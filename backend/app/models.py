from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def now():
    return datetime.now(timezone.utc)


class Record:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Record, Base):
    __tablename__ = "users"
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)


class Session(Record, Base):
    __tablename__ = "sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PasswordReset(Record, Base):
    __tablename__ = "password_resets"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Project(Record, Base):
    __tablename__ = "projects"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))


class Image(Record, Base):
    __tablename__ = "satellite_images"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    path: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(40))
    sensor: Mapped[str] = mapped_column(String(60))
    acquired_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bands: Mapped[dict] = mapped_column(JSON)
    details: Mapped[dict] = mapped_column(JSON)
    sha256: Mapped[str] = mapped_column(String(64))


class AOI(Record, Base):
    __tablename__ = "areas_of_interest"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    geojson: Mapped[dict] = mapped_column(JSON)


class Model(Base):
    __tablename__ = "models"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    architecture: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(40), default="1.0")
    checkpoint: Mapped[str | None] = mapped_column(Text, nullable=True)
    checkpoint_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    required_auxiliary: Mapped[list] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    validation_metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    training_date: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Analysis(Record, Base):
    __tablename__ = "analyses"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    image_id: Mapped[str] = mapped_column(ForeignKey("satellite_images.id"))
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"))
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(40), default="Queued", index=True)
    parameters: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Job(Record, Base):
    __tablename__ = "processing_jobs"
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), unique=True)
    task_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    stages: Mapped[list] = mapped_column(JSON, default=list)


class CloudMask(Record, Base):
    __tablename__ = "cloud_masks"
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), unique=True)
    path: Mapped[str] = mapped_column(Text)
    statistics: Mapped[dict] = mapped_column(JSON)


class Reconstruction(Record, Base):
    __tablename__ = "reconstructions"
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), unique=True)
    path: Mapped[str] = mapped_column(Text)
    provenance: Mapped[dict] = mapped_column(JSON)


class Metric(Record, Base):
    __tablename__ = "metrics"
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), index=True)
    region: Mapped[str] = mapped_column(String(40))
    values: Mapped[dict] = mapped_column(JSON)


class Export(Record, Base):
    __tablename__ = "exports"
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"))
    kind: Mapped[str] = mapped_column(String(40))
    path: Mapped[str] = mapped_column(Text)


class ModelRun(Record, Base):
    __tablename__ = "model_runs"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"))
    dataset: Mapped[str] = mapped_column(Text)
    configuration: Mapped[dict] = mapped_column(JSON)
    history: Mapped[list] = mapped_column(JSON)
    checkpoint: Mapped[str] = mapped_column(Text)


class AuditLog(Record, Base):
    __tablename__ = "audit_logs"
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(60))
    details: Mapped[dict] = mapped_column(JSON)


CATALOG = [
    ("spatial-baseline", "Spatial interpolation", "Normalized convolution", []),
    (
        "temporal-baseline",
        "Temporal replacement",
        "Aligned temporal optical",
        ["temporal"],
    ),
    ("resunet", "ResUNet", "Residual U-Net", []),
    ("cgan", "Conditional GAN", "ResUNet + PatchGAN", []),
    ("diffusion", "Conditional diffusion", "Conditional DDPM", []),
    (
        "multimodal-diffusion",
        "Multimodal diffusion",
        "Optical/SAR attention DDPM",
        ["temporal", "sentinel1"],
    ),
]
