import { ApiError } from "./api-error";

/** Current weather-model estimate near the selected point, not a satellite mask. */
export interface CloudCoverResult {
  latitude: number;
  longitude: number;
  cloudCover: number;
  observedAt: string;
  fetchedAt: string;
  intervalSeconds?: number;
  modelLatitude?: number;
  modelLongitude?: number;
  source: "Open-Meteo";
  sourceUrl: string;
}

const unavailable =
  "Cloud conditions are temporarily unavailable for this location. Please try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

export function cloudCoverCoordinates(params: URLSearchParams) {
  const lat = params.get("lat")?.trim() ?? "";
  const lng = params.get("lng")?.trim() ?? "";
  const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (
    !decimal.test(lat) ||
    !decimal.test(lng) ||
    !isNumberInRange(latitude, -90, 90) ||
    !isNumberInRange(longitude, -180, 180)
  ) {
    throw new ApiError(
      400,
      "Choose a valid map location with latitude from -90 to 90 and longitude from -180 to 180.",
    );
  }
  return { latitude, longitude };
}

function currentTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z?$/.test(value)
  )
    return null;
  // timezone=GMT is explicit below; Open-Meteo's ISO strings omit the UTC suffix.
  const utc = value.endsWith("Z") ? value.slice(0, -1) : value;
  const date = new Date(`${utc}Z`);
  if (!Number.isFinite(date.getTime())) return null;
  const iso = date.toISOString();
  return iso.startsWith(utc) ? iso : null;
}

export async function getCloudCover(
  latitude: number,
  longitude: number,
  requestSignal?: AbortSignal,
): Promise<CloudCoverResult> {
  if (
    !isNumberInRange(latitude, -90, 90) ||
    !isNumberInRange(longitude, -180, 180)
  ) {
    throw new ApiError(400, "Choose a valid map location.");
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "cloud_cover",
    timezone: "GMT",
    forecast_days: "1",
    cell_selection: "nearest",
  }).toString();

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (requestSignal?.aborted) abort();
  else requestSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 10_000);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Weather provider returned an error.");
    const data: unknown = await response.json();
    if (
      !isRecord(data) ||
      !isRecord(data.current) ||
      data.error ||
      (data.utc_offset_seconds !== undefined && data.utc_offset_seconds !== 0)
    ) {
      throw new Error("Weather provider returned an invalid response.");
    }
    const observedAt = currentTimestamp(data.current.time);
    const cloudCover = data.current.cloud_cover;
    if (!observedAt || !isNumberInRange(cloudCover, 0, 100)) {
      throw new Error("Weather provider did not return cloud conditions.");
    }

    const result: CloudCoverResult = {
      latitude,
      longitude,
      cloudCover,
      observedAt,
      fetchedAt: new Date().toISOString(),
      source: "Open-Meteo",
      sourceUrl: "https://open-meteo.com/",
    };
    const interval = data.current.interval;
    if (
      typeof interval === "number" &&
      Number.isInteger(interval) &&
      interval > 0
    ) {
      result.intervalSeconds = interval;
    }
    if (isNumberInRange(data.latitude, -90, 90))
      result.modelLatitude = data.latitude;
    if (isNumberInRange(data.longitude, -180, 180))
      result.modelLongitude = data.longitude;
    return result;
  } catch {
    throw new ApiError(502, unavailable);
  } finally {
    clearTimeout(timer);
    requestSignal?.removeEventListener("abort", abort);
  }
}
