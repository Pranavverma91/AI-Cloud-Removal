"""
Generates synthetic 'satellite-like' sample images for Demo Mode, so the app
can be shown without real satellite imagery. Run once: python generate_samples.py
"""
import os
import numpy as np
import cv2

OUT = os.path.dirname(os.path.abspath(__file__))


def _noise(shape, scale=12):
    return (np.random.randn(*shape) * scale)


def make_agriculture_sample(path, size=512):
    img = np.zeros((size, size, 3), dtype=np.float32)
    xx, yy = np.meshgrid(np.linspace(0, 1, size), np.linspace(0, 1, size))
    # patchwork of fields with varying health via perlin-ish blend of sines
    field = (np.sin(xx * 14) * np.cos(yy * 11) + 1) / 2
    health = np.clip(field + np.random.randn(size, size) * 0.08, 0, 1)

    img[:, :, 0] = 60 + (1 - health) * 120   # more red where stressed
    img[:, :, 1] = 90 + health * 140         # more green where healthy
    img[:, :, 2] = 40 + (1 - health) * 30
    img += _noise(img.shape, 6)
    img = np.clip(img, 0, 255).astype(np.uint8)
    cv2.imwrite(path, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))


def make_water_sample(path, size=512):
    img = np.zeros((size, size, 3), dtype=np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    cx, cy = size * 0.6, size * 0.4
    river = ((xx - cx * (1 + 0.3 * np.sin(yy / 60))) ** 2 < (size * 0.045) ** 2)
    lake = ((xx - size * 0.25) ** 2 + (yy - size * 0.7) ** 2) < (size * 0.14) ** 2

    img[:, :, 0] = 90   # land base
    img[:, :, 1] = 120
    img[:, :, 2] = 60
    water_mask = river | lake
    img[water_mask] = [25, 70, 140]
    img += _noise(img.shape, 8)
    img = np.clip(img, 0, 255).astype(np.uint8)
    cv2.imwrite(path, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))


def make_forest_pair(path_before, path_after, size=512):
    xx, yy = np.meshgrid(np.linspace(0, 1, size), np.linspace(0, 1, size))
    forest_before = (np.sin(xx * 9) * np.cos(yy * 7) + 1) / 2
    forest_before = np.clip(forest_before + 0.25, 0, 1)

    img_before = np.zeros((size, size, 3), dtype=np.float32)
    img_before[:, :, 0] = 50
    img_before[:, :, 1] = 90 + forest_before * 130
    img_before[:, :, 2] = 40
    img_before += _noise(img_before.shape, 6)
    cv2.imwrite(path_before, cv2.cvtColor(np.clip(img_before, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))

    # simulate a cleared patch (deforestation) in the after image
    forest_after = forest_before.copy()
    cx, cy = int(size * 0.35), int(size * 0.45)
    rr = size * 0.18
    yyc, xxc = np.mgrid[0:size, 0:size]
    clear_mask = ((xxc - cx) ** 2 + (yyc - cy) ** 2) < rr ** 2
    forest_after[clear_mask] *= 0.15

    img_after = np.zeros((size, size, 3), dtype=np.float32)
    img_after[:, :, 0] = 50 + clear_mask * 60
    img_after[:, :, 1] = 90 + forest_after * 130
    img_after[:, :, 2] = 40
    img_after += _noise(img_after.shape, 6)
    cv2.imwrite(path_after, cv2.cvtColor(np.clip(img_after, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))


if __name__ == "__main__":
    np.random.seed(7)
    make_agriculture_sample(os.path.join(OUT, "agriculture_sample.jpg"))
    make_water_sample(os.path.join(OUT, "water_sample.jpg"))
    make_forest_pair(
        os.path.join(OUT, "forest_before.jpg"),
        os.path.join(OUT, "forest_after.jpg"),
    )
    print("Sample data generated in", OUT)
