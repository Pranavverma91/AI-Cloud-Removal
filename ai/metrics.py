import math

import numpy as np
from scipy.ndimage import binary_erosion
from skimage.metrics import structural_similarity


def ndvi(values, scales=(1, 1, 1), offsets=(0, 0, 0)):
    red, nir = values[1] * scales[1] + offsets[1], values[2] * scales[2] + offsets[2]
    denominator = nir + red
    return np.divide(
        nir - red,
        denominator,
        out=np.full(red.shape, np.nan, "float32"),
        where=np.abs(denominator) > 1e-8,
    )


class Accumulator:
    def __init__(self, data_range):
        self.data_range = float(data_range)
        self.n = 0
        self.absolute = self.square = self.angle = 0.0
        self.angle_n = 0
        self.band_square = np.zeros(3, "float64")
        self.band_sum = np.zeros(3, "float64")
        self.ssim_sum = 0.0
        self.ssim_n = 0

    def add(self, estimate, reference, region, valid, core=None):
        selected = region & valid
        if core is not None:
            selected &= core
        if not selected.any():
            return
        e, r = (
            estimate[:, selected].astype("float64"),
            reference[:, selected].astype("float64"),
        )
        delta = e - r
        n = e.shape[1]
        self.n += n
        self.absolute += np.abs(delta).sum()
        self.square += np.square(delta).sum()
        self.band_square += np.square(delta).sum(axis=1)
        self.band_sum += r.sum(axis=1)
        denom = np.linalg.norm(e, axis=0) * np.linalg.norm(r, axis=0)
        angular = denom > 1e-12
        angles = np.arccos(
            np.clip((e[:, angular] * r[:, angular]).sum(axis=0) / denom[angular], -1, 1)
        )
        self.angle += np.degrees(angles).sum()
        self.angle_n += angular.sum()
        if min(region.shape) >= 7:
            centers = binary_erosion(
                region & valid, structure=np.ones((7, 7), bool), border_value=0
            )
            if core is not None:
                centers &= core
            if centers.any():
                for band in range(3):
                    _, score = structural_similarity(
                        np.where(valid, estimate[band], 0),
                        np.where(valid, reference[band], 0),
                        data_range=self.data_range,
                        full=True,
                    )
                    self.ssim_sum += score[centers].sum()
                    self.ssim_n += centers.sum()

    def result(self):
        if not self.n:
            return None
        mse = self.square / (self.n * 3)
        means = self.band_sum / self.n
        ergas = (
            100 * np.sqrt(np.mean((self.band_square / self.n) / np.square(means)))
            if np.all(np.abs(means) > 1e-10)
            else None
        )
        return {
            "pixels": int(self.n),
            "mae": float(self.absolute / (self.n * 3)),
            "rmse": math.sqrt(mse),
            "psnr": 10 * math.log10(self.data_range**2 / mse) if mse > 0 else None,
            "ssim": float(self.ssim_sum / self.ssim_n) if self.ssim_n else None,
            "sam": float(self.angle / self.angle_n) if self.angle_n else None,
            "ergas": float(ergas) if ergas is not None else None,
        }
