import type { Raster } from "./science/types";
import proj4 from "proj4";

export type LissCloudObservation = {
  image_id: string;
  sensor: string;
  acquired_at: string | null;
  bounds: [number, number, number, number];
  width: number;
  height: number;
  valid_pixels: number;
  valid_percent: number;
  cloud_pixels: number;
  cloud_percent: number;
  shadow_pixels: number;
  shadow_percent: number;
  brightness_threshold: number;
  method: string;
  scope: string;
  preview_url: string;
  overlay_data_url: string;
  limitations: string[];
};

export function isLissIv(image: Raster) {
  return (
    /\bLISS[\s_-]*(?:IV|4)\b/i.test(image.sensor) &&
    !["mask", "dem", "sentinel1", "sentinel2", "synthetic"].includes(
      image.role,
    ) &&
    ["green", "red", "nir"].every((band) => image.bands[band] > 0)
  );
}

export function acquisitionDay(image: Raster): string | null {
  const value = image.acquired_at;
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const day = value.slice(0, 10),
    date = new Date(day + "T00:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day
    ? day
    : null;
}

export function rasterContainsPoint(image: Raster, point: [number, number]) {
  const [lng, lat] = point,
    [west, south, east, north] = image.metadata.bounds;
  const inBounds =
    [lng, lat, west, south, east, north].every(Number.isFinite) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90 &&
    south < north &&
    lat >= south &&
    lat <= north &&
    (west <= east ? lng >= west && lng <= east : lng >= west || lng <= east);
  if (!inBounds) return false;
  // New uploads retain the native grid, allowing exact footprint checks in
  // projected scenes whose WGS84 bounding rectangle also includes outside land.
  const { origin, step, width, height, crs } = image.metadata;
  if (!origin || !step) return true;
  if (
    ![origin[0], origin[1], step[0], step[1], width, height].every(
      Number.isFinite,
    ) ||
    step[0] <= 0 ||
    step[1] >= 0 ||
    width <= 0 ||
    height <= 0
  )
    return false;
  try {
    const epsg = Number(crs.split(":")[1]);
    const southZone = epsg >= 32700;
    const zone = epsg - (southZone ? 32700 : 32600);
    const target =
      epsg >= 32601 && epsg <= 32760 && zone >= 1 && zone <= 60
        ? `+proj=utm +zone=${zone} ${southZone ? "+south " : ""}+datum=WGS84 +units=m +no_defs`
        : crs;
    const [x, y] = proj4("EPSG:4326", target, point);
    const column = (x - origin[0]) / step[0],
      row = (y - origin[1]) / step[1];
    return (
      Number.isFinite(column) &&
      Number.isFinite(row) &&
      column >= 0 &&
      row >= 0 &&
      column <= width &&
      row <= height
    );
  } catch {
    return false;
  }
}

function newestFirst(a: Raster, b: Raster) {
  const dateA = acquisitionDay(a) || "",
    dateB = acquisitionDay(b) || "";
  return dateB.localeCompare(dateA) || b.created_at.localeCompare(a.created_at);
}

export function lissImagesAt(images: Raster[], point: [number, number]) {
  return images
    .filter((image) => isLissIv(image) && rasterContainsPoint(image, point))
    .sort(newestFirst);
}

export function otherDateLissImages(
  images: Raster[],
  source: Raster,
  point?: [number, number],
) {
  const day = acquisitionDay(source);
  if (!isLissIv(source) || !day) return [];
  return images
    .filter((image) => {
      const otherDay = acquisitionDay(image);
      const a = source.metadata.bounds,
        b = image.metadata.bounds;
      const intervals = (bounds: number[]) =>
        bounds[0] <= bounds[2]
          ? [[bounds[0], bounds[2]]]
          : [
              [bounds[0], 180],
              [-180, bounds[2]],
            ];
      const overlap =
        a[1] < b[3] &&
        a[3] > b[1] &&
        intervals(a).some((left) =>
          intervals(b).some(
            (right) => left[0] < right[1] && left[1] > right[0],
          ),
        );
      return (
        image.id !== source.id &&
        isLissIv(image) &&
        !!otherDay &&
        otherDay !== day &&
        overlap &&
        (!point || rasterContainsPoint(image, point))
      );
    })
    .sort(newestFirst);
}
