"""
Water body detection using a simple spectral-index + thresholding approach.

Real satellite water detection typically uses NDWI (Green/NIR bands). With
RGB-only input we approximate the same idea with a proxy index built from the
blue and green channels, then clean it up with morphological operations
(no ML model, no deep learning — matches the "keep it simple" brief).
"""
import cv2
import numpy as np


def analyze_water(path, max_dim=900):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read image file")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    h, w = img.shape[:2]
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    img_f = img.astype(np.float32)
    r, g, b = img_f[:, :, 0], img_f[:, :, 1], img_f[:, :, 2]

    # Proxy water index: water tends to be darker overall and bluer than land/veg
    wi = (b - r) / (b + r + 1e-6)
    brightness = (r + g + b) / 3

    water_mask = (wi > 0.02) & (brightness < 160)

    # Clean up small speckle noise with morphological opening/closing
    mask_u8 = (water_mask * 255).astype(np.uint8)
    kernel = np.ones((5, 5), np.uint8)
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN, kernel)
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, kernel)
    water_mask = mask_u8 > 0

    total_px = water_mask.size
    water_px = int(water_mask.sum())
    coverage_pct = round(100 * water_px / total_px, 1)

    overlay = img.copy()
    highlight = np.zeros_like(img)
    highlight[water_mask] = [56, 189, 248]  # sky-blue highlight
    overlay = cv2.addWeighted(overlay, 0.55, highlight, 0.45, 0)

    # Pure black/white mask for the "detected water mask" panel
    mask_rgb = cv2.cvtColor(mask_u8, cv2.COLOR_GRAY2RGB)

    return {
        "coverage_pct": coverage_pct,
        "total_pixels": total_px,
        "image_pixels": total_px,
        "water_mask": mask_rgb,
        "overlay": overlay,
        "original": img,
    }
