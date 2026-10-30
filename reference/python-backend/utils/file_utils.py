import os
import uuid
import cv2
from werkzeug.utils import secure_filename
from flask import current_app


def allowed_file(filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in current_app.config["ALLOWED_EXTENSIONS"]


def save_upload(file_storage, subfolder=""):
    """Saves an uploaded werkzeug FileStorage, returns the saved path."""
    if not file_storage or file_storage.filename == "":
        raise ValueError("No file provided")
    if not allowed_file(file_storage.filename):
        raise ValueError("Unsupported file format. Use JPG, PNG, or TIFF.")

    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], subfolder)
    os.makedirs(folder, exist_ok=True)

    safe_name = secure_filename(file_storage.filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    path = os.path.join(folder, unique_name)
    file_storage.save(path)
    return path


def save_rgb_array(rgb_array, subfolder="results", prefix="result"):
    """Saves a numpy RGB array (as produced by image_processing modules) to disk."""
    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], subfolder)
    os.makedirs(folder, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex}.jpg"
    path = os.path.join(folder, filename)
    bgr = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
    cv2.imwrite(path, bgr)
    return path


def to_public_url(abs_path):
    """Converts an absolute path under UPLOAD_FOLDER into a /uploads/... URL."""
    if not abs_path:
        return None
    upload_root = current_app.config["UPLOAD_FOLDER"]
    rel = os.path.relpath(abs_path, upload_root)
    return f"/uploads/{rel.replace(os.sep, '/')}"


def sample_to_public_url(abs_path):
    """Converts an absolute path under SAMPLE_DATA_FOLDER into a /samples/... URL."""
    if not abs_path:
        return None
    return f"/samples/{os.path.basename(abs_path)}"


def resolve_public_url_to_path(url):
    """Reverses to_public_url / sample_to_public_url back to a filesystem path."""
    if not url:
        return None
    if url.startswith("/uploads/"):
        return os.path.join(current_app.config["UPLOAD_FOLDER"], url[len("/uploads/"):])
    if url.startswith("/samples/"):
        return os.path.join(current_app.config["SAMPLE_DATA_FOLDER"], url[len("/samples/"):])
    return url  # already a filesystem path
