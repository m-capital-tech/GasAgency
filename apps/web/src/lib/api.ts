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

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export async function api<T = any>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json?.error?.code ?? "HTTP", json?.error?.message ?? `Request failed (${res.status})`, res.status);
  return json as T;
}
export const get = <T = any>(path: string) => api<T>("GET", path);
export const post = <T = any>(path: string, body?: unknown) => api<T>("POST", path, body);
export const patch = <T = any>(path: string, body?: unknown) => api<T>("PATCH", path, body);
export const put = <T = any>(path: string, body?: unknown) => api<T>("PUT", path, body);
