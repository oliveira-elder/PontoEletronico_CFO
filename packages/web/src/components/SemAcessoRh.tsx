import React from "react";

/** Página de RH sem nenhuma aba liberada no Perfil do RH do usuário. */
export function SemAcessoRh({ pagina }: { pagina: string }) {
  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: "0 16px" }}>
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.12)",
          padding: "32px 28px",
          textAlign: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)"
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-900)", margin: "0 0 8px" }}>
          Sem acesso a esta página
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, margin: 0 }}>
          O seu perfil do RH não libera nenhuma aba de <strong>{pagina}</strong>. Fale com o Gerente
          de RH para ajustar o seu perfil.
        </p>
      </div>
    </div>
  );
}
