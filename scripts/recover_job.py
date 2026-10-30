"""Mark a stale claimed job failed only after its owning worker has stopped."""

import argparse

from backend.app.database import SessionLocal
from backend.app.models import Analysis, now

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("analysis_id")
    parser.add_argument("--worker-stopped", action="store_true")
    args = parser.parse_args()
    if not args.worker_stopped:
        parser.error("Stop the owning worker, then pass --worker-stopped")
    with SessionLocal() as db:
        analysis = db.get(Analysis, args.analysis_id)
        if not analysis or analysis.status in {"Completed", "Failed"}:
            parser.error("No stale active job found")
        analysis.status = "Failed"
        analysis.error = "Operator marked stale after worker shutdown. Submit a new analysis."
        analysis.updated_at = now()
        db.commit()
