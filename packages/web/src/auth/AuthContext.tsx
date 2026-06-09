import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import keycloak from "./keycloak";
import { setAuthTokenProvider } from "../hooks/useApi";

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
  const kcUrl = import.meta.env.VITE_KEYCLOAK_URL ?? "https://sso.cfo.org.br";
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

/* Limpa estado obsoleto do keycloak-js no sessionStorage. */
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
  // Todo usuário autenticado é "funcionario" por padrão
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

// Detecta se a URL atual é um callback do Keycloak (contém code/state/error)
function urlHasAuthCallback(): boolean {
  const q = window.location.search;
  return q.includes("code=") || q.includes("state=") || q.includes("error=");
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

  // Guards e estado interno (não causam re-render)
  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const devTokenRef = useRef<string | undefined>(undefined);

  /* Renova token 60s antes do vencimento; desconecta se falhar (confidencialidade) */
  const startTokenRefresh = useCallback(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(async () => {
      try {
        const refreshed = await keycloak.updateToken(60);
        if (refreshed) saveKcSession();
      } catch {
        clearKcSession();
        try {
          keycloak.logout({
            redirectUri: import.meta.env.VITE_APP_BASE_URL ?? window.location.origin
          });
        } catch {
          window.location.assign("/login");
        }
      }
    }, 30_000);
  }, []);

  /* Inicialização LAZY — só roda quando alguém precisa
     (rota protegida, callback do Keycloak na URL, ou pedido explícito) */
  const ensureInitialized = useCallback((): Promise<boolean> => {
    // Se já autenticado (ex: devLogin), retorna imediatamente sem rodar Keycloak
    if (authenticated) return Promise.resolve(true);
    if (initPromiseRef.current) return initPromiseRef.current;

    // keycloak-js v25 só permite chamar init() uma vez por instância.
    // Se já foi inicializado, retorna estado atual sem reinicializar.
    const kc = keycloak as unknown as { didInitialize?: boolean };
    if (kc.didInitialize) {
      const auth = !!keycloak.authenticated;
      setAuthenticated(auth);
      if (auth) setUser(parseUser());
      setInitialized(true);
      initPromiseRef.current = Promise.resolve(auth);
      return initPromiseRef.current;
    }

    const stored = loadKcSession();
    const appBaseUrl = import.meta.env.VITE_APP_BASE_URL ?? window.location.origin;

    initPromiseRef.current = keycloak
      .init({
        pkceMethod: "S256",
        checkLoginIframe: false,
        responseMode: "query",
        onLoad: "check-sso",
        silentCheckSsoRedirectUri: appBaseUrl + "/silent-check-sso.html",
        // Restaura tokens persistidos para evitar redirect no F5
        token: stored?.token,
        refreshToken: stored?.refreshToken,
        idToken: stored?.idToken
      })
      .then((auth: boolean) => {
        if (auth) {
          saveKcSession();
          setUser(parseUser());
          startTokenRefresh();
        }
        setAuthenticated(auth);
        setInitialized(true);
        return auth;
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
        console.error("[Auth] Keycloak init falhou:", err);
        setInitError(msg || "Erro desconhecido");
        setInitialized(true);
        return false;
      });

    return initPromiseRef.current as Promise<boolean>;
  }, [startTokenRefresh, authenticated]);

  /* Sincroniza perfil do backend após autenticação bem-sucedida.
     Usa token() para funcionar tanto com SSO quanto com Login Dev. */
  useEffect(() => {
    if (!authenticated) return;
    const tk = devTokenRef.current ?? keycloak.token;
    if (!tk) return;
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${tk}` } })
      .then(async (r) => {
        if (r.status === 403) {
          const body = (await r.json().catch(() => ({}))) as { message?: string };
          if (body?.message === "CONTA_DESATIVADA") {
            if (!cancelled) setContaDesativada(true);
            return null;
          }
        }
        return r.ok ? r.json() : null;
      })
      .then((profile) => {
        if (!cancelled && profile) setUser(profile as AuthUser);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  /* Apenas inicializa automaticamente se a URL for um callback do Keycloak.
     Caso contrário, mantém estado "não inicializado" sem rodar nenhuma rede,
     garantindo que páginas públicas (como /login) renderizem instantaneamente. */
  useEffect(() => {
    if (urlHasAuthCallback()) {
      ensureInitialized();
    } else {
      // Marca como inicializado para que as rotas possam decidir o que fazer
      setInitialized(true);
    }

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => {
        try {
          keycloak.logout({ redirectUri: window.location.origin + "/login" });
        } catch {
          /* logout failure is non-fatal */
        }
      });
    };

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [ensureInitialized]);

  /* ─── Actions ─── */

  const appBaseUrl = import.meta.env.VITE_APP_BASE_URL ?? window.location.origin;

  async function login() {
    try {
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
    const appBaseUrl = import.meta.env.VITE_APP_BASE_URL ?? window.location.origin;
    try {
      keycloak.logout({ redirectUri: appBaseUrl });
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
    return devTokenRef.current ?? keycloak.token;
  }

  /* Registra o provider global no useApi para que TODAS as chamadas
     (api.get, api.put, etc.) incluam automaticamente o Bearer token,
     sem precisar passar manualmente em cada local. */
  useEffect(() => {
    setAuthTokenProvider(token);
  }, []);

  async function refreshProfile() {
    const tk = devTokenRef.current ?? keycloak.token;
    if (!tk) return;
    const r = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${tk}` } }).catch(
      () => null
    );
    if (!r) return;
    if (r.status === 403) {
      const body = (await r.json().catch(() => ({}))) as { message?: string };
      if (body?.message === "CONTA_DESATIVADA") {
        setContaDesativada(true);
        return;
      }
    }
    const profile = r.ok ? await r.json().catch(() => null) : null;
    if (profile) setUser(profile as AuthUser);
  }

  async function devLogin() {
    if (!import.meta.env.DEV) return;
    // Gera o JWT ANTES de marcar como autenticado para que requests
    // disparadas após o navigate() já encontrem o token pronto.
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

/* ─── Hook ─── */

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
