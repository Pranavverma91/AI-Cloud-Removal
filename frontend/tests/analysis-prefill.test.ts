import { describe, expect, test } from "vitest";
import {
  analysisPrefill,
  compatibleLissReference,
} from "@/lib/analysis-prefill";
import type { Raster } from "@/lib/science/types";

const image = (id: string, extra: Partial<Raster> = {}): Raster => ({
  id,
  name: `${id}.tif`,
  role: "cloudy",
  sensor: "LISS-IV",
  acquired_at: "2026-10-06",
  bands: { green: 1, red: 2, nir: 3 },
  metadata: {
    width: 32,
    height: 32,
    count: 3,
    dtype: "uint16",
    crs: "EPSG:4326",
    bounds: [77, 22, 78, 23],
    resolution: [0.01, 0.01],
    nodata: null,
    scales: [1, 1, 1],
    offsets: [0, 0, 0],
    bytes: 1000,
  },
  sha256: "test",
  created_at: "2026-10-07T00:00:00Z",
  ...extra,
});

describe("map reconstruction links", () => {
  test("resolves uploaded IDs only after the observations arrive", () => {
    const search = new URLSearchParams(
      "sensor=LISS-IV&image=cloudy&temporal=clear",
    );
    expect(analysisPrefill(search, []).sourceId).toBe("none");
    expect(
      analysisPrefill(search, [
        image("cloudy"),
        image("clear", { acquired_at: "2026-10-04" }),
      ]),
    ).toMatchObject({
      sourceId: "cloudy",
      temporalId: "clear",
      modelId: "temporal-baseline",
      missingSource: false,
      invalidTemporal: false,
    });
  });

  test.each([
    ["same acquisition", image("clear")],
    ["date missing", image("clear", { acquired_at: null })],
    [
      "another sensor",
      image("clear", { sensor: "Sentinel-2", acquired_at: "2026-10-04" }),
    ],
    [
      "non-optical input",
      image("clear", { bands: { mask: 1 }, acquired_at: "2026-10-04" }),
    ],
    ["same source", image("cloudy", { acquired_at: "2026-10-04" })],
    [
      "different LISS sensor label",
      image("clear", { sensor: "LISS-4", acquired_at: "2026-10-04" }),
    ],
    [
      "different band scale",
      image("clear", {
        acquired_at: "2026-10-04",
        metadata: { ...image("base").metadata, scales: [1, 0.01, 1] },
      }),
    ],
    [
      "different band offset",
      image("clear", {
        acquired_at: "2026-10-04",
        metadata: { ...image("base").metadata, offsets: [0, 0, -1000] },
      }),
    ],
  ])("rejects a temporal link to %s", (_description, candidate) => {
    const result = analysisPrefill(
      new URLSearchParams(
        `sensor=LISS-IV&image=cloudy&temporal=${candidate.id}`,
      ),
      [image("cloudy"), candidate],
    );
    expect(result.temporalId).toBe("none");
    expect(result.modelId).toBe("spatial-baseline");
    expect(result.invalidTemporal).toBe(true);
  });

  test("does not treat another sensor as LISS-IV", () => {
    expect(
      analysisPrefill(new URLSearchParams("sensor=LISS-IV&image=sentinel"), [
        image("sentinel", { sensor: "Sentinel-2" }),
      ]),
    ).toMatchObject({ sourceId: "none", missingSource: true });
  });

  test("compares calibration by mapped optical band, not raw storage order", () => {
    const source = image("source", {
      metadata: {
        ...image("base").metadata,
        scales: [1, 2, 3],
        offsets: [4, 5, 6],
      },
    });
    const reference = image("reference", {
      acquired_at: "2026-10-04",
      bands: { green: 3, red: 2, nir: 1 },
      metadata: {
        ...image("base").metadata,
        scales: [3, 2, 1],
        offsets: [6, 5, 4],
      },
    });
    expect(compatibleLissReference(source, reference)).toBe(true);
    expect(
      compatibleLissReference(source, {
        ...reference,
        metadata: source.metadata,
      }),
    ).toBe(false);
  });
});
