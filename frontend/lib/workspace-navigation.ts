export const workspaceViews = ["overview", "map", "history", "methodology", "agriculture", "water", "forest"] as const;

/** Only return to the workspace; never accept an external or auth-loop destination. */
export function workspaceReturnTo(value?: string | string[]): string {
  if (typeof value !== "string") return "/workspace";
  try {
    const base = "https://space-eye.local";
    const url = new URL(value, base);
    if (!value.startsWith("/") || value.startsWith("//") || url.origin !== base || url.pathname !== "/workspace") return "/workspace";
    const view = url.searchParams.get("view");
    return view && workspaceViews.some(v => v === view) && view !== "overview" ? `/workspace?view=${view}` : "/workspace";
  } catch { return "/workspace"; }
}

/** Keep legacy access links within the application and out of redirect loops. */
export function personalReturnTo(value?: string | string[]): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) return "/dashboard";
  try {
    const base = "https://space-eye.local";
    const url = new URL(value, base);
    if (url.origin !== base) return "/dashboard";
    if (url.pathname === "/workspace") return workspaceReturnTo(value);
    const route = /^(?:\/(?:dashboard|explorer|reconstructions|datasets|history|settings)|\/analysis\/[^/]+|\/models(?:\/lab(?:\/[^/]+)?)?)$/;
    return route.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
