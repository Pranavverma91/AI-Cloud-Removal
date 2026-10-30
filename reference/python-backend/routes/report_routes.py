from flask import Blueprint, request, jsonify, current_app, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import Analysis
from utils.file_utils import resolve_public_url_to_path
from utils.pdf_utils import build_report

report_bp = Blueprint("reports", __name__, url_prefix="/api/reports")


@report_bp.post("/generate")
@jwt_required()
def generate():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    analysis_id = data.get("analysis_id")

    if not analysis_id:
        return jsonify({"error": "analysis_id is required."}), 400

    analysis = Analysis.query.filter_by(id=analysis_id, user_id=user_id).first()
    if not analysis:
        return jsonify({"error": "Analysis not found."}), 404

    payload = analysis.to_dict()
    payload["original_image_path"] = resolve_public_url_to_path(payload["original_image_url"])
    payload["secondary_image_path"] = resolve_public_url_to_path(payload["secondary_image_url"])
    payload["result_image_path"] = resolve_public_url_to_path(payload["result_image_url"])

    try:
        pdf_path = build_report(payload, current_app.config["REPORTS_FOLDER"])
    except Exception:
        return jsonify({"error": "Report generation failed."}), 500

    filename = pdf_path.replace("\\", "/").split("/")[-1]
    return jsonify({"report_url": f"/api/reports/download/{filename}"}), 201


@report_bp.get("/download/<filename>")
@jwt_required()
def download(filename):
    import os
    path = os.path.join(current_app.config["REPORTS_FOLDER"], filename)
    if not os.path.exists(path):
        return jsonify({"error": "Report not found."}), 404
    return send_file(path, as_attachment=True, download_name=filename)
