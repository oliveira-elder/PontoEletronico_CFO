const BASE = "/api";

/* Provider global de token, registrado pelo AuthContext.
   Garante que TODA chamada à API inclua o Bearer token sem precisar
   passar manualmente em cada local. */
let tokenProvider: () => string | undefined = () => undefined;

export function setAuthTokenProvider(fn: () => string | undefined) {
  tokenProvider = fn;
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  explicitToken?: string
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";

  const tk = explicitToken ?? tokenProvider();
  if (tk) headers["Authorization"] = `Bearer ${tk}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include"
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → ${res.status}${text ? ": " + text : ""}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return undefined as T;
}

export const api = {
  get: <T>(path: string, token?: string) => req<T>("GET", path, undefined, token),
  put: <T>(path: string, body: unknown, token?: string) => req<T>("PUT", path, body, token),
  post: <T>(path: string, body: unknown, token?: string) => req<T>("POST", path, body, token),
  patch: <T>(path: string, body?: unknown, token?: string) => req<T>("PATCH", path, body, token),
  delete: <T>(path: string, token?: string) => req<T>("DELETE", path, undefined, token)
};
