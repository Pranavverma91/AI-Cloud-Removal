// @vitest-environment node
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
vi.mock("@/lib/runtime-env", () => import("../adapters/cloudflare-node"));
vi.mock("@/lib/science/server", () => ({ backendURL: () => "" }));
import { POST } from "@/app/api/satellite/reconstruct/route";
import {
  reconstructionScenes,
  validateReconstructionCoverage,
} from "@/lib/satellite-reconstruction";
import { personalApi } from "@/lib/personal/api";
import { processInput } from "@/lib/personal/process";
import { readScene } from "@/lib/personal/raster";
import type { Analysis, Raster } from "@/lib/science/types";

const directory = mkdtempSync(tmpdir() + "/satellite-reconstruction-");
process.env.PERSONAL_DATA_DIR = directory;
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());
const selected = "S2A_MSIL2A_20261002T053241_R105_T43RGN_20261002T101803";
const referenceId = "S2A_MSIL2A_20260925T053241_R105_T43RGN_20260925T101803";
const bbox = [77.67, 28.95, 77.73, 29.01];
const input = {
  lat: 28.98,
  lng: 77.7,
  size: 5,
  scene: selected,
  method: "spatial-baseline",
  location: "Meerut",
};
const classes = (): number[] =>
  Array.from({ length: 64 }, (_, i) => (i === 0 ? 9 : i === 1 ? 3 : 4));

