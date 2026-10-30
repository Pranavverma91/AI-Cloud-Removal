import argparse
import json
import shutil
from pathlib import Path
from uuid import uuid4

from safetensors.torch import load_file
from sqlalchemy import select

from ai.models import make_model
from backend.app.config import settings
from backend.app.database import SessionLocal, verify_schema
from backend.app.models import Model, ModelRun, User
from backend.app.services.raster import sha256


def register(run, owner_email):
    verify_schema()
    run = Path(run)
    config = json.loads((run / "config.json").read_text())
    history = json.loads((run / "history.json").read_text())
    if not history:
        raise ValueError("Measured training history is required")
    model = make_model(config["model"], config)
    model.load_state_dict(load_file(run / "model.safetensors"), strict=True)
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == owner_email.lower()))
        entry = db.get(Model, config["model"])
        if not owner or not entry:
            raise ValueError("Research account or model registry entry unavailable")
        destination = settings().model_dir.resolve() / f"{entry.id}-{uuid4()}.safetensors"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(run / "model.safetensors", destination)
        entry.checkpoint = str(destination)
        entry.checkpoint_sha256 = sha256(destination)
        entry.config = config
        entry.training_date = config["training_date"]
        entry.version = str(uuid4())[:12]
        entry.enabled = True
        entry.validation_metrics = {
            "normalized_masked_mae": history[-1].get("val_mae"),
            "validation_loss": history[-1]["val_loss"],
        }
        record = ModelRun(
            owner_id=owner.id,
            model_id=entry.id,
            dataset=config["dataset"],
            configuration=config,
            history=history,
            checkpoint=str(destination),
        )
        db.add(record)
        db.commit()
        return record.id


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("run")
    parser.add_argument("--owner-email", required=True)
    print(register(**vars(parser.parse_args())))
