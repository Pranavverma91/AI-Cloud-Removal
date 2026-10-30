import { readAnalysis, fail, ApiError } from "@/lib/server";
import { generateReport } from "@/lib/report";
export async function GET(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params, { analysis, owner, bucket } = await readAnalysis(req, id);
        const image = await bucket.get(`${owner}/${id}/overlay.jpg`);
        if (!image)
            throw new ApiError(404, "The result image is unavailable.");
        const bytes = await generateReport(analysis, new Uint8Array(await image.arrayBuffer()));
        return new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="SPACE-EYE-${analysis.type}-${id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" } });
    }
    catch (e) {
        return fail(e);
    }
}
