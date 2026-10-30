import proj4 from "proj4";
import {
  readScene,
  aligned,
  stretch,
  bounds,
  point,
  png,
  tiff,
  projection,
  type Scene,
} from "./raster";
import type { Analysis, Metrics, Raster } from "../science/types";
import { automaticCloudMask, AUTOMATIC_CLOUD_METHOD } from "./cloud-mask";
export type Input = {
  analysis: Analysis;
  images: Record<string, { image: Raster; buffer: ArrayBuffer }>;
};
export type Product = {
  name: string;
  tif: ArrayBuffer;
  png: Uint8Array;
  map: Uint8Array;
};
function one(source: Scene, values: Float32Array, valid = source.valid): Scene {
  return {
    ...source,
    values: [values],
    valid,
    metadata: {
      ...source.metadata,
      count: 1,
      scales: [1],
      offsets: [0],
      dtype: "float32",
      nodata: NaN,
    },
  };
}
function sums(values: ArrayLike<number>, w: number, h: number) {
  const a = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += values[y * w + x];
      a[(y + 1) * (w + 1) + x + 1] = a[y * (w + 1) + x + 1] + row;
    }
  }
  return (x: number, y: number, r: number) => {
    const x0 = Math.max(0, x - r),
      y0 = Math.max(0, y - r),
      x1 = Math.min(w, x + r + 1),
      y1 = Math.min(h, y + r + 1),
      s = w + 1;
    return a[y1 * s + x1] - a[y0 * s + x1] - a[y1 * s + x0] + a[y0 * s + x0];
  };
}
function insideRing(p: number[], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function clip(scene: Scene, aoi: unknown) {
  if (!aoi) return;
  const a = aoi as { type: string; coordinates: number[][][] | number[][][][] };
  const polys = (
    a.type === "Polygon" ? [a.coordinates] : a.coordinates
  ) as number[][][][];
  const transform = proj4(scene.crs, "EPSG:4326");
  for (let y = 0; y < scene.height; y++)
    for (let x = 0; x < scene.width; x++) {
      const p = transform.forward(point(scene, x + 0.5, y + 0.5));
      if (
        !polys.some(
          (rings) =>
            insideRing(p, rings[0]) &&
            !rings.slice(1).some((r) => insideRing(p, r)),
        )
      )
        scene.valid[y * scene.width + x] = 0;
    }
}
export function evaluate(
  out: Scene,
  ref: Scene,
  mask: Float32Array,
  region: string,
): Metrics | null {
  let n = 0,
    absolute = 0,
    square = 0,
    angle = 0,
    angles = 0,
    low = Infinity,
    high = -Infinity;
  const error = [0, 0, 0],
    mean = [0, 0, 0];
  for (let i = 0; i < out.valid.length; i++) {
    if (
      !out.valid[i] ||
      !ref.valid[i] ||
      (region === "cloud" && mask[i] !== 1) ||
      (region === "shadow" && mask[i] !== 2) ||
      (region === "clear" && mask[i] !== 0)
    )
      continue;
    n++;
    let dot = 0,
      aa = 0,
      bb = 0;
    for (let b = 0; b < 3; b++) {
      const x =
          out.values[b][i] * out.metadata.scales[b] + out.metadata.offsets[b],
        y = ref.values[b][i] * ref.metadata.scales[b] + ref.metadata.offsets[b],
        d = x - y;
      absolute += Math.abs(d);
      square += d * d;
      error[b] += d * d;
      mean[b] += y;
      low = Math.min(low, y);
      high = Math.max(high, y);
      dot += x * y;
      aa += x * x;
      bb += y * y;
    }
    if (aa > 0 && bb > 0) {
      angle +=
        (Math.acos(Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb)))) * 180) /
        Math.PI;
      angles++;
    }
  }
  if (!n) return null;
  const mse = square / (3 * n),
    span = high - low;
  return {
    pixels: n,
    mae: absolute / (3 * n),
    rmse: Math.sqrt(mse),
    psnr: mse > 0 && span > 0 ? 10 * Math.log10((span * span) / mse) : null,
    ssim: null,
    sam: angles ? angle / angles : null,
    ergas: mean.every((v) => Math.abs(v / n) > 1e-10)
      ? 100 *
        Math.sqrt(
          error.reduce((s, v, b) => s + v / n / (mean[b] / n) ** 2, 0) / 3,
        )
      : null,
  };
}
export async function processInput(
  input: Input,
  stage: (name: string) => void = () => {},
): Promise<{ result: NonNullable<Analysis["result"]>; products: Product[] }> {
  const started = performance.now(),
    p = input.analysis.parameters;
  stage("Preprocessing");
  const load = async (id: unknown, mask = false) => {
    if (typeof id !== "string" || !input.images[id])
      throw Error("An input file is missing.");
    const f = input.images[id];
    return readScene(
      f.buffer,
      mask
        ? [f.image.bands.mask]
        : [f.image.bands.green, f.image.bands.red, f.image.bands.nir],
    );
  };
  const scene = await load(input.analysis.image_id);
  scene.valid = scene.valid.slice();
  clip(scene, p.aoi);
  if (!scene.valid.some(Boolean))
    throw Error("No valid pixels in the selected area.");
  const n = scene.valid.length;
  if (
    (p.target_crs && p.target_crs !== scene.crs) ||
    (p.resolution && Number(p.resolution) !== Math.abs(scene.step[0]))
  )
    throw Error(
      "The personal processor preserves the source grid. Reproject with the Python service before uploading.",
    );
  stage("Detecting Clouds");
  const mask = new Float32Array(n),
    score = new Float32Array(n);
  let maskSource = AUTOMATIC_CLOUD_METHOD;
  if (p.mask_id) {
    const supplied = aligned(await load(p.mask_id, true), scene, true);
    for (let i = 0; i < n; i++)
      if (scene.valid[i]) {
        if (!supplied.valid[i])
          throw Error(
            "The supplied mask does not cover the valid source area.",
          );
        if (![0, 1, 2].includes(supplied.values[0][i]))
          throw Error(
            `Mask classes must be 0 (clear), 1 (cloud), or 2 (shadow). Found ${supplied.values[0][i]} at pixel ${i}.`,
          );
        mask[i] = supplied.values[0][i];
      }
    maskSource = "Uploaded class mask (0 clear, 1 cloud, 2 shadow)";
  } else {
    const automatic = automaticCloudMask(
      scene,
      Number(p.brightness_threshold ?? 0.75),
      Boolean(p.detect_shadows),
    );
    mask.set(automatic.mask);
    score.set(automatic.score);
  }
  stage("Reconstructing");
  const output = {
    ...scene,
    values: scene.values.map((v) => v.slice()),
    valid: scene.valid.slice(),
  };
  if (input.analysis.model_id === "temporal-baseline") {
    const temporal = aligned(await load(p.temporal_id), scene);
    for (let i = 0; i < n; i++)
      if (scene.valid[i] && mask[i]) {
        if (!temporal.valid[i])
          throw Error("The temporal reference must cover every masked pixel.");
        output.values.forEach((v, b) => (v[i] = temporal.values[b][i]));
      }
  } else {
    const clear = Uint8Array.from(scene.valid, (v, i) =>
        v && !mask[i] ? 1 : 0,
      ),
      total = clear.reduce((a, b) => a + b, 0);
    if (!total)
      throw Error(
        "No clear pixels remain for spatial interpolation. Use a temporal reference or adjust the cloud mask.",
      );
    const counts = sums(clear, scene.width, scene.height);
    for (let b = 0; b < 3; b++) {
      const masked = Float32Array.from(scene.values[b], (v, i) =>
          clear[i] ? v : 0,
        ),
        sum = sums(masked, scene.width, scene.height),
        global = masked.reduce((a, v) => a + v, 0) / total;
      for (let y = 0; y < scene.height; y++)
        for (let x = 0; x < scene.width; x++) {
          const i = y * scene.width + x;
          if (!scene.valid[i] || !mask[i]) continue;
          let v = global;
          for (const r of [2, 6, 16, 48, 128, 384]) {
            const count = counts(x, y, r);
            if (count >= 3) {
              v = sum(x, y, r) / count;
              break;
            }
          }
          output.values[b][i] = v;
        }
    }
  }
  stage("Postprocessing");
  const ndvi = (s: Scene) => {
    const v = new Float32Array(n),
      valid = s.valid.slice();
    for (let i = 0; i < n; i++) {
      const red = s.values[1][i] * s.metadata.scales[1] + s.metadata.offsets[1],
        nir = s.values[2][i] * s.metadata.scales[2] + s.metadata.offsets[2],
        denom = nir + red;
      if (!Number.isFinite(denom) || Math.abs(denom) < 1e-10) valid[i] = 0;
      else v[i] = (nir - red) / denom;
    }
    return one(s, v, valid);
  };
  const items: Record<string, Scene> = {
    original: scene,
    reconstruction: output,
    mask: one(scene, mask),
    "ndvi-original": ndvi(scene),
    ndvi: ndvi(output),
  };
  if (!p.mask_id) items.score = one(scene, score);
  stage("Evaluating");
  let metrics: Record<string, Metrics | null> | null = null;
  let note =
    "No paired reference supplied. Quantitative reconstruction metrics are unavailable.";
  if (p.reference_id) {
    const ref = aligned(await load(p.reference_id), scene);
    items.reference = ref;
    const valid = Uint8Array.from(scene.valid, (v, i) =>
      v && ref.valid[i] ? 1 : 0,
    );
    items.difference = {
      ...output,
      valid,
      values: output.values.map((v, b) =>
        Float32Array.from(v, (x, i) => Math.abs(x - ref.values[b][i])),
      ),
    };
    if (
      ["same-acquisition", "synthetic-ground-truth"].includes(
        String(p.reference_relation),
      )
    ) {
      metrics = Object.fromEntries(
        ["all", "cloud", "shadow", "clear"].map((k) => [
          k,
          evaluate(output, ref, mask, k),
        ]),
      );
      note =
        "Metrics use calibrated Green/Red/NIR values at jointly valid pixels. SSIM is unavailable in the personal processor. PSNR is unavailable for zero error or zero range; ERGAS uses a grid ratio of 1. Reference pairing is declared by you.";
    } else
      note =
        "A temporal reference is displayed for comparison. It is not paired ground truth, so reconstruction metrics are unavailable.";
  }
  const counts = { valid: 0, cloud: 0, shadow: 0, clear: 0 };
  const area = { valid: 0, cloud: 0, shadow: 0, clear: 0 };
  const transform = proj4(scene.crs, "EPSG:4326");
  for (let y = 0; y < scene.height; y++) {
    const a = transform.forward(point(scene, scene.width / 2, y)),
      b = transform.forward(point(scene, scene.width / 2 + 1, y)),
      c = transform.forward(point(scene, scene.width / 2, y + 1));
    const radians = Math.PI / 180;
    const m2 =
      Math.abs(
        ((b[0] - a[0]) * (Math.sin(c[1] * radians) - Math.sin(a[1] * radians)) -
          (c[0] - a[0]) *
            (Math.sin(b[1] * radians) - Math.sin(a[1] * radians))) *
          radians,
      ) *
      6371008.8 ** 2;
    for (let x = 0; x < scene.width; x++) {
      const i = y * scene.width + x;
      if (!scene.valid[i]) continue;
      const k = mask[i] === 1 ? "cloud" : mask[i] === 2 ? "shadow" : "clear";
      counts.valid++;
      counts[k]++;
      area.valid += m2;
      area[k] += m2;
    }
  }
  // Pool observed and reconstructed values so a fully cloudy source cannot
  // clip the darker ground estimate to black. Both sides use the same mapping.
  const ranges = stretch(
    scene,
    output,
    ...(items.reference ? [items.reference] : []),
  );
  const products: Product[] = [];
  const box = bounds(scene),
    merc = proj4("EPSG:4326", projection("EPSG:3857")),
    nw = merc.forward([box[0], box[3]]),
    se = merc.forward([box[2], box[1]]);
  const edge = Math.min(768, Math.max(scene.width, scene.height));
  const ratio = (se[0] - nw[0]) / (nw[1] - se[1]),
    mw = Math.max(1, Math.round(Math.min(edge, edge * ratio))),
    mh = Math.max(1, Math.round(Math.min(edge, edge / ratio)));
  const mapGrid = {
    width: mw,
    height: mh,
    crs: "EPSG:3857",
    origin: nw,
    step: [(se[0] - nw[0]) / mw, (se[1] - nw[1]) / mh],
  };
  for (const [name, s] of Object.entries(items)) {
    const kind =
      name === "mask" ? "mask" : name.startsWith("ndvi") ? "ndvi" : "optical";
    const comparison = ["original", "reconstruction", "reference"].includes(
      name,
    );
    const scales = comparison ? ranges : stretch(s);
    products.push({
      name,
      tif: tiff(s),
      png: png(s, kind, scales, 768, comparison ? 2.2 : 1),
      map: png(
        aligned(s, mapGrid, name === "mask"),
        kind,
        scales,
        768,
        comparison ? 2.2 : 1,
      ),
    });
  }
  return {
    products,
    result: {
      metadata: { ...output.metadata, dtype: "float32", nodata: null },
      counts,
      area_m2: area,
      cloud_percent: (100 * counts.cloud) / counts.valid,
      shadow_percent: (100 * counts.shadow) / counts.valid,
      metrics,
      metric_note: note,
      provenance: {
        engine: "Personal browser worker 1.0",
        model: input.analysis.model_id,
        mask_source: maskSource,
        inputs: Object.values(input.images).map((f) => ({
          id: f.image.id,
          name: f.image.name,
          sha256: f.image.sha256,
          bands: f.image.bands,
          sensor: f.image.sensor,
          acquired_at: f.image.acquired_at,
        })),
        source_grid_preserved: true,
        display_stretch:
          "Shared pooled 2–98% optical percentiles, gamma 2.2; GeoTIFF values unchanged",
        auxiliary_resampling: "Bilinear optical; nearest-neighbor class mask",
        area_method: "Approximate spherical per-row pixel area",
        parameters: p,
      },
      seconds: (performance.now() - started) / 1000,
      confidence: null,
      limitations: [
        "Reconstruction estimates hidden content and is not an observation.",
        "Spatial interpolation can blur large cloud areas. Temporal replacement can contain real scene changes.",
        p.mask_id
          ? "Reconstruction follows the supplied class mask. Classification errors can leave clouds or replace clear pixels; review the mask."
          : "Automatic masking is a brightness heuristic, not a trained cloud classifier. Review or supply your own class mask.",
        "Online baselines run while this tab is open. Neural architectures require the optional Python service and trained weights.",
        "GeoTIFF exports retain the source grid. AOIs mask pixels outside the selection; map previews are resampled for display.",
      ],
    },
  };
}
