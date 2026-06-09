import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

function InitSpinner() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--cream-50)",
        gap: 16
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: "3px solid var(--cream-200)",
          borderTop: "3px solid var(--burgundy-600)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }}
      />
      <p style={{ fontSize: 13, color: "var(--ink-500)", fontFamily: "var(--font-body)" }}>
        Verificando sessão…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SsoCallbackError({ error }: { error: string | null }) {
  function retry() {
    // Limpa estado obsoleto e volta ao login limpo
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("kc-callback-") || k === "oauthRedirect")
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.location.assign("/login");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--cream-50)",
        gap: 14,
        padding: "0 24px",
        textAlign: "center"
      }}
    >
      <p style={{ fontSize: 28, margin: 0 }}>⚠️</p>
      <p
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--ink-900)",
          fontFamily: "var(--font-body)",
          margin: 0
        }}
      >
        Falha ao completar o login
      </p>
      <p
        style={{ fontSize: 13, color: "var(--ink-500)", maxWidth: 460, lineHeight: 1.6, margin: 0 }}
      >
        O servidor SSO autenticou com sucesso, mas houve um erro ao processar o retorno.
      </p>
      {error && (
        <div
          style={{
            background: "rgba(200,57,63,0.06)",
            border: "1px solid rgba(200,57,63,0.20)",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            maxWidth: 520,
            fontSize: 12,
            color: "var(--red)",
            fontFamily: "var(--font-mono)",
            textAlign: "left",
            wordBreak: "break-word"
          }}
        >
          <strong style={{ display: "block", marginBottom: 4 }}>Erro técnico:</strong>
          {error}
        </div>
      )}
      <p
        style={{
          fontSize: 11.5,
          color: "var(--ink-500)",
          maxWidth: 460,
          lineHeight: 1.6,
          margin: 0
        }}
      >
        Tentar novamente fará logout completo e voltará à tela de login.
      </p>
      <button
        onClick={retry}
        style={{
          marginTop: 4,
          padding: "10px 24px",
          borderRadius: "var(--radius-md)",
          background: "var(--burgundy-600)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "var(--font-body)"
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}

function ContaDesativadaScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--cream-50)",
        gap: 16,
        padding: "0 24px",
        textAlign: "center"
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "rgba(200,57,63,0.10)",
          border: "2px solid rgba(200,57,63,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26
        }}
      >
        🔒
      </div>
      <p
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--ink-900)",
          fontFamily: "var(--font-body)",
          margin: 0
        }}
      >
        Acesso suspenso
      </p>
      <p
        style={{
          fontSize: 14,
          color: "var(--ink-600)",
          maxWidth: 420,
          lineHeight: 1.6,
          margin: 0
        }}
      >
        Sua conta foi desativada pelo RH ou administrador do sistema.
        <br />
        Entre em contato com o seu setor de Recursos Humanos para reativação.
      </p>
      <button
        onClick={onLogout}
        style={{
          marginTop: 8,
          padding: "10px 28px",
          borderRadius: "var(--radius-md)",
          background: "var(--burgundy-600)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "var(--font-body)"
        }}
      >
        Sair do sistema
      </button>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authenticated, contaDesativada, ensureInitialized, initError, logout } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(!authenticated);
  const [ssoError, setSsoError] = useState(false);

  useEffect(() => {
    if (authenticated) {
      setChecking(false);
      return;
    }

    const q = window.location.search;
    const wasCallback = q.includes("code=") || q.includes("state=") || q.includes("error=");

    let active = true;
    ensureInitialized()
      .then((auth) => {
        if (active && !auth && wasCallback) setSsoError(true);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [authenticated, ensureInitialized]);

  if (checking) return <InitSpinner />;
  if (ssoError) return <SsoCallbackError error={initError} />;
  if (contaDesativada) return <ContaDesativadaScreen onLogout={logout} />;
  if (!authenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return <>{children}</>;
}
