import { readAnalysis, fail } from "@/lib/server";
export async function GET(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const { analysis } = await readAnalysis(req, id);
        return Response.json(analysis, { headers: { "Cache-Control": "private, no-store" } });
    }
    catch (e) {
        return fail(e);
    }
}
