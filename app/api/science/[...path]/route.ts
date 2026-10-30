import {personalApi} from "@/lib/personal/api";
import { backendURL } from "@/lib/science/server";
export const dynamic = "force-dynamic";
async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const base = backendURL();
  if (!base) return personalApi(request, (await params).path);
  const url = new URL(request.url),
    origin = request.headers.get("origin");
  if (
    request.method !== "GET" &&
    (request.headers.get("x-space-eye") !== "1" ||
      (origin && origin !== url.origin))
  )
    return Response.json(
      { detail: "Request origin not permitted" },
      { status: 403 },
    );
  const { path } = await params;
  if (path.some((p) => p === ".." || p.includes("/") || p.includes("\\")))
    return Response.json({ detail: "Invalid API path" }, { status: 400 });
  const headers = new Headers();
  for (const name of ["content-type", "x-space-eye", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("space_eye_session="));
  if (cookie) headers.set("cookie", cookie);
  try {
    const init: RequestInit & { duplex?: string } = {
      method: request.method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    };
    if (request.method !== "GET") {
      init.body = request.body;
      init.duplex = "half";
    }
    const upstream = await fetch(
      base.replace(/\/$/, "") +
        "/" +
        path.map(encodeURIComponent).join("/") +
        url.search,
      init,
    );
    const resultHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-type", "content-disposition", "set-cookie"]) {
      const value = upstream.headers.get(name);
      if (value) resultHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: resultHeaders,
    });
  } catch {
    return Response.json(
      {
        detail:
          "Research service unavailable. Check the API connection and retry.",
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
