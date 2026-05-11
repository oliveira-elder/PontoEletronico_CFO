import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

/* Spinner mínimo enquanto valida sessão */
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

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authenticated, ensureInitialized } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(!authenticated);

  useEffect(() => {
    // Se já autenticado (ex: devLogin), não precisa inicializar o Keycloak
    if (authenticated) {
      setChecking(false);
      return;
    }

    let active = true;
    ensureInitialized().finally(() => {
      if (active) setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [authenticated, ensureInitialized]);

  if (checking) return <InitSpinner />;

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
