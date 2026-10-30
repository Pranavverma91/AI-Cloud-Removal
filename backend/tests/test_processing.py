import numpy as np
import pytest
import rasterio
from conftest import upload

from backend.app.services.pipeline import process
from backend.app.services.raster import inspect, prepare_raster


def queue(client, scene, **options):
    data = {
        "name": "Numerical fixture",
        "image_id": upload(client, scene["cloudy_path"]),
        "mask_id": upload(client, scene["mask_path"], "mask", {"mask": 2}),
        **options,
    }
    response = client.post("/analyses", json=data)
    assert response.status_code == 202, response.text
    return response.json()["id"]


def completed(client, id_):
    process(id_)
    result = client.get("/analyses/" + id_).json()
    assert result["status"] == "Completed", result
    return result


def test_temporal_overlap_cog_metrics_and_duplicate_delivery(client, raster_scene, tmp_path):
    reference = upload(client, raster_scene["clear_path"], "clear")
    id_ = queue(
        client,
        raster_scene,
        model_id="temporal-baseline",
        temporal_id=reference,
        reference_id=reference,
        reference_relation="synthetic-ground-truth",
    )
    result = completed(client, id_)
    metrics = result["result"]["metrics"]
    assert metrics["cloud"]["mae"] == 0 and metrics["clear"]["rmse"] == 0
    assert metrics["cloud"]["ssim"] == pytest.approx(1)
    assert metrics["cloud"]["psnr"] is None
    assert result["result"]["counts"]["cloud"] == 6000
    assert result["result"]["confidence"] is None
    output = tmp_path / "download.tif"
    output.write_bytes(client.get(f"/analyses/{id_}/exports/reconstruction").content)
    with rasterio.open(output) as src:
        np.testing.assert_array_equal(src.read(), raster_scene["clear"])
        assert src.tags(ns="IMAGE_STRUCTURE")["LAYOUT"] == "COG"
        assert str(src.crs) == "EPSG:32643"
        assert src.dataset_mask()[0, 0] == 0
    assert client.get(f"/analyses/{id_}/preview/reconstruction").content.startswith(b"\x89PNG")
    assert client.get(f"/analyses/{id_}/exports/metadata").status_code == 200
    process(id_)
    assert client.get("/analyses/" + id_).json()["result"] == result["result"]


def test_spatial_preserves_clear_pixels_and_has_no_reference_accuracy(
    client, raster_scene, tmp_path
):
    id_ = queue(client, raster_scene, feather=3)
    result = completed(client, id_)
    assert result["result"]["metrics"] is None
    path = tmp_path / "spatial.tif"
    path.write_bytes(client.get(f"/analyses/{id_}/exports/reconstruction").content)
    with rasterio.open(path) as src:
        data = src.read()
        clear = raster_scene["mask"] == 0
        np.testing.assert_array_equal(data[:, clear], raster_scene["cloudy"][:, clear])
        assert np.isfinite(data).all()


def test_temporal_reference_is_not_reported_as_ground_truth(client, raster_scene):
    reference = upload(client, raster_scene["clear_path"], "clear")
    result = completed(
        client, queue(client, raster_scene, reference_id=reference, reference_relation="temporal")
    )
    assert result["result"]["metrics"] is None
    assert "not ground truth" in result["result"]["metric_note"]


def test_invalid_mask_fails_without_outputs(client, raster_scene):
    values = np.full((1, 280, 300), 9, "uint8")
    invalid = upload(client, raster_scene["write"]("invalid.tif", values), "mask", {"mask": 1})
    id_ = queue(client, raster_scene, mask_id=invalid)
    process(id_)
    result = client.get("/analyses/" + id_).json()
    assert result["status"] == "Failed" and "classes" in result["error"]
    assert client.get(f"/analyses/{id_}/exports/reconstruction").status_code == 404


def test_uint32_is_rejected_to_prevent_silent_clear_pixel_rounding(raster_scene):
    path = raster_scene["write"]("wide.tif", np.full((3, 8, 8), 2**25 + 1, "uint32"))
    with pytest.raises(ValueError, match="Supported raster types"):
        inspect(path)


def test_reprojection_and_aoi_require_real_intersection(raster_scene, tmp_path):
    path = prepare_raster(
        raster_scene["cloudy_path"],
        tmp_path / "reprojected.tif",
        target_crs="EPSG:4326",
        resolution=0.0001,
    )
    assert inspect(path)["crs"] == "EPSG:4326"
    outside = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]],
    }
    with pytest.raises(ValueError, match="does not intersect"):
        prepare_raster(raster_scene["cloudy_path"], tmp_path / "outside.tif", aoi=outside)


def test_synthetic_generation_and_georeferenced_patch_preparation(raster_scene, tmp_path):
    import json

    from scripts.generate_synthetic import generate
    from scripts.prepare_patches import prepare

    source = raster_scene["clear_path"]
    synthetic = tmp_path / "synthetic"
    generate(source, synthetic, seed=12)
    with (
        rasterio.open(synthetic / "cloudy.tif") as observed,
        rasterio.open(synthetic / "clear.tif") as truth,
        rasterio.open(synthetic / "mask.tif") as masks,
    ):
        c = masks.read(1)
        valid = c != 255
        np.testing.assert_array_equal(observed.read()[:, c == 0], truth.read()[:, c == 0])
        assert (c == 1).any() and valid.any()
        np.testing.assert_array_equal(truth.read()[:, valid], raster_scene["clear"][:, valid])
    manifest = tmp_path / "pairs.json"
    manifest.write_text(
        json.dumps(
            [
                {
                    "scene_id": "one",
                    "split": "train",
                    "cloudy": "synthetic/cloudy.tif",
                    "clear": "synthetic/clear.tif",
                    "mask": "synthetic/mask.tif",
                }
            ]
        )
    )
    counts = prepare(manifest, tmp_path / "patches")
    assert counts["train"] > 0
    with np.load(next((tmp_path / "patches" / "train").glob("*.npz")), allow_pickle=False) as patch:
        assert patch["cloudy"].shape == (3, 256, 256)
        assert set(np.unique(patch["mask"])) <= {0, 1}
        assert np.isfinite(patch["clear"]).all()


def test_registered_neural_checkpoint_runs_through_api_and_worker(client, raster_scene, tmp_path):
    import torch

    from ai.training.train import train
    from scripts.register_model import register

    torch.set_num_threads(1)
    for split in ["train", "val"]:
        folder = tmp_path / "training" / split
        folder.mkdir(parents=True)
        rng = np.random.default_rng(123 if split == "train" else 456)
        clear = rng.random((3, 16, 16), dtype="float32")
        mask = np.zeros((1, 16, 16), "float32")
        mask[:, 4:12, 4:12] = 1
        np.savez(folder / "patch.npz", cloudy=clear * (1 - mask) + mask, clear=clear, mask=mask)
    run = tmp_path / "run"
    train(tmp_path / "training", run, epochs=1, batch_size=1, base=4)
    record = register(run, "a@example.com")
    assert client.get("/experiments").json()[0]["id"] == record
    result = completed(client, queue(client, raster_scene, model_id="resunet"))
    assert result["result"]["provenance"]["checkpoint_sha256"]
    assert result["result"]["provenance"]["parameters"]["seed"] == 42
    assert result["result"]["metrics"] is None
