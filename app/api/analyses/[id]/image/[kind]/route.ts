import { readAnalysis, fail, ApiError } from "@/lib/server";
export async function GET(req: Request, { params }: {
    params: Promise<{
        id: string;
        kind: string;
    }>;
}) {
    try {
        const { id, kind } = await params;
        if (!["original", "overlay", "before"].includes(kind))
            throw new ApiError(404, "Image not found.");
        const { owner, bucket } = await readAnalysis(req, id), object = await bucket.get(`${owner}/${id}/${kind}.jpg`);
        if (!object)
            throw new ApiError(404, "Image not found.");
        return new Response(object.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    catch (e) {
        return fail(e);
    }
}
