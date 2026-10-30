import { fromArrayBuffer, writeArrayBuffer, type GeoTIFFImage } from "geotiff";
import proj4 from "proj4";
import { encode } from "fast-png";
import type { Metadata } from "../science/types";
export const MAX_PIXELS = 2_000_000;
export const MAX_BYTES = 32 * 1024 * 1024;
export type Grid = {
  width: number;
  height: number;
  crs: string;
  origin: number[];
  step: number[];
};
export type Scene = Grid & {
  values: Float32Array[];
  valid: Uint8Array;
  metadata: Metadata;
  keys: Record<string, unknown>;
};
export function projection(crs: string) {
  const code = Number(crs.split(":")[1]);
  if (code >= 32601 && code <= 32760) {
    const south = code >= 32700,
      zone = code - (south ? 32700 : 32600);
    if (zone >= 1 && zone <= 60)
      proj4.defs(
        crs,
        `+proj=utm +zone=${zone} ${south ? "+south " : ""}+datum=WGS84 +units=m +no_defs`,
      );
  }
  if (!proj4.defs(crs))
    throw Error(
      "Use WGS84, Web Mercator or WGS84 UTM imagery for online processing. Other coordinate systems are supported in the Python project.",
    );
  return crs;
}
export function point(grid: Grid, x: number, y: number) {
  return [grid.origin[0] + x * grid.step[0], grid.origin[1] + y * grid.step[1]];
}
export function corners(grid: Grid) {
  return [
    [0, 0],
    [grid.width, 0],
    [grid.width, grid.height],
    [0, grid.height],
  ].map(([x, y]) =>
    proj4(projection(grid.crs), "EPSG:4326", point(grid, x, y)),
  );
}
export function bounds(grid: Grid): [number, number, number, number] {
  const c = corners(grid);
  return [
    Math.min(...c.map((v) => v[0])),
    Math.min(...c.map((v) => v[1])),
    Math.max(...c.map((v) => v[0])),
    Math.max(...c.map((v) => v[1])),
  ];
}
export async function openRaster(buffer: ArrayBuffer) {
  const tiff = await fromArrayBuffer(buffer);
  return tiff.getImage();
}
export function gridOf(image: GeoTIFFImage): Grid {
  const keys = image.getGeoKeys();
  const epsg = Number(
    keys?.ProjectedCSTypeGeoKey || keys?.GeographicTypeGeoKey,
  );
  if (!epsg || epsg === 32767)
    throw Error(
      "The GeoTIFF needs a supported EPSG coordinate reference system.",
    );
  const grid = {
    width: image.getWidth(),
    height: image.getHeight(),
    crs: projection("EPSG:" + epsg),
    origin: image.getOrigin(),
    step: image.getResolution(),
  };
  if (!grid.origin.every(Number.isFinite))
    throw Error("The GeoTIFF origin must contain finite coordinates.");
  const transform = image.getFileDirectory().getValue("ModelTransformation");
  if (transform && (Number(transform[1]) !== 0 || Number(transform[4]) !== 0))
    throw Error(
      "Reproject rotated imagery to a north-up GeoTIFF before online processing.",
    );
  if (
    !grid.step.every(Number.isFinite) ||
    grid.step[0] <= 0 ||
    grid.step[1] >= 0
  )
    throw Error("A north-up, nonzero pixel grid is required.");
  return grid;
}
export async function info(
  image: GeoTIFFImage,
  bytes: number,
): Promise<Metadata> {
  const grid = gridOf(image),
    count = image.getSamplesPerPixel();
  if (grid.width * grid.height > MAX_PIXELS)
    throw Error(
      "Online processing supports up to 2 million pixels per image. Crop the image first, or use the included Python processor for larger scenes.",
    );
  if (count < 1 || count > 8) throw Error("Use a raster with 1–8 bands.");
  const sample = image.getSampleFormat(),
    bits = image.getBitsPerSample();
  if (
    !([1, 2].includes(sample) && bits <= 16) &&
    !(sample === 3 && bits === 32)
  )
    throw Error("Use uint8, uint16, int8, int16 or float32 raster values.");
  const scales = [],
    offsets = [];
  for (let b = 0; b < count; b++) {
    const g = (await image.getGDALMetadata(b)) || {};
    scales.push(Number(g.SCALE ?? 1));
    offsets.push(Number(g.OFFSET ?? 0));
  }
  if (
    ![...scales, ...offsets].every(Number.isFinite) ||
    scales.some((v) => v === 0)
  )
    throw Error(
      "Band scale and offset metadata must be finite, with nonzero scales.",
    );
  return {
    ...grid,
    bounds: bounds(grid),
    count,
    dtype: (sample === 3 ? "float" : sample === 2 ? "int" : "uint") + bits,
    resolution: grid.step.slice(0, 2).map(Math.abs),
    nodata: image.getGDALNoData(),
    scales,
    offsets,
    bytes,
  };
}
export async function readScene(
  buffer: ArrayBuffer,
  indices?: number[],
): Promise<Scene> {
  const image = await openRaster(buffer),
    metadata = await info(image, buffer.byteLength),
    grid = gridOf(image);
  const bands =
    indices || Array.from({ length: metadata.count }, (_, i) => i + 1);
  if (bands.some((i) => !Number.isInteger(i) || i < 1 || i > metadata.count))
    throw Error("Invalid band mapping.");
  const data = await image.readRasters({
    samples: bands.map((i) => i - 1),
    interleave: false,
  });
  const values = bands.map((_, i) =>
    Float32Array.from(data[i] as ArrayLike<number>),
  );
  const valid = new Uint8Array(grid.width * grid.height).fill(1);
  for (let i = 0; i < valid.length; i++)
    for (const band of values)
      if (
        !Number.isFinite(band[i]) ||
        (metadata.nodata !== null && band[i] === metadata.nodata)
      )
        valid[i] = 0;
  return {
    ...grid,
    values,
    valid,
    metadata: {
      ...metadata,
      count: bands.length,
      scales: bands.map((i) => metadata.scales[i - 1]),
      offsets: bands.map((i) => metadata.offsets[i - 1]),
    },
    keys: image.getGeoKeys() || {},
  };
}
export function stretch(scene: Scene, ...comparisons: Scene[]) {
  return scene.values.map((_, b) => {
    const s: number[] = [];
    for (const frame of [scene, ...comparisons]) {
      const band = frame.values[b];
      const stride = Math.max(1, Math.ceil(band.length / 100000));
      for (let i = 0; i < band.length; i += stride)
        if (frame.valid[i] && Number.isFinite(band[i])) s.push(band[i]);
    }
    s.sort((a, b) => a - b);
    if (!s.length) return [0, 1];
    const low = s[Math.floor(s.length * 0.02)],
      high = s[Math.min(s.length - 1, Math.floor(s.length * 0.98))];
    return [low, Math.max(1e-10, high - low)];
  });
}
export function png(
  scene: Scene,
  kind = "optical",
  ranges = stretch(scene),
  max = 768,
  gamma = 1,
) {
  const factor = Math.min(1, max / Math.max(scene.width, scene.height)),
    width = Math.max(1, Math.round(scene.width * factor)),
    height = Math.max(1, Math.round(scene.height * factor));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const s =
          Math.min(scene.height - 1, Math.floor(y / factor)) * scene.width +
          Math.min(scene.width - 1, Math.floor(x / factor)),
        i = (y * width + x) * 4;
      data[i + 3] = scene.valid[s] ? 255 : 0;
      if (kind === "mask") {
        const c = scene.values[0][s];
        const p =
          c === 1 ? [245, 250, 255] : c === 2 ? [95, 65, 145] : [20, 70, 65];
        data.set(p, i);
      } else if (kind === "ndvi") {
        const t = Math.max(0, Math.min(1, (scene.values[0][s] + 1) / 2));
        data[i] = 220 * (1 - t) + 24 * t;
        data[i + 1] = 95 + 95 * t;
        data[i + 2] = 65 + 25 * t;
      } else
        for (let channel = 0; channel < 3; channel++) {
          const b = scene.values.length >= 3 ? 2 - channel : 0;
          const intensity = Math.max(
            0,
            Math.min(1, (scene.values[b][s] - ranges[b][0]) / ranges[b][1]),
          );
          data[i + channel] = 255 * intensity ** (1 / gamma);
        }
    }
  return encode({ width, height, data, channels: 4 });
}
export function tiff(scene: Scene) {
  const count = scene.values.length,
    n = scene.valid.length,
    data = new Float32Array(n * count);
  for (let i = 0; i < n; i++)
    for (let b = 0; b < count; b++)
      data[i * count + b] = scene.valid[i] ? scene.values[b][i] : NaN;
  const code = Number(scene.crs.split(":")[1]);
  const buffer = writeArrayBuffer(data, {
    width: scene.width,
    height: scene.height,
    BitsPerSample: Array(count).fill(32),
    SampleFormat: Array(count).fill(3),
    SamplesPerPixel: count,
    PhotometricInterpretation: count >= 3 ? 2 : 1,
    ModelPixelScale: [scene.step[0], Math.abs(scene.step[1]), 0],
    ModelTiepoint: [0, 0, 0, scene.origin[0], scene.origin[1], 0],
    GTModelTypeGeoKey: code === 4326 ? 2 : 1,
    GTRasterTypeGeoKey: 1,
    ...(code === 4326
      ? { GeographicTypeGeoKey: 4326 }
      : { ProjectedCSTypeGeoKey: code }),
    GDAL_NODATA: "nan",
    ImageDescription:
      "<GDALMetadata>" +
      scene.values
        .map(
          (_, b) =>
            `<Item name="SCALE" sample="${b}" role="scale">${scene.metadata.scales[b] ?? 1}</Item><Item name="OFFSET" sample="${b}" role="offset">${scene.metadata.offsets[b] ?? 0}</Item>`,
        )
        .join("") +
      "</GDALMetadata>",
  } as unknown as Parameters<typeof writeArrayBuffer>[1]);
  // GeoTIFF.js 3 cannot write GDAL_METADATA directly. ImageDescription is the
  // same TIFF ASCII field type; retag that entry and restore numeric IFD order.
  const view = new DataView(buffer),
    little = view.getUint16(0) === 0x4949,
    offset = view.getUint32(4, little),
    length = view.getUint16(offset, little);
  const entries = [];
  for (let i = 0; i < length; i++) {
    const start = offset + 2 + i * 12;
    if (view.getUint16(start, little) === 270)
      view.setUint16(start, 42112, little);
    entries.push(new Uint8Array(buffer.slice(start, start + 12)));
  }
  entries.sort(
    (a, b) =>
      new DataView(a.buffer).getUint16(0, little) -
      new DataView(b.buffer).getUint16(0, little),
  );
  entries.forEach((e, i) =>
    new Uint8Array(buffer, offset + 2 + i * 12, 12).set(e),
  );
  return buffer;
}
export function aligned(
  source: Scene,
  target: Grid,
  categorical = false,
): Scene {
  if (
    source.crs === target.crs &&
    source.width === target.width &&
    source.height === target.height &&
    source.origin.slice(0, 2).every((v, i) => v === target.origin[i]) &&
    source.step.slice(0, 2).every((v, i) => v === target.step[i])
  )
    return source;
  const n = target.width * target.height,
    values = source.values.map(() => new Float32Array(n)),
    valid = new Uint8Array(n),
    transform = proj4(projection(target.crs), projection(source.crs));
  // Coordinate transforms can put an exact pixel centre a few floating-point
  // units outside its integer index. Preserve that centre and its NoData rules.
  const snap = (v: number) =>
    Math.abs(v - Math.round(v)) < 1e-7 ? Math.round(v) : v;
  for (let y = 0; y < target.height; y++)
    for (let x = 0; x < target.width; x++) {
      const p = transform.forward(point(target, x + 0.5, y + 0.5));
      const sx = snap((p[0] - source.origin[0]) / source.step[0] - 0.5),
        sy = snap((p[1] - source.origin[1]) / source.step[1] - 0.5),
        i = y * target.width + x;
      if (categorical) {
        const xx = Math.round(sx),
          yy = Math.round(sy),
          j = yy * source.width + xx;
        if (
          xx >= 0 &&
          yy >= 0 &&
          xx < source.width &&
          yy < source.height &&
          source.valid[j]
        ) {
          valid[i] = 1;
          values.forEach((b, k) => (b[i] = source.values[k][j]));
        }
      } else if (
        sx >= 0 &&
        sy >= 0 &&
        sx <= source.width - 1 &&
        sy <= source.height - 1
      ) {
        const x0 = Math.floor(sx),
          y0 = Math.floor(sy),
          x1 = Math.min(source.width - 1, x0 + 1),
          y1 = Math.min(source.height - 1, y0 + 1);
        const js = [
            y0 * source.width + x0,
            y0 * source.width + x1,
            y1 * source.width + x0,
            y1 * source.width + x1,
          ],
          w = [
            (1 - (sx - x0)) * (1 - (sy - y0)),
            (sx - x0) * (1 - (sy - y0)),
            (1 - (sx - x0)) * (sy - y0),
            (sx - x0) * (sy - y0),
          ];
        if (js.every((j, k) => w[k] === 0 || source.valid[j])) {
          valid[i] = 1;
          values.forEach(
            (b, k) =>
              (b[i] = js.reduce(
                (sum, j, z) =>
                  w[z] === 0 ? sum : sum + source.values[k][j] * w[z],
                0,
              )),
          );
        }
      }
    }
  return {
    ...source,
    ...target,
    values,
    valid,
    metadata: {
      ...source.metadata,
      ...target,
      bounds: bounds(target),
      resolution: target.step.slice(0, 2).map(Math.abs),
    },
  };
}
