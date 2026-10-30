import { ApiError } from "./api-error";

export type ImageryTileCoordinates = { z: string; x: string; y: string };
const TILE_LIMIT = 1024 * 1024;
const SERVICE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

function tileCoordinates(values: ImageryTileCoordinates) {
  if (!Object.values(values).every((value) => /^(0|[1-9]\d*)$/.test(value)))
    throw new ApiError(400, "Choose valid imagery tile coordinates.");
  const z = Number(values.z),
    x = Number(values.x),
    y = Number(values.y);
  if (
    ![z, x, y].every(Number.isSafeInteger) ||
    z < 0 ||
    z > 22 ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  )
    throw new ApiError(400, "Choose valid imagery tile coordinates.");
  return { z, x, y };
}

function unavailableTile() {
  // Preserve 404 for MapLibre's georeferenced ancestor-tile fallback. The
  // provider's missing-tile responses omit CORS headers in direct browser use.
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

export async function imageryTile(
  values: ImageryTileCoordinates,
  requestSignal: AbortSignal,
) {
  const { z, x, y } = tileCoordinates(values);
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(15000)]);
  try {
    const response = await fetch(
      `${SERVICE}/tile/${z}/${y}/${x}?blankTile=false`,
      {
        signal,
        redirect: "error",
        cache: "no-store",
      },
    );
    if (
      response.status === 404 ||
      response.headers.get("blank-tile")?.trim().toLowerCase() === "true"
    ) {
      await response.body?.cancel();
      return unavailableTile();
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new ApiError(
        502,
        "The aerial imagery provider is temporarily unavailable.",
      );
    }
    const contentType = response.headers
      .get("content-type")
      ?.split(";")[0]
      .trim()
      .toLowerCase();
    if (
      !contentType ||
      !["image/jpeg", "image/png"].includes(contentType) ||
      !response.body ||
      Number(response.headers.get("content-length")) > TILE_LIMIT
    ) {
      await response.body?.cancel();
      throw new ApiError(
        502,
        "The aerial imagery provider returned an invalid tile.",
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > TILE_LIMIT) {
        await reader.cancel();
        throw new ApiError(
          502,
          "The aerial imagery tile exceeded the size limit.",
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const signature =
      contentType === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10]
        : [255, 216, 255];
    if (!signature.every((byte, index) => bytes[index] === byte))
      throw new ApiError(
        502,
        "The aerial imagery provider returned an invalid tile.",
      );
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "The aerial imagery provider could not be reached. Please retry the map.",
    );
  }
}
