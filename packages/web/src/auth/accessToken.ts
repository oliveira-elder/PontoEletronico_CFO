import keycloak from "./keycloak";

let tokenProvider: () => string | undefined = () => undefined;

export function setAccessTokenProvider(fn: () => string | undefined) {
  tokenProvider = fn;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    })
  ]);
}

async function refreshKeycloakToken(minValidity = 30): Promise<void> {
  if (!keycloak.authenticated) return;
  await withTimeout(keycloak.updateToken(minValidity), 8_000);
}

/** Garante access token válido antes de chamar a API (SSO ou Login Dev). */
export async function resolveAccessToken(explicit?: string): Promise<string | undefined> {
  const fromProvider = tokenProvider();
  const candidate = fromProvider ?? keycloak.token ?? explicit;

  if (!keycloak.authenticated) return candidate;

  if (candidate && !keycloak.isTokenExpired(30)) return candidate;

  try {
    await refreshKeycloakToken(30);
  } catch {
    return keycloak.token ?? candidate;
  }

  return keycloak.token ?? candidate;
}

export async function forceRefreshAccessToken(): Promise<string | undefined> {
  try {
    await refreshKeycloakToken(-1);
  } catch {
    /* mantém token atual se refresh falhar */
  }
  return (await resolveAccessToken()) ?? undefined;
}

export { refreshKeycloakToken };
