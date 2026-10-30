"""
Agriculture / Crop Health analysis.

We don't have a real near-infrared band (this is a normal RGB satellite crop,
not a multispectral one), so we use a *pseudo-vegetation index* built from the
green and red channels instead of true NDVI:

    VI = (G - R) / (G + R + eps)

This tracks the same intuition as NDVI (healthy chlorophyll reflects more
green/near-IR and absorbs more red) closely enough for a demonstration
pipeline, and is a standard, honestly-documented simplification for
RGB-only vegetation analysis. It is NOT a substitute for a real multispectral
NDVI pipeline and the app must never claim otherwise.
"""
import cv2
import numpy as np

HEALTHY_THRESHOLD = 0.15
MODERATE_THRESHOLD = 0.02


def _load_rgb(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read image file")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    return img


def analyze_agriculture(path, max_dim=900):
    img = _load_rgb(path)
    h, w = img.shape[:2]
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    img_f = img.astype(np.float32)
    r, g, b = img_f[:, :, 0], img_f[:, :, 1], img_f[:, :, 2]
    vi = (g - r) / (g + r + 1e-6)
    vi = cv2.GaussianBlur(vi, (5, 5), 0)

    healthy_mask = vi >= HEALTHY_THRESHOLD
    moderate_mask = (vi >= MODERATE_THRESHOLD) & (vi < HEALTHY_THRESHOLD)
    stressed_mask = vi < MODERATE_THRESHOLD

    total = vi.size
    healthy_pct = round(100 * healthy_mask.sum() / total, 1)
    moderate_pct = round(100 * moderate_mask.sum() / total, 1)
    stressed_pct = round(100 * stressed_mask.sum() / total, 1)

    # Build a green/yellow/red classification map
    class_map = np.zeros_like(img)
    class_map[healthy_mask] = [34, 197, 94]     # green
    class_map[moderate_mask] = [234, 179, 8]    # yellow
    class_map[stressed_mask] = [239, 68, 68]    # red

    overlay = cv2.addWeighted(img, 0.45, class_map, 0.55, 0)

    # Normalize VI to a 0-255 heat map for display
    vi_norm = np.clip((vi + 1) / 2 * 255, 0, 255).astype(np.uint8)
    vi_heatmap = cv2.applyColorMap(vi_norm, cv2.COLORMAP_SUMMER)
    vi_heatmap = cv2.cvtColor(vi_heatmap, cv2.COLOR_BGR2RGB)

    vegetation_coverage = round(100 * (healthy_mask | moderate_mask).sum() / total, 1)

    if stressed_pct >= 25:
        recommendation = (
            f"Vegetation stress detected across roughly {stressed_pct}% of the "
            "analyzed region. Field inspection is recommended in the highlighted zones."
        )
    elif stressed_pct >= 8:
        recommendation = (
            f"Vegetation stress detected in approximately {stressed_pct}% of the "
            "analyzed region."
        )
    else:
        recommendation = (
            "No significant vegetation stress detected. Most of the analyzed "
            "region shows healthy vegetation signal."
        )

    return {
        "healthy_pct": healthy_pct,
        "moderate_pct": moderate_pct,
        "stressed_pct": stressed_pct,
        "vegetation_coverage_pct": vegetation_coverage,
        "recommendation": recommendation,
        "classification_overlay": overlay,   # RGB numpy array, caller saves it
        "vi_heatmap": vi_heatmap,
        "original": img,
    }
