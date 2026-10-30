// @vitest-environment node
import { beforeEach, afterEach, expect, test, vi } from "vitest";
const base = vi.hoisted(() => ({ url: "https://processor.example" }));
vi.mock("@/lib/science/server", () => ({ backendURL: () => base.url }));
vi.mock("@/lib/personal/api", () => ({
  personalApi: async () => Response.json({ id: "personal-owner" }),
}));
import { GET, POST } from "@/app/api/science/[...path]/route";
const context = (path = ["auth", "me"]) => ({
  params: Promise.resolve({ path }),
});
beforeEach(() => {
  base.url = "https://processor.example";
});
afterEach(() => vi.unstubAllGlobals());
test("unconfigured Python service delegates directly to the personal workspace", async () => {
  base.url = "";
  const r = await GET(
    new Request("https://site.test/api/science/auth/me"),
    context(),
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ id: "personal-owner" });
});
test("cross origin writes are rejected before reaching the backend", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const r = await POST(
    new Request("https://site.test/api/science/auth/login", {
      method: "POST",
      headers: { origin: "https://foreign.test", "X-Space-Eye": "1" },
    }),
    context(["auth", "login"]),
  );
  expect(r.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
test("only the research cookie is forwarded and private output is not cached", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response('{"id":"a"}', {
      headers: {
        "content-type": "application/json",
        "set-cookie": "space_eye_session=new; HttpOnly; Secure; Path=/",
      },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const r = await GET(
    new Request("https://site.test/api/science/auth/me", {
      headers: {
        cookie: "chatgpt_private=sensitive; space_eye_session=research",
      },
    }),
    context(),
  );
  expect(fetch.mock.calls[0][0]).toBe("https://processor.example/auth/me");
  expect(fetch.mock.calls[0][1].headers.get("cookie")).toBe(
    "space_eye_session=research",
  );
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
});
test("path traversal cannot escape the fixed upstream endpoint", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const r = await GET(
    new Request("https://site.test/api/science/me"),
    context(["..", "secrets"]),
  );
  expect(r.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
