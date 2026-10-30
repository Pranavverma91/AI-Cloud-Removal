"""Prepare disjoint paired scenes; never silently register images by array index."""

import argparse
import json
from contextlib import ExitStack
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

from ai.inference import positions
from backend.app.services.raster import aligned, normalization, read_valid, sha256


def prepare(manifest, output, size=256, overlap=32):
    if size not in (256, 512) or not 0 <= overlap < size:
        raise ValueError("Use size 256/512 and a smaller overlap")
    manifest = Path(manifest)
    rows = json.loads(manifest.read_text())
    folder = Path(output)
    seen = {}
    hashes = {}
    for row in rows:
        split = row["split"]
        scene = row["scene_id"]
        if split not in {"train", "val", "test"}:
            raise ValueError("Explicit train/val/test splits required")
        if scene in seen and seen[scene] != split:
            raise ValueError("Scene leakage across dataset splits")
        seen[scene] = split
        for role in ["clear", "cloudy", "temporal", "sar"]:
            if role in row:
                digest = sha256((manifest.parent / row[role]).resolve())
                if digest in hashes and hashes[digest] != split:
                    raise ValueError("Scene leakage across dataset splits")
                hashes[digest] = split
    folder.mkdir(parents=True, exist_ok=False)
    counts = {"train": 0, "val": 0, "test": 0}
    records = []
    for row in rows:
        target = folder / row["split"]
        target.mkdir(exist_ok=True)
        bands = row.get("bands", [1, 2, 3])
        with ExitStack() as stack:
            source = stack.enter_context(rasterio.open(manifest.parent / row["cloudy"]))
            if not source.crs:
                raise ValueError("Cloudy raster needs a CRS")
            low, span = normalization(source, bands)
            readers = {}
            for key in ["clear", "mask"] + (["temporal", "sar"] if "sar" in row else []):
                src, vrt = aligned(manifest.parent / row[key], source, key == "mask")
                stack.enter_context(src)
                stack.enter_context(vrt)
                if key in {"clear", "temporal"}:
                    if any(
                        not np.allclose(
                            [getattr(source, attribute)[b - 1] for b in bands],
                            [getattr(src, attribute)[b - 1] for b in bands],
                        )
                        for attribute in ["scales", "offsets"]
                    ):
                        raise ValueError(
                            "Calibrate paired optical radiometry before patch preparation"
                        )
                readers[key] = vrt
            written = 0
            for y in positions(source.height, size, overlap):
                for x in positions(source.width, size, overlap):
                    if x + size > source.width or y + size > source.height:
                        continue
                    win = Window(x, y, size, size)
                    cloudy, valid = read_valid(source, win, bands)
                    clear, cv = read_valid(readers["clear"], win, bands)
                    classes, mv = read_valid(readers["mask"], win, [1])
                    valid &= cv & mv & np.isin(classes[0], [0, 1, 2])
                    if not valid.all():
                        continue
                    values = {
                        "cloudy": np.clip(
                            (cloudy - low[:, None, None]) / span[:, None, None], 0, 1
                        ),
                        "clear": np.clip((clear - low[:, None, None]) / span[:, None, None], 0, 1),
                        "mask": np.isin(classes, [1, 2]).astype("float32"),
                    }
                    if "sar" in readers:
                        temporal, tv = read_valid(readers["temporal"], win, bands)
                        sar, sv = read_valid(readers["sar"], win, row.get("sar_bands", [1, 2]))
                        sl = np.asarray(row["sar_low"])
                        ss = np.asarray(row["sar_span"])
                        if np.any(ss <= 0):
                            raise ValueError("Positive SAR spans required")
                        if not (tv & sv).all():
                            continue
                        values.update(
                            temporal=np.clip(
                                (temporal - low[:, None, None]) / span[:, None, None], 0, 1
                            ),
                            sar=np.clip((sar - sl[:, None, None]) / ss[:, None, None], 0, 1),
                        )
                    filename = f"{len(records):04d}-{written:07d}.npz"
                    np.savez_compressed(target / filename, **values)
                    written += 1
            counts[row["split"]] += written
            records.append(
                {
                    "scene_id": row["scene_id"],
                    "split": row["split"],
                    "patches": written,
                    "cloudy_sha256": sha256(manifest.parent / row["cloudy"]),
                    "clear_sha256": sha256(manifest.parent / row["clear"]),
                    "normalization_low": low.tolist(),
                    "normalization_span": span.tolist(),
                }
            )
    (folder / "manifest.json").write_text(
        json.dumps(
            {"size": size, "overlap": overlap, "counts": counts, "scenes": records}, indent=2
        )
    )
    return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest")
    parser.add_argument("output")
    parser.add_argument("--size", type=int, default=256)
    parser.add_argument("--overlap", type=int, default=32)
    prepare(**vars(parser.parse_args()))
