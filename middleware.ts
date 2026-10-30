import { NextResponse } from "next/server";

// These pages depend on the current sign-in state and must never be shared-cached.
export function middleware() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/", "/workspace/:path*", "/login", "/signup", "/dashboard", "/explorer", "/analysis/:path*", "/reconstructions", "/datasets", "/models/:path*", "/history", "/settings"] };
