import os
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, Analysis
from utils.file_utils import save_upload, save_rgb_array, to_public_url, sample_to_public_url
from image_processing.agriculture import analyze_agriculture
from image_processing.water import analyze_water
from image_processing.forest import analyze_forest_change

analyze_bp = Blueprint("analyze", __name__, url_prefix="/api/analyze")

# ---- Demo mode fixed results (fast, deterministic, clearly labelled) -------
DEMO_FILES = {
    "agriculture": "agriculture_sample.jpg",
    "water": "water_sample.jpg",
}


def _sample_path(filename):
    return os.path.join(current_app.config["SAMPLE_DATA_FOLDER"], filename)


def _common_meta(form):
    return {
        "location_name": form.get("location_name") or None,
        "latitude": float(form["latitude"]) if form.get("latitude") else None,
        "longitude": float(form["longitude"]) if form.get("longitude") else None,
        "is_demo": (form.get("demo") == "true"),
    }


@analyze_bp.post("/agriculture")
@jwt_required()
def agriculture():
    user_id = int(get_jwt_identity())
    meta = _common_meta(request.form)

    try:
        if meta["is_demo"]:
            image_path = _sample_path(DEMO_FILES["agriculture"])
        else:
            if "image" not in request.files:
                return jsonify({"error": "No image uploaded."}), 400
            image_path = save_upload(request.files["image"], subfolder="agriculture")

        result = analyze_agriculture(image_path)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        return jsonify({"error": "Analysis failed. Please try a different image."}), 500

    overlay_path = save_rgb_array(result["classification_overlay"], "results", "agri")

    analysis = Analysis(
        user_id=user_id,
        analysis_type="agriculture",
        location_name=meta["location_name"],
        latitude=meta["latitude"],
        longitude=meta["longitude"],
        is_demo=meta["is_demo"],
        result_summary=f"Healthy {result['healthy_pct']}%",
        original_image_path=sample_to_public_url(image_path) if meta["is_demo"] else to_public_url(image_path),
        result_image_path=to_public_url(overlay_path),
    )
    analysis.set_result({k: v for k, v in result.items() if k not in
                          ("classification_overlay", "vi_heatmap", "original")})
    db.session.add(analysis)
    db.session.commit()

    return jsonify({"analysis": analysis.to_dict()}), 201


@analyze_bp.post("/water")
@jwt_required()
def water():
    user_id = int(get_jwt_identity())
    meta = _common_meta(request.form)

    try:
        if meta["is_demo"]:
            image_path = _sample_path(DEMO_FILES["water"])
        else:
            if "image" not in request.files:
                return jsonify({"error": "No image uploaded."}), 400
            image_path = save_upload(request.files["image"], subfolder="water")

        result = analyze_water(image_path)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        return jsonify({"error": "Analysis failed. Please try a different image."}), 500

    overlay_path = save_rgb_array(result["overlay"], "results", "water")

    analysis = Analysis(
        user_id=user_id,
        analysis_type="water",
        location_name=meta["location_name"],
        latitude=meta["latitude"],
        longitude=meta["longitude"],
        is_demo=meta["is_demo"],
        result_summary=f"{result['coverage_pct']}% water",
        original_image_path=sample_to_public_url(image_path) if meta["is_demo"] else to_public_url(image_path),
        result_image_path=to_public_url(overlay_path),
    )
    analysis.set_result({k: v for k, v in result.items() if k not in
                          ("water_mask", "overlay", "original")})
    db.session.add(analysis)
    db.session.commit()

    return jsonify({"analysis": analysis.to_dict()}), 201


@analyze_bp.post("/forest")
@jwt_required()
def forest():
    user_id = int(get_jwt_identity())
    meta = _common_meta(request.form)

    try:
        if meta["is_demo"]:
            before_path = _sample_path("forest_before.jpg")
            after_path = _sample_path("forest_after.jpg")
        else:
            if "image_before" not in request.files or "image_after" not in request.files:
                return jsonify({"error": "Both a previous and current image are required."}), 400
            before_path = save_upload(request.files["image_before"], subfolder="forest")
            after_path = save_upload(request.files["image_after"], subfolder="forest")

        result = analyze_forest_change(before_path, after_path)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        return jsonify({"error": "Analysis failed. Please try different images."}), 500

    change_map_path = save_rgb_array(result["change_map"], "results", "forest")

    analysis = Analysis(
        user_id=user_id,
        analysis_type="forest",
        location_name=meta["location_name"],
        latitude=meta["latitude"],
        longitude=meta["longitude"],
        is_demo=meta["is_demo"],
        result_summary=f"{result['change_pct']}% vegetation change",
        original_image_path=sample_to_public_url(before_path) if meta["is_demo"] else to_public_url(before_path),
        secondary_image_path=sample_to_public_url(after_path) if meta["is_demo"] else to_public_url(after_path),
        result_image_path=to_public_url(change_map_path),
    )
    analysis.set_result({k: v for k, v in result.items() if k not in
                          ("change_map", "before", "after")})
    db.session.add(analysis)
    db.session.commit()

    return jsonify({"analysis": analysis.to_dict()}), 201
