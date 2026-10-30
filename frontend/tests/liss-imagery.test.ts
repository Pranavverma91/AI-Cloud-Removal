import { expect, test } from "vitest";
import proj4 from "proj4";
import {
  acquisitionDay,
  isLissIv,
  lissImagesAt,
  otherDateLissImages,
  rasterContainsPoint,
} from "@/lib/liss-imagery";
import type { Raster } from "@/lib/science/types";

function raster(
  id = "source",
  acquired_at: string | null = "2026-10-20",
): Raster {
  return {
    id,
    name: id + ".tif",
    sensor: "LISS-IV",
    role: "cloudy",
    acquired_at,
    bands: { green: 1, red: 2, nir: 3 },
    sha256: id,
    created_at: "2026-10-21T00:00:00Z",
    metadata: {
      width: 100,
      height: 100,
      count: 3,
      dtype: "uint16",
      crs: "EPSG:4326",
      bounds: [77, 28, 78, 29],
      resolution: [0.01, 0.01],
      nodata: null,
      scales: [1, 1, 1],
      offsets: [0, 0, 0],
      bytes: 60000,
    },
  };
}

test("LISS-IV inventory accepts sensor spellings but never substitutes Sentinel or synthetic captures", () => {
  for (const sensor of [
    "LISS-IV",
    "LISS IV",
    "LISS4",
    "ResourceSat-2A LISS4 MX70",
    "LISS_IV",
  ])
    expect(isLissIv({ ...raster(), sensor })).toBe(true);
  for (const sensor of ["LISS-III", "Sentinel-2", "LISS-IV2", "ALISS-IV"])
    expect(isLissIv({ ...raster(), sensor })).toBe(false);
  expect(isLissIv({ ...raster(), role: "synthetic" })).toBe(false);
  expect(isLissIv({ ...raster(), bands: { mask: 1 } })).toBe(false);
});

test("location inventory uses geographic coverage, newest acquisition first and unknown dates last", () => {
  const images = [
    raster("old", "2026-09-01"),
    raster("undated", null),
    raster("new", "2026-10-20"),
  ];
  const distant = raster("distant");
  distant.metadata.bounds = [10, 10, 11, 11];
  expect(
    lissImagesAt([...images, distant], [77.5, 28.5]).map((item) => item.id),
  ).toEqual(["new", "old", "undated"]);
  expect(images.map((item) => item.id)).toEqual(["old", "undated", "new"]);
  expect(lissImagesAt(images, [78.5, 28.5])).toEqual([]);
  expect(lissImagesAt(images, [NaN, 28.5])).toEqual([]);
});

test("native projected footprint rejects points inside only the larger WGS84 bounding rectangle", () => {
  const image = raster();
  const transform = "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs";
  const center = proj4(transform, "EPSG:4326", [500050, 2400050]) as [
    number,
    number,
  ];
  image.metadata = {
    ...image.metadata,
    crs: "EPSG:32643",
    bounds: [center[0] - 1, center[1] - 1, center[0] + 1, center[1] + 1],
    origin: [500000, 2400100, 0],
    step: [1, -1, 0],
  };
  expect(rasterContainsPoint(image, center)).toBe(true);
  expect(rasterContainsPoint(image, [center[0] + 0.5, center[1]])).toBe(false);
});

test("legacy geographic bounds support footprints crossing the antimeridian", () => {
  const image = raster();
  image.metadata.bounds = [179, 10, -179, 11];
  expect(rasterContainsPoint(image, [179.5, 10.5])).toBe(true);
  expect(rasterContainsPoint(image, [-179.5, 10.5])).toBe(true);
  expect(rasterContainsPoint(image, [0, 10.5])).toBe(false);
});

test("other-date comparisons require known different calendar dates and an overlapping observation", () => {
  const source = raster("source", "2026-10-20T12:00:00Z");
  const before = raster("before", "2026-10-19"),
    same = raster("same", "2026-10-20T09:00:00Z");
  const distant = raster("distant", "2026-10-18");
  distant.metadata.bounds = [20, 30, 21, 31];
  const images = [
    source,
    before,
    same,
    distant,
    raster("unknown", null),
    raster("bad", "2026-02-30"),
  ];
  expect(otherDateLissImages(images, source).map((item) => item.id)).toEqual([
    "before",
  ]);
  expect(
    otherDateLissImages(images, source, [77.5, 28.5]).map((item) => item.id),
  ).toEqual(["before"]);
  expect(otherDateLissImages(images, source, [78.5, 28.5])).toEqual([]);
  expect(otherDateLissImages(images, raster("undated", null))).toEqual([]);
});

test("acquisition dates preserve the declared acquisition day and reject impossible dates", () => {
  expect(acquisitionDay(raster("source", "2026-10-20T23:00:00-06:00"))).toBe(
    "2026-10-20",
  );
  expect(acquisitionDay(raster("source", "2026-02-30"))).toBeNull();
  expect(acquisitionDay(raster("source", "10/20/2026"))).toBeNull();
});
