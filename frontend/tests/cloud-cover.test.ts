// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/cloud-cover/route";

const data = (cloudCover: unknown = 72) => ({
  latitude: 28.625,
  longitude: 77.25,
  utc_offset_seconds: 0,
  current: { time: "2026-10-06T10:15", interval: 900, cloud_cover: cloudCover },
});
const request = (query = "lat=28.6139&lng=77.209") =>
  new Request(`https://site.test/api/cloud-cover?${query}`);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("returns a timestamped model estimate for the selected point with attribution", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T10:22:00Z"));
  const fetch = vi.fn().mockResolvedValue(Response.json(data()));
  vi.stubGlobal("fetch", fetch);
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    latitude: 28.6139,
    longitude: 77.209,
    cloudCover: 72,
    observedAt: "2026-10-06T10:15:00.000Z",
    fetchedAt: "2026-10-06T10:22:00.000Z",
    intervalSeconds: 900,
    modelLatitude: 28.625,
    modelLongitude: 77.25,
    source: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
  });
  const [url, options] = fetch.mock.calls[0];
  expect(new URL(url).origin).toBe("https://api.open-meteo.com");
  expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
    latitude: "28.6139",
    longitude: "77.209",
    current: "cloud_cover",
    timezone: "GMT",
    forecast_days: "1",
    cell_selection: "nearest",
  });
  expect(options).toMatchObject({
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
});

test.each([
  "",
  "lat=0",
  "lng=0",
  "lat=&lng=0",
  "lat=0&lng=%20",
  "lat=NaN&lng=0",
  "lat=0&lng=Infinity",
  "lat=91&lng=0",
  "lat=-90.1&lng=0",
  "lat=0&lng=180.1",
  "lat=0&lng=-181",
  "lat=0x10&lng=0",
])(
  "rejects invalid coordinates before contacting the provider: %s",
  async (query) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
    expect(fetch).not.toHaveBeenCalled();
  },
);

test.each(["lat=0&lng=0", "lat=-90&lng=-180", "lat=90&lng=180"])(
  "accepts valid zero and boundary coordinates: %s",
  async (query) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data(0))));
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ cloudCover: 0 });
  },
);

test.each([null, undefined, "0", -1, 101])(
  "does not fabricate clear conditions from an invalid reading: %s",
  async (cloudCover) => {
    const body = data();
    body.current.cloud_cover = cloudCover;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toHaveProperty("error");
  },
);

test.each(["", "not-a-date", "2026-02-30T10:15", "2026-10-06T10:15+05:30"])(
  "rejects missing or invalid UTC model timestamps: %s",
  async (time) => {
    const body = data();
    body.current.time = time;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    expect((await GET(request())).status).toBe(502);
  },
);

test("returns unavailable when the provider fails or returns malformed JSON", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
    .mockResolvedValueOnce(new Response("not JSON"))
    .mockRejectedValueOnce(new Error("network unavailable"));
  vi.stubGlobal("fetch", fetch);
  for (let i = 0; i < 3; i++) {
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toHaveProperty("error");
  }
});

test("a new point triggers a separate lookup without reusing the previous selection", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(data(72)))
    .mockResolvedValueOnce(Response.json(data(15)));
  vi.stubGlobal("fetch", fetch);
  await GET(request());
  const second = await GET(request("lat=19.076&lng=72.8777"));
  expect(await second.json()).toMatchObject({
    latitude: 19.076,
    longitude: 72.8777,
    cloudCover: 15,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new URL(fetch.mock.calls[1][0]).searchParams.get("latitude")).toBe(
    "19.076",
  );
});

test("aborts a stalled provider after ten seconds", async () => {
  vi.useFakeTimers();
  let providerSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          providerSignal = options.signal;
          providerSignal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    ),
  );
  const pending = GET(request());
  await vi.advanceTimersByTimeAsync(10_000);
  expect(providerSignal?.aborted).toBe(true);
  expect((await pending).status).toBe(502);
  expect(vi.getTimerCount()).toBe(0);
});

test("cancels upstream work when the selected-point request is aborted", async () => {
  const controller = new AbortController();
  let providerSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          providerSignal = options.signal;
          providerSignal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    ),
  );
  const pending = GET(new Request(request(), { signal: controller.signal }));
  controller.abort();
  expect((await pending).status).toBe(502);
  expect(providerSignal?.aborted).toBe(true);
});
