import hashlib
import io
import math
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image as PILImage
from pyproj import Geod
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.vrt import WarpedVRT
from rasterio.warp import calculate_default_transform, transform_bounds, transform_geom
from rasterio.windows import Window, from_bounds


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect(path, max_pixels=100_000_000):
    with rasterio.open(path) as src:
        if src.driver != "GTiff" or not src.crs:
            raise ValueError("Upload a GeoTIFF with a valid coordinate reference system")
        if src.width * src.height > max_pixels or not 1 <= src.count <= 16:
            raise ValueError("Raster exceeds configured pixel or band limit")
        if any(d not in {"uint8", "int8", "uint16", "int16", "float32"} for d in src.dtypes):
            raise ValueError("Supported raster types are uint8, int8, uint16, int16 and float32")
        bounds = list(transform_bounds(src.crs, "EPSG:4326", *src.bounds, densify_pts=21))
        if not np.isfinite(bounds).all():
            raise ValueError("Raster extent cannot be transformed to geographic coordinates")
        return {
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "dtype": src.dtypes[0],
            "crs": str(src.crs),
            "bounds": bounds,
            "resolution": list(src.res),
            "nodata": float(src.nodata)
            if src.nodata is not None and np.isfinite(src.nodata)
            else None,
            "scales": list(src.scales),
            "offsets": list(src.offsets),
            "bytes": Path(path).stat().st_size,
        }


def windows(width, height, size=512):
    for y in range(0, height, size):
        for x in range(0, width, size):
            yield Window(x, y, min(size, width - x), min(size, height - y))


def read_valid(src, window=None, bands=None):
    data = src.read(bands, window=window, masked=True)
    values = np.asarray(data.data, dtype=np.float32)
    valid = (~np.ma.getmaskarray(data)).all(axis=0) & np.isfinite(values).all(axis=0)
    return values, valid


def normalization(src, bands=None):
    bands = bands or list(range(1, src.count + 1))
    scale = min(1, 768 / max(src.width, src.height))
    sample = src.read(
        bands,
        out_shape=(
            len(bands),
            max(1, round(src.height * scale)),
            max(1, round(src.width * scale)),
        ),
        masked=True,
    )
    low, span = [], []
    for band in sample:
        values = band.compressed()
        values = values[np.isfinite(values)]
        if not values.size:
            raise ValueError("No valid raster values")
        lo, hi = np.percentile(values, [2, 98])
        low.append(float(lo))
        span.append(float(max(hi - lo, 1)))
    return np.asarray(low, "float32"), np.asarray(span, "float32")


def profile(src, count=3, dtype=None, nodata=None):
    return {
        "driver": "GTiff",
        "width": src.width,
        "height": src.height,
        "count": count,
        "dtype": dtype or src.dtypes[0],
        "crs": src.crs,
        "transform": src.transform,
        "nodata": nodata,
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
        "compress": "deflate",
    }


def preview(path, bands=None, stretch=None, kind="optical"):
    with rasterio.open(path) as src:
        indices = bands or ([3, 2, 1] if src.count >= 3 else [1])
        scale = min(1, 1024 / max(src.width, src.height))
        a = src.read(
            indices,
            out_shape=(
                len(indices),
                max(1, round(src.height * scale)),
                max(1, round(src.width * scale)),
            ),
            masked=True,
        )
        valid = (~np.ma.getmaskarray(a)).all(axis=0) & np.isfinite(a.data).all(axis=0)
        if kind == "mask":
            palette = np.array([[32, 57, 57], [240, 244, 255], [83, 70, 131]], "uint8")
            rgb = palette[np.clip(a.data[0].astype(int), 0, 2)]
            valid &= a.data[0] != 255
        elif kind == "ndvi":
            t = np.clip((a.data[0] + 1) / 2, 0, 1)
            rgb = np.stack(
                [220 * (1 - t) + 24 * t, 95 + 95 * t, 65 * (1 - t) + 90 * t], axis=-1
            ).astype("uint8")
        else:
            if stretch:
                low, span = (
                    np.array(stretch[0])[np.array(indices) - 1],
                    np.array(stretch[1])[np.array(indices) - 1],
                )
            else:
                low, span = normalization(src, indices)
            rgb = (np.clip((a.data - low[:, None, None]) / span[:, None, None], 0, 1) * 255).astype(
                "uint8"
            )
            if len(indices) == 1:
                rgb = np.repeat(rgb, 3, axis=0)
            rgb = np.moveaxis(rgb, 0, -1)
        rgba = np.dstack([rgb, valid.astype("uint8") * 255])
        output = io.BytesIO()
        PILImage.fromarray(rgba).save(output, "PNG")
        return output.getvalue()


