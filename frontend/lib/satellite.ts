import { ApiError } from "./api-error";
export const CATALOG = "https://planetarycomputer.microsoft.com/api/stac/v1";
export const DATA = "https://planetarycomputer.microsoft.com/api/data/v1";
export type Scene = {
    id: string;
    capturedAt: string;
    cloudCover: number;
    platform: string;
    baseline: number;
};
type StacItem = {
    id: string;
    bbox: number[];
    properties: Record<string, unknown>;
};
export async function upstream(url: string, maxBytes = 8000000): Promise<Uint8Array> {
    let response: Response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(55000), headers: { "User-Agent": "SpaceEye-PersonalObservatory/3.0" } });
    }
    catch {
        throw new ApiError(502, "The external data service could not be reached. Please retry shortly. Your saved observations and uploads are still available.");
    }
    if (!response.ok)
        throw new ApiError(502, response.status === 404 ? "This satellite scene is no longer available. Search for another capture." : "The imagery service could not complete this request. Please try another capture or retry shortly.");
    if (Number(response.headers.get("content-length")) > maxBytes)
        throw new ApiError(502, "The imagery response exceeded the size limit.");
    const reader = response.body!.getReader(), chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        length += value.length;
        if (length > maxBytes) {
            await reader.cancel();
            throw new ApiError(502, "The imagery response exceeded the size limit.");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
    }
    return bytes;
}
export async function remoteJson<T>(url: string): Promise<T> { return JSON.parse(new TextDecoder().decode(await upstream(url, 4000000))) as T; }
export function areaFrom(values: {
    lat: unknown;
    lng: unknown;
    size: unknown;
}) {
    const lat = Number(values.lat), lng = Number(values.lng), size = Number(values.size || 5);
    if (values.lat === null || values.lng === null || values.lat === "" || values.lng === "" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 80 || Math.abs(lng) > 180 || ![1, 2, 5, 10].includes(size))
        throw new ApiError(400, "Choose a valid location between 80°S and 80°N and a 1, 2, 5, or 10 km area.");
    const dy = size / 2 / 111.32, dx = dy / Math.cos(lat * Math.PI / 180);
    const bbox = [lng - dx, lat - dy, lng + dx, lat + dy].map(n => Math.round(n * 1e6) / 1e6);
    if (bbox[0] < -180 || bbox[2] > 180)
        throw new ApiError(400, "Move the selection away from the international date line.");
    return { lat, lng, size, bbox };
}
export function sceneId(id: unknown): string { if (typeof id !== "string" || !/^S2[ABC]_MSIL2A_\d{8}T\d{6}_R\d{3}_T[A-Z0-9]{5}_\d{8}T\d{6}$/.test(id))
    throw new ApiError(400, "Choose a satellite capture from the search results."); return id; }
const summary = (f: StacItem): Scene => ({ id: f.id, capturedAt: String(f.properties.datetime), cloudCover: Number(f.properties["eo:cloud_cover"] || 0), platform: String(f.properties.platform || "Sentinel-2"), baseline: Number(f.properties["s2:processing_baseline"] || 0) });
export async function getScene(id: string, bbox: number[]): Promise<Scene> {
    const f = await remoteJson<StacItem>(`${CATALOG}/collections/sentinel-2-l2a/items/${sceneId(id)}`);
    if (!f.bbox || f.bbox[0] > bbox[2] || f.bbox[2] < bbox[0] || f.bbox[1] > bbox[3] || f.bbox[3] < bbox[1])
        throw new ApiError(400, "This image does not cover the selected location. Search again.");
    return summary(f);
}
export async function findScenes(bbox: number[], endDate: string, cloud: number) {
    const end = endDate ? new Date(`${endDate}T23:59:59Z`) : new Date();
    if (Number.isNaN(end.getTime()) || end.getTime() > Date.now() + 86400000 || end.getUTCFullYear() < 2017)
        throw new ApiError(400, "Choose an end date between 2017 and today.");
    if (!Number.isFinite(cloud) || cloud < 0 || cloud > 100)
        throw new ApiError(400, "Cloud cover must be between 0 and 100%.");
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    const query = new URLSearchParams({ collections: "sentinel-2-l2a", bbox: bbox.join(","), limit: "30", sortby: "-datetime", datetime: `${start.toISOString()}/${end.toISOString()}`, query: JSON.stringify({ "eo:cloud_cover": { lte: cloud } }) });
    const data = await remoteJson<{
        features: StacItem[];
    }>(`${CATALOG}/search?${query}`);
    const seen = new Set<string>();
    return data.features.map(summary).filter(s => { const day = s.capturedAt.slice(0, 10); if (seen.has(day))
        return false; seen.add(day); return true; }).slice(0, 16);
}
export function imageUrl(id: string, bbox: number[], raw = false) {
    const q = new URLSearchParams({ collection: "sentinel-2-l2a", item: sceneId(id), resampling: "nearest", dst_crs: "EPSG:4326" });
    for (const asset of raw ? ["B04", "B03", "B08", "SCL"] : ["visual"])
        q.append("assets", asset);
    return `${DATA}/item/bbox/${bbox.join(",")}/384x384.${raw ? "npy" : "jpg"}?${q}`;
}
