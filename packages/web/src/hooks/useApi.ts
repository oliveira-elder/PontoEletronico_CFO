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
  const tk = explicitToken ?? tokenProvider();
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
