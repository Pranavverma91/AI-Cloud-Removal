import { ApiError } from "@/lib/api-error";
import { cloudCoverCoordinates, getCloudCover } from "@/lib/cloud-cover";

export async function GET(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { latitude, longitude } = cloudCoverCoordinates(
      new URL(req.url).searchParams,
    );
    const result = await getCloudCover(latitude, longitude, req.signal);
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : "Cloud conditions are temporarily unavailable. Please try again.",
      },
      { status: error instanceof ApiError ? error.status : 502, headers },
    );
  }
}
