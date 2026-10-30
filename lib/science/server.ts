import { cookies } from "next/headers";
import { env } from "@/lib/runtime-env";
import { profile } from "@/lib/personal/auth";
import type { User } from "./types";
export function backendURL() {
  return (
    (env as unknown as Record<string, string | undefined>).SCIENCE_API_URL ||
    process.env.SCIENCE_API_URL ||
    ""
  );
}
export async function researchUser(): Promise<User | null> {
  const base = backendURL();
  if (!base) return profile();
  const cookie = (await cookies()).get("space_eye_session");
  if (!cookie) return null;
  try {
    const response = await fetch(base.replace(/\/$/, "") + "/auth/me", {
      headers: { cookie: `space_eye_session=${cookie.value}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
