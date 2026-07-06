import { forceRefreshAccessToken, resolveAccessToken } from "../auth/accessToken";

const BASE = "/api";
const GATEWAY_RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_GATEWAY_RETRIES = 3;

export { setAccessTokenProvider as setAuthTokenProvider } from "../auth/accessToken";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  explicitToken?: string,
  flags = { authRetried: false, gatewayRetries: 0 }
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";

  const tk = await resolveAccessToken(explicitToken);
  if (tk) headers["Authorization"] = `Bearer ${tk}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include"
  });

  if (GATEWAY_RETRY_STATUSES.has(res.status) && flags.gatewayRetries < MAX_GATEWAY_RETRIES) {
    await sleep(1000 * (flags.gatewayRetries + 1));
    return req<T>(method, path, body, explicitToken, {
      ...flags,
      gatewayRetries: flags.gatewayRetries + 1
    });
  }

  if (res.status === 401 && !flags.authRetried) {
    await forceRefreshAccessToken();
    return req<T>(method, path, body, undefined, { ...flags, authRetried: true });
  }
  if (!res.ok) {
    let message = `Não foi possível concluir a operação (erro ${res.status}).`;
    try {
      const data = await res.json();
      if (typeof data?.message === "string") {
        message = data.message;
      } else if (Array.isArray(data?.message)) {
        message = data.message.join(" ");
      }
    } catch {
      /* resposta sem corpo JSON: mantém mensagem genérica */
    }
    throw new Error(message);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return undefined as T;
}

async function downloadFile(path: string, filename: string, explicitToken?: string) {
  const headers: Record<string, string> = {};
  const tk = await resolveAccessToken(explicitToken);
  if (tk) headers["Authorization"] = `Bearer ${tk}`;

  const res = await fetch(`${BASE}${path}`, { method: "GET", headers, credentials: "include" });
  if (!res.ok) {
    let detail = `status ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.message ?? detail;
    } catch {
      /* sem corpo JSON */
    }
    throw new Error(detail);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, token?: string) => req<T>("GET", path, undefined, token),
  put: <T>(path: string, body: unknown, token?: string) => req<T>("PUT", path, body, token),
  post: <T>(path: string, body: unknown, token?: string) => req<T>("POST", path, body, token),
  patch: <T>(path: string, body?: unknown, token?: string) => req<T>("PATCH", path, body, token),
  delete: <T>(path: string, token?: string) => req<T>("DELETE", path, undefined, token),
  download: (path: string, filename: string, token?: string) => downloadFile(path, filename, token)
};
