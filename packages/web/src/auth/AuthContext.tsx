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
        realm_access: { roles: ["funcionario", "admin", "gestor", "intranet_admin"] }
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
  username: string;
  roles: string[];
}

interface AuthContextType {
  initialized: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  token: () => string | undefined;
  ensureInitialized: () => Promise<boolean>;
  login: () => void;
  loginToBaterPonto: () => void;
  logout: () => void;
  hasRole: (role: string) => boolean;
  devLogin: () => Promise<void>;
}

/* ─── Helpers ─── */

interface KcToken {
  sub?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles: string[] };
}
function parseUser(): AuthUser | null {
  const p = keycloak.tokenParsed as KcToken | undefined;
  if (!p) return null;
  return {
    id: p.sub ?? "",
    name: p.name ?? p.preferred_username ?? "",
    email: p.email ?? "",
    username: p.preferred_username ?? "",
    roles: p.realm_access?.roles ?? []
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
  const [user, setUser] = useState<AuthUser | null>(null);

  // Guards e estado interno (não causam re-render)
  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const devTokenRef = useRef<string | undefined>(undefined);

  /* Renova token 60s antes do vencimento; desconecta se falhar (confidencialidade) */
  const startTokenRefresh = useCallback(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(async () => {
      try {
        await keycloak.updateToken(60);
      } catch {
        try {
          keycloak.logout({ redirectUri: window.location.origin + "/login" });
        } catch {
          /* logout failure is non-fatal */
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

    initPromiseRef.current = keycloak
      .init({
        pkceMethod: "S256",
        checkLoginIframe: false,
        responseMode: "query"
      })
      .then((auth: boolean) => {
        setAuthenticated(auth);
        if (auth) {
          setUser(parseUser());
          startTokenRefresh();
        }
        setInitialized(true);
        return auth;
      })
      .catch((err: unknown) => {
        console.warn("[Auth] Keycloak init falhou:", err);
        setInitialized(true);
        return false;
      });

    return initPromiseRef.current as Promise<boolean>;
  }, [startTokenRefresh, authenticated]);

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

  function login() {
    try {
      keycloak.login({ redirectUri: window.location.origin + "/ponto" });
    } catch (e) {
      console.error("[Auth] Falha ao iniciar login:", e);
      alert(
        `Não foi possível conectar ao servidor de autenticação.\nURL: ${import.meta.env.VITE_KEYCLOAK_URL}\nRealm: ${import.meta.env.VITE_KEYCLOAK_REALM}\n\nVerifique se o servidor SSO está acessível e se o realm e o client "ponto-web" foram criados.`
      );
    }
  }

  function loginToBaterPonto() {
    try {
      keycloak.login({ redirectUri: window.location.origin + "/ponto/registrar" });
    } catch (e) {
      console.error("[Auth] Falha ao iniciar login:", e);
      alert(
        `Não foi possível conectar ao servidor de autenticação.\nURL: ${import.meta.env.VITE_KEYCLOAK_URL}\nRealm: ${import.meta.env.VITE_KEYCLOAK_REALM}\n\nVerifique se o servidor SSO está acessível e se o realm e o client "ponto-web" foram criados.`
      );
    }
  }

  function logout() {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    try {
      keycloak.logout({ redirectUri: window.location.origin + "/login" });
    } catch {
      window.location.assign("/login");
    }
  }

  function hasRole(role: string): boolean {
    return user?.roles.includes(role) ?? false;
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
      username: "dev",
      roles: ["funcionario", "admin"]
    });
    setAuthenticated(true);
    setInitialized(true);
  }

  return (
    <AuthContext.Provider
      value={{
        initialized,
        authenticated,
        user,
        token,
        ensureInitialized,
        login,
        loginToBaterPonto,
        logout,
        hasRole,
        devLogin
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
