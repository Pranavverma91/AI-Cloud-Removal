import argparse
import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from safetensors.torch import save_file
from torch.nn import functional as F
from torch.utils.data import DataLoader

from ai.models import PatchDiscriminator, make_model
from ai.training.data import PairedDataset


def train(
    data,
    output,
    model="resunet",
    epochs=50,
    batch_size=4,
    base=16,
    steps=100,
    seed=42,
    sar_low=None,
    sar_span=None,
):
    if epochs < 1 or batch_size < 1 or steps < 2 or base < 4 or base % 4:
        raise ValueError(
            "Positive epochs/batch, at least 2 diffusion steps, and a base width divisible by 4 are required"
        )
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    config = {
        "model": model,
        "base": base,
        "steps": steps,
        "seed": seed,
        "epochs": epochs,
        "batch_size": batch_size,
        "device": device,
        "dataset": str(Path(data).resolve()),
        "training_date": datetime.now(timezone.utc).isoformat(),
    }
    if model == "multimodal-diffusion":
        if sar_low is None or sar_span is None or min(sar_span) <= 0:
            raise ValueError(
                "Multimodal training needs the two SAR lows and positive spans used during patch preparation"
            )
        config.update(sar_low=sar_low, sar_span=sar_span)
    directory = Path(output)
    directory.mkdir(parents=True, exist_ok=False)
    network = make_model(model, config).to(device)
    config["parameters"] = sum(p.numel() for p in network.parameters())
    optimizer = torch.optim.AdamW(network.parameters(), lr=2e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)
    discriminator = PatchDiscriminator(base).to(device) if model == "cgan" else None
    disc_optimizer = (
        torch.optim.AdamW(discriminator.parameters(), lr=2e-4) if discriminator else None
    )
    train_loader = DataLoader(
        PairedDataset(data, "train", model == "multimodal-diffusion"),
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,
    )
    val_loader = DataLoader(
        PairedDataset(data, "val", model == "multimodal-diffusion"),
        batch_size=batch_size,
        num_workers=0,
    )
    history = []
    for epoch in range(1, epochs + 1):
        started = time.perf_counter()
        network.train()
        losses = []
        for condition, target, mask in train_loader:
            condition, target, mask = (v.to(device) for v in (condition, target, mask))
            optimizer.zero_grad()
            if hasattr(network, "loss"):
                loss = network.loss(condition, target, mask)
            else:
                prediction = network(condition)
                weight = 0.1 + mask
                loss = ((prediction - target).abs() * weight).sum() / (weight.sum() * 3)
                if discriminator:
                    disc_optimizer.zero_grad()
                    real = discriminator(condition, target)
                    fake = discriminator(condition, prediction.detach())
                    disc_loss = 0.5 * (
                        F.binary_cross_entropy_with_logits(real, torch.ones_like(real))
                        + F.binary_cross_entropy_with_logits(fake, torch.zeros_like(fake))
                    )
                    disc_loss.backward()
                    disc_optimizer.step()
                    discriminator.requires_grad_(False)
                    fake = discriminator(condition, prediction)
                    loss = loss + 0.01 * F.binary_cross_entropy_with_logits(
                        fake, torch.ones_like(fake)
                    )
            loss.backward()
            torch.nn.utils.clip_grad_norm_(network.parameters(), 1)
            optimizer.step()
            if discriminator:
                discriminator.requires_grad_(True)
            losses.append(float(loss.detach()))
        scheduler.step()
        network.eval()
        validation = []
        absolute = []
        with torch.inference_mode():
            for condition, target, mask in val_loader:
                condition, target, mask = (v.to(device) for v in (condition, target, mask))
                if hasattr(network, "sample"):
                    validation.append(float(network.loss(condition, target, mask)))
                    prediction = network.sample(condition)
                else:
                    prediction = network(condition)
                    validation.append(float((prediction - target).abs().mean()))
                valid_mask = mask.expand_as(target).bool()
                if valid_mask.any():
                    absolute.append(float((prediction - target).abs()[valid_mask].mean()))
        history.append(
            {
                "epoch": epoch,
                "train_loss": float(np.mean(losses)),
                "val_loss": float(np.mean(validation)),
                "val_mae": float(np.mean(absolute)) if absolute else None,
                "seconds": time.perf_counter() - started,
            }
        )
        save_file(
            {k: v.detach().cpu().contiguous() for k, v in network.state_dict().items()},
            directory / "model.safetensors",
        )
        state = {
            "epoch": epoch,
            "optimizer": optimizer.state_dict(),
            "scheduler": scheduler.state_dict(),
            "torch_rng": torch.get_rng_state(),
        }
        if discriminator:
            state.update(
                discriminator=discriminator.state_dict(),
                discriminator_optimizer=disc_optimizer.state_dict(),
            )
        torch.save(state, directory / "training-state.pt")
        (directory / "history.json").write_text(json.dumps(history, indent=2, allow_nan=False))
        (directory / "config.json").write_text(json.dumps(config, indent=2))
    return history


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train on prepared, disjoint paired raster patches"
    )
    parser.add_argument("--data", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--model",
        choices=["resunet", "cgan", "diffusion", "multimodal-diffusion"],
        default="resunet",
    )
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--base", type=int, default=16)
    parser.add_argument("--steps", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--sar-low", type=float, nargs=2)
    parser.add_argument("--sar-span", type=float, nargs=2)
    train(**vars(parser.parse_args()))
