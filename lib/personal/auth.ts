import { env } from "@/lib/runtime-env";
export const COOKIE = "cloud_personal_session";
export const OWNER = "personal-owner";
export function resources() {
  const e = env as unknown as { DB?: D1Database; BUCKET?: R2Bucket };
  if (!e.DB || !e.BUCKET) throw new Error("Personal storage is unavailable.");
  return { db: e.DB, bucket: e.BUCKET };
}
export function setting(name: string) {
  return (
    (env as unknown as Record<string, string>)[name] || process.env[name] || ""
  );
}
export function profile() {
  return {
    id: OWNER,
    name: setting("PERSONAL_NAME") || "My workspace",
    email: "Personal workspace",
  };
}
