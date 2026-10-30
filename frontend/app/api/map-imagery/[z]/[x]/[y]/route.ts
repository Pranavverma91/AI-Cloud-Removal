import { identity, fail } from "@/lib/server";
import { imageryTile, type ImageryTileCoordinates } from "@/lib/imagery-tiles";

export async function GET(
  request: Request,
  context: { params: Promise<ImageryTileCoordinates> },
) {
  try {
    await identity(request);
    return await imageryTile(await context.params, request.signal);
  } catch (error) {
    return fail(error);
  }
}
