import io
import json
from datetime import date
from pathlib import Path
from uuid import uuid4

import httpx
import numpy as np
import rasterio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from PIL import Image as PILImage
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform as project_xy
from rasterio.windows import Window
from sqlalchemy import select, text

from ..config import settings
from ..database import db_session
from ..models import AOI, Analysis, AuditLog, Export, Image, Job, Model, ModelRun
from ..schemas import AnalysisInput, AOIInput
from ..security import current_user, owned, rate_limit
from ..services.raster import inspect, preview, read_valid, sha256
from ..worker import process_job

router = APIRouter(tags=["Research"], dependencies=[Depends(current_user)])


def image_json(item):
    return {
        "id": item.id,
        "name": item.name,
        "role": item.role,
        "sensor": item.sensor,
        "acquired_at": item.acquired_at,
        "bands": item.bands,
        "metadata": item.details,
        "sha256": item.sha256,
        "created_at": item.created_at,
    }


def analysis_json(item):
    result = {key: value for key, value in (item.result or {}).items() if key != "products"} or None
    return {
        "id": item.id,
        "name": item.name,
        "image_id": item.image_id,
        "model_id": item.model_id,
        "status": item.status,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "parameters": item.parameters,
        "result": result,
        "error": item.error,
        "products": list((item.result or {}).get("products", {})),
    }


def model_json(model):
    baseline = model.id in {"spatial-baseline", "temporal-baseline"}
    available = model.enabled and (
        baseline or bool(model.checkpoint and Path(model.checkpoint).is_file())
    )
    return {
        "id": model.id,
        "name": model.name,
        "architecture": model.architecture,
        "version": model.version,
        "available": available,
        "baseline": baseline,
        "required_auxiliary": model.required_auxiliary,
        "training_date": model.training_date,
        "validation_metrics": model.validation_metrics,
        "reason": None if available else "Compatible trained weights have not been registered",
    }


@router.post("/images", status_code=201)
async def upload(
    file: UploadFile = File(),
    role: str = Form("cloudy"),
    sensor: str = Form("LISS-IV"),
    bands: str = Form('{"green":1,"red":2,"nir":3}'),
    acquired_at: str = Form(""),
    user=Depends(current_user),
    db=Depends(db_session),
):
    rate_limit("upload:" + user.id, 30, 3600)
    if role not in {
        "cloudy",
        "clear",
        "mask",
        "temporal",
        "sentinel1",
        "sentinel2",
        "dem",
        "synthetic",
    }:
        raise HTTPException(422, "Unsupported image role")
    path = settings().storage_dir.resolve() / "inputs" / (str(uuid4()) + ".tif")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if acquired_at:
            date.fromisoformat(acquired_at)
        mapping = json.loads(bands)
        total = 0
        with path.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings().max_upload_mb * 1024 * 1024:
                    raise ValueError("File exceeds upload size limit")
                target.write(chunk)
        metadata = inspect(path, settings().max_raster_pixels)
        required = (
            ["vv", "vh"]
            if role == "sentinel1"
            else ["green", "red", "nir"]
            if role not in {"mask", "dem"}
            else ["mask" if role == "mask" else "elevation"]
        )
        if (
            not isinstance(mapping, dict)
            or any(
                type(mapping.get(key)) is not int or not 1 <= mapping[key] <= metadata["count"]
                for key in required
            )
            or len({mapping[k] for k in required}) != len(required)
        ):
            raise ValueError("Map distinct valid band indices for the selected image role")
        image = Image(
            owner_id=user.id,
            name=Path(file.filename or "observation.tif").name[:200],
            path=str(path),
            role=role,
            sensor=sensor[:60],
            acquired_at=acquired_at or None,
            bands=mapping,
            details=metadata,
            sha256=sha256(path),
        )
        db.add(image)
        db.flush()
        if db.bind.dialect.name == "postgresql":
            left, bottom, right, top = metadata["bounds"]
            db.execute(
                text(
                    "UPDATE satellite_images SET footprint=ST_MakeEnvelope(:l,:b,:r,:t,4326) WHERE id=:id"
                ),
                {"l": left, "b": bottom, "r": right, "t": top, "id": image.id},
            )
        db.add(
            AuditLog(
                owner_id=user.id,
                action="image.uploaded",
                details={"image_id": image.id, "sha256": image.sha256},
            )
        )
        db.commit()
        return image_json(image)
    except (ValueError, rasterio.errors.RasterioError) as exc:
        db.rollback()
        path.unlink(missing_ok=True)
        raise HTTPException(422, str(exc)) from exc
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/images")
def images(user=Depends(current_user), db=Depends(db_session)):
    return [
        image_json(i)
        for i in db.scalars(
            select(Image).where(Image.owner_id == user.id).order_by(Image.created_at.desc())
        )
    ]


