from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


cfg = settings()
if cfg.database_url.startswith("sqlite") and not cfg.testing:
    raise RuntimeError("SQLite is permitted only with TESTING=true")
engine = create_engine(cfg.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def db_session():
    with SessionLocal() as db:
        yield db


def verify_schema():
    try:
        with engine.connect() as conn:
            if (
                conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
                != "0001_science"
            ):
                raise RuntimeError("Unexpected schema version")
            if conn.dialect.name == "postgresql":
                conn.execute(text("SELECT PostGIS_Version()"))
    except Exception as exc:
        raise RuntimeError(
            "Database not ready. Run alembic -c backend/alembic.ini upgrade head"
        ) from exc
