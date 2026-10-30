"use client";
import { api } from "../science/client";
import type { Analysis, Raster } from "../science/types";
import type { Input, Product } from "./process";
const active = new Map<string, Promise<void>>();
export function running(id: string) {
  return active.has(id);
}
export function startAnalysis(a: Analysis) {
  if (active.has(a.id)) return active.get(a.id)!;
  const run = async () => {
    let worker: Worker | undefined;
    let stages = Promise.resolve();
    try {
      const current = await api<Analysis>("/analyses/" + a.id);
      if (current.status === "Completed") return;
      const ids = [
        ...new Set([
          a.image_id,
          ...["mask_id", "reference_id", "temporal_id"]
            .map((k) => a.parameters[k])
            .filter((v): v is string => typeof v === "string"),
        ]),
      ];
      const images: Input["images"] = {};
      for (const id of ids) {
        const image = await api<Raster>("/images/" + id);
        const response = await fetch("/api/science/images/" + id + "/source");
        if (!response.ok)
          throw Error("Input download failed. Reload and retry.");
        images[id] = { image, buffer: await response.arrayBuffer() };
      }
      worker = new Worker("/personal-worker.js");
      const output = await new Promise<{
        result: NonNullable<Analysis["result"]>;
        products: Product[];
      }>((resolve, reject) => {
        worker!.onerror = () =>
          reject(
            Error("The processor could not start. Reload this page and retry."),
          );
        worker!.onmessage = (e) => {
          if (e.data.stage)
            stages = stages
              .then(() =>
                api("/analyses/" + a.id + "/stage", {
                  method: "POST",
                  body: JSON.stringify({ stage: e.data.stage }),
                }),
              )
              .then(() => {});
          if (e.data.error) reject(Error(e.data.error));
          if (e.data.output) resolve(e.data.output);
        };
        worker!.postMessage(
          { analysis: a, images },
          Object.values(images).map((f) => f.buffer),
        );
      });
      await stages;
      for (const p of output.products)
        for (const [format, data] of [
          ["tif", p.tif],
          ["png", p.png],
          ["map", p.map],
        ] as const) {
          const response = await fetch(
            `/api/science/analyses/${a.id}/artifact/${p.name}/${format}`,
            {
              method: "POST",
              headers: {
                "X-Space-Eye": "1",
                "Content-Type": "application/octet-stream",
              },
              body: data as BodyInit,
            },
          );
          if (!response.ok) {
            const error = (await response.json()) as { detail?: string };
            throw Error(error.detail || "An output could not be saved.");
          }
        }
      await api("/analyses/" + a.id + "/complete", {
        method: "POST",
        body: JSON.stringify({
          result: output.result,
          products: output.products.map((p) => p.name),
        }),
      });
    } catch (e) {
      await stages.catch(() => {});
      await api("/analyses/" + a.id + "/stage", {
        method: "POST",
        body: JSON.stringify({
          stage: "Failed",
          error: e instanceof Error ? e.message : "Processing failed",
        }),
      }).catch(() => {});
    } finally {
      worker?.terminate();
    }
  };
  const promise = Promise.resolve(
    navigator.locks
      ? navigator.locks.request("cloud-analysis-" + a.id, run)
      : run(),
  )
    .then(() => {})
    .finally(() => active.delete(a.id));
  active.set(a.id, promise);
  return promise;
}