@router.get("/images/{id_}")
def image(id_: str, user=Depends(current_user), db=Depends(db_session)):
    return image_json(owned(db, Image, id_, user))


@router.get("/images/{id_}/preview")
def image_preview(id_: str, user=Depends(current_user), db=Depends(db_session)):
    item = owned(db, Image, id_, user)
    bands = (
        [item.bands[k] for k in ("nir", "red", "green")]
        if "nir" in item.bands
        else [next(iter(item.bands.values()))]
    )
    return Response(
        preview(item.path, bands=bands, kind="mask" if item.role == "mask" else "optical"),
        media_type="image/png",
        headers={"Cache-Control": "private, no-store"},
    )


def compatible(source, other):
    if other.sensor != source.sensor or not {"green", "red", "nir"} <= other.bands.keys():
        raise HTTPException(
            422,
            "Optical references must use the same sensor and mapped Green/Red/NIR bands",
        )
    for key in ("scales", "offsets"):
        a = [source.details[key][source.bands[k] - 1] for k in ("green", "red", "nir")]
        b = [other.details[key][other.bands[k] - 1] for k in ("green", "red", "nir")]
        if not np.allclose(a, b):
            raise HTTPException(422, "Reference radiometry differs; calibrate it before processing")


@router.post("/analyses", status_code=202)
def create_analysis(data: AnalysisInput, user=Depends(current_user), db=Depends(db_session)):
    rate_limit("analysis:" + user.id, 20, 3600)
    image = owned(db, Image, data.image_id, user)
    if not {"green", "red", "nir"} <= image.bands.keys():
        raise HTTPException(422, "Choose an optical image with Green/Red/NIR mapping")
    model = db.get(Model, data.model_id)
    if not model or not model_json(model)["available"]:
        raise HTTPException(
            422, "Requested model is unavailable; register compatible trained weights"
        )
    for required in model.required_auxiliary:
        if not getattr(data, required + "_id"):
            raise HTTPException(422, f"This model requires {required} imagery")
    for key in ("mask", "reference", "temporal", "sentinel1"):
        id_ = getattr(data, key + "_id")
        if id_:
            item = owned(db, Image, id_, user)
            if key in {"reference", "temporal"}:
                compatible(image, item)
            if key == "mask" and item.role != "mask":
                raise HTTPException(422, "Select an uploaded class mask")
            if key == "sentinel1" and not {"vv", "vh"} <= item.bands.keys():
                raise HTTPException(422, "SAR requires calibrated VV/VH band mapping")
    if bool(data.reference_id) != (data.reference_relation != "none"):
        raise HTTPException(422, "Set the reference relationship accurately")
    if (
        data.model_id == "multimodal-diffusion"
        and not {"sar_low", "sar_span"} <= model.config.keys()
    ):
        raise HTTPException(422, "Registered SAR normalization is missing")
    analysis = Analysis(
        owner_id=user.id,
        image_id=image.id,
        model_id=model.id,
        name=data.name,
        parameters=data.model_dump(),
    )
    db.add(analysis)
    db.flush()
    job = Job(analysis_id=analysis.id, stages=[])
    db.add(job)
    db.commit()
    try:
        job.task_id = process_job.delay(analysis.id).id
        db.commit()
    except Exception as exc:
        analysis.status, analysis.error = (
            "Failed",
            "Queue unavailable; no processing started",
        )
        db.commit()
        raise HTTPException(503, analysis.error) from exc
    return analysis_json(analysis)


@router.get("/analyses")
def analyses(user=Depends(current_user), db=Depends(db_session)):
    return [
        analysis_json(a)
        for a in db.scalars(
            select(Analysis)
            .where(Analysis.owner_id == user.id)
            .order_by(Analysis.created_at.desc())
        )
    ]


@router.get("/analyses/{id_}")
def analysis(id_: str, user=Depends(current_user), db=Depends(db_session)):
    a = owned(db, Analysis, id_, user)
    result = analysis_json(a)
    job = db.scalar(select(Job).where(Job.analysis_id == id_))
    result["stages"] = job.stages if job else []
    return result