def aligned(path, target, categorical=False):
    source = rasterio.open(path)
    try:
        return source, WarpedVRT(
            source,
            crs=target.crs,
            transform=target.transform,
            width=target.width,
            height=target.height,
            resampling=Resampling.nearest if categorical else Resampling.bilinear,
            dtype="float32",
            nodata=float("nan"),
        )
    except Exception:
        source.close()
        raise


def prepare_raster(
    path, output, aoi=None, target_crs=None, resolution=None, max_pixels=100_000_000
):
    if not aoi and not target_crs and not resolution:
        return Path(path)
    with rasterio.open(path) as src:
        crs = rasterio.crs.CRS.from_user_input(target_crs) if target_crs else src.crs
        transform, width, height = calculate_default_transform(
            src.crs, crs, src.width, src.height, *src.bounds, resolution=resolution
        )
        if width * height > max_pixels:
            raise ValueError("Requested grid exceeds pixel limit")
        with WarpedVRT(
            src,
            crs=crs,
            transform=transform,
            width=width,
            height=height,
            resampling=Resampling.bilinear,
            add_alpha=False,
        ) as vrt:
            geometry = transform_geom("EPSG:4326", crs, aoi) if aoi else None
            if geometry:
                from shapely.geometry import shape

                win = from_bounds(*shape(geometry).bounds, transform=transform)
                left, top = (
                    max(0, math.floor(win.col_off)),
                    max(0, math.floor(win.row_off)),
                )
                right, bottom = (
                    min(width, math.ceil(win.col_off + win.width)),
                    min(height, math.ceil(win.row_off + win.height)),
                )
                if right <= left or bottom <= top:
                    raise ValueError("Area does not intersect the image")
                crop = Window(left, top, right - left, bottom - top)
            else:
                crop = Window(0, 0, width, height)
            out_profile = profile(vrt, src.count, src.dtypes[0], src.nodata)
            out_profile.update(
                width=int(crop.width),
                height=int(crop.height),
                transform=vrt.window_transform(crop),
            )
            with rasterio.open(output, "w", **out_profile) as dst:
                dst.scales, dst.offsets = src.scales, src.offsets
                for win in windows(dst.width, dst.height):
                    source_win = Window(
                        win.col_off + crop.col_off,
                        win.row_off + crop.row_off,
                        win.width,
                        win.height,
                    )
                    values, valid = read_valid(vrt, source_win)
                    if geometry:
                        valid &= geometry_mask(
                            [geometry],
                            (int(win.height), int(win.width)),
                            dst.window_transform(win),
                            invert=True,
                        )
                    dst.write(
                        np.where(valid, values, src.nodata if src.nodata is not None else 0).astype(
                            src.dtypes[0]
                        ),
                        window=win,
                    )
                    dst.write_mask(valid.astype("uint8") * 255, window=win)
    return Path(output)


def pixel_area(src, win):
    cx, cy = win.col_off + win.width / 2, win.row_off + win.height / 2
    coords = [
        src.transform * p
        for p in [(cx, cy), (cx + 1, cy), (cx + 1, cy + 1), (cx, cy + 1), (cx, cy)]
    ]
    geometry = transform_geom(src.crs, "EPSG:4326", {"type": "Polygon", "coordinates": [coords]})
    xy = geometry["coordinates"][0]
    area, _ = Geod(ellps="WGS84").polygon_area_perimeter(*zip(*xy))
    return abs(area)