function npy(
  scl = classes(),
  clear = [3000, 2000, 7000],
  alpha = scl.map(() => 65535),
) {
  const header = new TextEncoder().encode(
    `{'descr': '<u2', 'fortran_order': False, 'shape': (5, ${scl.length / 8}, 8), }\n`,
  );
  const bytes = new Uint8Array(10 + header.length + scl.length * 10);
  bytes.set([0x93, 78, 85, 77, 80, 89, 1, 0]);
  const view = new DataView(bytes.buffer);
  view.setUint16(8, header.length, true);
  bytes.set(header, 10);
  const bands = [
    ...clear.map((value) =>
      scl.map((c) => ([8, 9, 10].includes(c) ? 9000 : value)),
    ),
    scl,
    alpha,
  ];
  bands
    .flat()
    .forEach((value, i) =>
      view.setUint16(10 + header.length + i * 2, value, true),
    );
  return bytes;
}
function provider(
  source = npy(),
  reference = npy(Array(64).fill(4), [4000, 3000, 6000]),
) {
  const fetch = vi.fn(async (url: string) => {
    const u = new URL(url);
    const isReference = url.includes(referenceId);
    if (u.pathname.includes("/items/"))
      return Response.json({
        id: isReference ? referenceId : selected,
        bbox,
        properties: {
          datetime: isReference
            ? "2026-09-25T05:32:41Z"
            : "2026-10-02T05:32:41Z",
          "s2:processing_baseline": "05.00",
          "eo:cloud_cover": 95,
        },
      });
    expect(u.searchParams.getAll("assets")).toEqual([
      "B04",
      "B03",
      "B08",
      "SCL",
    ]);
    expect(u.searchParams.get("dst_crs")).toBe("EPSG:4326");
    return new Response(isReference ? reference : source);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
function request(body: unknown = input, headers: HeadersInit = {}) {
  return POST(
    new Request("https://app.test/api/satellite/reconstruct", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}
function call(path: string, method = "GET", body?: BodyInit) {
  return personalApi(
    new Request(`https://app.test/api/science/${path}`, {
      method,
      headers: { "X-Space-Eye": "1" },
      body,
    }),
    path.split("/"),
  );
}

test("retains observed cloud spectra, calibrated bands, georeferencing and separate class mask", async () => {
  const scl = classes();
  scl[2] = 7;
  const alpha = scl.map(() => 65535);
  alpha[3] = 0;
  const { source, mask, clouds, shadows, clear } = reconstructionScenes(
    npy(scl, undefined, alpha),
    5,
    bbox,
  );
  expect([clouds, shadows, clear]).toEqual([1, 1, 60]);
  expect(source.values[0][0]).toBeCloseTo(0.8);
  expect(source.values.map((b) => b[4])).toEqual([
    expect.closeTo(0.1),
    expect.closeTo(0.2),
    expect.closeTo(0.6),
  ]);
  expect(Array.from(source.valid.slice(0, 4))).toEqual([1, 1, 0, 0]);
  expect(Array.from(mask.values[0].slice(0, 2))).toEqual([1, 2]);
  expect(source.metadata).toMatchObject({
    crs: "EPSG:4326",
    bounds: bbox,
    scales: [1, 1, 1],
    offsets: [0, 0, 0],
  });
  const reference = reconstructionScenes(npy(scl), 5, bbox, true);
  expect(Array.from(reference.source.valid.slice(0, 3))).toEqual([0, 0, 0]);
});

test.each([new Uint8Array(0), npy().subarray(0, -1), npy(Array(64).fill(12))])(
  "rejects malformed spectral data before it can become a result",
  (bytes) => {
    expect(() => reconstructionScenes(bytes, 5, bbox)).toThrow("unreadable");
  },
);

test("rejects empty targets, no clear spatial support and cloudy temporal references", () => {
  const cloudy = reconstructionScenes(npy(Array(64).fill(9)), 5, bbox);
  const clear = reconstructionScenes(npy(Array(64).fill(4)), 5, bbox);
  expect(() =>
    validateReconstructionCoverage(clear, "spatial-baseline"),
  ).toThrow("No classified clouds");
  expect(() =>
    validateReconstructionCoverage(cloudy, "spatial-baseline"),
  ).toThrow("no clear pixels");
  const ref = reconstructionScenes(npy(), 5, bbox, true).source;
  expect(() =>
    validateReconstructionCoverage(cloudy, "temporal-baseline", ref),
  ).toThrow("cloudy or missing data");
  expect(() =>
    validateReconstructionCoverage(cloudy, "temporal-baseline", clear.source),
  ).not.toThrow();
});

test.each(["spatial-baseline", "temporal-baseline"])(
  "%s saves the exact selected area and completes with unchanged clear pixels and exportable products",
  async (method) => {
    provider();
    const response = await request({
      ...input,
      method,
      ...(method === "temporal-baseline"
        ? { referenceScene: referenceId }
        : {}),
    });
    expect(response.status, await response.clone().text()).toBe(202);
    const job = (await response.json()) as Analysis;
    expect(job).toMatchObject({
      engine: "browser",
      model_id: method,
      status: "Queued",
      parameters: { detect_shadows: true },
    });
    const images: Record<string, { image: Raster; buffer: ArrayBuffer }> = {};
    for (const id of [
      job.image_id,
      job.parameters.mask_id,
      job.parameters.temporal_id,
    ].filter(Boolean) as string[]) {
      const image = (await (await call(`images/${id}`)).json()) as Raster;
      expect(image.sensor).toBe("Sentinel-2");
      expect(image.acquired_at).toMatch(/^2026-/);
      images[id] = {
        image,
        buffer: await (await call(`images/${id}/source`)).arrayBuffer(),
      };
    }
    const output = await processInput({ analysis: job, images });
    expect(output.result.counts).toMatchObject({
      cloud: 1,
      shadow: 1,
      clear: 62,
      valid: 64,
    });
    expect(output.result.cloud_percent).toBe(100 / 64);
    expect(output.result.metrics).toBeNull();
    const original = await readScene(
      output.products.find((p) => p.name === "original")!.tif,
    );
    const restored = await readScene(
      output.products.find((p) => p.name === "reconstruction")!.tif,
    );
    expect(restored.crs).toBe("EPSG:4326");
    expect(restored.origin).toEqual(original.origin);
    for (let b = 0; b < 3; b++)
      expect(restored.values[b].slice(2)).toEqual(original.values[b].slice(2));
    expect(original.values[0][0]).toBeCloseTo(0.8);
    expect(restored.values[0][0]).toBeCloseTo(
      method === "spatial-baseline" ? 0.1 : 0.2,
    );
    expect(output.result.limitations.join(" ")).toContain(
      "supplied class mask",
    );
    expect(output.result.provenance.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sensor: "Sentinel-2",
          acquired_at: "2026-10-02",
          name: expect.stringContaining(selected),
        }),
      ]),
    );
    for (const product of output.products)
      for (const format of ["tif", "png", "map"] as const) {
        expect(
          (
            await call(
              `analyses/${job.id}/artifact/${product.name}/${format}`,
              "POST",
              product[format] as BodyInit,
            )
          ).status,
        ).toBe(200);
      }
    expect(
      (
        await call(
          `analyses/${job.id}/complete`,
          "POST",
          JSON.stringify({
            result: output.result,
            products: output.products.map((p) => p.name),
          }),
        )
      ).status,
    ).toBe(200);
    expect(await (await call(`analyses/${job.id}`)).json()).toMatchObject({
      status: "Completed",
    });
    expect(
      (await call(`analyses/${job.id}/exports/reconstruction`)).headers.get(
        "content-type",
      ),
    ).toBe("image/tiff");
    expect((await call(`analyses/${job.id}/exports/report`)).status).toBe(200);
  },
);

test("failed coverage creates neither uploaded records nor queued jobs", async () => {
  provider(npy(Array(64).fill(9)), npy());
  const images = await (await call("images")).json();
  const analyses = await (await call("analyses")).json();
  const response = await request({
    ...input,
    method: "temporal-baseline",
    referenceScene: referenceId,
  });
  expect(response.status).toBe(422);
  expect(await response.json()).toHaveProperty(
    "error",
    expect.stringContaining("reference date is cloudy"),
  );
  expect(await (await call("images")).json()).toEqual(images);
  expect(await (await call("analyses")).json()).toEqual(analyses);
});

test("invalid, cross-origin and oversized requests cannot contact the provider or queue work", async () => {
  const fetch = provider();
  for (const body of [
    null,
    [],
    { ...input, scene: "bad" },
    { ...input, method: "fake-ai" },
    { ...input, lat: 91 },
    { ...input, method: "temporal-baseline", referenceScene: selected },
  ]) {
    expect((await request(body)).status).toBe(400);
  }
  expect(
    (await request(input, { origin: "https://foreign.test" })).status,
  ).toBe(403);
  expect((await request({ ...input, location: "x".repeat(2100) })).status).toBe(
    413,
  );
  expect(fetch).not.toHaveBeenCalled();
});
