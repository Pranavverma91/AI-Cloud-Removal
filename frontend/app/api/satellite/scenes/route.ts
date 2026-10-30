import { identity, fail } from "@/lib/server";
import { areaFrom, findScenes } from "@/lib/satellite";
export async function GET(req: Request) { try {
    await identity(req);
    const p = new URL(req.url).searchParams;
    const area = areaFrom({ lat: p.get("lat"), lng: p.get("lng"), size: p.get("size") });
    const scenes = await findScenes(area.bbox, p.get("end") || "", Number(p.get("cloud") || 40));
    return Response.json({ scenes, bbox: area.bbox, searchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
catch (e) {
    return fail(e);
} }