def product(db, id_, kind, user):
    analysis = owned(db, Analysis, id_, user)
    if analysis.status != "Completed" or kind not in (analysis.result or {}).get("products", {}):
        raise HTTPException(404, "Product unavailable")
    return analysis, Path(analysis.result["products"][kind])


@router.get("/analyses/{id_}/preview/{kind}")
def analysis_preview(id_: str, kind: str, user=Depends(current_user), db=Depends(db_session)):
    _, path = product(db, id_, kind, user)
    png = path.with_name(kind + ".png")
    if not png.is_file():
        raise HTTPException(404, "Preview unavailable for this product")
    return FileResponse(png, media_type="image/png", headers={"Cache-Control": "private, no-store"})


@router.get("/analyses/{id_}/exports/{kind}")
def export(id_: str, kind: str, user=Depends(current_user), db=Depends(db_session)):
    a = owned(db, Analysis, id_, user)
    if a.status != "Completed":
        raise HTTPException(404, "Result unavailable")
    if kind in {"metadata", "report"}:
        path = Path(a.result["products"]["reconstruction"]).with_name(
            "metadata.json" if kind == "metadata" else "report.html"
        )
    else:
        _, path = product(db, id_, kind, user)
    db.add(Export(analysis_id=id_, kind=kind, path=str(path)))
    db.commit()
    return FileResponse(
        path,
        filename=f"SPACE-EYE-{id_}-{path.name}",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/analyses/{id_}/pixel")
def pixel(
    id_: str,
    lon: float = Query(ge=-180, le=180),
    lat: float = Query(ge=-85, le=85),
    user=Depends(current_user),
    db=Depends(db_session),
):
    a, _ = product(db, id_, "reconstruction", user)
    result = {"longitude": lon, "latitude": lat, "values": {}}
    for key in ("original", "reconstruction", "reference", "ndvi", "mask"):
        if key not in a.result["products"]:
            continue
        with rasterio.open(a.result["products"][key]) as src:
            x, y = project_xy("EPSG:4326", src.crs, [lon], [lat])
            row, col = src.index(x[0], y[0])
            if not (0 <= row < src.height and 0 <= col < src.width):
                continue
            values, valid = read_valid(src, Window(col, row, 1, 1))
            result["values"][key] = values[:, 0, 0].tolist() if valid[0, 0] else None
    return result


@router.get("/analyses/{id_}/tiles/{kind}/{z}/{x}/{y}.png")
def tile(
    id_: str,
    kind: str,
    z: int,
    x: int,
    y: int,
    user=Depends(current_user),
    db=Depends(db_session),
):
    a, path = product(db, id_, kind, user)
    if not (0 <= z <= 22 and 0 <= x < 2**z and 0 <= y < 2**z):
        raise HTTPException(422, "Invalid tile coordinate")
    half = 20037508.342789244
    size = 2 * half / 2**z
    bounds = (
        -half + x * size,
        half - (y + 1) * size,
        -half + (x + 1) * size,
        half - y * size,
    )
    with (
        rasterio.open(path) as src,
        WarpedVRT(
            src,
            crs="EPSG:3857",
            transform=from_bounds(*bounds, 256, 256),
            width=256,
            height=256,
            dtype="float32",
            nodata=float("nan"),
            resampling=Resampling.nearest if kind == "mask" else Resampling.bilinear,
        ) as vrt,
    ):
        values, valid = read_valid(vrt)
        if src.count >= 3:
            low, span = map(np.asarray, a.result["stretch"])
            rgb = (
                np.moveaxis(
                    np.clip(
                        (values[[2, 1, 0]] - low[[2, 1, 0], None, None])
                        / span[[2, 1, 0], None, None],
                        0,
                        1,
                    ),
                    0,
                    -1,
                )
                * 255
            )
        elif kind == "mask":
            rgb = np.array([[20, 70, 65], [245, 250, 255], [95, 65, 145]], "uint8")[
                np.clip(np.nan_to_num(values[0]), 0, 2).astype(int)
            ]
        else:
            t = np.clip((values[0] + 1) / 2, 0, 1)
            rgb = np.stack([220 * (1 - t), 95 + 95 * t, 65 + 25 * t], -1)
        rgba = np.dstack([np.nan_to_num(rgb).astype("uint8"), valid.astype("uint8") * 255])
        out = io.BytesIO()
        PILImage.fromarray(rgba).save(out, "PNG")
        return Response(
            out.getvalue(),
            media_type="image/png",
            headers={"Cache-Control": "private, no-store"},
        )


@router.get("/models")
def models(db=Depends(db_session)):
    return [model_json(m) for m in db.scalars(select(Model))]


@router.get("/experiments")
def experiments(user=Depends(current_user), db=Depends(db_session)):
    return [
        {
            "id": r.id,
            "model_id": r.model_id,
            "dataset": r.dataset,
            "configuration": r.configuration,
            "history": r.history,
            "created_at": r.created_at,
        }
        for r in db.scalars(
            select(ModelRun)
            .where(ModelRun.owner_id == user.id)
            .order_by(ModelRun.created_at.desc())
        )
    ]


@router.get("/dashboard")
def dashboard(user=Depends(current_user), db=Depends(db_session)):
    all_images = list(db.scalars(select(Image).where(Image.owner_id == user.id)))
    jobs = list(
        db.scalars(
            select(Analysis)
            .where(Analysis.owner_id == user.id)
            .order_by(Analysis.created_at.desc())
        )
    )
    completed = [a for a in jobs if a.status == "Completed"]
    return {
        "images": len(all_images),
        "analyses": len(jobs),
        "completed": len(completed),
        "processing": sum(a.status not in {"Completed", "Failed"} for a in jobs),
        "processed_area_m2": sum(a.result["area_m2"]["valid"] for a in completed),
        "recent": [analysis_json(a) for a in jobs[:8]],
        "cloud_coverage": [
            {"name": a.name, "percent": a.result["cloud_percent"]} for a in completed
        ],
        "models": [model_json(m) for m in db.scalars(select(Model))],
    }


@router.get("/aoi")
def areas(user=Depends(current_user), db=Depends(db_session)):
    return [
        {"id": a.id, "name": a.name, "geojson": a.geojson}
        for a in db.scalars(select(AOI).where(AOI.owner_id == user.id))
    ]


@router.post("/aoi", status_code=201)
def save_area(data: AOIInput, user=Depends(current_user), db=Depends(db_session)):
    a = AOI(owner_id=user.id, **data.model_dump())
    db.add(a)
    db.flush()
    if db.bind.dialect.name == "postgresql":
        db.execute(
            text(
                "UPDATE areas_of_interest SET geometry=ST_SetSRID(ST_GeomFromGeoJSON(:geo),4326) WHERE id=:id"
            ),
            {"geo": json.dumps(a.geojson), "id": a.id},
        )
    db.commit()
    return {"id": a.id, "name": a.name, "geojson": a.geojson}


@router.get("/geography/places")
def places(q: str = Query(min_length=2, max_length=160)):
    try:
        response = httpx.get(
            "https://photon.komoot.io/api/", params={"q": q, "limit": 6}, timeout=15
        )
        response.raise_for_status()
        return response.json()["features"]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(503, "Place search unavailable") from exc


@router.get("/geography/scenes")
def scenes(
    lon: float = Query(ge=-180, le=180),
    lat: float = Query(ge=-85, le=85),
    sensor: str = "sentinel-2",
    start: str = "2025-01-01",
    end: str = "2026-12-31",
    cloud: float = Query(default=30, ge=0, le=100),
):
    try:
        date.fromisoformat(start)
        date.fromisoformat(end)
    except ValueError as exc:
        raise HTTPException(422, "Use ISO acquisition dates") from exc
    if sensor not in {"sentinel-1", "sentinel-2"}:
        raise HTTPException(422, "LISS-IV requires licensed manual upload")
    body = {
        "collections": ["sentinel-1-rtc" if sensor == "sentinel-1" else "sentinel-2-l2a"],
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": 12,
    }
    if sensor == "sentinel-2":
        body["query"] = {"eo:cloud_cover": {"lte": cloud}}
    try:
        response = httpx.post(
            "https://planetarycomputer.microsoft.com/api/stac/v1/search",
            json=body,
            timeout=25,
        )
        response.raise_for_status()
        return [
            {
                "id": f["id"],
                "collection": f["collection"],
                "datetime": f["properties"].get("datetime"),
                "cloud_cover": f["properties"].get("eo:cloud_cover"),
                "bbox": f.get("bbox"),
            }
            for f in response.json()["features"]
        ]
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise HTTPException(503, "Satellite catalogue unavailable") from exc
