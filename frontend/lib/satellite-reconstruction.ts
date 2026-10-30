import { ApiError } from "./api-error";
import { areaFrom, getScene, imageUrl, sceneId, upstream } from "./satellite";
import { personalApi } from "./personal/api";
import { OWNER, resources } from "./personal/auth";
import { tiff, type Scene } from "./personal/raster";
import type { Analysis, Raster } from "./science/types";

export type ReconstructionRequest = {
  lat: unknown;
  lng: unknown;
  size: unknown;
  scene: unknown;
  method: unknown;
  referenceScene?: unknown;
  location?: unknown;
};

/** Keep observed cloud spectra; analysis-only decoders deliberately discard them. */
export function reconstructionScenes(
  bytes: Uint8Array,
  baseline: number,
  bbox: number[],
  clearReference = false,
) {
  const unreadable = () =>
    new ApiError(
      422,
      "The satellite service returned an unreadable spectral crop.",
    );
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x93 ||
    new TextDecoder().decode(bytes.subarray(1, 6)) !== "NUMPY"
  )
    throw unreadable();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[6];
  if (version !== 1 && version !== 2) throw unreadable();
  const start = version === 1 ? 10 : 12;
  const headerLength =
    version === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  if (headerLength > 65536 || start + headerLength > bytes.length)
    throw unreadable();
  const header = new TextDecoder().decode(
    bytes.subarray(start, start + headerLength),
  );
  const dtype = header.match(/'descr':\s*'([^']+)'/)?.[1];
  const dimensions = header
    .match(/'shape':\s*\(([^)]+)\)/)?.[1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number);
  if (
    dtype !== "<u2" ||
    !/'fortran_order':\s*False/.test(header) ||
    !dimensions ||
    dimensions.length !== 3 ||
    dimensions[0] !== 5 ||
    dimensions.some((value) => !Number.isInteger(value) || value <= 0) ||
    dimensions[1] > 512 ||
    dimensions[2] > 512 ||
    !Number.isFinite(baseline)
  )
    throw unreadable();
  const [, height, width] = dimensions;
  const n = width * height,
    offset = start + headerLength;
  if (
    offset + n * 5 * 2 !== bytes.length ||
    bbox.length !== 4 ||
    !bbox.every(Number.isFinite) ||
    bbox[0] >= bbox[2] ||
    bbox[1] >= bbox[3]
  )
    throw unreadable();
  const [west, south, east, north] = bbox;
  const values = [
    new Float32Array(n),
    new Float32Array(n),
    new Float32Array(n),
  ];
  const valid = new Uint8Array(n),
    mask = new Float32Array(n);
  const shift = baseline >= 4 ? -1000 : 0;
  let clouds = 0,
    shadows = 0,
    clear = 0;
  for (let i = 0; i < n; i++) {
    const red = view.getUint16(offset + i * 2, true);
    const green = view.getUint16(offset + (n + i) * 2, true);
    const nir = view.getUint16(offset + (2 * n + i) * 2, true);
    const scl = view.getUint16(offset + (3 * n + i) * 2, true);
    const alpha = view.getUint16(offset + (4 * n + i) * 2, true);
    if (scl > 11) throw unreadable();
    const classification = [8, 9, 10].includes(scl) ? 1 : scl === 3 ? 2 : 0;
    const usable =
      alpha > 0 && red > 0 && green > 0 && nir > 0 && ![0, 1, 7].includes(scl);
    values[0][i] = (green + shift) / 10000;
    values[1][i] = (red + shift) / 10000;
    values[2][i] = (nir + shift) / 10000;
    valid[i] = usable && (!clearReference || classification === 0) ? 1 : 0;
    mask[i] = classification;
    if (valid[i]) {
      if (classification === 1) clouds++;
      else if (classification === 2) shadows++;
      else clear++;
    }
  }
  const source: Scene = {
    width,
    height,
    crs: "EPSG:4326",
    origin: [west, north, 0],
    step: [(east - west) / width, -(north - south) / height, 0],
    values,
    valid,
    keys: {
      GeographicTypeGeoKey: 4326,
      GTModelTypeGeoKey: 2,
      GTRasterTypeGeoKey: 1,
    },
    metadata: {
      width,
      height,
      count: 3,
      dtype: "float32",
      crs: "EPSG:4326",
      bounds: [west, south, east, north],
      resolution: [(east - west) / width, (north - south) / height],
      nodata: NaN,
      scales: [1, 1, 1],
      offsets: [0, 0, 0],
      bytes: 0,
    },
  };
  const classification: Scene = {
    ...source,
    values: [mask],
    metadata: { ...source.metadata, count: 1, scales: [1], offsets: [0] },
  };
  return { source, mask: classification, clouds, shadows, clear };
}

