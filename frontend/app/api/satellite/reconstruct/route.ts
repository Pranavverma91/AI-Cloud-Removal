import { ApiError, fail, identity, sameOrigin } from "@/lib/server";
import { backendURL } from "@/lib/science/server";
import {
  prepareSatelliteReconstruction,
  type ReconstructionRequest,
} from "@/lib/satellite-reconstruction";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await identity(request);
    if (backendURL())
      throw new ApiError(
        409,
        "Map reconstruction uses the built-in personal processor. Upload your observation through the configured research service instead.",
      );
    if (Number(request.headers.get("content-length")) > 2000)
      throw new ApiError(413, "The reconstruction request is too large.");
    const reader = request.body?.getReader();
    if (!reader)
      throw new ApiError(400, "Choose a satellite capture to reconstruct.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2000) {
        await reader.cancel();
        throw new ApiError(413, "The reconstruction request is too large.");
      }
      chunks.push(value);
    }
    let input: unknown;
    try {
      input = JSON.parse(await new Blob(chunks as BlobPart[]).text());
    } catch {
      throw new ApiError(400, "Send a valid reconstruction request.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ApiError(400, "Send a valid reconstruction request.");
    const result = await prepareSatelliteReconstruction(
      request,
      input as ReconstructionRequest,
    );
    return Response.json(result, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return fail(error);
  }
}
