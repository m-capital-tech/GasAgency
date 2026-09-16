import { DemoEngine, handle, type Method } from "@gassetu/engine";
import type { LiveEvent } from "@gassetu/shared";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Mode = "remote" | "local";
let mode: Mode = "remote";
let localEngine: DemoEngine | null = null;
const modeListeners = new Set<(m: Mode) => void>();

export function getMode(): Mode {
  return mode;
}
export function onModeChange(l: (m: Mode) => void) {
  modeListeners.add(l);
  return () => modeListeners.delete(l);
}
export function getLocalEngine(): DemoEngine {
  if (!localEngine) localEngine = new DemoEngine();
  return localEngine;
}
function setMode(m: Mode) {
  if (mode === m) return;
  mode = m;
  modeListeners.forEach((l) => l(m));
}
export function forceRemote() {
  setMode("remote");
}

/** Subscribe to engine events when running offline. */
export function onLocalEvent(l: (e: LiveEvent) => void) {
  return getLocalEngine().on(l);
}

let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
}

async function remote<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json?.error?.code ?? "HTTP", json?.error?.message ?? `Request failed (${res.status})`, res.status);
  return json as T;
}

function local<T>(method: Method, path: string, body?: unknown): T {
  const url = new URL(path, "http://local");
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));
  const out = handle(getLocalEngine(), { method, path: url.pathname, query, body: body ?? {} });
  if (out.status >= 400) {
    const err = (out.body as any)?.error ?? {};
    throw new ApiError(err.code ?? "ERR", err.message ?? "Request failed", out.status);
  }
  return out.body as T;
}

/** Try the mock API; on a network failure fall back to the bundled in-memory engine (PRD §9 offline fallback). */
export async function api<T = any>(method: Method, path: string, body?: unknown): Promise<T> {
  if (mode === "local") return local<T>(method, path, body);
  try {
    return await remote<T>(method, path, body);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.warn(`[api] ${method} ${path} unreachable → switching to offline demo mode`, (err as Error).message);
    setMode("local");
    return local<T>(method, path, body);
  }
}

export const get = <T = any>(path: string) => api<T>("GET", path);
export const post = <T = any>(path: string, body?: unknown) => api<T>("POST", path, body);
export const patch = <T = any>(path: string, body?: unknown) => api<T>("PATCH", path, body);
export const put = <T = any>(path: string, body?: unknown) => api<T>("PUT", path, body);
