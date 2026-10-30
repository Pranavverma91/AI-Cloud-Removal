import { ApiError } from "@/lib/api-error";
import { cloudCoverCoordinates } from "@/lib/cloud-cover";
import { areaFrom, sceneId } from "@/lib/satellite";
import { getSatelliteClouds } from "@/lib/satellite-cloud";

export async function GET(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const params = new URL(req.url).searchParams;
    const { latitude, longitude } = cloudCoverCoordinates(params);
    const area = areaFrom({
      lat: latitude,
      lng: longitude,
      size: params.get("size"),
    });
    const result = await getSatelliteClouds(sceneId(params.get("scene")), area);
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : "Satellite cloud analysis is unavailable. Try another capture.",
      },
      {
        status: error instanceof ApiError ? error.status : 502,
        headers,
      },
    );
  }
}
