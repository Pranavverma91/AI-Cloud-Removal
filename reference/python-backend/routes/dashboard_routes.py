from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import func
from models import db, Analysis

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dashboard_bp.get("/stats")
@jwt_required()
def stats():
    user_id = int(get_jwt_identity())

    counts = dict(
        db.session.query(Analysis.analysis_type, func.count(Analysis.id))
        .filter_by(user_id=user_id)
        .group_by(Analysis.analysis_type)
        .all()
    )
    total = sum(counts.values())

    recent = (
        Analysis.query.filter_by(user_id=user_id)
        .order_by(Analysis.created_at.desc())
        .limit(5)
        .all()
    )

    return jsonify({
        "total_analyses": total,
        "agriculture_count": counts.get("agriculture", 0),
        "water_count": counts.get("water", 0),
        "forest_count": counts.get("forest", 0),
        "recent_analyses": [a.to_dict() for a in recent],
    }), 200
