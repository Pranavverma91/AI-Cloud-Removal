import os
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)

    # Default to SQLite so the project runs out of the box with zero setup.
    # For the MySQL setup described in README.md / database/schema.sql, set:
    #   DATABASE_URL=mysql+pymysql://user:password@localhost/spaceeye
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'spaceeye.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
    RESULTS_FOLDER = os.path.join(BASE_DIR, "uploads", "results")
    REPORTS_FOLDER = os.path.join(BASE_DIR, "uploads", "reports")
    MAX_CONTENT_LENGTH = 12 * 1024 * 1024  # 12 MB upload limit
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "tif", "tiff"}

    SAMPLE_DATA_FOLDER = os.path.join(BASE_DIR, "sample_data")
