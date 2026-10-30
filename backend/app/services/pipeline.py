import html
import json
import time
from contextlib import ExitStack

import numpy as np
import rasterio
from rasterio.shutil import copy as raster_copy
from rasterio.windows import Window
from scipy.ndimage import distance_transform_edt
from sqlalchemy import select, update

from ai.detection import detect, interpolate
from ai.inference import NeuralPredictor, blend_weights, positions
from ai.metrics import Accumulator, ndvi

from ..config import settings
from ..database import SessionLocal
from ..models import Analysis, CloudMask, Image, Job, Metric, Model, Reconstruction, now
from .raster import (
    aligned,
    inspect,
    normalization,
    pixel_area,
    prepare_raster,
    preview,
    profile,
    read_valid,
    windows,
)


def optical_bands(image):
    return [image.bands[name] for name in ("green", "red", "nir")]


def process(analysis_id):
    started = time.perf_counter()
    with SessionLocal() as db:
        claimed = db.execute(
            update(Analysis)
            .where(Analysis.id == analysis_id, Analysis.status == "Queued")
            .values(status="Preprocessing", updated_at=now())
        ).rowcount
        db.commit()
        if not claimed:
            return
        analysis = db.get(Analysis, analysis_id)
        job = db.scalar(select(Job).where(Job.analysis_id == analysis_id))

        def stage(name):
            analysis.status, analysis.updated_at = name, now()
            if job:
                job.stages = [
                    *job.stages,
                    {"stage": name, "timestamp": now().isoformat()},
                ]
            db.commit()

        try:
            image, model = (
                db.get(Image, analysis.image_id),
                db.get(Model, analysis.model_id),
            )
            cfg, p = settings(), analysis.parameters
            output = cfg.storage_dir.resolve() / "results" / analysis.id
            output.mkdir(parents=True, exist_ok=False)
            prepared = prepare_raster(
                image.path,
                output / "prepared.tif",
                p.get("aoi"),
                p.get("target_crs"),
                p.get("resolution"),
                cfg.max_raster_pixels,
            )
            with rasterio.open(prepared) as src:
                bands = optical_bands(image)
                with rasterio.open(
                    output / "original.tif",
                    "w",
                    **profile(src, 3, src.dtypes[0], src.nodata),
                ) as dst:
                    dst.scales = tuple(src.scales[i - 1] for i in bands)
                    dst.offsets = tuple(src.offsets[i - 1] for i in bands)
                    for win in windows(src.width, src.height):
                        values, valid = read_valid(src, win, bands)
                        dst.write(values.astype(src.dtypes[0]), window=win)
                        dst.write_mask(valid.astype("uint8") * 255, window=win)
            with ExitStack() as stack:
                original = stack.enter_context(rasterio.open(output / "original.tif"))
                low, span = normalization(original)
                auxiliary = {}
                for key in ("mask", "reference", "temporal", "sentinel1"):
                    if p.get(key + "_id"):
                        item = db.get(Image, p[key + "_id"])
                        source, vrt = aligned(item.path, original, key == "mask")
                        stack.enter_context(source)
                        stack.enter_context(vrt)
                        auxiliary[key] = (item, vrt)
                stage("Detecting Clouds")
                counts = {"clear": 0, "cloud": 0, "shadow": 0, "valid": 0}
                area = {"clear": 0.0, "cloud": 0.0, "shadow": 0.0, "valid": 0.0}
                with (
                    rasterio.open(
                        output / "mask.tif", "w", **profile(original, 1, "uint8", 255)
                    ) as maskout,
                    rasterio.open(
                        output / "score.tif",
                        "w",
                        **profile(original, 1, "float32", -9999),
                    ) as scoreout,
                ):
                    for win in windows(original.width, original.height):
                        x, y, w, h = map(int, (win.col_off, win.row_off, win.width, win.height))
                        hx, hy = max(0, x - 24), max(0, y - 24)
                        halo = Window(
                            hx,
                            hy,
                            min(original.width, x + w + 24) - hx,
                            min(original.height, y + h + 24) - hy,
                        )
                        values, valid = read_valid(original, halo)
                        classes, score = detect(
                            values,
                            valid,
                            low,
                            span,
                            p["brightness_threshold"],
                            p["detect_shadows"],
                        )
                        core = (slice(y - hy, y - hy + h), slice(x - hx, x - hx + w))
                        classes, score, valid = classes[core], score[core], valid[core]
                        if "mask" in auxiliary:
                            supplied, mv = read_valid(
                                auxiliary["mask"][1], win, [auxiliary["mask"][0].bands["mask"]]
                            )
                            if np.any(valid & (~mv | ~np.isin(supplied[0], [0, 1, 2]))):
                                raise ValueError(
                                    "Mask must cover the source and use classes 0 clear, 1 cloud, 2 shadow"
                                )
                            classes = np.where(valid, supplied[0], 255).astype("uint8")
                            score = np.full(score.shape, -9999, "float32")
                        maskout.write(classes, 1, window=win)
                        scoreout.write(
                            np.where(valid, score, -9999).astype("float32"),
                            1,
                            window=win,
                        )
                        area_per_pixel = pixel_area(original, win)
                        for key, selection in [
                            ("clear", classes == 0),
                            ("cloud", classes == 1),
                            ("shadow", classes == 2),
                            ("valid", valid),
                        ]:
                            n = int(selection.sum())
                            counts[key] += n
                            area[key] += n * area_per_pixel
                if not counts["valid"]:
                    raise ValueError("No valid pixels in processing area")
                stage("Reconstructing")
                neural = (
                    NeuralPredictor(model, seed=p.get("seed", 42))
                    if model.id not in {"spatial-baseline", "temporal-baseline"}
                    else None
                )
                shape = (3, original.height, original.width)
                sums = np.memmap(output / "sums.bin", mode="w+", shape=shape, dtype="float32")
                weights = np.memmap(
                    output / "weights.bin", mode="w+", shape=shape[1:], dtype="float32"
                )
                sums[:] = 0
                weights[:] = 0
                with rasterio.open(output / "mask.tif") as mask:
                    for y in positions(original.height, p["patch_size"], p["overlap"]):
                        for x in positions(original.width, p["patch_size"], p["overlap"]):
                            h, w = (
                                min(p["patch_size"], original.height - y),
                                min(p["patch_size"], original.width - x),
                            )
                            win = Window(x, y, w, h)
                            values, valid = read_valid(original, win)
                            classes = mask.read(1, window=win)
                            masked = np.isin(classes, [1, 2]) & valid
                            estimate = values.copy()
                            if masked.any():
                                if model.id == "spatial-baseline":
                                    estimate = interpolate(values, masked, valid)
                                else:
                                    norm = np.clip(
                                        (
                                            np.where(valid, values, low[:, None, None])
                                            - low[:, None, None]
                                        )
                                        / span[:, None, None],
                                        0,
                                        1,
                                    )
                                    condition = [norm, masked[None].astype("float32")]
                                    if "temporal" in model.required_auxiliary:
                                        item, vrt = auxiliary["temporal"]
                                        temporal, tv = read_valid(vrt, win, optical_bands(item))
                                        if np.any((valid if neural else masked) & ~tv):
                                            raise ValueError(
                                                "Temporal image does not cover the required processing pixels"
                                            )
                                        if not neural:
                                            estimate[:, masked] = temporal[:, masked]
                                        else:
                                            condition.append(
                                                np.clip(
                                                    (
                                                        np.where(tv, temporal, low[:, None, None])
                                                        - low[:, None, None]
                                                    )
                                                    / span[:, None, None],
                                                    0,
                                                    1,
                                                )
                                            )
                                    if "sentinel1" in model.required_auxiliary:
                                        item, vrt = auxiliary["sentinel1"]
                                        radar, rv = read_valid(
                                            vrt,
                                            win,
                                            [item.bands["vv"], item.bands["vh"]],
                                        )
                                        if np.any(valid & ~rv):
                                            raise ValueError(
                                                "SAR image does not cover the processing pixels"
                                            )
                                        sar_low, sar_span = (
                                            np.array(model.config["sar_low"]),
                                            np.array(model.config["sar_span"]),
                                        )
                                        if (
                                            sar_low.shape != (2,)
                                            or sar_span.shape != (2,)
                                            or not np.isfinite(sar_low).all()
                                            or not np.isfinite(sar_span).all()
                                            or np.any(sar_span <= 0)
                                        ):
                                            raise ValueError("Invalid registered SAR calibration")
                                        condition.append(
                                            np.clip(
                                                (
                                                    np.where(rv, radar, sar_low[:, None, None])
                                                    - sar_low[:, None, None]
                                                )
                                                / sar_span[:, None, None],
                                                0,
                                                1,
                                            )
                                        )
                                    if neural:
                                        estimate = (
                                            neural.predict(np.concatenate(condition))
                                            * span[:, None, None]
                                            + low[:, None, None]
                                        )
                            blend = blend_weights(h, w)
                            if not np.isfinite(estimate[:, valid]).all():
                                raise ValueError(
                                    "Reconstruction produced nonfinite values in valid pixels"
                                )
                            sums[:, y : y + h, x : x + w] += (
                                np.where(np.isfinite(estimate), estimate, 0) * blend
                            )
                            weights[y : y + h, x : x + w] += blend
                stage("Postprocessing")
                products = {
                    key: str(output / filename)
                    for key, filename in {
                        "original": "original.tif",
                        "reconstruction": "reconstruction.tif",
                        "mask": "mask.tif",
                        "score": "score.tif",
                        "ndvi-original": "ndvi-original.tif",
                        "ndvi": "ndvi.tif",
                    }.items()
                }
                with (
                    rasterio.open(output / "mask.tif") as mask,
                    rasterio.open(
                        output / "reconstructed-temp.tif",
                        "w",
                        **profile(original, 3, original.dtypes[0], original.nodata),
                    ) as dst,
                    rasterio.open(
                        products["ndvi-original"],
                        "w",
                        **profile(original, 1, "float32", -9999),
                    ) as n0,
                    rasterio.open(
                        products["ndvi"], "w", **profile(original, 1, "float32", -9999)
                    ) as n1,
                ):
                    dst.scales, dst.offsets = original.scales, original.offsets
                    for win in windows(original.width, original.height):
                        y, x, h, w = map(int, (win.row_off, win.col_off, win.height, win.width))
                        values, valid = read_valid(original, win)
                        selected = np.isin(mask.read(1, window=win), [1, 2]) & valid
                        estimate = sums[:, y : y + h, x : x + w] / np.maximum(
                            weights[y : y + h, x : x + w], 1e-8
                        )
                        if p["feather"]:
                            halo = min(p["feather"], 16)
                            hx, hy = max(0, x - halo), max(0, y - halo)
                            m = np.isin(
                                mask.read(
                                    1,
                                    window=Window(
                                        hx,
                                        hy,
                                        min(original.width, x + w + halo) - hx,
                                        min(original.height, y + h + halo) - hy,
                                    ),
                                ),
                                [1, 2],
                            )
                            alpha = np.clip(
                                distance_transform_edt(m)[y - hy : y - hy + h, x - hx : x - hx + w]
                                / p["feather"],
                                0,
                                1,
                            )
                            estimate = estimate * alpha + values * (1 - alpha)
                        reconstructed = np.where(selected, estimate, values)
                        dtype = np.dtype(original.dtypes[0])
                        if dtype.kind in "iu":
                            lim = np.iinfo(dtype)
                            reconstructed = np.clip(np.rint(reconstructed), lim.min, lim.max)
                        reconstructed = reconstructed.astype(dtype)
                        dst.write(reconstructed, window=win)
                        dst.write_mask(valid.astype("uint8") * 255, window=win)
                        for target, data in [(n0, values), (n1, reconstructed)]:
                            v = ndvi(data, original.scales, original.offsets)
                            target.write(
                                np.where(valid & np.isfinite(v), v, -9999).astype("float32"),
                                1,
                                window=win,
                            )
                sums.flush()
                weights.flush()
                del sums, weights
                (output / "sums.bin").unlink()
                (output / "weights.bin").unlink()
                raster_copy(
                    output / "reconstructed-temp.tif",
                    products["reconstruction"],
                    driver="COG",
                    compress="DEFLATE",
                )
                (output / "reconstructed-temp.tif").unlink()
                stage("Evaluating")
                metrics = None
                relation = p["reference_relation"]
                metric_note = "Reference unavailable — quantitative reconstruction metrics cannot be calculated."
                if "reference" in auxiliary:
                    item, ref = auxiliary["reference"]
                    rb = optical_bands(item)
                    products["reference"] = str(output / "reference.tif")
                    products["difference"] = str(output / "difference.tif")
                    ref_low, ref_span = normalization(ref, rb)
                    ranges = float(max(ref_span))
                    accumulators = {
                        region: Accumulator(ranges)
                        for region in ("all", "cloud", "shadow", "clear")
                    }
                    with (
                        rasterio.open(
                            products["reference"],
                            "w",
                            **profile(original, 3, "float32", -9999),
                        ) as refout,
                        rasterio.open(
                            products["difference"],
                            "w",
                            **profile(original, 3, "float32", -9999),
                        ) as diffout,
                        rasterio.open(products["reconstruction"]) as rec,
                        rasterio.open(products["mask"]) as mask,
                    ):
                        for win in windows(original.width, original.height):
                            values, vv = read_valid(rec, win)
                            truth, tv = read_valid(ref, win, rb)
                            valid = vv & tv
                            refout.write(
                                np.where(valid, truth, -9999).astype("float32"),
                                window=win,
                            )
                            diffout.write(
                                np.where(valid, values - truth, -9999).astype("float32"),
                                window=win,
                            )
                            if relation in {
                                "same-acquisition",
                                "synthetic-ground-truth",
                            }:
                                y, x, h, w = map(
                                    int,
                                    (win.row_off, win.col_off, win.height, win.width),
                                )
                                hx, hy = max(0, x - 3), max(0, y - 3)
                                halo = Window(
                                    hx,
                                    hy,
                                    min(original.width, x + w + 3) - hx,
                                    min(original.height, y + h + 3) - hy,
                                )
                                e, ev = read_valid(rec, halo)
                                r, rv = read_valid(ref, halo, rb)
                                m = mask.read(1, window=halo)
                                core = np.zeros(m.shape, bool)
                                core[y - hy : y - hy + h, x - hx : x - hx + w] = True
                                for key, selection in [
                                    ("all", m != 255),
                                    ("cloud", m == 1),
                                    ("shadow", m == 2),
                                    ("clear", m == 0),
                                ]:
                                    accumulators[key].add(e, r, selection, ev & rv, core)
                    if relation in {"same-acquisition", "synthetic-ground-truth"}:
                        metrics = {
                            key: accumulator.result() for key, accumulator in accumulators.items()
                        }
                        metric_note = "Native digital-number errors; SAM in degrees; ERGAS grid ratio 1. PSNR/SSIM range is sampled reference 2–98% span. Null PSNR at zero error means infinite PSNR. SSIM uses fully valid 7×7 neighborhoods within each region."
                    else:
                        metric_note = "Different-date imagery is a temporal comparison, not ground truth. Accuracy metrics unavailable."
                stretch = [low.tolist(), span.tolist()]
                for key in ("original", "reconstruction", "reference", "mask", "ndvi"):
                    if key in products:
                        (output / (key + ".png")).write_bytes(
                            preview(
                                products[key],
                                stretch=stretch
                                if key in {"original", "reconstruction", "reference"}
                                else None,
                                kind="mask"
                                if key == "mask"
                                else "ndvi"
                                if key == "ndvi"
                                else "optical",
                            )
                        )
                provenance = {
                    "source": {
                        "name": image.name,
                        "sensor": image.sensor,
                        "acquired_at": image.acquired_at,
                        "bands": image.bands,
                        "metadata": image.details,
                    },
                    "input_sha256": image.sha256,
                    "model": model.id,
                    "model_version": model.version,
                    "checkpoint_sha256": model.checkpoint_sha256,
                    "parameters": p,
                    "timestamp": now().isoformat(),
                    "device": neural.device if neural else "cpu",
                    "auxiliary_sha256": {k: i.sha256 for k, (i, _) in auxiliary.items()},
                }
                result = {
                    "products": products,
                    "metadata": inspect(products["reconstruction"]),
                    "counts": counts,
                    "area_m2": area,
                    "cloud_percent": 100 * counts["cloud"] / counts["valid"],
                    "shadow_percent": 100 * counts["shadow"] / counts["valid"],
                    "metrics": metrics,
                    "metric_note": metric_note,
                    "provenance": provenance,
                    "seconds": time.perf_counter() - started,
                    "confidence": None,
                    "stretch": stretch,
                    "limitations": [
                        "Reconstruction is an estimate, not an observation.",
                        "Threshold cloud detection is experimental; snow and bright roofs can be misclassified.",
                        "Area uses local geodesic pixel-area approximation per 512-pixel window.",
                        "No calibrated uncertainty or automatic subpixel image registration is available.",
                    ],
                }
                (output / "metadata.json").write_text(json.dumps(result, indent=2, allow_nan=False))
                (output / "report.html").write_text(
                    "<!doctype html><meta charset=utf-8><title>SPACE EYE processing report</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>"
                    + html.escape(analysis.name)
                    + "</h1><p>Reconstructed pixels are estimates. Review provenance and limitations before interpretation.</p><pre>"
                    + html.escape(json.dumps(result, indent=2))
                    + "</pre>"
                )
                analysis.result = result
                db.add(
                    CloudMask(
                        analysis_id=analysis.id,
                        path=products["mask"],
                        statistics=counts,
                    )
                )
                db.add(
                    Reconstruction(
                        analysis_id=analysis.id,
                        path=products["reconstruction"],
                        provenance=provenance,
                    )
                )
                for region, values in (metrics or {}).items():
                    if values:
                        db.add(Metric(analysis_id=analysis.id, region=region, values=values))
                stage("Completed")
        except Exception as exc:
            db.rollback()
            analysis = db.get(Analysis, analysis_id)
            analysis.error = str(exc)[:1000]
            stage("Failed")
            import logging

            logging.getLogger(__name__).exception("Analysis %s failed", analysis_id)
