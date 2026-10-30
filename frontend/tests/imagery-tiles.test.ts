// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { imageryTile } from "@/lib/imagery-tiles";

vi.mock("@/lib/server", () => ({
  identity: vi.fn(async () => ({ owner: "test" })),
  fail: (error: ApiError) =>
    Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    ),
}));
import { GET } from "@/app/api/map-imagery/[z]/[x]/[y]/route";

const coords = { z: "18", x: "187651", y: "109007" };
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 255, 217]);
const signal = () => new AbortController().signal;
const get = (params = coords) =>
  GET(new Request("http://localhost/api/map-imagery/18/187651/109007"), {
    params: Promise.resolve(params),
  });
afterEach(() => vi.unstubAllGlobals());

test("serves the original image bytes using the provider's row-column ordering and no-blank option", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } }),
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await get();
  expect(fetcher).toHaveBeenCalledWith(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/109007/187651?blankTile=false",
    expect.objectContaining({
      signal: expect.any(AbortSignal),
      redirect: "error",
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/jpeg");
  expect(response.headers.get("cache-control")).toContain("max-age=86400");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
});

test("preserves a missing tile's 404 without requiring CORS headers so MapLibre can load an ancestor", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Not found", { status: 404 })),
  );
  const response = await get();
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("");
  expect(response.headers.get("cache-control")).toContain("max-age=3600");
});

test("does not treat the provider's explicitly flagged placeholder as real imagery", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(jpeg, {
          headers: { "content-type": "image/jpeg", "blank-tile": "true" },
        }),
    ),
  );
  expect((await get()).status).toBe(404);
});

test.each([
  { z: "23", x: "0", y: "0" },
  { z: "2", x: "4", y: "1" },
  { z: "2", x: "1", y: "4" },
  { z: "2", x: "-1", y: "1" },
  { z: "2", x: "1.5", y: "1" },
  { z: "2", x: "../tile", y: "1" },
])(
  "rejects invalid tile coordinates before requesting the provider: %j",
  async (params) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await get(params)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  },
);

test("an upstream outage stays an uncached error rather than becoming a missing tile", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Unavailable", { status: 503 })),
  );
  const response = await get();
  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

test.each(["text/html", "image/jpeg"])(
  "rejects non-image bodies advertised as %s",
  async (contentType) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("not an image", {
            headers: { "content-type": contentType },
          }),
      ),
    );
    expect((await get()).status).toBe(502);
  },
);

test("bounds streamed tiles even when the server does not send Content-Length", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(new Uint8Array(1024 * 1024 + 1), {
          headers: { "content-type": "image/jpeg" },
        }),
    ),
  );
  await expect(imageryTile(coords, signal())).rejects.toMatchObject({
    status: 502,
    message: expect.stringContaining("size limit"),
  });
});

test("connects request cancellation to the provider request", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    ),
  );
  const result = imageryTile(coords, controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ status: 502 });
});
