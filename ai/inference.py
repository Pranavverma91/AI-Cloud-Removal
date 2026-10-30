import numpy as np

from backend.app.services.raster import sha256


def positions(length, size, overlap):
    starts = list(range(0, max(1, length - size + 1), size - overlap))
    return sorted(set(starts + [max(0, length - size)]))


def blend_weights(height, width):
    return np.maximum(
        np.outer(np.hanning(max(height, 2))[:height], np.hanning(max(width, 2))[:width]),
        0.01,
    ).astype("float32")


class NeuralPredictor:
    def __init__(self, model, seed=42):
        import torch
        from safetensors.torch import load_file

        from .models import make_model

        if (
            not model.checkpoint
            or not model.checkpoint_sha256
            or sha256(model.checkpoint) != model.checkpoint_sha256
        ):
            raise ValueError("Validated checkpoint is unavailable or its checksum has changed")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        torch.manual_seed(seed)
        self.network = make_model(model.id, model.config).to(self.device)
        self.network.load_state_dict(load_file(model.checkpoint), strict=True)
        self.network.eval()
        self.model_id = model.id

    def predict(self, condition):
        import torch

        with torch.inference_mode():
            tensor = torch.from_numpy(condition[None].astype("float32")).to(self.device)
            h, w = tensor.shape[-2:]
            tensor = torch.nn.functional.pad(tensor, (0, (-w) % 4, 0, (-h) % 4), mode="replicate")
            result = (
                self.network.sample(tensor)
                if hasattr(self.network, "sample")
                else self.network(tensor)
            )
            return result[0, :, :h, :w].float().cpu().numpy()
