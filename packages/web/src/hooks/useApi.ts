import { forceRefreshAccessToken, resolveAccessToken } from "../auth/accessToken";

const BASE = "/api";
const GATEWAY_RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_GATEWAY_RETRIES = 3;

export { setAccessTokenProvider as setAuthTokenProvider } from "../auth/accessToken";

export function isRequestAborted(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function abortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Aborted", "AbortError");
  }
  return Object.assign(new Error("Aborted"), { name: "AbortError" });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

type ReqFlags = { authRetried: boolean; gatewayRetries: number; signal?: AbortSignal };

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  explicitToken?: string,
  flags: ReqFlags = { authRetried: false, gatewayRetries: 0 }
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";

  const tk = await resolveAccessToken(explicitToken);
  if (flags.signal?.aborted) throw abortError();
  if (tk) headers["Authorization"] = `Bearer ${tk}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
    signal: flags.signal
  });

  if (GATEWAY_RETRY_STATUSES.has(res.status) && flags.gatewayRetries < MAX_GATEWAY_RETRIES) {
    await sleep(1000 * (flags.gatewayRetries + 1), flags.signal);
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
    if (res.status === 403) {
      message = "Você não tem permissão para acessar este recurso.";
    } else if (res.status === 413) {
      message =
        "O arquivo enviado é muito grande. Tente um documento menor ou com menor resolução.";
    }
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

/** Arquivo autenticado como Blob (ex.: PDF para o visualizador protegido). */
async function fetchBlob(path: string, explicitToken?: string): Promise<Blob> {
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
  return res.blob();
}

/** POST que devolve arquivo (ex.: ZIP do AFD/AEJ) e dispara o download. */
async function postDownload(
  path: string,
  body: unknown,
  filenamePadrao: string,
  explicitToken?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tk = await resolveAccessToken(explicitToken);
  if (tk) headers["Authorization"] = `Bearer ${tk}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = `status ${res.status}`;
    try {
      const j = await res.json();
      detail = j?.message ?? detail;
    } catch {
      /* sem corpo JSON */
    }
    throw new Error(Array.isArray(detail) ? detail.join(" ") : detail);
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const nome = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? filenamePadrao;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { assinado: res.headers.get("X-Assinado") === "1", nome };
}

export const api = {
  get: <T>(path: string, token?: string, signal?: AbortSignal) =>
    req<T>("GET", path, undefined, token, { authRetried: false, gatewayRetries: 0, signal }),
  put: <T>(path: string, body: unknown, token?: string) => req<T>("PUT", path, body, token),
  post: <T>(path: string, body: unknown, token?: string) => req<T>("POST", path, body, token),
  patch: <T>(path: string, body?: unknown, token?: string) => req<T>("PATCH", path, body, token),
  delete: <T>(path: string, body?: unknown, token?: string) => req<T>("DELETE", path, body, token),
  download: (path: string, filename: string, token?: string) => downloadFile(path, filename, token),
  blob: (path: string, token?: string) => fetchBlob(path, token),
  postDownload: (path: string, body: unknown, filename: string, token?: string) =>
    postDownload(path, body, filename, token)
};
