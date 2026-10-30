from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://spaceeye:spaceeye@localhost:5432/spaceeye"
    redis_url: str = "redis://localhost:6379/0"
    storage_dir: Path = Path("data/storage")
    model_dir: Path = Path("data/checkpoints")
    allowed_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"
    session_secure: bool = True
    session_hours: int = 24
    max_upload_mb: int = 256
    max_raster_pixels: int = 100_000_000
    testing: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    @property
    def origins(self):
        return [s.strip() for s in self.allowed_origins.split(",") if s.strip()]


@lru_cache
def settings():
    return Settings()
