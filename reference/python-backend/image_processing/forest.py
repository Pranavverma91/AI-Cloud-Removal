"""
Forest & vegetation change detection.

Computes the same pseudo-vegetation-index used in agriculture.py for two
images of the same location taken at different times, aligns their sizes,
and thresholds the difference to classify change.
"""
import cv2
import numpy as np

VEG_THRESHOLD = 0.05        # VI above this counts as "vegetated"
CHANGE_THRESHOLD = 0.08     # abs difference above this counts as real change


def _vi(img):
    img_f = img.astype(np.float32)
    r, g = img_f[:, :, 0], img_f[:, :, 1]
    vi = (g - r) / (g + r + 1e-6)
    return cv2.GaussianBlur(vi, (5, 5), 0)


def _load(path, size=None):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not read image file")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    if size:
        img = cv2.resize(img, size)
    return img


def analyze_forest_change(path_before, path_after, max_dim=900):
    before = _load(path_before)
    h, w = before.shape[:2]
    scale = min(1.0, max_dim / max(h, w))
    target_size = (int(w * scale), int(h * scale)) if scale < 1.0 else (w, h)
    before = cv2.resize(before, target_size)
    after = _load(path_after, size=target_size)

    vi_before = _vi(before)
    vi_after = _vi(after)

    veg_before_pct = round(100 * (vi_before >= VEG_THRESHOLD).sum() / vi_before.size, 1)
    veg_after_pct = round(100 * (vi_after >= VEG_THRESHOLD).sum() / vi_after.size, 1)
    change_pct = round(veg_after_pct - veg_before_pct, 1)

    diff = vi_after - vi_before
    loss_mask = diff < -CHANGE_THRESHOLD
    gain_mask = diff > CHANGE_THRESHOLD
    stable_veg_mask = (~loss_mask) & (~gain_mask) & (vi_after >= VEG_THRESHOLD)

    change_map = np.zeros_like(before)
    change_map[stable_veg_mask] = [34, 197, 94]   # green - stable vegetation
    change_map[loss_mask] = [239, 68, 68]         # red - vegetation loss
    change_map[gain_mask] = [56, 189, 248]        # cyan - vegetation gain

    overlay = cv2.addWeighted(after, 0.4, change_map, 0.6, 0)

    if change_pct <= -3:
        classification = "Vegetation loss"
    elif change_pct >= 3:
        classification = "Vegetation gain"
    else:
        classification = "Stable"

    loss_pct = round(100 * loss_mask.sum() / loss_mask.size, 1)
    gain_pct = round(100 * gain_mask.sum() / gain_mask.size, 1)

    return {
        "veg_before_pct": veg_before_pct,
        "veg_after_pct": veg_after_pct,
        "change_pct": change_pct,
        "classification": classification,
        "loss_pct": loss_pct,
        "gain_pct": gain_pct,
        "change_map": overlay,
        "before": before,
        "after": after,
    }
