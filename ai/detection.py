import numpy as np
from scipy.ndimage import binary_dilation, gaussian_filter


def detect(values, valid, low, span, threshold=0.75, shadows=True):
    normalized = np.clip((values - low[:, None, None]) / span[:, None, None], 0, 1)
    brightness = normalized.mean(axis=0)
    cloud = (brightness >= threshold) & valid
    shadow = (
        (brightness < 0.14) & binary_dilation(cloud, iterations=24) & valid & ~cloud
        if shadows
        else np.zeros(valid.shape, bool)
    )
    mask = np.zeros(valid.shape, "uint8")
    mask[cloud], mask[shadow], mask[~valid] = 1, 2, 255
    return mask, brightness.astype("float32")


def interpolate(values, masked, valid):
    clear = valid & ~masked
    if not clear.any():
        raise ValueError(
            "No clear context in this patch; supply temporal imagery or trained weights"
        )
    output = values.copy()
    remaining = masked & valid
    for sigma in (4, 12, 32, 96):
        weight = gaussian_filter(clear.astype("float32"), sigma)
        available = remaining & (weight > 1e-7)
        for i in range(values.shape[0]):
            smooth = gaussian_filter(np.where(clear, values[i], 0), sigma) / np.maximum(
                weight, 1e-7
            )
            output[i, available] = smooth[available]
        remaining &= ~available
        if not remaining.any():
            break
    if remaining.any():
        raise ValueError("Insufficient clear context for spatial reconstruction")
    return output
