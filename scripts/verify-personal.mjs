import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const portServer = createServer();
await new Promise((resolve, reject) => {
  portServer.once("error", reject);
  portServer.listen(0, "127.0.0.1", resolve);
});
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const directory = mkdtempSync(path.join(tmpdir(), "personal-http-check-"));
const serverEnvironment = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(port),
  SCIENCE_API_URL: "",
  PERSONAL_HOST: "127.0.0.1",
  PERSONAL_DATA_DIR: directory,
};
let child;
async function startServer() {
  child = spawn(
    process.execPath,
    [
      "scripts/run-next.mjs",
      process.argv.includes("--production") ? "start" : "dev",
    ],
    {
      env: serverEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      output += data;
      process.stdout.write(data);
    });
  const deadline = Date.now() + 60000;
  while (!output.includes("Ready in")) {
    if (child.exitCode !== null || Date.now() > deadline)
      throw Error("Personal server did not become ready.");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
try {
  await startServer();
  const base = `http://127.0.0.1:${port}`;
  const request = (route, options = {}) =>
    fetch(base + route, {
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
      ...options,
    });
  for (const route of ["/", "/applications", "/research"]) {
    const response = await request(route);
    assert.equal(response.status, 200, route);
    assert.match(
      await response.text(),
      /AI-Based Cloud Removal and Reconstruction/,
    );
    console.log(`Verified ${route}: HTTP 200`);
  }
  for (const route of ["/login", "/signup", "/forgot-password"]) {
    for (const [returnTo, destination] of [
      [undefined, "/dashboard"],
      ["/history?view=completed", "/history?view=completed"],
      ["https://foreign.test", "/dashboard"],
      ["//foreign.test", "/dashboard"],
      ["/\\foreign.test", "/dashboard"],
    ]) {
      const query = returnTo
        ? "?" + new URLSearchParams({ return_to: returnTo })
        : "";
      const response = await request(route + query);
      assert.equal(response.status, 307, route + query);
      assert.equal(
        response.headers.get("location"),
        destination,
        route + query,
      );
    }
    console.log(`Verified ${route}: redirects into the workspace safely`);
  }
  const current = await request("/api/science/auth/me");
  assert.equal(current.status, 200);
  const user = await current.json();
  assert.equal(user.id, "personal-owner");
  const login = await request("/api/science/auth/login", {
    method: "POST",
    headers: { "X-Space-Eye": "1" },
  });
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), user);
  assert.equal(login.headers.get("set-cookie"), null);
  const forged = await request("/api/science/auth/me", {
    headers: {
      cookie: "cloud_personal_session=obsolete-session",
      "oai-authenticated-user-id": "forged-owner",
      "oai-authenticated-user-email": "forged@example.test",
    },
  });
  assert.equal(forged.status, 200);
  assert.deepEqual(await forged.json(), user);
  const crossOrigin = await request("/api/science/aoi", {
    method: "POST",
    headers: { "X-Space-Eye": "1", origin: "https://foreign.test" },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  for (const route of [
    "/api/science/auth/me",
    "/api/science/health",
    "/api/science/images",
    "/dashboard",
    "/analysis/new",
    "/datasets",
    "/history",
    "/reconstructions",
    "/explorer",
    "/models",
    "/models/lab",
    "/settings",
    "/workspace",
  ]) {
    const response = await request(route);
    assert.equal(response.status, 200, `${route}: ${await response.text()}`);
    console.log(`Verified direct access to ${route}: HTTP 200`);
  }
  const workerResponse = await request("/personal-worker.js");
  assert.equal(workerResponse.status, 200);
  const workerSource = await workerResponse.text();
  const require = createRequire(import.meta.url);
  const { build } = require(
    createRequire(require.resolve("vite/package.json")).resolve("esbuild"),
  );
  await build({
    entryPoints: ["scripts/personal-smoke-fixtures.ts"],
    outfile: ".sites-runtime/smoke-fixtures.mjs",
    platform: "node",
    format: "esm",
    bundle: true,
    packages: "external",
    logLevel: "silent",
  });
  const { fixture, readScene } = await import(
    new URL("../.sites-runtime/smoke-fixtures.mjs", import.meta.url)
  );
  const sample = fixture();
  const upload = new FormData();
  upload.set("file", new File([sample.buffer], "http-test-observation.tif"));
  upload.set("bands", JSON.stringify({ green: 1, red: 2, nir: 3 }));
  const api = async (
    route,
    body,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const response = await request("/api/science" + route, {
      method,
      headers: { "X-Space-Eye": "1" },
      body:
        body instanceof FormData ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body)
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
    assert.ok(
      response.ok,
      `${route}: ${response.status} ${response.ok ? "" : await response.text()}`,
    );
    return response;
  };
  const source = await (await api("/images", upload)).json();
  const analysis = await (
    await api("/analyses", {
      name: "Full HTTP processing test",
      image_id: source.id,
      detect_shadows: false,
    })
  ).json();
  const worker = new Worker(
    `const {parentPort} = require('node:worker_threads'); globalThis.self = globalThis; self.postMessage = (data, options) => parentPort.postMessage(data, Array.isArray(options) ? options : options?.transfer); ${workerSource}\nparentPort.on('message', data => self.onmessage({data}));`,
    { eval: true },
  );
  const stages = [];
  let output;
  try {
    output = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Processing worker timed out.")),
        30000,
      );
      worker.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.on("message", (data) => {
        if (data.stage) stages.push(data.stage);
        if (data.error) {
          clearTimeout(timer);
          reject(Error(data.error));
        }
        if (data.output) {
          clearTimeout(timer);
          resolve(data.output);
        }
      });
      worker.postMessage(
        {
          analysis,
          images: { [source.id]: { image: source, buffer: sample.buffer } },
        },
        [sample.buffer],
      );
    });
  } finally {
    await worker.terminate();
  }
  for (const stage of stages)
    await api(`/analyses/${analysis.id}/stage`, { stage });
  for (const product of output.products)
    for (const [format, bytes] of [
      ["tif", product.tif],
      ["png", product.png],
      ["map", product.map],
    ])
      await api(
        `/analyses/${analysis.id}/artifact/${product.name}/${format}`,
        bytes,
      );
  await api(`/analyses/${analysis.id}/complete`, {
    result: output.result,
    products: output.products.map((p) => p.name),
  });
  assert.equal(output.result.counts.cloud, 64);
  const download = await api(`/analyses/${analysis.id}/exports/reconstruction`);
  const reconstructed = await readScene(await download.arrayBuffer());
  assert.equal(reconstructed.values[0][15 * 32 + 15], 1000);
  assert.equal(reconstructed.values[0][1], 1000);
  assert.equal(reconstructed.valid[0], 0);
  for (const route of [
    `/analyses/${analysis.id}/preview/reconstruction`,
    `/analyses/${analysis.id}/preview/reconstruction?map=1`,
    `/analyses/${analysis.id}/exports/metadata`,
    `/analyses/${analysis.id}/exports/report`,
    `/analyses/${analysis.id}/pixel?lon=${sample.center[0]}&lat=${sample.center[1]}`,
  ])
    await api(route);
  const preview = await request(`/analysis/${analysis.id}`);
  assert.equal(preview.status, 200);
  console.log(
    "Verified GeoTIFF upload, served processing worker, stage updates, saved products, pixel inspection and exports.",
  );
  await stopServer();
  await startServer();
  const persisted = await (await api(`/analyses/${analysis.id}`)).json();
  assert.equal(persisted.status, "Completed");
  await api(`/analyses/${analysis.id}/exports/reconstruction`);
  console.log(
    "Verified completed analysis and exports survive a server restart.",
  );
  assert.equal(
    (
      await request("/api/science/auth/logout", {
        method: "POST",
        headers: { "X-Space-Eye": "1" },
      })
    ).status,
    200,
  );
  assert.equal((await request("/api/science/auth/me")).status, 200);
  await api(`/analyses/${analysis.id}/exports/reconstruction`);
  console.log(
    "Password-free personal startup, direct workspace access, database, processing worker and exports verified.",
  );
} finally {
  await stopServer();
  rmSync(directory, { recursive: true, force: true });
}
