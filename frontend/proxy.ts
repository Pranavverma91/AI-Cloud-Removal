import { NextResponse } from "next/server";

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/workspace/:path*",
    "/login",
    "/signup",
    "/dashboard",
    "/explorer",
    "/analysis/:path*",
    "/reconstructions",
    "/datasets",
    "/models/:path*",
    "/history",
    "/settings",
  ],
};
