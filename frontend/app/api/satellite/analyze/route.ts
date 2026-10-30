import { ApiError, bindings, identity, sameOrigin, fail } from "@/lib/server";
import { areaFrom, sceneId, getScene, imageUrl, upstream } from "@/lib/satellite";
import { decodeBands, spectralAnalysis } from "@/lib/spectral-engine";
import { modules, type Analysis, type AnalysisType } from "@/lib/types";
export async function POST(req: Request) {
    const written: string[] = [];
    let cleanup: R2Bucket | undefined;
    try {
        sameOrigin(req);
        const { owner } = await identity(req), { db, bucket } = bindings();
        cleanup = bucket;
        if (Number(req.headers.get("content-length")) > 2000)
            throw new ApiError(413, "The request is too large.");
        const reader = req.body?.getReader();
        if (!reader)
            throw new ApiError(400, "Send an observation request.");
        let raw = "", bodySize = 0;
        const decoder = new TextDecoder();
        for (;;) {
            const part = await reader.read();
            if (part.done)
                break;
            bodySize += part.value.byteLength;
            if (bodySize > 2000) {
                await reader.cancel();
                throw new ApiError(413, "The request is too large.");
            }
            raw += decoder.decode(part.value, { stream: true });
        }
        raw += decoder.decode();
        let input;
        try {
            input = JSON.parse(raw);
        }
        catch {
            throw new ApiError(400, "Send a valid observation request.");
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
            throw new ApiError(400, "Send a valid observation request.");
        const type = input.type as AnalysisType;
        if (!Object.hasOwn(modules, type))
            throw new ApiError(400, "Choose an analysis type.");
        const area = areaFrom(input), idScene = sceneId(input.scene), beforeId = type === "forest" ? sceneId(input.before) : null;
        const scene = await getScene(idScene, area.bbox), prior = beforeId ? await getScene(beforeId, area.bbox) : undefined;
        if (prior && new Date(prior.capturedAt) >= new Date(scene.capturedAt))
            throw new ApiError(400, "The before image must have an earlier capture date.");
        const requests = [upstream(imageUrl(idScene, area.bbox)), upstream(imageUrl(idScene, area.bbox, true))];
        if (beforeId)
            requests.push(upstream(imageUrl(beforeId, area.bbox)), upstream(imageUrl(beforeId, area.bbox, true)));
        const [original, bands, beforeImage, beforeBands] = await Promise.all(requests);
        let computed;
        try {
            computed = spectralAnalysis(type, decodeBands(bands, scene.baseline), prior && beforeBands ? decodeBands(beforeBands, prior.baseline) : undefined);
        }
        catch (e) {
            throw new ApiError(422, e instanceof Error ? e.message : "Could not read the spectral image.");
        }
        const id = crypto.randomUUID(), createdAt = new Date().toISOString(), location = String(input.location || `${area.lat.toFixed(4)}, ${area.lng.toFixed(4)}`).slice(0, 180);
        const images: Analysis["images"] = { original: `/api/analyses/${id}/image/original`, overlay: `/api/analyses/${id}/image/overlay` };
        const payloads: [
            string,
            Uint8Array
        ][] = [["original", original], ["overlay", computed.overlay]];
        if (beforeImage) {
            images.before = `/api/analyses/${id}/image/before`;
            payloads.push(["before", beforeImage]);
        }
        for (const [kind, bytes] of payloads) {
            const key = `${owner}/${id}/${kind}.jpg`;
            await bucket.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
            written.push(key);
        }
        const result: Analysis = { id, type, title: `${modules[type].title} · ${location}`, location, latitude: area.lat, longitude: area.lng, createdAt, images, width: computed.width, height: computed.height, metrics: computed.metrics, distribution: computed.distribution, summary: computed.summary, algorithm: computed.algorithm, source: { kind: "sentinel-2", provider: "Copernicus Sentinel-2 L2A · Microsoft Planetary Computer", capturedAt: scene.capturedAt, beforeCapturedAt: prior?.capturedAt, sceneId: idScene, beforeSceneId: beforeId || undefined, cloudCover: Math.round(scene.cloudCover * 10) / 10, validPercent: computed.validPercent, sizeKm: area.size, bbox: area.bbox, nativeResolution: "10 m spectral bands; 20 m scene classification" } };
        await db.prepare("INSERT INTO analyses (id,owner,type,title,created_at,payload) VALUES (?,?,?,?,?,?)").bind(id, owner, type, result.title, createdAt, JSON.stringify(result)).run();
        return Response.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }
    catch (e) {
        if (cleanup && written.length)
            try {
                await cleanup.delete(written);
            }
            catch {
                console.error("Observation image cleanup failed");
            }
        return fail(e);
    }
}
