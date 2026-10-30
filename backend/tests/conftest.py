import os
import tempfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

TEST_ROOT = tempfile.TemporaryDirectory(prefix="space-eye-tests-")
os.environ.update(
    TESTING="true",
    DATABASE_URL=f"sqlite:///{TEST_ROOT.name}/test.db",
    STORAGE_DIR=f"{TEST_ROOT.name}/storage",
    MODEL_DIR=f"{TEST_ROOT.name}/models",
    SESSION_SECURE="false",
    ALLOWED_ORIGINS="http://testserver",
)

from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.database import Base, SessionLocal, engine
from backend.app.main import app
from backend.app.models import CATALOG, Model
from backend.app.routers import science


@pytest.fixture(autouse=True)
def database(monkeypatch):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))")
        )
        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(text("INSERT INTO alembic_version VALUES ('0001_science')"))
    with SessionLocal() as db:
        db.add_all(
            [
                Model(
                    id=id_,
                    name=name,
                    architecture=architecture,
                    required_auxiliary=aux,
                    enabled=id_.endswith("baseline"),
                )
                for id_, name, architecture, aux in CATALOG
            ]
        )
        db.commit()
    monkeypatch.setattr(
        science.process_job, "delay", lambda id_: SimpleNamespace(id="test-dispatch")
    )


@pytest.fixture
def client():
    with TestClient(app, headers={"X-Space-Eye": "1", "Origin": "http://testserver"}) as value:
        result = value.post(
            "/auth/signup",
            json={
                "name": "Researcher A",
                "email": "a@example.com",
                "password": "strong-test-password",
            },
        )
        assert result.status_code == 201, result.text
        yield value


@pytest.fixture
def raster_scene(tmp_path):
    yy, xx = np.mgrid[:280, :300]
    clear = np.stack([120 + xx + yy, 240 + xx // 2 + yy, 600 + xx + yy]).astype("uint16")
    mask = np.zeros((280, 300), "uint8")
    mask[70:145, 90:170] = 1
    mask[145:158, 90:170] = 2
    cloudy = clear.copy()
    cloudy[:, mask == 1] = 1800
    cloudy[:, mask == 2] = 50
    clear[:, 0, 0] = 0
    cloudy[:, 0, 0] = 0

    def write(name, values, nodata=None):
        path = tmp_path / name
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            width=values.shape[2],
            height=values.shape[1],
            count=len(values),
            dtype=values.dtype,
            crs="EPSG:32643",
            transform=from_origin(760000, 3200000, 5.8, 5.8),
            nodata=nodata,
        ) as target:
            target.write(values)
        return path

    return {
        "clear": clear,
        "cloudy": cloudy,
        "mask": mask,
        "clear_path": write("clear.tif", clear, 0),
        "cloudy_path": write("cloudy.tif", cloudy, 0),
        "mask_path": write("mask.tif", np.stack([np.zeros_like(mask), mask])),
        "write": write,
    }


def upload(client, path, role="cloudy", bands=None):
    import json

    with Path(path).open("rb") as file:
        response = client.post(
            "/images",
            files={"file": (Path(path).name, file, "image/tiff")},
            data={
                "role": role,
                "sensor": "LISS-IV",
                "bands": json.dumps(bands or {"green": 1, "red": 2, "nir": 3}),
            },
        )
    assert response.status_code == 201, response.text
    return response.json()["id"]
