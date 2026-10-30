from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset


class PairedDataset(Dataset):
    def __init__(self, directory, split, multimodal=False):
        self.files = sorted((Path(directory) / split).glob("*.npz"))
        if not self.files:
            raise ValueError(f"No prepared patches for split {split}")
        self.augment = split == "train"
        self.multimodal = multimodal

    def __len__(self):
        return len(self.files)

    def __getitem__(self, index):
        with np.load(self.files[index], allow_pickle=False) as archive:
            keys = ["cloudy", "clear", "mask"] + (["temporal", "sar"] if self.multimodal else [])
            values = {key: archive[key].astype("float32") for key in keys}
        if self.augment:
            rotations = int(np.random.randint(4))
            flip = bool(np.random.randint(2))
            for key in values:
                values[key] = np.rot90(values[key], rotations, axes=(-2, -1))
                if flip:
                    values[key] = values[key][..., ::-1]
            gain, offset = (
                float(np.random.uniform(0.95, 1.05)),
                float(np.random.uniform(-0.025, 0.025)),
            )
            for key in ["cloudy", "clear", "temporal"]:
                if key in values:
                    values[key] = np.clip(values[key] * gain + offset, 0, 1)
        condition = [values["cloudy"], values["mask"]]
        if self.multimodal:
            condition.extend([values["temporal"], values["sar"]])
        return tuple(
            torch.from_numpy(np.ascontiguousarray(v))
            for v in [np.concatenate(condition), values["clear"], values["mask"]]
        )
