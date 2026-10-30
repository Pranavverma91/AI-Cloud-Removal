import { identity, fail } from "@/lib/server";
import { areaFrom, imageUrl, sceneId, upstream } from "@/lib/satellite";
export async function GET(req: Request) { try {
    await identity(req);
    const p = new URL(req.url).searchParams;
    const area = areaFrom({ lat: p.get("lat"), lng: p.get("lng"), size: p.get("size") });
    const bytes = await upstream(imageUrl(sceneId(p.get("scene")), area.bbox));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
}
catch (e) {
    return fail(e);
} }
