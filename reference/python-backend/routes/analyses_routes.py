from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import Analysis

analyses_bp = Blueprint("analyses", __name__, url_prefix="/api/analyses")


@analyses_bp.get("")
@jwt_required()
def list_analyses():
    user_id = int(get_jwt_identity())
    items = (
        Analysis.query.filter_by(user_id=user_id)
        .order_by(Analysis.created_at.desc())
        .all()
    )
    return jsonify({"analyses": [a.to_dict() for a in items]}), 200


@analyses_bp.get("/<int:analysis_id>")
@jwt_required()
def get_analysis(analysis_id):
    user_id = int(get_jwt_identity())
    item = Analysis.query.filter_by(id=analysis_id, user_id=user_id).first()
    if not item:
        return jsonify({"error": "Analysis not found."}), 404
    return jsonify({"analysis": item.to_dict()}), 200
