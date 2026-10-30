import { encode } from "fast-png";
import { ApiError } from "./api-error";
import { DATA, getScene, sceneId, upstream } from "./satellite";

export type SatelliteCloudMetrics = {
  cloudPercent: number | null;
  coveragePercent: number;
  unclassifiedPercent: number;
  cloudShadowPercent: number | null;
  snowIcePercent: number | null;
  width: number;
  height: number;
};

/** Decode TiTiler's C-order SCL + alpha NPY without evaluating its header. */
function readSatelliteClouds(
  bytes: Uint8Array,
): {
  metrics: SatelliteCloudMetrics;
  cloudPixels: Uint8Array;
  cloudPixelCount: number;
} {
  const invalid = () =>
    new ApiError(
      502,
      "The satellite cloud classification could not be read. Try another capture.",
    );
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x93 ||
    new TextDecoder().decode(bytes.subarray(1, 6)) !== "NUMPY"
  )
    throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[6];
  if (version !== 1 && version !== 2) throw invalid();
  const start = version === 1 ? 10 : 12;
  const length =
    version === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  if (length > 4096 || start + length > bytes.length) throw invalid();
  const header = new TextDecoder().decode(
    bytes.subarray(start, start + length),
  );
  const dtype = header.match(/'descr':\s*'([^']+)'/)?.[1];
  const shape = header.match(
    /'shape':\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,?\s*\)/,
  );
  if (
    !shape ||
    !/'fortran_order':\s*False/.test(header) ||
    !["|u1", "<u2"].includes(dtype || "")
  )
    throw invalid();
  const [bands, height, width] = shape.slice(1).map(Number);
  if (bands !== 2 || width < 1 || height < 1 || width > 512 || height > 512)
    throw invalid();
  const count = width * height,
    offset = start + length,
    stride = dtype === "<u2" ? 2 : 1;
  if (offset + count * 2 * stride !== bytes.length) throw invalid();
  const read = (i: number) =>
    stride === 1 ? bytes[offset + i] : view.getUint16(offset + i * 2, true);
  const cloudPixels = new Uint8Array(count * 4);
  let valid = 0,
    cloudy = 0,
    shadow = 0,
    snow = 0,
    unclassified = 0;
  for (let i = 0; i < count; i++) {
    if (!read(count + i)) continue;
    const scl = read(i);
    if (scl > 11) throw invalid();
    if (scl === 7) {
      unclassified++;
      continue;
    }
    if (scl === 0 || scl === 1) continue;
    valid++;
    if (scl === 8 || scl === 9 || scl === 10) {
      cloudy++;
      // The same classified pixels drive both the percentage and the overlay.
      cloudPixels.set([255, 255, 255, 80], i * 4);
    }
    if (scl === 3) shadow++;
    if (scl === 11) snow++;
  }
  const percent = (part: number, total: number) =>
    Math.round((part / total) * 1000) / 10;
  return {
    metrics: {
      cloudPercent: valid ? percent(cloudy, valid) : null,
      coveragePercent: percent(valid, count),
      unclassifiedPercent: percent(unclassified, count),
      cloudShadowPercent: valid ? percent(shadow, valid) : null,
      snowIcePercent: valid ? percent(snow, valid) : null,
      width,
      height,
    },
    cloudPixels,
    cloudPixelCount: cloudy,
  };
}

export function satelliteCloudMetrics(bytes: Uint8Array): SatelliteCloudMetrics {
  return readSatelliteClouds(bytes).metrics;
}

export function satelliteCloudAnalysis(bytes: Uint8Array) {
  const { metrics, cloudPixels, cloudPixelCount } = readSatelliteClouds(bytes);
  const png = encode({
    width: metrics.width,
    height: metrics.height,
    data: cloudPixels,
    channels: 4,
    depth: 8,
  });
  let binary = "";
  for (let offset = 0; offset < png.length; offset += 8192) {
    binary += String.fromCharCode(...png.subarray(offset, offset + 8192));
  }
  return {
    ...metrics,
    cloudPixelCount,
    cloudMaskDataUrl: `data:image/png;base64,${btoa(binary)}`,
  };
}

export async function getSatelliteClouds(
  id: string,
  area: { lat: number; lng: number; size: number; bbox: number[] },
) {
  const scene = await getScene(sceneId(id), area.bbox);
  const params = new URLSearchParams({
    collection: "sentinel-2-l2a",
    item: scene.id,
    assets: "SCL",
    resampling: "nearest",
    dst_crs: "EPSG:4326",
  });
  const data = await upstream(
    `${DATA}/item/bbox/${area.bbox.join(",")}/384x384.npy?${params}`,
    1_100_000,
  );
  return {
    sceneId: scene.id,
    capturedAt: scene.capturedAt,
    latitude: area.lat,
    longitude: area.lng,
    sizeKm: area.size,
    bbox: area.bbox,
    ...satelliteCloudAnalysis(data),
    source: "Copernicus Sentinel-2 L2A · Microsoft Planetary Computer",
    sourceUrl: "https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a",
    method:
      "Cloud classes 8, 9 and 10 (including cirrus) in the Sentinel-2 scene classification layer. Translucent white highlights mark the same pixels used for the cloud percentage. Percentages use classified pixels in this crop, excluding no-data, defective and unclassified pixels. Nearest-neighbour sampling on a 384 × 384 grid from the 20 m classification layer; approximate area percentage at capture time.",
  };
}

export type SatelliteCloudResult = Awaited<
  ReturnType<typeof getSatelliteClouds>
>;
