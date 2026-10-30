// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { decode } from "fast-png";
import {
  satelliteCloudAnalysis,
  satelliteCloudMetrics,
  getSatelliteClouds,
} from "@/lib/satellite-cloud";
import { GET } from "@/app/api/satellite/clouds/route";

const id = "S2A_MSIL2A_20261002T053241_R105_T43RGN_20261002T101803";
const capturedAt = "2026-10-02T05:32:41.024000Z";
function npy(
  classes: number[],
  mask = classes.map(() => 255),
  dtype = "|u1",
  width = classes.length,
) {
  const header = new TextEncoder().encode(
    `{'descr': '${dtype}', 'fortran_order': False, 'shape': (2, ${classes.length / width}, ${width}), }\n`,
  );
  const stride = dtype === "<u2" ? 2 : 1;
  const result = new Uint8Array(
    10 + header.length + classes.length * 2 * stride,
  );
  result.set([0x93, 78, 85, 77, 80, 89, 1, 0]);
  const view = new DataView(result.buffer);
  view.setUint16(8, header.length, true);
  result.set(header, 10);
  [...classes, ...mask].forEach((value, index) => {
    if (stride === 1) result[10 + header.length + index] = value;
    else view.setUint16(10 + header.length + index * 2, value, true);
  });
  return result;
}
const metadata = () =>
  Response.json({
    id,
    bbox: [77, 28, 79, 30],
    properties: { datetime: capturedAt, "eo:cloud_cover": 95 },
  });
afterEach(() => vi.unstubAllGlobals());

function cloudMask(bytes: Uint8Array) {
  const result = satelliteCloudAnalysis(bytes);
  expect(result.cloudMaskDataUrl).toMatch(/^data:image\/png;base64,/);
  const image = decode(
    Buffer.from(result.cloudMaskDataUrl.split(",")[1], "base64"),
    { checkCrc: true },
  );
  return { result, image };
}

test("cloud highlights preserve image rows and columns and exclude invalid pixels", () => {
  const { result, image } = cloudMask(
    npy(
      [8, 0, 9, 1, 10, 7, 3, 11, 4, 9, 6, 2],
      [255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255],
      "|u1",
      4,
    ),
  );
  expect(image).toMatchObject({ width: 4, height: 3, channels: 4, depth: 8 });
  const cloudy = [255, 255, 255, 80], clear = [0, 0, 0, 0];
  expect(Array.from(image.data)).toEqual([
    ...cloudy, ...clear, ...cloudy, ...clear,
    ...cloudy, ...clear, ...clear, ...clear,
    ...clear, ...clear, ...clear, ...clear,
  ]);
  expect(result).toMatchObject({
    cloudPixelCount: 3,
    cloudPercent: 37.5,
    coveragePercent: 66.7,
    unclassifiedPercent: 8.3,
  });
});

test("clear and missing-data crops have fully transparent masks but distinct percentages", () => {
  for (const classes of [[4, 6, 5], [0, 1, 7]]) {
    const { result, image } = cloudMask(npy(classes));
    expect(Array.from(image.data)).toEqual(Array(12).fill(0));
    expect(result.cloudPixelCount).toBe(0);
    expect(result.cloudPercent).toBe(classes[0] === 4 ? 0 : null);
  }
});

test("all-cloud 16-bit crops highlight every pixel including first and last", () => {
  const { result, image } = cloudMask(npy([8, 9, 10, 9], undefined, "<u2", 2));
  expect(image).toMatchObject({ width: 2, height: 2 });
  expect(Array.from(image.data)).toEqual(Array(4).fill([255, 255, 255, 80]).flat());
  expect(result).toMatchObject({ cloudPercent: 100, cloudPixelCount: 4 });
});

test("retains tiny cloud regions even when the percentage rounds down to zero", () => {
  const classes = Array(384 * 384).fill(4);
  classes[classes.length - 1] = 10;
  const { result, image } = cloudMask(npy(classes, undefined, "|u1", 384));
  expect(result).toMatchObject({
    cloudPercent: 0,
    cloudPixelCount: 1,
    width: 384,
    height: 384,
  });
  expect(Array.from(image.data.subarray(0, -4)).every(value => value === 0)).toBe(true);
  expect(Array.from(image.data.subarray(-4))).toEqual([255, 255, 255, 80]);
});

test("counts clouds and cirrus in the crop, excluding missing, defective and unclassified samples", () => {
  expect(
    satelliteCloudMetrics(
      npy(
        [0, 1, 7, 8, 9, 10, 3, 11, 4, 9],
        [255, 255, 255, 255, 255, 255, 255, 255, 255, 0],
      ),
    ),
  ).toEqual({
    cloudPercent: 50,
    coveragePercent: 60,
    unclassifiedPercent: 10,
    cloudShadowPercent: 16.7,
    snowIcePercent: 16.7,
    width: 10,
    height: 1,
  });
});
test("retains zero cloud coverage and supports the unsigned 16-bit layout", () => {
  expect(satelliteCloudMetrics(npy([4, 6, 5], undefined, "<u2"))).toMatchObject(
    { cloudPercent: 0, coveragePercent: 100 },
  );
  expect(satelliteCloudMetrics(npy([8, 9, 10]))).toMatchObject({
    cloudPercent: 100,
    coveragePercent: 100,
  });
});
test("no classified pixels yields unknown, never a false clear-sky percentage", () => {
  expect(satelliteCloudMetrics(npy([0, 1, 7]))).toMatchObject({
    cloudPercent: null,
    coveragePercent: 0,
    cloudShadowPercent: null,
    snowIcePercent: null,
  });
});
test.each([
  new Uint8Array(0),
  new TextEncoder().encode("not a numpy array"),
  npy([12]),
  npy([4, 8]).subarray(0, -1),
  npy([4], undefined, "|f8"),
])("rejects malformed or unsupported classification data", (bytes) => {
  expect(() => satelliteCloudMetrics(bytes)).toThrow();
});
test("reads classification for the exact image crop, without using whole-scene cloud metadata", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(metadata())
    .mockResolvedValueOnce(new Response(npy([4, 6, 8, 10])));
  vi.stubGlobal("fetch", fetch);
  const result = await getSatelliteClouds(id, {
    lat: 28.98,
    lng: 77.7,
    size: 5,
    bbox: [77.674, 28.957, 77.726, 29.003],
  });
  expect(result).toMatchObject({
    sceneId: id,
    capturedAt,
    cloudPercent: 50,
    coveragePercent: 100,
    sizeKm: 5,
    cloudPixelCount: 2,
  });
  expect(result.cloudMaskDataUrl).toMatch(/^data:image\/png;base64,/);
  const url = new URL(fetch.mock.calls[1][0]);
  expect(url.pathname).toContain("77.674,28.957,77.726,29.003/384x384.npy");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    item: id,
    assets: "SCL",
    resampling: "nearest",
    dst_crs: "EPSG:4326",
  });
});
test.each([
  "",
  "lat=0&lng=0&scene=bad",
  `lat=91&lng=0&scene=${id}`,
  `lat=0&lng=0&size=500&scene=${id}`,
])(
  "rejects invalid area and capture before contacting the provider: %s",
  async (query) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(
      new Request(`https://app.test/api/satellite/clouds?${query}`),
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  },
);
test("returns a provider error instead of fabricating a percentage", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  const response = await GET(
    new Request(
      `https://app.test/api/satellite/clouds?lat=28.98&lng=77.7&scene=${id}`,
    ),
  );
  expect(response.status).toBe(502);
  expect(await response.json()).toHaveProperty("error");
});
