import { z } from "zod";
import { decode as decodePng } from "fast-png";
import { areaSchema, resultSchema, validDate } from "./validation";
import { COOKIE, OWNER, profile, resources } from "./auth";
import {
  openRaster,
  info,
  readScene,
  png,
  MAX_BYTES,
  MAX_PIXELS,
  projection,
} from "./raster";
import proj4 from "proj4";
import type { Analysis, Model, Raster } from "../science/types";
import { isLissIv, type LissCloudObservation } from "../liss-imagery";
import {
  automaticCloudMask,
  AUTOMATIC_CLOUD_METHOD,
  cloudOverlayPng,
  pngDataUrl,
} from "./cloud-mask";
const now = () => new Date().toISOString();
const models: Model[] = [
  [
    "spatial-baseline",
    "Spatial reconstruction",
    "Multiscale normalized interpolation",
    [],
  ],
  [
    "temporal-baseline",
    "Temporal reconstruction",
    "Georeferenced temporal replacement",
    ["temporal"],
  ],
  ["resunet", "ResUNet", "Residual U-Net", []],
  ["cgan", "Conditional GAN", "ResUNet + PatchGAN", []],
  ["diffusion", "Conditional diffusion", "Conditional DDPM", []],
  [
    "multimodal-diffusion",
    "Multimodal diffusion",
    "Optical/SAR attention DDPM",
    ["temporal", "sentinel1"],
  ],
].map(([id, name, architecture, aux]) => ({
  id: id as string,
  name: name as string,
  architecture: architecture as string,
  version: "personal-1.0",
  available: String(id).endsWith("baseline"),
  baseline: String(id).endsWith("baseline"),
  required_auxiliary: aux as string[],
  training_date: null,
  validation_metrics: null,
  reason: String(id).endsWith("baseline")
    ? null
    : "Requires training and the Python inference service; no pretrained weights are included.",
}));
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function check(ok: unknown, message: string, status = 422): asserts ok {
  if (!ok) throw new HttpError(status, message);
}
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
function json(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, { status, headers: { ...headers, ...extra } });
}
async function record<T>(id: string, kind: string): Promise<T> {
  const { db } = resources();
  const row = await db
    .prepare(
      "SELECT payload FROM personal_records WHERE id=? AND kind=? AND owner=?",
    )
    .bind(id, kind, OWNER)
    .first<{ payload: string }>();
  if (!row) throw new HttpError(404, "This record is unavailable.");
  return JSON.parse(row.payload);
}
async function list<T>(kind: string): Promise<T[]> {
  const { db } = resources();
  const rows = await db
    .prepare(
      "SELECT payload FROM personal_records WHERE kind=? AND owner=? ORDER BY created_at DESC LIMIT 500",
    )
    .bind(kind, OWNER)
    .all<{ payload: string }>();
  return rows.results.map((r) => JSON.parse(r.payload));
}
async function put(id: string, kind: string, value: unknown, created = now()) {
  await resources()
    .db.prepare(
      "INSERT INTO personal_records (id,owner,kind,payload,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
    )
    .bind(id, OWNER, kind, JSON.stringify(value), created)
    .run();
}
async function readJson(request: Request, limit = 2_000_000) {
  const text = new TextDecoder().decode(await uploadBody(request, limit));
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(422, "Send valid JSON.");
  }
}
async function uploadBody(request: Request, max = MAX_BYTES + 65536) {
  const reader = request.body?.getReader();
  check(reader, "No upload supplied.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(
        413,
        `Request exceeds the ${Math.round(max / 1024)} KB limit.`,
      );
    }
    chunks.push(part.value);
  }
  return new Blob(chunks as BlobPart[]).arrayBuffer();
}
function polygon(value: unknown) {
  if (!value) return null;
  check(JSON.stringify(value).length < 100000, "Area is too complex.");
  return areaSchema.parse(value);
}
const analysisInput = z.object({
  name: z.string().trim().min(1).max(160),
  image_id: z.string(),
  model_id: z
    .enum(["spatial-baseline", "temporal-baseline"])
    .default("spatial-baseline"),
  mask_id: z.string().nullable().optional(),
  reference_id: z.string().nullable().optional(),
  temporal_id: z.string().nullable().optional(),
  sentinel1_id: z.string().nullable().optional(),
  reference_relation: z
    .enum(["none", "same-acquisition", "synthetic-ground-truth", "temporal"])
    .default("none"),
  patch_size: z.union([z.literal(256), z.literal(512)]).default(256),
  overlap: z.number().int().min(16).max(128).default(32),
  brightness_threshold: z.number().min(0.4).max(0.99).default(0.75),
  detect_shadows: z.boolean().default(true),
  feather: z.number().int().min(0).max(16).default(0),
  target_crs: z.string().nullable().optional(),
  resolution: z.number().finite().positive().nullable().optional(),
  aoi: z.any().optional(),
  seed: z.number().int().default(42),
});
export async function personalApi(
  request: Request,
  path: string[],
): Promise<Response> {
  try {
    const url = new URL(request.url),
      key = path.join("/"),
      method = request.method,
      { bucket } = resources();
    const methods = ["images", "analyses", "aoi"].includes(key)
      ? ["GET", "POST"]
      : ["auth/login", "auth/logout"].includes(key) ||
          (path[0] === "analyses" &&
            ["stage", "artifact", "complete"].includes(path[2]))
        ? ["POST"]
        : ["GET"];
    if (!methods.includes(method))
      return json({ detail: "Method not allowed." }, 405, {
        Allow: methods.join(", "),
      });
    if (method !== "GET")
      check(
        request.headers.get("x-space-eye") === "1" &&
          (!request.headers.get("origin") ||
            request.headers.get("origin") === url.origin),
        "Request origin not permitted.",
        403,
      );
    if (key === "auth/login" && method === "POST") {
      // Older clients may still call this endpoint; no sign-in is required.
      return json(profile());
    }
    if (key === "auth/logout" && method === "POST") {
      // Expire an old cookie without locking the password-free workspace.
      return json({ ok: true }, 200, {
        "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`,
      });
    }
    if (key === "auth/me") return json(profile());
    if (key === "health")
      return json({
        status: "ready",
        service: "Built-in personal processor",
        version: "5.1.0",
        max_pixels: MAX_PIXELS,
      });
    if (key === "models") return json(models);
    if (key === "experiments") return json([]);
    if (key === "images" && method === "GET") return json(await list("image"));
    if (key === "images" && method === "POST") {
      const bytes = await uploadBody(request);
      let form: FormData;
      try {
        form = await new Request("https://local/upload", {
          method: "POST",
          body: bytes,
          headers: {
            "content-type": request.headers.get("content-type") || "",
          },
        }).formData();
      } catch {
        throw new HttpError(422, "Send a GeoTIFF using a multipart upload.");
      }
      const file = form.get("file");
      check(
        file instanceof File && file.size > 0 && file.size <= MAX_BYTES,
        "Select a GeoTIFF under 32 MB.",
      );
      const buffer = await file.arrayBuffer();
      let metadata;
      try {
        metadata = await info(await openRaster(buffer), buffer.byteLength);
      } catch (error) {
        throw new HttpError(
          422,
          error instanceof Error ? error.message : "Use a valid GeoTIFF.",
        );
      }
      const role = String(form.get("role") || "cloudy");
      check(
        [
          "cloudy",
          "clear",
          "mask",
          "temporal",
          "sentinel1",
          "sentinel2",
          "dem",
          "synthetic",
        ].includes(role),
        "Invalid image role.",
      );
      let bandMapping: unknown;
      try {
        bandMapping = JSON.parse(String(form.get("bands")));
      } catch {
        throw new HttpError(422, "Provide a valid JSON band mapping.");
      }
      const bands = z
        .record(z.number().int().min(1).max(metadata.count))
        .parse(bandMapping);
      const needed =
        role === "mask"
          ? ["mask"]
          : role === "dem"
            ? ["elevation"]
            : role === "sentinel1"
              ? ["vv", "vh"]
              : ["green", "red", "nir"];
      check(
        needed.every((k) => bands[k]) &&
          new Set(needed.map((k) => bands[k])).size === needed.length,
        "Map distinct valid bands.",
      );
      const acquisition = String(form.get("acquired_at") || "");
      check(
        !acquisition || validDate(acquisition),
        "Use an ISO acquisition date.",
      );
      const id = crypto.randomUUID();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
      )
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const value: Raster = {
        id,
        name: file.name.slice(0, 200),
        role,
        sensor: String(form.get("sensor") || "LISS-IV").slice(0, 60),
        acquired_at: acquisition || null,
        bands,
        metadata,
        sha256: hash,
        created_at: now(),
      };
      await bucket.put(`personal/${id}/source`, buffer, {
        httpMetadata: { contentType: "image/tiff" },
      });
      try {
        await put(id, "image", value);
      } catch (e) {
        await bucket.delete(`personal/${id}/source`);
        throw e;
      }
      return json(value, 201);
    }
    if (path[0] === "images" && path[1]) {
      const image = await record<Raster>(path[1], "image");
      if (path.length === 2) return json(image);
      if (path[2] === "clouds" && path.length === 3) {
        check(
          isLissIv(image),
          "Choose an uploaded LISS-IV observation with mapped green, red and NIR bands.",
        );
        const thresholdText = url.searchParams.get("threshold");
        const threshold = thresholdText === null ? 0.75 : Number(thresholdText);
        check(
          thresholdText !== "" &&
            Number.isFinite(threshold) &&
            threshold >= 0.4 &&
            threshold <= 0.99,
          "Use a cloud brightness threshold from 0.4 to 0.99.",
        );
        const source = await bucket.get(`personal/${image.id}/source`);
        check(source, "Image file unavailable.", 404);
        const scene = await readScene(await source.arrayBuffer(), [
          image.bands.green,
          image.bands.red,
          image.bands.nir,
        ]);
        const detection = automaticCloudMask(scene, threshold, true);
        check(
          detection.valid > 0,
          "This observation has no valid pixels to analyze.",
        );
        const observation: LissCloudObservation = {
          image_id: image.id,
          sensor: image.sensor,
          acquired_at: image.acquired_at,
          bounds: scene.metadata.bounds,
          width: scene.width,
          height: scene.height,
          valid_pixels: detection.valid,
          valid_percent: (100 * detection.valid) / (scene.width * scene.height),
          cloud_pixels: detection.cloud,
          cloud_percent: (100 * detection.cloud) / detection.valid,
          shadow_pixels: detection.shadow,
          shadow_percent: (100 * detection.shadow) / detection.valid,
          brightness_threshold: threshold,
          method: AUTOMATIC_CLOUD_METHOD,
          scope: "All valid pixels in the uploaded observation footprint",
          preview_url: `/api/science/images/${encodeURIComponent(image.id)}/preview`,
          overlay_data_url: pngDataUrl(cloudOverlayPng(scene, detection.mask)),
          limitations: [
            "Automatic cloud detection uses relative brightness; bright ground, snow and haze can be mistaken for cloud. Review the overlay or supply a class mask before reconstruction.",
            "The percentage covers valid pixels in the entire uploaded observation, not a radius around the selected map point. NoData pixels are excluded.",
            "The original preview is an NIR/red/green false-colour composite from the uploaded LISS-IV observation, not a true-colour photograph.",
            "This is an observation from its acquisition date, not current weather. A reconstructed image estimates obscured content; it cannot reveal an observed view beneath clouds on the same date.",
          ],
        };
        return json(observation);
      }
      const source = await bucket.get(`personal/${image.id}/source`);
      check(source, "Image file unavailable.", 404);
      if (path[2] === "source")
        return new Response(source.body, {
          headers: { ...headers, "Content-Type": "image/tiff" },
        });
      if (path[2] === "preview") {
        const cache = await bucket.get(`personal/${image.id}/preview`);
        if (cache)
          return new Response(cache.body, {
            headers: { ...headers, "Content-Type": "image/png" },
          });
        const indices = image.bands.nir
          ? [image.bands.green, image.bands.red, image.bands.nir]
          : [Object.values(image.bands)[0]];
        const preview = png(
          await readScene(await source.arrayBuffer(), indices),
          image.role === "mask" ? "mask" : "optical",
          undefined,
          512,
        );
        await bucket.put(`personal/${image.id}/preview`, preview);
        return new Response(preview as BodyInit, {
          headers: { ...headers, "Content-Type": "image/png" },
        });
      }
    }
    if (key === "analyses" && method === "GET")
      return json(await list("analysis"));
    if (key === "analyses" && method === "POST") {
      const p = analysisInput.parse(await readJson(request));
      p.aoi = polygon(p.aoi);
      if (p.target_crs) projection(p.target_crs);
      const image = await record<Raster>(p.image_id, "image");
      check(
        (!p.target_crs || p.target_crs === image.metadata.crs) &&
          (!p.resolution || p.resolution === image.metadata.resolution[0]),
        "Personal processing preserves the source grid. Use the Python service for reprojection.",
      );
      check(
        !p.sentinel1_id && p.feather === 0,
        "SAR conditioning and feathering require the Python service.",
      );
      check(
        p.reference_id !== p.image_id && p.temporal_id !== p.image_id,
        "Use a separate observation as the reference, not the source image itself.",
      );
      check(
        !(
          p.model_id === "temporal-baseline" &&
          p.temporal_id === p.reference_id &&
          ["same-acquisition", "synthetic-ground-truth"].includes(
            p.reference_relation,
          )
        ),
        "The temporal input used for reconstruction cannot also be its accuracy reference. Choose a different-date comparison or an independent paired reference.",
      );
      check(
        ["green", "red", "nir"].every((k) => image.bands[k]),
        "Choose mapped optical imagery.",
      );
      check(
        Boolean(p.reference_id) === (p.reference_relation !== "none"),
        "Select the correct reference relationship.",
      );
      check(
        p.model_id !== "temporal-baseline" || p.temporal_id,
        "Temporal reconstruction needs an uploaded temporal reference.",
      );
      for (const k of ["mask", "reference", "temporal"] as const) {
        const id = p[`${k}_id`];
        if (id) {
          const aux = await record<Raster>(id, "image");
          if (k === "mask") check(aux.role === "mask", "Choose a class mask.");
          else
            check(
              aux.sensor === image.sensor &&
                ["green", "red", "nir"].every(
                  (b) =>
                    aux.bands[b] &&
                    aux.metadata.scales[aux.bands[b] - 1] ===
                      image.metadata.scales[image.bands[b] - 1] &&
                    aux.metadata.offsets[aux.bands[b] - 1] ===
                      image.metadata.offsets[image.bands[b] - 1],
                ),
              "Use the same sensor and calibrated Green/Red/NIR mapping for optical references.",
            );
        }
      }
      const id = crypto.randomUUID(),
        a = {
          id,
          name: p.name,
          image_id: p.image_id,
          model_id: p.model_id,
          status: "Queued",
          created_at: now(),
          updated_at: now(),
          error: null,
          parameters: p,
          products: [],
          result: null,
          stages: [{ stage: "Queued", timestamp: now() }],
          engine: "browser",
        };
      await put(id, "analysis", a);
      return json(a, 202);
    }
    if (key === "dashboard") {
      const images = await list<Raster>("image"),
        analyses = await list<Analysis>("analysis"),
        complete = analyses.filter((a) => a.status === "Completed");
      return json({
        images: images.length,
        analyses: analyses.length,
        completed: complete.length,
        processing: analyses.filter(
          (a) => !["Completed", "Failed"].includes(a.status),
        ).length,
        processed_area_m2: complete.reduce(
          (sum, a) => sum + (a.result?.area_m2.valid || 0),
          0,
        ),
        recent: analyses.slice(0, 8),
        cloud_coverage: complete
          .slice(0, 20)
          .reverse()
          .map((a) => ({
            name: a.name,
            percent: a.result?.cloud_percent || 0,
          })),
        models,
      });
    }
    if (key === "aoi") {
      if (method === "GET") return json(await list("aoi"));
      const data = z
        .object({ name: z.string().trim().min(1).max(160), geojson: z.any() })
        .parse(await readJson(request));
      const id = crypto.randomUUID(),
        value = { id, name: data.name, geojson: polygon(data.geojson) };
      check(value.geojson, "Choose a polygon.");
      await put(id, "aoi", value);
      return json(value, 201);
    }
    if (path[0] === "analyses" && path[1]) {
      const a = await record<Analysis & { engine: string }>(
        path[1],
        "analysis",
      );
      if (path.length === 2) return json(a);
      const allowed = [
        "original",
        "reconstruction",
        "mask",
        "score",
        "ndvi-original",
        "ndvi",
        "reference",
        "difference",
      ];
      if (path[2] === "stage" && method === "POST") {
        const data = z
          .object({
            stage: z.enum([
              "Preprocessing",
              "Detecting Clouds",
              "Reconstructing",
              "Postprocessing",
              "Evaluating",
              "Failed",
            ]),
            error: z.string().max(1000).optional(),
          })
          .parse(await readJson(request, 2000));
        check(
          a.status !== "Completed",
          "This result is already completed.",
          409,
        );
        a.status = data.stage;
        a.updated_at = now();
        a.error = data.error || null;
        a.stages = [
          ...(a.stages || []),
          { stage: data.stage, timestamp: now() },
        ];
        await put(a.id, "analysis", a, a.created_at);
        return json(a);
      }
      if (path[2] === "artifact" && method === "POST") {
        check(a.status !== "Completed", "Result is complete.", 409);
        const product = path[3],
          format = path[4];
        check(
          allowed.includes(product) && ["tif", "png", "map"].includes(format),
          "Invalid output product.",
        );
        const buffer = await uploadBody(request, 32 * 1024 * 1024);
        if (format === "tif") {
          let m;
          try {
            m = await info(await openRaster(buffer), buffer.byteLength);
          } catch (error) {
            throw new HttpError(
              422,
              error instanceof Error
                ? error.message
                : "Invalid output GeoTIFF.",
            );
          }
          check(m.width * m.height <= MAX_PIXELS, "Output too large.");
          const source = await record<Raster>(a.image_id, "image");
          check(
            m.width === source.metadata.width &&
              m.height === source.metadata.height &&
              m.crs === source.metadata.crs &&
              m.bounds.every(
                (v, i) => Math.abs(v - source.metadata.bounds[i]) < 1e-8,
              ) &&
              m.count ===
                ([
                  "original",
                  "reconstruction",
                  "reference",
                  "difference",
                ].includes(product)
                  ? 3
                  : 1),
            "Output must preserve the source grid and expected bands.",
          );
        } else {
          const bytes = new Uint8Array(buffer),
            view = new DataView(buffer);
          check(
            bytes.length >= 33 &&
              [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
            "Invalid PNG.",
          );
          check(
            view.getUint32(16) > 0 &&
              view.getUint32(20) > 0 &&
              view.getUint32(16) <= 768 &&
              view.getUint32(20) <= 768,
            "Invalid preview dimensions.",
          );
          try {
            decodePng(bytes, { checkCrc: true });
          } catch {
            throw new HttpError(
              422,
              "The PNG preview is damaged or incomplete.",
            );
          }
        }
        await bucket.put(`personal/${a.id}/${product}.${format}`, buffer, {
          httpMetadata: {
            contentType: format === "tif" ? "image/tiff" : "image/png",
          },
        });
        return json({ ok: true });
      }
      if (path[2] === "complete" && method === "POST") {
        check(a.status !== "Completed", "Result is complete.", 409);
        const data = z
          .object({
            result: resultSchema,
            products: z.array(z.string()).max(8),
          })
          .parse(await readJson(request));
        const needed = [
          "original",
          "reconstruction",
          "mask",
          "ndvi-original",
          "ndvi",
          ...(!a.parameters.mask_id ? ["score"] : []),
          ...(a.parameters.reference_id ? ["reference", "difference"] : []),
        ];
        check(
          needed.every((p) => data.products.includes(p)) &&
            data.products.length === needed.length &&
            new Set(data.products).size === needed.length,
          "Missing output products.",
        );
        const source = await record<Raster>(a.image_id, "image");
        check(
          data.result.metadata.width === source.metadata.width &&
            data.result.metadata.height === source.metadata.height &&
            data.result.metadata.crs === source.metadata.crs &&
            data.result.metadata.count === 3 &&
            data.result.counts.valid <=
              source.metadata.width * source.metadata.height,
          "Result does not match the source grid.",
        );
        for (const p of data.products)
          for (const format of ["tif", "png", "map"])
            check(
              await bucket.head(`personal/${a.id}/${p}.${format}`),
              `The ${p} ${format} output upload is missing.`,
            );
        a.result = data.result;
        a.products = data.products;
        a.status = "Completed";
        a.error = null;
        a.updated_at = now();
        a.stages = [
          ...(a.stages || []),
          { stage: "Completed", timestamp: now() },
        ];
        await put(a.id, "analysis", a, a.created_at);
        return json(a);
      }
      check(
        a.status === "Completed" && a.result,
        "The result is not ready.",
        404,
      );
      if (path[2] === "exports" && ["metadata", "report"].includes(path[3])) {
        if (path[3] === "metadata")
          return json(a, 200, {
            "Content-Disposition":
              'attachment; filename="analysis-metadata.json"',
          });
        const escape = (s: string) =>
          s.replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c]!,
          );
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>AI-Based Cloud Removal and Reconstruction</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(a.name)}</h1><p>Reconstruction is an estimate. Keep this report with the georeferenced outputs.</p><pre>${escape(JSON.stringify(a, null, 2))}</pre>`,
          {
            headers: {
              ...headers,
              "Content-Type": "text/html",
              "Content-Disposition":
                'attachment; filename="reconstruction-report.html"',
              "Content-Security-Policy": "sandbox",
            },
          },
        );
      }
      if (["preview", "exports"].includes(path[2])) {
        check(a.products.includes(path[3]), "Output unavailable.", 404);
        const suffix =
          path[2] === "preview"
            ? url.searchParams.get("map") === "1"
              ? "map"
              : "png"
            : "tif";
        const value = await bucket.get(`personal/${a.id}/${path[3]}.${suffix}`);
        check(value, "Output unavailable.", 404);
        return new Response(value.body, {
          headers: {
            ...headers,
            "Content-Type": suffix === "tif" ? "image/tiff" : "image/png",
            ...(suffix === "tif"
              ? {
                  "Content-Disposition": `attachment; filename="${path[3]}.tif"`,
                }
              : {}),
          },
        });
      }
      if (path[2] === "pixel") {
        const lon = Number(url.searchParams.get("lon")),
          lat = Number(url.searchParams.get("lat"));
        check(
          url.searchParams.has("lon") &&
            url.searchParams.has("lat") &&
            Number.isFinite(lon) &&
            Number.isFinite(lat) &&
            Math.abs(lon) <= 180 &&
            Math.abs(lat) <= 85,
          "Invalid coordinate.",
        );
        const values: Record<string, number[] | null> = {};
        for (const kind of [
          "original",
          "reconstruction",
          "reference",
          "ndvi",
          "mask",
        ].filter((k) => a.products.includes(k))) {
          const object = await bucket.get(`personal/${a.id}/${kind}.tif`);
          if (!object) continue;
          const scene = await readScene(await object.arrayBuffer());
          const p = proj4("EPSG:4326", scene.crs, [lon, lat]),
            x = Math.floor((p[0] - scene.origin[0]) / scene.step[0]),
            y = Math.floor((p[1] - scene.origin[1]) / scene.step[1]),
            i = y * scene.width + x;
          values[kind] =
            x < 0 ||
            y < 0 ||
            x >= scene.width ||
            y >= scene.height ||
            !scene.valid[i]
              ? null
              : scene.values.map((b) => b[i]);
        }
        return json({ longitude: lon, latitude: lat, values });
      }
    }
    if (key === "geography/places") {
      const q = url.searchParams.get("q") || "";
      check(q.length >= 2 && q.length <= 160, "Enter a place name.");
      const response = await fetch(
        "https://photon.komoot.io/api/?limit=6&q=" + encodeURIComponent(q),
        { signal: AbortSignal.timeout(15000) },
      );
      check(response.ok, "Place search is temporarily unavailable.", 503);
      return json(
        ((await response.json()) as { features: unknown[] }).features,
      );
    }
    if (key === "geography/scenes") {
      const lon = Number(url.searchParams.get("lon")),
        lat = Number(url.searchParams.get("lat")),
        sensor = url.searchParams.get("sensor") || "sentinel-2",
        start = url.searchParams.get("start") || "2025-01-01",
        end = url.searchParams.get("end") || now().slice(0, 10);
      check(
        url.searchParams.has("lon") &&
          url.searchParams.has("lat") &&
          Number.isFinite(lon) &&
          Number.isFinite(lat) &&
          Math.abs(lon) <= 180 &&
          Math.abs(lat) <= 85,
        "Invalid search coordinate.",
      );
      check(
        validDate(start) && validDate(end) && start <= end,
        "Use a valid date interval.",
      );
      check(
        ["sentinel-1", "sentinel-2"].includes(sensor),
        "Upload LISS-IV GeoTIFFs obtained through NRSC/Bhoonidhi. Automatic LISS-IV catalogue access is not configured.",
      );
      const body = {
        collections: [
          sensor === "sentinel-1" ? "sentinel-1-rtc" : "sentinel-2-l2a",
        ],
        intersects: { type: "Point", coordinates: [lon, lat] },
        datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
        limit: 12,
        ...(sensor === "sentinel-2"
          ? {
              query: {
                "eo:cloud_cover": {
                  lte: Math.max(
                    0,
                    Math.min(100, Number(url.searchParams.get("cloud") || 30)),
                  ),
                },
              },
            }
          : {}),
      };
      const response = await fetch(
        "https://planetarycomputer.microsoft.com/api/stac/v1/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25000),
        },
      );
      check(
        response.ok,
        "Satellite catalogue is temporarily unavailable.",
        503,
      );
      const result = (await response.json()) as {
        features: {
          id: string;
          collection: string;
          properties: Record<string, unknown>;
          bbox: number[];
        }[];
      };
      return json(
        result.features.map((f) => ({
          id: f.id,
          collection: f.collection,
          datetime: f.properties.datetime,
          cloud_cover: f.properties["eo:cloud_cover"],
          bbox: f.bbox,
        })),
      );
    }
    throw new HttpError(404, "This operation is unavailable.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          detail: error.issues
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; "),
        },
        422,
      );
    if (error instanceof HttpError)
      return json({ detail: error.message }, error.status);
    console.error(
      "Personal processing API:",
      error instanceof Error ? error.message : error,
    );
    return json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "The request could not be completed. Please retry.",
      },
      503,
    );
  }
}
