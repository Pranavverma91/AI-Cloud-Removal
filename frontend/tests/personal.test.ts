// @vitest-environment node
import { test, expect, vi, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { tiff, readScene, aligned, type Scene } from "@/lib/personal/raster";
import { processInput, evaluate } from "@/lib/personal/process";
import { automaticCloudMask, cloudOverlayPng } from "@/lib/personal/cloud-mask";
import { decode as decodePng } from "fast-png";
import type { LissCloudObservation } from "@/lib/liss-imagery";
import type { Analysis, Raster } from "@/lib/science/types";
vi.mock("@/lib/runtime-env", () => import("../adapters/cloudflare-node"));
import { personalApi } from "@/lib/personal/api";
import { identity } from "@/lib/server";
const directory = mkdtempSync(tmpdir() + "/cloud-personal-");
process.env.PERSONAL_DATA_DIR = directory;
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function scene(width = 32, height = 32): Scene {
  const n = width * height;
  return {
    width,
    height,
    crs: "EPSG:32643",
    origin: [500000, 2400000, 0],
    step: [5.8, -5.8, 0],
    values: [
      new Float32Array(n).fill(1000),
      new Float32Array(n).fill(2000),
      new Float32Array(n).fill(6000),
    ],
    valid: new Uint8Array(n).fill(1),
    keys: {},
    metadata: {
      width,
      height,
      count: 3,
      dtype: "float32",
      crs: "EPSG:32643",
      bounds: [0, 0, 0, 0],
      resolution: [5.8, 5.8],
      nodata: null,
      scales: [0.0001, 0.0001, 0.0001],
      offsets: [0, 0, 0],
      bytes: 0,
    },
  };
}
function image(
  id: string,
  s: Scene,
  bands = { green: 1, red: 2, nir: 3 },
): Raster {
  return {
    id,
    name: id + ".tif",
    role: "cloudy",
    sensor: "LISS-IV",
    acquired_at: null,
    bands,
    metadata: s.metadata,
    sha256: "test",
    created_at: new Date().toISOString(),
  };
}
function analysis(parameters: Record<string, unknown> = {}): Analysis {
  return {
    id: "test",
    name: "Numerical verification",
    image_id: "source",
    model_id: "spatial-baseline",
    status: "Queued",
    created_at: "",
    updated_at: "",
    error: null,
    products: [],
    result: null,
    parameters: {
      brightness_threshold: 0.75,
      detect_shadows: false,
      ...parameters,
    },
  };
}
test("GeoTIFF round-trip retains native samples, nodata, CRS and radiometric calibration", async () => {
  const s = scene();
  s.valid[0] = 0;
  const round = await readScene(tiff(s));
  expect(round.crs).toBe(s.crs);
  expect(round.origin.slice(0, 2)).toEqual(s.origin.slice(0, 2));
  expect(round.step.slice(0, 2)).toEqual(s.step.slice(0, 2));
  expect(round.values[2][10]).toBe(6000);
  expect(round.valid[0]).toBe(0);
  expect(round.metadata.scales).toEqual([0.0001, 0.0001, 0.0001]);
});
test("spatial reconstruction changes only cloud pixels, exports valid NDVI and computes paired metrics", async () => {
  const clear = scene(),
    source = scene();
  for (let y = 12; y < 20; y++)
    for (let x = 12; x < 20; x++)
      source.values.forEach((v) => (v[y * 32 + x] = 10000));
  source.valid[0] = 0;
  const a = analysis({
    reference_id: "reference",
    reference_relation: "synthetic-ground-truth",
  });
  const output = await processInput({
    analysis: a,
    images: {
      source: { image: image("source", source), buffer: tiff(source) },
      reference: { image: image("reference", clear), buffer: tiff(clear) },
    },
  });
  const reconstructed = await readScene(
      output.products.find((p) => p.name === "reconstruction")!.tif,
    ),
    ndvi = await readScene(output.products.find((p) => p.name === "ndvi")!.tif);
  expect(reconstructed.valid[0]).toBe(0);
  expect(reconstructed.values[0][1]).toBe(1000);
  expect(reconstructed.values[0][15 * 32 + 15]).toBe(1000);
  expect(ndvi.values[0][15 * 32 + 15]).toBeCloseTo(0.5);
  expect(output.result.counts.cloud).toBe(64);
  expect(output.result.metrics!.cloud!.rmse).toBe(0);
  expect(output.result.area_m2.valid / 1023).toBeCloseTo(5.8 * 5.8, 0);
  expect(
    output.products.every((p) => p.png[0] === 137 && p.map[0] === 137),
  ).toBe(true);
});
test("temporal references fill masked pixels without being reported as paired ground truth", async () => {
  const source = scene(),
    temp = scene();
  source.values.forEach((v) => (v[500] = 10000));
  const mask = scene();
  mask.values = [new Float32Array(1024)];
  mask.values[0][500] = 1;
  mask.metadata = { ...mask.metadata, count: 1, scales: [1], offsets: [0] };
  const a = analysis({
    mask_id: "mask",
    temporal_id: "temporal",
    reference_id: "temporal",
    reference_relation: "temporal",
  });
  a.model_id = "temporal-baseline";
  const output = await processInput({
    analysis: a,
    images: {
      source: { image: image("source", source), buffer: tiff(source) },
      temporal: { image: image("temporal", temp), buffer: tiff(temp) },
      mask: {
        image: { ...image("mask", mask), bands: { mask: 1 } },
        buffer: tiff(mask),
      },
    },
  });
  expect(output.result.metrics).toBeNull();
  expect(
    (
      await readScene(
        output.products.find((p) => p.name === "reconstruction")!.tif,
      )
    ).values[2][500],
  ).toBe(6000);
});
test("known calibrated error yields actual regional MAE and RMSE", () => {
  const ref = scene(2, 2),
    out = scene(2, 2);
  out.values.forEach((v) => v.fill(v[0] + 100));
  const m = evaluate(out, ref, new Float32Array(4), "all")!;
  expect(m.mae).toBeCloseTo(0.01);
  expect(m.rmse).toBeCloseTo(0.01);
  expect(m.pixels).toBe(4);
});
async function call(
  path: string,
  method = "GET",
  body?: BodyInit,
  headers: Record<string, string> = {},
) {
  return personalApi(
    new Request("https://test.local/api/science/" + path, {
      method,
      headers: {
        "X-Space-Eye": "1",
        ...headers,
      },
      body,
    }),
    path.split("/"),
  );
}
test("personal storage, processing and exports work directly while preserving origin checks and owner identity", async () => {
  expect((await call("images")).status).toBe(200);
  expect(
    (await call("aoi", "POST", "{}", { origin: "https://foreign.test" }))
      .status,
  ).toBe(403);
  expect(
    (
      await identity(
        new Request("https://test.local", {
          headers: {
            "oai-authenticated-user-id": "forged",
            "oai-authenticated-user-email": "fake@example.test",
          },
        }),
      )
    ).owner,
  ).toBe("personal-owner");
  expect((await identity(new Request("https://test.local"))).owner).toBe(
    "personal-owner",
  );
  const s = scene();
  s.values.forEach((v) => (v[500] = 10000));
  const form = new FormData();
  form.set("file", new File([tiff(s)], "test-scene.tif"));
  form.set("role", "cloudy");
  form.set("sensor", "LISS-IV");
  form.set("bands", JSON.stringify({ green: 1, red: 2, nir: 3 }));
  const upload = await call("images", "POST", form);
  expect(upload.status).toBe(201);
  const source = (await upload.json()) as Raster;
  const create = await call(
    "analyses",
    "POST",
    JSON.stringify({ name: "Personal analysis", image_id: source.id }),
  );
  expect(create.status).toBe(202);
  const a = (await create.json()) as Analysis;
  const output = await processInput({
    analysis: a,
    images: {
      [source.id]: {
        image: source,
        buffer: await (
          await call("images/" + source.id + "/source")
        ).arrayBuffer(),
      },
    },
  });
  for (const p of output.products)
    for (const [format, data] of [
      ["tif", p.tif],
      ["png", p.png],
      ["map", p.map],
    ] as const)
      expect(
        (
          await call(
            `analyses/${a.id}/artifact/${p.name}/${format}`,
            "POST",
            data as BodyInit,
          )
        ).status,
      ).toBe(200);
  expect(
    (
      await call(
        `analyses/${a.id}/complete`,
        "POST",
        JSON.stringify({
          result: output.result,
          products: output.products.map((p) => p.name),
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    ((await (await call(`analyses/${a.id}`)).json()) as Analysis).status,
  ).toBe("Completed");
  expect(
    (await call(`analyses/${a.id}/exports/reconstruction`)).headers.get(
      "content-type",
    ),
  ).toBe("image/tiff");
  expect((await call(`analyses/${a.id}/exports/reconstruction`)).status).toBe(
    200,
  );
  await call("auth/logout", "POST");
  expect((await call("auth/me")).status).toBe(200);
  expect((await call(`analyses/${a.id}/exports/reconstruction`)).status).toBe(
    200,
  );
});

test("undefined NDVI exports as NoData without losing a valid optical result", async () => {
  const s = scene(8, 8);
  s.values[1].fill(0);
  s.values[2].fill(0);
  const output = await processInput({
    analysis: analysis(),
    images: { source: { image: image("source", s), buffer: tiff(s) } },
  });
  const ndvi = await readScene(
    output.products.find((p) => p.name === "ndvi")!.tif,
  );
  expect(ndvi.valid.every((v) => v === 0)).toBe(true);
  expect(output.result.counts.valid).toBe(64);
});

test("bilinear alignment ignores NoData neighbours with zero interpolation weight", () => {
  const s = scene(2, 2);
  s.valid[1] = 0;
  s.values.forEach((band) => {
    band[1] = NaN;
  });
  const out = aligned(s, {
    width: 1,
    height: 1,
    crs: s.crs,
    origin: s.origin,
    step: s.step,
  });
  expect(out.valid[0]).toBe(1);
  expect(out.values.map((band) => band[0])).toEqual([1000, 2000, 6000]);
});

test.each([
  [1, 1],
  [1, 9],
  [9, 1],
  [8, 8],
])("clear %i×%i scenes preserve every source sample", async (w, h) => {
  const s = scene(w, h);
  const output = await processInput({
    analysis: analysis(),
    images: { source: { image: image("source", s), buffer: tiff(s) } },
  });
  const result = await readScene(
    output.products.find((p) => p.name === "reconstruction")!.tif,
  );
  expect(result.values).toEqual(s.values);
  expect(output.result.counts.clear).toBe(w * h);
  expect(output.result.counts.cloud).toBe(0);
});

test("all-cloud masks need a temporal reference and invalid mask classes fail clearly", async () => {
  const s = scene(8, 8),
    mask = scene(8, 8);
  mask.values = [new Float32Array(64).fill(1)];
  mask.metadata = { ...mask.metadata, count: 1, scales: [1], offsets: [0] };
  const input = {
    analysis: analysis({ mask_id: "mask" }),
    images: {
      source: { image: image("source", s), buffer: tiff(s) },
      mask: {
        image: { ...image("mask", mask), bands: { mask: 1 } },
        buffer: tiff(mask),
      },
    },
  };
  await expect(processInput(input)).rejects.toThrow("No clear pixels");
  input.analysis.model_id = "temporal-baseline";
  input.analysis.parameters.temporal_id = "source";
  const output = await processInput(input);
  expect(output.result.counts.cloud).toBe(64);
  mask.values[0][0] = 3;
  input.images.mask.buffer = tiff(mask);
  await expect(processInput(input)).rejects.toThrow("Mask classes");
});

test("a fully cloudy source does not clip the darker reconstructed ground preview to black", async () => {
  const source = scene(8, 8),
    reference = scene(8, 8),
    mask = scene(8, 8);
  source.values.forEach((band) => band.fill(10000));
  reference.values.forEach((band, b) => {
    for (let i = 0; i < band.length; i++) band[i] = 1000 + b * 1000 + i * 50;
  });
  mask.values = [new Float32Array(64).fill(1)];
  mask.metadata = { ...mask.metadata, count: 1, scales: [1], offsets: [0] };
  const a = analysis({ mask_id: "mask", temporal_id: "reference" });
  a.model_id = "temporal-baseline";
  const output = await processInput({
    analysis: a,
    images: {
      source: { image: image("source", source), buffer: tiff(source) },
      reference: {
        image: image("reference", reference),
        buffer: tiff(reference),
      },
      mask: {
        image: { ...image("mask", mask), bands: { mask: 1 } },
        buffer: tiff(mask),
      },
    },
  });
  const result = output.products.find((p) => p.name === "reconstruction")!;
  const rendered = decodePng(result.png);
  expect(
    Array.from(rendered.data).filter((value, i) => i % 4 !== 3 && value > 40)
      .length,
  ).toBeGreaterThan(64 * 3 * 0.75);
  expect((await readScene(result.tif)).values).toEqual(reference.values);
  expect(output.result.provenance.display_stretch).toContain("Shared pooled");
});

test("empty AOI and a non-covering temporal reference cannot produce a successful result", async () => {
  const s = scene(8, 8),
    distant = scene(8, 8);
  distant.origin = [100000, 1000000, 0];
  const a = analysis({
    aoi: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  });
  const input = {
    analysis: a,
    images: {
      source: { image: image("source", s), buffer: tiff(s) },
      temporal: { image: image("temporal", distant), buffer: tiff(distant) },
    },
  };
  await expect(processInput(input)).rejects.toThrow("No valid pixels");
  a.parameters = {
    temporal_id: "temporal",
    brightness_threshold: 0.75,
    detect_shadows: false,
  };
  a.model_id = "temporal-baseline";
  s.values.forEach((band) => {
    band[32] = 10000;
  });
  input.images.source.buffer = tiff(s);
  await expect(processInput(input)).rejects.toThrow("cover every masked pixel");
});

function uploadForm(s = scene(8, 8)) {
  const form = new FormData();
  form.set("file", new File([tiff(s)], "observation.tif"));
  form.set("role", "cloudy");
  form.set("sensor", "LISS-IV");
  form.set("bands", JSON.stringify({ green: 1, red: 2, nir: 3 }));
  return form;
}

test.each([
  "damaged TIFF",
  "invalid bands JSON",
  "repeated bands",
  "impossible date",
])("upload rejects %s as a correctable input error", async (scenario) => {
  const form = uploadForm();
  if (scenario === "damaged TIFF")
    form.set("file", new File(["not a TIFF"], "bad.tif"));
  if (scenario === "invalid bands JSON") form.set("bands", "{");
  if (scenario === "repeated bands")
    form.set("bands", '{"green":1,"red":1,"nir":3}');
  if (scenario === "impossible date") form.set("acquired_at", "2026-02-30");
  expect((await call("images", "POST", form)).status).toBe(422);
});

test.each([
  { type: "Polygon", coordinates: [] },
  {
    type: "Polygon",
    coordinates: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  },
  {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ],
  },
  {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 1],
        [2, 2],
        [0, 0],
      ],
    ],
  },
  {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [200, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    ],
  },
])("malformed study area %# is rejected before processing", async (geojson) => {
  expect(
    (
      await call(
        "aoi",
        "POST",
        JSON.stringify({ name: "Invalid area", geojson }),
      )
    ).status,
  ).toBe(422);
});

test("valid polygons and multipolygons persist, while unsupported methods cannot modify records", async () => {
  const coordinates = [
    [
      [77, 28],
      [78, 28],
      [78, 29],
      [77, 28],
    ],
  ];
  for (const geojson of [
    { type: "Polygon", coordinates },
    { type: "MultiPolygon", coordinates: [coordinates] },
  ]) {
    expect(
      (
        await call(
          "aoi",
          "POST",
          JSON.stringify({ name: "Study area", geojson }),
        )
      ).status,
    ).toBe(201);
  }
  const before = await (await call("aoi")).json();
  expect((await call("aoi", "DELETE")).status).toBe(405);
  expect(await (await call("aoi")).json()).toEqual(before);
  expect((await call("auth/me", "POST", "{}")).status).toBe(405);
});

test("unsupported models, self-references and unimplemented output settings are rejected before queuing", async () => {
  const source = (await (
    await call("images", "POST", uploadForm())
  ).json()) as Raster;
  for (const parameters of [
    { model_id: "resunet" },
    { model_id: "temporal-baseline" },
    { reference_id: source.id, reference_relation: "same-acquisition" },
    { temporal_id: source.id, model_id: "temporal-baseline" },
    { feather: 5 },
    { sentinel1_id: "unsupported" },
    { resolution: 20 },
  ]) {
    expect(
      (
        await call(
          "analyses",
          "POST",
          JSON.stringify({
            name: "Rejected",
            image_id: source.id,
            ...parameters,
          }),
        )
      ).status,
    ).toBe(422);
  }
});

test("failed runs can resume, damaged or missing outputs block completion, and completed results stay immutable", async () => {
  const s = scene(8, 8);
  const source = (await (
    await call("images", "POST", uploadForm(s))
  ).json()) as Raster;
  const a = (await (
    await call(
      "analyses",
      "POST",
      JSON.stringify({ name: "Recovery check", image_id: source.id }),
    )
  ).json()) as Analysis;
  expect(
    (
      await call(
        `analyses/${a.id}/stage`,
        "POST",
        JSON.stringify({ stage: "Failed", error: "Interrupted upload" }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        `analyses/${a.id}/stage`,
        "POST",
        JSON.stringify({ stage: "Preprocessing" }),
      )
    ).status,
  ).toBe(200);
  const resumed = (await (await call(`analyses/${a.id}`)).json()) as Analysis;
  expect(resumed.error).toBeNull();
  const output = await processInput({
    analysis: a,
    images: { [source.id]: { image: source, buffer: tiff(s) } },
  });
  expect(
    (
      await call(
        `analyses/${a.id}/artifact/original/png`,
        "POST",
        new Uint8Array([137, 0, 0]),
      )
    ).status,
  ).toBe(422);
  expect(
    (
      await call(
        `analyses/${a.id}/artifact/original/tif`,
        "POST",
        tiff(scene(4, 4)),
      )
    ).status,
  ).toBe(422);
  for (const p of output.products)
    expect(
      (await call(`analyses/${a.id}/artifact/${p.name}/tif`, "POST", p.tif))
        .status,
    ).toBe(200);
  const payload = {
    result: output.result,
    products: output.products.map((p) => p.name),
  };
  expect(
    (await call(`analyses/${a.id}/complete`, "POST", JSON.stringify(payload)))
      .status,
  ).toBe(422);
  expect(
    (
      await call(
        `analyses/${a.id}/complete`,
        "POST",
        JSON.stringify({ ...payload, result: {} }),
      )
    ).status,
  ).toBe(422);
  for (const p of output.products)
    for (const [format, bytes] of [
      ["png", p.png],
      ["map", p.map],
    ] as const)
      expect(
        (
          await call(
            `analyses/${a.id}/artifact/${p.name}/${format}`,
            "POST",
            bytes as BodyInit,
          )
        ).status,
      ).toBe(200);
  expect(
    (await call(`analyses/${a.id}/complete`, "POST", JSON.stringify(payload)))
      .status,
  ).toBe(200);
  expect(
    (await call(`analyses/${a.id}/stage`, "POST", '{"stage":"Failed"}')).status,
  ).toBe(409);
  expect(
    (
      await call(
        `analyses/${a.id}/artifact/mask/tif`,
        "POST",
        output.products[0].tif,
      )
    ).status,
  ).toBe(409);
  expect(
    (await call(`analyses/${a.id}/complete`, "POST", JSON.stringify(payload)))
      .status,
  ).toBe(409);
  expect((await call(`analyses/${a.id}/exports/report`)).status).toBe(200);
  expect((await call(`analyses/${a.id}/exports/metadata`)).status).toBe(200);
});

test("legacy access endpoints need no password or session and retain the personal owner", async () => {
  const current = await call("auth/me");
  expect(current.status).toBe(200);
  const user = (await current.json()) as { id: string };
  expect(user.id).toBe("personal-owner");
  const login = await call("auth/login", "POST");
  expect(login.status).toBe(200);
  expect(await login.json()).toEqual(user);
  expect(login.headers.get("set-cookie")).toBeNull();
  const logout = await call("auth/logout", "POST");
  expect(logout.status).toBe(200);
  expect(await logout.json()).toEqual({ ok: true });
  expect(await (await call("auth/me")).json()).toEqual(user);

  const previous = process.env.PERSONAL_PASSWORD_HASH;
  try {
    process.env.PERSONAL_PASSWORD_HASH = "obsolete-password-hash";
    const staleSession = await call("auth/me", "GET", undefined, {
      cookie: "cloud_personal_session=obsolete-session",
      "oai-authenticated-user-id": "forged-owner",
    });
    expect(staleSession.status).toBe(200);
    expect(await staleSession.json()).toEqual(user);
  } finally {
    if (previous === undefined) delete process.env.PERSONAL_PASSWORD_HASH;
    else process.env.PERSONAL_PASSWORD_HASH = previous;
  }
});

test.each(["auth/login", "auth/logout", "aoi", "analyses"])(
  "%s continues to reject cross-origin mutations without a session gate",
  async (path) => {
    expect(
      (await call(path, "POST", "{}", { origin: "https://foreign.test" }))
        .status,
    ).toBe(403);
    expect((await call(path, "POST", "{}", { "X-Space-Eye": "" })).status).toBe(
      403,
    );
  },
);

test("LISS-IV cloud inspection measures only valid source pixels, shows white mask and does not create a reconstruction", async () => {
  const sourceScene = scene(8, 8);
  sourceScene.values.forEach((band) => {
    for (let i = 0; i < 16; i++) band[i] = 10000;
  });
  sourceScene.valid[0] = 0;
  const form = uploadForm(sourceScene);
  form.set("acquired_at", "2026-10-20");
  const source = (await (await call("images", "POST", form)).json()) as Raster;
  const before = await (await call("analyses")).json();
  const response = await call(`images/${source.id}/clouds`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const report = (await response.json()) as LissCloudObservation;
  expect(report).toMatchObject({
    image_id: source.id,
    sensor: "LISS-IV",
    acquired_at: "2026-10-20",
    width: 8,
    height: 8,
    cloud_pixels: 15,
    valid_pixels: 63,
    brightness_threshold: 0.75,
    preview_url: `/api/science/images/${source.id}/preview`,
  });
  expect(report.cloud_percent).toBeCloseTo((100 * 15) / 63);
  expect(report.valid_percent).toBeCloseTo((100 * 63) / 64);
  expect(report.scope).toContain("uploaded observation footprint");
  expect(report.limitations.join(" ")).toContain("false-colour");
  const mask = decodePng(
    Uint8Array.from(atob(report.overlay_data_url.split(",")[1]), (value) =>
      value.charCodeAt(0),
    ),
  );
  expect(mask.width).toBe(8);
  expect(Array.from(mask.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  expect(Array.from(mask.data.slice(4, 8))).toEqual([255, 255, 255, 150]);
  expect(Array.from(mask.data.slice(-4))).toEqual([0, 0, 0, 0]);
  expect(await (await call("analyses")).json()).toEqual(before);
  const a = analysis();
  a.image_id = source.id;
  const result = await processInput({
    analysis: a,
    images: { [source.id]: { image: source, buffer: tiff(sourceScene) } },
  });
  expect(result.result.counts.cloud).toBe(report.cloud_pixels);
  expect(result.result.cloud_percent).toBe(report.cloud_percent);
});

test("cloud inspection validates thresholds, missing observations, optical LISS-IV provenance and valid pixels", async () => {
  const source = (await (
    await call("images", "POST", uploadForm())
  ).json()) as Raster;
  for (const threshold of ["", "NaN", "0.39", "1.1", "Infinity"])
    expect(
      (
        await personalApi(
          new Request(
            `https://test.local/api/science/images/${source.id}/clouds?threshold=${threshold}`,
          ),
          ["images", source.id, "clouds"],
        )
      ).status,
    ).toBe(422);
  expect((await call(`images/${source.id}/clouds`, "POST", "{}")).status).toBe(
    405,
  );
  expect((await call("images/missing/clouds")).status).toBe(404);
  const other = uploadForm();
  other.set("sensor", "Sentinel-2");
  const foreign = (await (
    await call("images", "POST", other)
  ).json()) as Raster;
  expect((await call(`images/${foreign.id}/clouds`)).status).toBe(422);
  const nodata = scene(8, 8);
  nodata.valid.fill(0);
  const empty = (await (
    await call("images", "POST", uploadForm(nodata))
  ).json()) as Raster;
  expect((await call(`images/${empty.id}/clouds`)).status).toBe(422);
});

test("white cloud overlays preserve preview aspect ratio and exclude shadow-only pixels", () => {
  const s = scene(1024, 256);
  const mask = new Float32Array(s.valid.length).fill(1);
  mask[0] = 2;
  const overlay = decodePng(cloudOverlayPng(s, mask));
  expect([overlay.width, overlay.height]).toEqual([512, 128]);
  expect(Array.from(overlay.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  expect(Array.from(overlay.data.slice(4, 8))).toEqual([255, 255, 255, 150]);
});

test("brightness detection accepts reviewed thresholds and keeps percentage distinct from shadow estimates", () => {
  const s = scene(8, 8);
  s.values.forEach((band) => {
    band[0] = 10000;
    band[1] = 10000;
  });
  const plain = automaticCloudMask(s, 0.75, false),
    shadows = automaticCloudMask(s, 0.75, true);
  expect(plain.cloud).toBe(2);
  expect(plain.shadow).toBe(0);
  expect(shadows.cloud).toBe(2);
  expect(shadows.shadow).toBe(62);
  expect(() => automaticCloudMask(s, NaN)).toThrow("threshold");
});
