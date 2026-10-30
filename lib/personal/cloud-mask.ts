import { encode } from "fast-png";
import { stretch, type Scene } from "./raster";

export const AUTOMATIC_CLOUD_METHOD =
  "Relative brightness and adjacent-dark-pixel heuristic";

export function automaticCloudMask(
  scene: Scene,
  threshold = 0.75,
  detectShadows = true,
) {
  if (!Number.isFinite(threshold) || threshold < 0.4 || threshold > 0.99)
    throw Error("Use a cloud brightness threshold from 0.4 to 0.99.");
  if (scene.values.length !== 3)
    throw Error("Cloud detection needs mapped green, red and NIR bands.");
  const ranges = stretch(scene),
    n = scene.valid.length;
  const mask = new Float32Array(n),
    score = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!scene.valid[i]) continue;
    const brightness =
      scene.values.reduce(
        (sum, band, k) =>
          sum +
          Math.max(0, Math.min(1, (band[i] - ranges[k][0]) / ranges[k][1])),
        0,
      ) / 3;
    score[i] = brightness;
    if (brightness >= threshold) mask[i] = 1;
  }
  if (detectShadows) {
    const stride = scene.width + 1;
    const integral = new Float64Array(stride * (scene.height + 1));
    for (let y = 0; y < scene.height; y++) {
      let row = 0;
      for (let x = 0; x < scene.width; x++) {
        row += mask[y * scene.width + x];
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
      }
    }
    for (let y = 0; y < scene.height; y++)
      for (let x = 0; x < scene.width; x++) {
        const i = y * scene.width + x;
        if (!scene.valid[i] || mask[i] || score[i] >= 0.13) continue;
        const x0 = Math.max(0, x - 12),
          y0 = Math.max(0, y - 12);
        const x1 = Math.min(scene.width, x + 13),
          y1 = Math.min(scene.height, y + 13);
        if (
          integral[y1 * stride + x1] -
            integral[y0 * stride + x1] -
            integral[y1 * stride + x0] +
            integral[y0 * stride + x0] >
          0
        )
          mask[i] = 2;
      }
  }
  let valid = 0,
    cloud = 0,
    shadow = 0;
  for (let i = 0; i < n; i++)
    if (scene.valid[i]) {
      valid++;
      if (mask[i] === 1) cloud++;
      else if (mask[i] === 2) shadow++;
    }
  return { mask, score, valid, cloud, shadow };
}

export function cloudOverlayPng(scene: Scene, mask: Float32Array, max = 512) {
  const factor = Math.min(1, max / Math.max(scene.width, scene.height));
  const width = Math.max(1, Math.round(scene.width * factor));
  const height = Math.max(1, Math.round(scene.height * factor));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sample =
        Math.min(scene.height - 1, Math.floor(y / factor)) * scene.width +
        Math.min(scene.width - 1, Math.floor(x / factor));
      if (scene.valid[sample] && mask[sample] === 1)
        data.set([255, 255, 255, 150], (y * width + x) * 4);
    }
  return encode({ width, height, data, channels: 4 });
}

export function pngDataUrl(data: Uint8Array) {
  let binary = "";
  for (let start = 0; start < data.length; start += 8192)
    binary += String.fromCharCode(...data.subarray(start, start + 8192));
  return "data:image/png;base64," + btoa(binary);
}
