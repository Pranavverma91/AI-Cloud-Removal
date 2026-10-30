import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from config import Config
from models import db
from routes.auth_routes import auth_bp
from routes.analyze_routes import analyze_bp
from routes.dashboard_routes import dashboard_bp
from routes.analyses_routes import analyses_bp
from routes.report_routes import report_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    os.makedirs(app.config["RESULTS_FOLDER"], exist_ok=True)
    os.makedirs(app.config["REPORTS_FOLDER"], exist_ok=True)

    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)
    db.init_app(app)
    JWTManager(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(analyze_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(analyses_bp)
    app.register_blueprint(report_bp)

    # Serve uploaded/result/report images and the demo sample images
    @app.get("/uploads/<path:filename>")
    def serve_uploads(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    @app.get("/samples/<path:filename>")
    def serve_samples(filename):
        return send_from_directory(app.config["SAMPLE_DATA_FOLDER"], filename)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "SPACE-EYE API"}), 200

    # ---- Friendly error handlers (spec section 13) ----
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "The requested resource was not found."}), 404

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "File is too large. Maximum upload size is 12 MB."}), 413

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Something went wrong on our end. Please try again."}), 500

    with app.app_context():
        db.create_all()

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
