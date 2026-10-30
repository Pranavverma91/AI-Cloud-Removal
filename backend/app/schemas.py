import math
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from shapely.errors import GEOSException
from shapely.geometry import shape


def valid_geometry(value):
    if value is None:
        return None
    if len(str(value)) > 100_000:
        raise ValueError("Polygon is too complex")
    try:
        geometry = shape(value)
    except (ValueError, TypeError, KeyError, IndexError, AttributeError, GEOSException) as exc:
        raise ValueError("Provide a valid GeoJSON polygon") from exc
    if (
        geometry.geom_type not in {"Polygon", "MultiPolygon"}
        or not geometry.is_valid
        or geometry.is_empty
    ):
        raise ValueError("Provide a valid GeoJSON polygon")
    left, bottom, right, top = geometry.bounds
    if not (-180 <= left <= right <= 180 and -85 <= bottom <= top <= 85):
        raise ValueError("Use WGS84 longitude/latitude coordinates within ±85°")
    return value


class AnalysisInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    image_id: str
    model_id: str = "spatial-baseline"
    mask_id: str | None = None
    reference_id: str | None = None
    reference_relation: Literal[
        "none", "same-acquisition", "synthetic-ground-truth", "temporal"
    ] = "none"
    temporal_id: str | None = None
    sentinel1_id: str | None = None
    aoi: dict | None = None
    patch_size: Literal[256, 512] = 256
    overlap: int = Field(default=32, ge=16, le=128)
    brightness_threshold: float = Field(default=0.75, ge=0.4, le=0.99)
    detect_shadows: bool = True
    feather: int = Field(default=0, ge=0, le=16)
    seed: int = Field(default=42, ge=0, le=4294967295)
    target_crs: str | None = None
    resolution: float | None = Field(default=None, gt=0)

    _aoi = field_validator("aoi")(valid_geometry)

    @field_validator("resolution")
    @classmethod
    def finite_resolution(cls, value):
        if value is not None and not math.isfinite(value):
            raise ValueError("Resolution must be finite")
        return value


class AOIInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    geojson: dict
    _geometry = field_validator("geojson")(valid_geometry)
