"use client";
import { useCallback, useEffect, useState } from "react";
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Space-Eye", "1");
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch("/api/science" + path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data: unknown = await response
    .json()
    .catch(() => ({ detail: "The service returned an unreadable response" }));
  const detail = (data as { detail?: unknown })?.detail;
  if (!response.ok)
    throw new Error(
      typeof detail === "string"
        ? detail
        : JSON.stringify(detail || "Request failed"),
    );
  return data as T;
}
export function useResource<T>(path: string, interval = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await api<T>(path);
      setData(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Service unavailable");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    const start = setTimeout(refresh, 0);
    const timer = interval ? setInterval(refresh, interval) : undefined;
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [refresh, interval]);
  return { data, error, loading, refresh };
}
export const number = (value: number | null | undefined, digits = 2) =>
  value == null
    ? "Unavailable"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
