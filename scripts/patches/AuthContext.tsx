import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import keycloak from "./keycloak";
import { setAccessTokenProvider } from "./accessToken";
import { api } from "../hooks/useApi";

/* ─── JWT dev assinado com HS256 ────────────────────────────────────────────
   Usa a mesma JWT_SECRET=dev-secret do backend (keycloak-jwt.strategy.ts).
   Inclui iss/aud/sub esperados pela strategy para o token ser aceito. */
function b64url(data: Uint8Array): string {
  let s = "";
  data.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function createDevJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const kcUrl = import.meta.env.VITE_KEYCLOAK_URL ?? "http://192.168.100.112:8080";
  const kcRealm = import.meta.env.VITE_KEYCLOAK_REALM ?? "cfo";
  const audience = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "pontoeletronico-dev";
  const issuer = `${kcUrl}/realms/${kcRealm}`;

  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        sub: "dev-user-001",
        iss: issuer,
        aud: audience,
        iat: now,
        exp: now + 86_400 * 30,
        name: "Desenvolvedor CFO",
        email: "dev@cfo.org.br",
        preferred_username: "dev",
        realm_access: { roles: ["funcionario", "gestor", "ponto-admin"] },
        groups: ["funcionario", "gestor", "ponto-admin"]
      })
    )
  );

  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("dev-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

/* ─── Types ─── */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailReal: string | null;
  username: string;
  roles: string[];
  groups: string[];
  isSuperAdmin: boolean;
  funcionario: {
    id: string;
    matricula: string | null;
    cargo: string;
    departamento: string | null;
    fotoPerfilUrl: string | null;
    solicitarAtualizacaoFoto: boolean;
    isManager: boolean;
    section: string | null;
  } | null;
}