export function validateReconstructionCoverage(
  source: ReturnType<typeof reconstructionScenes>,
  method: "spatial-baseline" | "temporal-baseline",
  reference?: Scene,
) {
  if (!source.clouds && !source.shadows)
    throw new ApiError(
      422,
      "No classified clouds or shadows need removal in this crop. Choose a cloudy capture or analyse this clear observation.",
    );
  if (method === "spatial-baseline" && !source.clear)
    throw new ApiError(
      422,
      "This crop has no clear pixels for spatial reconstruction. Choose a clear reference from another date and use temporal reconstruction.",
    );
  if (method === "temporal-baseline") {
    if (
      !reference ||
      reference.width !== source.source.width ||
      reference.height !== source.source.height
    )
      throw new ApiError(
        422,
        "Temporal reconstruction needs an aligned reference capture from another date.",
      );
    for (let i = 0; i < source.source.valid.length; i++)
      if (
        source.source.valid[i] &&
        source.mask.values[0][i] &&
        !reference.valid[i]
      )
        throw new ApiError(
          422,
          "The reference date is cloudy or missing data over part of the area to reconstruct. Choose another reference date with clear coverage.",
        );
  }
}

async function personalResult<T>(
  origin: string,
  path: string,
  body: FormData | Record<string, unknown>,
): Promise<T> {
  const response = await personalApi(
    new Request(`${origin}/api/science/${path}`, {
      method: "POST",
      headers: {
        "X-Space-Eye": "1",
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
    [path],
  );
  const result = (await response.json()) as T & { detail?: string };
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.detail || "The satellite reconstruction could not be prepared.",
    );
  return result;
}

export async function prepareSatelliteReconstruction(
  request: Request,
  input: ReconstructionRequest,
): Promise<Analysis> {
  const area = areaFrom(input),
    selected = sceneId(input.scene);
  if (!["spatial-baseline", "temporal-baseline"].includes(String(input.method)))
    throw new ApiError(400, "Choose spatial or temporal reconstruction.");
  const method = input.method as "spatial-baseline" | "temporal-baseline";
  const referenceId =
    method === "temporal-baseline" ? sceneId(input.referenceScene) : null;
  if (referenceId === selected)
    throw new ApiError(
      400,
      "Choose a distinct reference capture from another date.",
    );
  const [capture, referenceCapture] = await Promise.all([
    getScene(selected, area.bbox),
    referenceId ? getScene(referenceId, area.bbox) : Promise.resolve(null),
  ]);
  if (
    referenceCapture &&
    referenceCapture.capturedAt.slice(0, 10) === capture.capturedAt.slice(0, 10)
  )
    throw new ApiError(400, "Choose a reference captured on a different date.");
  const [raw, referenceRaw] = await Promise.all([
    upstream(imageUrl(selected, area.bbox, true)),
    referenceId
      ? upstream(imageUrl(referenceId, area.bbox, true))
      : Promise.resolve(null),
  ]);
  const source = reconstructionScenes(raw, capture.baseline, area.bbox);
  const reference =
    referenceRaw && referenceCapture
      ? reconstructionScenes(
          referenceRaw,
          referenceCapture.baseline,
          area.bbox,
          true,
        ).source
      : undefined;
  validateReconstructionCoverage(source, method, reference);
  request.signal.throwIfAborted();
  const origin = new URL(request.url).origin;
  const imported: string[] = [];
  const upload = async (
    scene: Scene,
    role: "cloudy" | "mask" | "temporal",
    id: string,
    acquired: string,
  ) => {
    const form = new FormData();
    form.set(
      "file",
      new File(
        [tiff(scene)],
        `Sentinel-2_${id}_${role}_${area.size}km_resampled.tif`,
        { type: "image/tiff" },
      ),
    );
    form.set("role", role);
    form.set("sensor", "Sentinel-2");
    // The archive stores acquisition dates; the full capture ID (including UTC
    // acquisition time) remains in the filename and saved input provenance.
    form.set("acquired_at", acquired.slice(0, 10));
    form.set(
      "bands",
      JSON.stringify(
        role === "mask" ? { mask: 1 } : { green: 1, red: 2, nir: 3 },
      ),
    );
    const image = await personalResult<Raster>(origin, "images", form);
    imported.push(image.id);
    return image;
  };
  try {
    const image = await upload(
      source.source,
      "cloudy",
      selected,
      capture.capturedAt,
    );
    const mask = await upload(
      source.mask,
      "mask",
      selected,
      capture.capturedAt,
    );
    const temporal =
      reference && referenceCapture && referenceId
        ? await upload(
            reference,
            "temporal",
            referenceId,
            referenceCapture.capturedAt,
          )
        : null;
    request.signal.throwIfAborted();
    const place =
      typeof input.location === "string" && input.location.trim()
        ? input.location.trim()
        : `${area.lat.toFixed(4)}, ${area.lng.toFixed(4)}`;
    return await personalResult<Analysis>(origin, "analyses", {
      name: `Cloud reconstruction · ${place} · ${capture.capturedAt.slice(0, 10)}`.slice(
        0,
        160,
      ),
      image_id: image.id,
      mask_id: mask.id,
      temporal_id: temporal?.id || null,
      model_id: method,
      reference_relation: "none",
      detect_shadows: true,
    });
  } catch (error) {
    const { db, bucket } = resources();
    for (const id of imported) {
      await bucket
        .delete([`personal/${id}/source`, `personal/${id}/preview`])
        .catch(() => {});
      await db
        .prepare(
          "DELETE FROM personal_records WHERE id=? AND kind='image' AND owner=?",
        )
        .bind(id, OWNER)
        .run()
        .catch(() => {});
    }
    throw error;
  }
}
