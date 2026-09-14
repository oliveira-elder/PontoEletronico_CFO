import React from "react";

/** Tela de espera do boot/SSO — fundo cream para não parecer “tela branca”. */
export function PageSpinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--cream-50, #fbf8f4)",
        gap: 16
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: "3px solid var(--cream-200, #eadfd0)",
          borderTop: "3px solid var(--burgundy-600, #7a1e26)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }}
      />
      <p
        style={{
          fontSize: 13,
          color: "var(--ink-500, #6b5e55)",
          fontFamily: "var(--font-body, system-ui, sans-serif)"
        }}
      >
        {label}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
