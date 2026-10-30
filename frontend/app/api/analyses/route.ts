import { bindings, identity, sameOrigin, fail, ApiError } from "@/lib/server";
import { analyze, decodeImage } from "@/lib/analysis-engine";
import { modules, type AnalysisType, type Analysis } from "@/lib/types";
export async function GET(req: Request) {
    try {
        const { owner } = await identity(req), { db } = bindings();
        const rows = await db.prepare("SELECT payload FROM analyses WHERE owner = ? AND COALESCE(json_extract(payload, '$.demo'), 0) = 0 ORDER BY created_at DESC LIMIT 200").bind(owner).all<{
            payload: string;
        }>();
        const counts = await db.prepare("SELECT type, COUNT(*) AS count FROM analyses WHERE owner = ? AND COALESCE(json_extract(payload, '$.demo'), 0) = 0 GROUP BY type").bind(owner).all<{
            type: string;
            count: number;
        }>();
        return Response.json({ analyses: rows.results.map(x => JSON.parse(x.payload)), counts: Object.fromEntries(counts.results.map(x => [x.type, x.count])) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    catch (e) {
        return fail(e);
    }
}
export async function POST(req: Request) {
    const written: string[] = [];
    let cleanup: R2Bucket | undefined;
    try {
        sameOrigin(req);
        const { owner } = await identity(req), { db, bucket } = bindings();
        cleanup = bucket;
        if (Number(req.headers.get("content-length") || 0) > 7000000)
            throw new ApiError(413, "The prepared images are too large.");
        const reader = req.body?.getReader();
        if (!reader)
            throw new ApiError(400, "Choose an image.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.byteLength;
            if (size > 7000000) {
                await reader.cancel();
                throw new ApiError(413, "The prepared images are too large.");
            }
            chunks.push(part.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
        }
        let form: FormData;
        try {
            form = await new Response(body, { headers: { "Content-Type": req.headers.get("Content-Type") || "" } }).formData();
        }
        catch {
            throw new ApiError(400, "Send a valid image upload.");
        }
        const type = String(form.get("type")) as AnalysisType;
        if (!Object.hasOwn(modules, type))
            throw new ApiError(400, "Choose crop health, water detection, or forest change.");
        const file = form.get("image"), beforeFile = form.get("before");
        if (!(file instanceof File) || file.size === 0 || file.size > 3000000)
            throw new ApiError(400, "Choose a valid image under 12 MB.");
        if (type === "forest" && (!(beforeFile instanceof File) || beforeFile.size === 0 || beforeFile.size > 3000000))
            throw new ApiError(400, "Choose a before and an after image.");
        const coord = (key: string, min: number, max: number) => {
            const v = form.get(key);
            if (v === null || v === "")
                return null;
            const n = Number(v);
            if (!Number.isFinite(n) || n < min || n > max)
                throw new ApiError(400, "Enter valid latitude and longitude.");
            return n;
        };
        const lat = coord("latitude", -90, 90), lng = coord("longitude", -180, 180);
        if ((lat === null) !== (lng === null))
            throw new ApiError(400, "Provide both coordinates, or leave both empty.");
        const location = String(form.get("location") || "Untitled location").trim().slice(0, 100) || "Untitled location";
        const bytes = new Uint8Array(await file.arrayBuffer()), beforeBytes = type === "forest" ? new Uint8Array(await (beforeFile as File).arrayBuffer()) : undefined;
        let computed;
        try {
            computed = analyze(type, decodeImage(bytes), beforeBytes ? decodeImage(beforeBytes) : undefined);
        }
        catch (e) {
            throw new ApiError(400, e instanceof Error ? e.message : "The image could not be analyzed.");
        }
        if (form.get("demo") === "true") throw new ApiError(400, "Sample analyses have been removed. Upload your own image or select a satellite observation.");
        const id = crypto.randomUUID(), createdAt = new Date().toISOString();
        const images: Analysis["images"] = { original: `/api/analyses/${id}/image/original`, overlay: `/api/analyses/${id}/image/overlay` };
        const payloads: [
            string,
            Uint8Array
        ][] = [["original", bytes], ["overlay", computed.overlay]];
        if (beforeBytes) {
            images.before = `/api/analyses/${id}/image/before`;
            payloads.push(["before", beforeBytes]);
        }
        for (const [kind, data] of payloads) {
            const key = `${owner}/${id}/${kind}.jpg`;
            await bucket.put(key, data, { httpMetadata: { contentType: "image/jpeg" } });
            written.push(key);
        }
        const result: Analysis = { id, type, title: `${modules[type].title} · ${location}`, location, latitude: lat, longitude: lng, source: { kind: "upload", provider: "Your uploaded RGB imagery" }, createdAt, images, width: computed.width, height: computed.height, metrics: computed.metrics, distribution: computed.distribution, summary: computed.summary, algorithm: computed.algorithm };
        await db.prepare("INSERT INTO analyses (id,owner,type,title,created_at,payload) VALUES (?,?,?,?,?,?)").bind(id, owner, type, result.title, createdAt, JSON.stringify(result)).run();
        return Response.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }
    catch (e) {
        if (cleanup && written.length) {
            try {
                await cleanup.delete(written);
            }
            catch {
                console.error("Orphan object cleanup failed");
            }
        }
        return fail(e);
    }
}
