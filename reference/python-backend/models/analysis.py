from datetime import datetime, timezone
import json
from . import db


class Analysis(db.Model):
    __tablename__ = "analyses"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)

    analysis_type = db.Column(db.String(20), nullable=False)   # agriculture | water | forest
    location_name = db.Column(db.String(180))
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)

    status = db.Column(db.String(20), default="completed")     # completed | failed
    is_demo = db.Column(db.Boolean, default=False)

    result_summary = db.Column(db.String(255))   # short human string, e.g. "18.4% water"
    result_json = db.Column(db.Text)              # full metrics as JSON

    original_image_path = db.Column(db.String(400))
    result_image_path = db.Column(db.String(400))
    secondary_image_path = db.Column(db.String(400))  # for forest "after" image

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    def set_result(self, result_dict):
        self.result_json = json.dumps(result_dict)

    def get_result(self):
        return json.loads(self.result_json) if self.result_json else {}

    def to_dict(self):
        return {
            "id": self.id,
            "analysis_type": self.analysis_type,
            "location_name": self.location_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "status": self.status,
            "is_demo": self.is_demo,
            "result_summary": self.result_summary,
            "result": self.get_result(),
            "original_image_url": self.original_image_path,
            "result_image_url": self.result_image_path,
            "secondary_image_url": self.secondary_image_path,
            "created_at": self.created_at.isoformat(),
        }
