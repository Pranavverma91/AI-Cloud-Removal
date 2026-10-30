from datetime import timedelta

from conftest import upload
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app.database import SessionLocal
from backend.app.main import app
from backend.app.models import PasswordReset, Session, now
from backend.app.security import digest


def test_auth_csrf_owner_isolation_and_logout(client, raster_scene):
    id_ = upload(client, raster_scene["cloudy_path"])
    assert (
        client.post("/auth/logout", headers={"Origin": "https://other.example"}).status_code == 403
    )
    with TestClient(app, headers={"X-Space-Eye": "1"}) as other:
        assert other.get("/images").status_code == 401
        assert (
            other.post(
                "/auth/signup",
                json={
                    "name": "Other",
                    "email": "b@example.com",
                    "password": "strong-test-password",
                },
            ).status_code
            == 201
        )
        assert other.get("/images").json() == []
        for suffix in ["", "/preview"]:
            assert other.get("/images/" + id_ + suffix).status_code == 404
        assert other.post("/analyses", json={"name": "Stolen", "image_id": id_}).status_code == 404
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401
    assert (
        client.post(
            "/auth/login", json={"email": "a@example.com", "password": "wrong-password"}
        ).status_code
        == 401
    )


def test_untrained_models_and_incorrect_reference_declarations_rejected(client, raster_scene):
    id_ = upload(client, raster_scene["cloudy_path"])
    for model in ["resunet", "cgan", "diffusion", "multimodal-diffusion"]:
        assert (
            client.post(
                "/analyses", json={"name": "Unavailable", "image_id": id_, "model_id": model}
            ).status_code
            == 422
        )
    assert (
        client.post(
            "/analyses", json={"name": "Bad reference", "image_id": id_, "reference_id": id_}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/analyses",
            json={"name": "Missing temporal", "image_id": id_, "model_id": "temporal-baseline"},
        ).status_code
        == 422
    )
    assert client.get("/dashboard").json()["analyses"] == 0


def test_password_reset_is_single_use_and_revokes_sessions(client):
    user = client.get("/auth/me").json()
    token = "reset-token-with-more-than-thirty-characters"
    with SessionLocal() as db:
        db.add(
            PasswordReset(
                user_id=user["id"],
                token_hash=digest(token),
                expires_at=now() + timedelta(minutes=5),
            )
        )
        db.commit()
        assert db.scalar(select(Session)).token_hash != client.cookies.get("space_eye_session")
    payload = {"token": token, "password": "replacement-strong-password"}
    assert client.post("/auth/reset", json=payload).status_code == 200
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/reset", json=payload).status_code == 400
    assert (
        client.post(
            "/auth/login", json={"email": user["email"], "password": payload["password"]}
        ).status_code
        == 200
    )


def test_bad_upload_geometry_and_queue_failure(client, raster_scene, monkeypatch):
    assert client.post("/images", files={"file": ("fake.tif", b"not-a-tiff")}).status_code == 422
    assert (
        client.post(
            "/aoi", json={"name": "Invalid", "geojson": {"type": "Point", "coordinates": [78, 28]}}
        ).status_code
        == 422
    )
    for geometry in [{}, {"type": "Polygon", "coordinates": "invalid"}]:
        assert (
            client.post("/aoi", json={"name": "Malformed", "geojson": geometry}).status_code == 422
        )
    id_ = upload(client, raster_scene["cloudy_path"])
    from backend.app.routers import science

    def unavailable(*args):
        raise ConnectionError("offline")

    monkeypatch.setattr(science.process_job, "delay", unavailable)
    assert (
        client.post("/analyses", json={"name": "Queue unavailable", "image_id": id_}).status_code
        == 503
    )
    assert client.get("/analyses").json()[0]["status"] == "Failed"