interface AuthContextType {
  initialized: boolean;
  authenticated: boolean;
  contaDesativada: boolean;
  user: AuthUser | null;
  initError: string | null;
  token: () => string | undefined;
  ensureInitialized: () => Promise<boolean>;
  login: () => Promise<void>;
  loginToBaterPonto: () => Promise<void>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  hasGroup: (group: string) => boolean;
  devLogin: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const KC_SESSION_KEY = "kc-persisted-session";

function saveKcSession() {
  try {
    if (keycloak.token && keycloak.refreshToken) {
      sessionStorage.setItem(
        KC_SESSION_KEY,
        JSON.stringify({
          token: keycloak.token,
          refreshToken: keycloak.refreshToken,
          idToken: keycloak.idToken
        })
      );
    }
  } catch {
    /* ignore */
  }
}

function loadKcSession(): { token?: string; refreshToken?: string; idToken?: string } | null {
  try {
    const raw = sessionStorage.getItem(KC_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearKcSession() {
  try {
    sessionStorage.removeItem(KC_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/* URL base para redirects OAuth — sempre o host atual do navegador. */
function getAppBaseUrl(): string {
  return window.location.origin.replace(/\/$/, "");
}

function clearStaleKeycloakState() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("kc-callback-") || k === "oauthRedirect")
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/* ─── Helpers ─── */

interface KcToken {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles: string[] };
  groups?: string[];
}

const SUPER_ADMIN_USERNAMES = (import.meta.env.VITE_SUPER_ADMIN_USERNAMES ?? "elder.oliveira")
  .split(",")
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

const SUPER_ADMIN_ROLES = [
  "ponto-admin",
  "PONTO_ADMIN",
  "gestor",
  "GESTOR_APROVACAO",
  "RH_AUDITORIA",
  "funcionario"
];

function parseUser(): AuthUser | null {
  const p = keycloak.tokenParsed as KcToken | undefined;
  if (!p) return null;
  const username = p.preferred_username ?? "";
  const fullName = p.name || [p.given_name, p.family_name].filter(Boolean).join(" ") || username;
  const baseRoles = p.realm_access?.roles ?? [];
  const isSuperAdmin = SUPER_ADMIN_USERNAMES.includes(username.toLowerCase());
  const roles = isSuperAdmin
    ? [...new Set([...baseRoles, ...SUPER_ADMIN_ROLES])]
    : [...new Set(["funcionario", ...baseRoles])];
  return {
    id: p.sub ?? "",
    name: fullName,
    email: p.email ?? "",
    emailReal: null,
    username,
    roles,
    groups: p.groups ?? [],
    isSuperAdmin,
    funcionario: null
  };
}

function urlHasAuthCallback(): boolean {
  const q = window.location.search;
  return q.includes("code=") || q.includes("state=") || q.includes("error=");
}

/** Garante access token válido; limpa sessão se refresh falhar (evita 400/401 silencioso). */
async function ensureValidKeycloakSession(): Promise<boolean> {
  if (!keycloak.authenticated || !keycloak.token) return false;
  try {
    await keycloak.updateToken(30);
  } catch {
    clearKcSession();
    return false;
  }
  if (!keycloak.token || keycloak.isTokenExpired(5)) {
    clearKcSession();
    return false;
  }
  return true;
}

/* ─── Context ─── */

const AuthContext = createContext<AuthContextType | null>(null);

/* ─── Provider ─── */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [contaDesativada, setContaDesativada] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const devTokenRef = useRef<string | undefined>(undefined);

  const startTokenRefresh = useCallback(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(async () => {
      try {
        const refreshed = await keycloak.updateToken(60);
        if (refreshed) saveKcSession();
      } catch {
        clearKcSession();
        try {
          keycloak.logout({ redirectUri: getAppBaseUrl() + "/login" });
        } catch {
          window.location.assign("/login");
        }
      }
    }, 30_000);
  }, []);

  const ensureInitialized = useCallback((): Promise<boolean> => {
    if (authenticated) return Promise.resolve(true);
    if (initPromiseRef.current) return initPromiseRef.current;

    const kc = keycloak as unknown as { didInitialize?: boolean };
    if (kc.didInitialize) {
      initPromiseRef.current = (async () => {
        let auth = !!keycloak.authenticated;
        if (auth) {
          auth = await ensureValidKeycloakSession();
          if (auth) {
            saveKcSession();
            setUser(parseUser());
            startTokenRefresh();
          } else {
            setUser(null);
          }
        }
        setAuthenticated(auth);
        setInitialized(true);
        return auth;
      })();
      return initPromiseRef.current;
    }

    const isCallback = urlHasAuthCallback();
    if (isCallback) clearKcSession();
    const stored = isCallback ? null : loadKcSession();

    initPromiseRef.current = keycloak
      .init({
        pkceMethod: "S256",
        checkLoginIframe: false,
        responseMode: "query",
        token: stored?.token,
        refreshToken: stored?.refreshToken,
        idToken: stored?.idToken
      })
      .then(async (auth: boolean) => {
        let ok = auth;
        if (ok) {
          ok = await ensureValidKeycloakSession();
          if (ok) {
            saveKcSession();
            setUser(parseUser());
            startTokenRefresh();
          } else {
            setUser(null);
          }
        }
        setAuthenticated(ok);
        setInitialized(true);
        return ok;
      })
      .catch((err: unknown) => {
        console.error("[Auth] Keycloak init falhou:", err);
        let msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
        if (!msg && err && typeof err === "object") {
          const o = err as { error?: string; error_description?: string };
          msg = [o.error, o.error_description].filter(Boolean).join(": ");
        }
        if (!msg || msg === "undefined") {
          msg =
            "Token OAuth rejeitado (401). O client do navegador (pontoeletronico-dev) deve ser público: Client authentication OFF no Keycloak.";
        }
        setInitError(msg);
        setInitialized(true);
        return false;
      });

    return initPromiseRef.current as Promise<boolean>;
  }, [startTokenRefresh, authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        if (!devTokenRef.current && keycloak.authenticated && keycloak.isTokenExpired(30)) {
          await keycloak.updateToken(30);
          saveKcSession();
        }
      } catch {
        if (!cancelled) {
          clearKcSession();
          setAuthenticated(false);
          setUser(null);
        }
        return;
      }
      const tk = devTokenRef.current ?? keycloak.token;
      if (!tk || cancelled) return;
      api
        .get<AuthUser>("/auth/me")
        .then((profile) => {
          if (!cancelled && profile) setUser(profile);
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : "";
          if (msg === "CONTA_DESATIVADA" && !cancelled) {
            setContaDesativada(true);
            return;
          }
          if (msg.includes("401") && !cancelled) {
            clearKcSession();
            setAuthenticated(false);
            setUser(null);
          }
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  useEffect(() => {
    if (urlHasAuthCallback()) {
      ensureInitialized();
    } else {
      setInitialized(true);
    }

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        try {
          keycloak.logout({ redirectUri: getAppBaseUrl() + "/login" });
        } catch {
          window.location.assign("/login");
        }
      });
    };

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [ensureInitialized]);

  const appBaseUrl = getAppBaseUrl();

  async function login() {
    try {
      clearKcSession();
      clearStaleKeycloakState();
      await ensureInitialized();
      keycloak.login({ redirectUri: appBaseUrl + "/ponto" });
    } catch (e) {
      console.error("[Auth] Falha ao iniciar login:", e);
      alert(
        `Não foi possível conectar ao servidor de autenticação.\nURL: ${import.meta.env.VITE_KEYCLOAK_URL}\nRealm: ${import.meta.env.VITE_KEYCLOAK_REALM}\n\nVerifique se o servidor SSO está acessível e se o realm e o client "${import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "pontoeletronico-dev"}" foram criados.`
      );
    }
  }

  async function loginToBaterPonto() {
    try {
      clearKcSession();
      clearStaleKeycloakState();
      await ensureInitialized();
      keycloak.login({ redirectUri: appBaseUrl + "/ponto/registrar" });
    } catch (e) {
      console.error("[Auth] Falha ao iniciar login:", e);
      alert(
        `Não foi possível conectar ao servidor de autenticação.\nURL: ${import.meta.env.VITE_KEYCLOAK_URL}\nRealm: ${import.meta.env.VITE_KEYCLOAK_REALM}\n\nVerifique se o servidor SSO está acessível e se o realm e o client "${import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "pontoeletronico-dev"}" foram criados.`
      );
    }
  }

  function logout() {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    clearKcSession();
    try {
      keycloak.logout({ redirectUri: getAppBaseUrl() + "/login" });
    } catch {
      window.location.assign("/login");
    }
  }

  function hasRole(role: string): boolean {
    return user?.roles.includes(role) ?? false;
  }

  function hasGroup(group: string): boolean {
    const groups = user?.groups ?? [];
    return groups.some((g) => g === group || g === `/${group}` || g.endsWith(`/${group}`));
  }

  function token() {
    if (devTokenRef.current) return devTokenRef.current;
    if (!keycloak.token || keycloak.isTokenExpired(5)) return undefined;
    return keycloak.token;
  }

  useEffect(() => {
    setAccessTokenProvider(token);
  }, []);

  async function refreshProfile() {
    try {
      const profile = await api.get<AuthUser>("/auth/me");
      if (profile) setUser(profile);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "CONTA_DESATIVADA") setContaDesativada(true);
    }
  }

  async function devLogin() {
    if (!import.meta.env.DEV) return;
    const jwt = await createDevJWT();
    devTokenRef.current = jwt;
    setUser({
      id: "dev-user-001",
      name: "Desenvolvedor CFO",
      email: "dev@cfo.org.br",
      emailReal: "dev@cfo.org.br",
      username: "dev",
      roles: ["funcionario", "gestor", "ponto-admin"],
      groups: ["funcionario", "gestor", "ponto-admin"],
      isSuperAdmin: true,
      funcionario: {
        id: "dev-func-001",
        matricula: "dev",
        cargo: "Desenvolvedor",
        departamento: null,
        fotoPerfilUrl: null,
        solicitarAtualizacaoFoto: false,
        isManager: true,
        section: "TI - Desenvolvimento"
      }
    });
    setAuthenticated(true);
    setInitialized(true);
  }

  return (
    <AuthContext.Provider
      value={{
        initialized,
        authenticated,
        contaDesativada,
        user,
        initError,
        token,
        ensureInitialized,
        login,
        loginToBaterPonto,
        logout,
        hasRole,
        hasGroup,
        devLogin,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
