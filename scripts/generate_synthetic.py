"""Create explicitly synthetic paired observations from a clean georeferenced input."""

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from scipy.ndimage import gaussian_filter, map_coordinates

from backend.app.services.raster import normalization, profile, read_valid, sha256, windows


def generate(clear, output, seed=42, bands=(1, 2, 3)):
    folder = Path(output)
    folder.mkdir(parents=True, exist_ok=False)
    random = np.random.default_rng(seed)
    with rasterio.open(clear) as src:
        if not src.crs:
            raise ValueError("Input needs a coordinate reference system")
        low, span = normalization(src, list(bands))
        field = gaussian_filter(
            random.random((max(8, src.height // 128), max(8, src.width // 128))), 1.4
        )
        lo, hi = np.percentile(field, [40, 92])
        field = np.clip((field - lo) / max(hi - lo, 1e-8), 0, 1)
        with (
            rasterio.open(
                folder / "cloudy.tif", "w", **profile(src, 3, src.dtypes[0], src.nodata)
            ) as cloudy,
            rasterio.open(
                folder / "clear.tif", "w", **profile(src, 3, src.dtypes[0], src.nodata)
            ) as truth,
            rasterio.open(folder / "mask.tif", "w", **profile(src, 1, "uint8", 255)) as mask,
        ):
            for target in (cloudy, truth):
                target.scales = tuple(src.scales[b - 1] for b in bands)
                target.offsets = tuple(src.offsets[b - 1] for b in bands)
            for win in windows(src.width, src.height):
                values, valid = read_valid(src, win, list(bands))
                yy, xx = np.mgrid[
                    int(win.row_off) : int(win.row_off + win.height),
                    int(win.col_off) : int(win.col_off + win.width),
                ]
                coords = np.array(
                    [
                        yy / max(1, src.height - 1) * (field.shape[0] - 1),
                        xx / max(1, src.width - 1) * (field.shape[1] - 1),
                    ]
                )
                opacity = map_coordinates(field, coords, order=1, mode="reflect")
                shadow = (
                    map_coordinates(
                        field, coords - np.array([0.7, 0.9])[:, None, None], order=1, mode="reflect"
                    )
                    * 0.38
                )
                clouds = opacity > 0.12
                opacity = np.where(clouds, opacity, 0)
                shadows = (shadow > 0.08) & ~clouds
                altered = values * (1 - opacity) + (low + span)[:, None, None] * opacity
                altered[:, shadows] *= 1 - shadow[shadows]
                if np.dtype(src.dtypes[0]).kind in "iu":
                    altered = np.rint(altered)
                for target, data in ((cloudy, altered), (truth, values)):
                    target.write(
                        np.where(valid, data, src.nodata if src.nodata is not None else 0).astype(
                            src.dtypes[0]
                        ),
                        window=win,
                    )
                    target.write_mask(valid.astype("uint8") * 255, window=win)
                classes = np.zeros(valid.shape, "uint8")
                classes[clouds] = 1
                classes[shadows] = 2
                classes[~valid] = 255
                mask.write(classes, 1, window=win)
    (folder / "provenance.json").write_text(
        json.dumps(
            {
                "kind": "Synthetic cloud and shadow contamination",
                "ground_truth_sha256": sha256(clear),
                "seed": seed,
                "description": "Procedural opacity and displaced shadows; not a physical atmospheric simulator or real observation.",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("clear")
    parser.add_argument("output")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--bands", nargs=3, type=int, default=[1, 2, 3])
    generate(**vars(parser.parse_args()))
