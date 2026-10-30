import { identity, fail, ApiError } from "@/lib/server";
import { remoteJson } from "@/lib/satellite";
const cache = new Map<string, {
    at: number;
    places: unknown[];
}>();
export async function GET(req: Request) {
    try {
        await identity(req);
        const p = new URL(req.url).searchParams, q = (p.get("q") || "").trim();
        let url: string;
        if (q) {
            if (q.length < 2 || q.length > 160)
                throw new ApiError(400, "Enter a place name between 2 and 160 characters.");
            url = "https://photon.komoot.io/api/?" + new URLSearchParams({ q, limit: "5", lang: "en" });
        }
        else {
            const lat = Number(p.get("lat")), lng = Number(p.get("lng"));
            if (!p.has("lat") || !p.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
                throw new ApiError(400, "Choose a valid map location.");
            url = "https://photon.komoot.io/reverse?" + new URLSearchParams({ lat: lat.toFixed(5), lon: lng.toFixed(5), limit: "1", lang: "en" });
        }
        const existing = cache.get(url);
        if (existing && Date.now() - existing.at < 3600000)
            return Response.json({ places: existing.places });
        const data = await remoteJson<{
            features: {
                geometry: {
                    coordinates: number[];
                };
                properties: Record<string, string>;
            }[];
        }>(url);
        const places = data.features.map(f => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], name: [f.properties.name, f.properties.city || f.properties.town || f.properties.village, f.properties.state, f.properties.country].filter((v, i, a) => v && a.indexOf(v) === i).join(", ") }));
        if (cache.size > 200)
            cache.clear();
        cache.set(url, { at: Date.now(), places });
        return Response.json({ places }, { headers: { "Cache-Control": "private, max-age=3600" } });
    }
    catch (e) {
        return fail(e);
    }
}
