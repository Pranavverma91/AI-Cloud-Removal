import json
from types import SimpleNamespace

import numpy as np
import pytest
import torch

from ai.inference import NeuralPredictor, blend_weights, positions
from ai.metrics import Accumulator, ndvi
from ai.training.train import train
from backend.app.services.raster import sha256
from scripts.prepare_patches import prepare

torch.set_num_threads(1)


def test_metrics_known_errors_and_complete_ssim_neighborhoods():
    reference = np.full((3, 20, 20), 100, "float32")
    estimate = reference + 10
    valid = np.ones((20, 20), bool)
    selected = valid.copy()
    acc = Accumulator(255)
    acc.add(estimate, reference, selected, valid)
    result = acc.result()
    assert result["mae"] == 10 and result["rmse"] == 10
    assert result["psnr"] == pytest.approx(20 * np.log10(25.5))
    assert result["sam"] == pytest.approx(0, abs=1e-5) and result["ergas"] == 10
    valid[6, 6] = False
    acc = Accumulator(255)
    acc.add(estimate, reference, selected, valid)
    assert acc.ssim_n == (14 * 14 - 7 * 7) * 3
    assert np.isnan(ndvi(np.zeros((3, 2, 2), "float32"))).all()
    assert ndvi(np.array([[[1]], [[2]], [[6]]], dtype="float32"))[0, 0] == 0.5


def test_overlap_covers_edges_and_blending_has_no_zero_denominator():
    coverage = np.zeros((301, 517), "float32")
    for y in positions(301, 256, 32):
        for x in positions(517, 256, 32):
            coverage[y : y + 256, x : x + 256] += blend_weights(256, 256)
    assert coverage.min() > 0 and positions(17, 256, 32) == [0]


@pytest.mark.parametrize("model", ["resunet", "cgan", "diffusion", "multimodal-diffusion"])
def test_real_training_checkpoint_and_inference(model, tmp_path):
    rng = np.random.default_rng(7)
    for split in ["train", "val"]:
        folder = tmp_path / "patches" / split
        folder.mkdir(parents=True)
        clear = rng.random((3, 16, 16), dtype="float32")
        mask = np.zeros((1, 16, 16), "float32")
        mask[:, 4:12, 4:12] = 1
        np.savez(
            folder / "fixture.npz",
            cloudy=clear * (1 - mask) + mask,
            clear=clear,
            mask=mask,
            temporal=clear,
            sar=rng.random((2, 16, 16), dtype="float32"),
        )
    out = tmp_path / "run"
    history = train(
        tmp_path / "patches",
        out,
        model=model,
        epochs=1,
        batch_size=1,
        base=4,
        steps=2,
        sar_low=[-25, -30],
        sar_span=[25, 30],
    )
    assert (
        len(history) == 1
        and np.isfinite(history[0]["train_loss"])
        and history[0]["val_mae"] is not None
    )
    checkpoint = out / "model.safetensors"
    config = json.loads((out / "config.json").read_text())
    predictor = NeuralPredictor(
        SimpleNamespace(
            id=model,
            checkpoint=str(checkpoint),
            checkpoint_sha256=sha256(checkpoint),
            config=config,
        )
    )
    condition = np.concatenate(
        [clear, mask]
        + ([clear, np.zeros((2, 16, 16), "float32")] if model == "multimodal-diffusion" else [])
    )
    prediction = predictor.predict(condition)
    assert prediction.shape == (3, 16, 16) and np.isfinite(prediction).all()
    if "diffusion" in model:
        np.testing.assert_array_equal(prediction[:, mask[0] == 0], clear[:, mask[0] == 0])
    with pytest.raises(ValueError, match="checksum"):
        NeuralPredictor(
            SimpleNamespace(
                id=model, checkpoint=str(checkpoint), checkpoint_sha256="invalid", config=config
            )
        )


def test_split_leakage_rejected_before_preparation(tmp_path):
    clear = tmp_path / "clear.tif"
    clear.write_bytes(b"same source checksum")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            [
                {"split": "train", "scene_id": "one", "clear": "clear.tif"},
                {"split": "val", "scene_id": "two", "clear": "clear.tif"},
            ]
        )
    )
    with pytest.raises(ValueError, match="leakage"):
        prepare(manifest, tmp_path / "patches")
