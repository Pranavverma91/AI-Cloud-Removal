import { z } from "zod";

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const coordinate = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-85).max(85),
]);
const ring = z
  .array(coordinate)
  .min(4)
  .refine((points) => {
    const first = points[0],
      last = points.at(-1)!;
    return (
      first[0] === last[0] &&
      first[1] === last[1] &&
      new Set(points.slice(0, -1).map((point) => point.join(","))).size >= 3 &&
      Math.abs(
        points
          .slice(0, -1)
          .reduce(
            (area, point, i) =>
              area +
              (point[0] - first[0]) * (points[i + 1][1] - first[1]) -
              (points[i + 1][0] - first[0]) * (point[1] - first[1]),
            0,
          ),
      ) > 1e-18
    );
  }, "Draw a closed polygon with at least three distinct corners and a nonzero area.");
const polygonCoordinates = z.array(ring).min(1);
export const areaSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygonCoordinates }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(polygonCoordinates).min(1),
  }),
]);

const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const counts = z
  .object({
    valid: nonnegative.int().positive(),
    clear: nonnegative.int(),
    cloud: nonnegative.int(),
    shadow: nonnegative.int(),
  })
  .refine(
    (v) => v.valid === v.clear + v.cloud + v.shadow,
    "Pixel counts must cover the valid area.",
  );
const metrics = z.object({
  pixels: nonnegative.int(),
  mae: nonnegative,
  rmse: nonnegative,
  psnr: finite.nullable(),
  ssim: finite.nullable(),
  sam: nonnegative.nullable(),
  ergas: nonnegative.nullable(),
});
export const resultSchema = z.object({
  metadata: z.object({
    width: finite.int().positive(),
    height: finite.int().positive(),
    count: finite.int().positive(),
    dtype: z.string(),
    crs: z.string(),
    bounds: z.tuple([finite, finite, finite, finite]),
    resolution: z.array(finite.positive()).length(2),
    nodata: finite.nullable(),
    scales: z.array(finite),
    offsets: z.array(finite),
    bytes: nonnegative,
  }),
  counts,
  area_m2: z.object({
    valid: nonnegative,
    clear: nonnegative,
    cloud: nonnegative,
    shadow: nonnegative,
  }),
  cloud_percent: nonnegative.max(100),
  shadow_percent: nonnegative.max(100),
  metrics: z.record(metrics.nullable()).nullable(),
  metric_note: z.string(),
  provenance: z.record(z.unknown()),
  seconds: nonnegative,
  confidence: z.null(),
  limitations: z.array(z.string()),
});
