import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { InstitutionFooter } from "../components/InstitutionFooter";
import { useInstituicaoBranding } from "../hooks/useInstituicaoBranding";
import { formatCidadeUf } from "../utils/instituicao";

/* ─── Relógio ao vivo ─── */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return (
    <div style={{ textAlign: "center", marginTop: 20, marginBottom: 4 }}>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 52,
          color: "#ffffff",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          marginBottom: 8
        }}
      >
        {time}
      </p>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.50)",
          margin: 0
        }}
      >
        {date}
      </p>
    </div>
  );
}

/* ─── Ícones inline ─── */
function ShieldIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function ClockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function LoginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

/* ─── Logo CFO (reutiliza o padrão do Topbar) ─── */
/* ─── Badge de segurança ─── */
function SecurityBadge({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: "var(--radius-full)",
        background: "rgba(122,30,38,0.06)",
        border: "1px solid rgba(122,30,38,0.10)",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--burgundy-700)",
        whiteSpace: "nowrap" as const
      }}
    >
      {icon}
      {children}
    </span>
  );
}

/* ─── Página de Login ─── */
export function LoginPage() {
  // Página 100% estática — não depende de estado de autenticação para renderizar.
  // Os handlers chamam keycloak.login() que constrói a URL e redireciona.
  const { login, loginToBaterPonto, devLogin } = useAuth();
  const navigate = useNavigate();
  const { branding } = useInstituicaoBranding();
  const loading = false;
  const isDev = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_LOGIN === "true";
  const cidadeUf = formatCidadeUf(branding);
  const faixaInstitucional = cidadeUf
    ? `${branding.nome} \u00a0·\u00a0 ${cidadeUf}`
    : branding.nome;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--cream-50)"
      }}
    >
      {/* Cabeçalho fixo: sticky funciona aqui pois o pai NÃO tem overflow hidden */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, flexShrink: 0 }}>
        {/* ── Faixa institucional bordô ── */}
        <div
          style={{
            background: "var(--cfo-bar)",
            padding: "0 24px",
            height: 40,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.75)",
              fontFamily: "var(--font-body)",
              display: "flex",
              alignItems: "center",
              gap: 5
            }}
          >
            {faixaInstitucional}
          </span>
          <div style={{ flex: 1 }} />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 10px",
              borderRadius: 100,
              background: "var(--amber)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--ink-900)"
            }}
          >
            ⚖ Acesso à Informação — LAI 12.527/2011
          </span>
        </div>

        {/* ── Faixa branca com identidade ── */}
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid rgba(122,30,38,0.08)",
            padding: "0 32px",
            height: 76,
            display: "flex",
            alignItems: "center",
            gap: 14,
            boxShadow: "0 2px 16px rgba(10,5,6,0.07)",
            flexShrink: 0
          }}
        >
          <img
            src="/logo.png"
            alt="Logo CFO"
            style={{ height: 36, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ width: 1, height: 44, background: "rgba(122,30,38,0.10)" }} />
          <div>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                color: "var(--burgundy-600)",
                fontSize: 17,
                lineHeight: 1.2,
                margin: 0
              }}
            >
              Ponto Eletrônico
            </p>
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: 0,
                marginTop: 2
              }}
            >
              Controle de Frequência
            </p>
          </div>
        </div>
        {/* fim faixa branca */}
      </div>
      {/* fim wrapper sticky */}

      {/* ── Conteúdo central ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px"
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* Card principal */}
          <div
            style={{
              background: "#fff",
              borderRadius: "var(--radius-xl)",
              boxShadow: "0 4px 40px -8px rgba(10,5,6,0.12), 0 1px 3px rgba(10,5,6,0.06)",
              overflow: "hidden"
            }}
          >
            {/* Cabeçalho do card */}
            <div
              style={{
                background:
                  "linear-gradient(135deg, var(--burgundy-700) 0%, var(--burgundy-600) 100%)",
                padding: "20px 32px 24px",
                textAlign: "center"
              }}
            >
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  color: "#fff",
                  fontSize: 26,
                  margin: "0 0 2px",
                  fontWeight: 400
                }}
              >
                Ponto Eletrônico
              </h1>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                  margin: 0
                }}
              >
                Acesso restrito a servidores do CFO
              </p>

              {/* Relógio ao vivo */}
              <LiveClock />
            </div>

            {/* Corpo do card */}
            <div style={{ padding: "32px" }}>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--ink-500)",
                  textAlign: "center",
                  marginBottom: 28,
                  lineHeight: 1.6
                }}
              >
                Utilize sua conta institucional para acessar o sistema. A autenticação é realizada
                com segurança pelo Keycloak SSO.
              </p>

              {/* Botão: Acessar o Sistema */}
              <button
                className="btn btn-primary"
                onClick={login}
                disabled={loading}
                style={{
                  width: "100%",
                  fontSize: 15,
                  padding: "14px 22px",
                  marginBottom: 12,
                  opacity: loading ? 0.55 : 1
                }}
              >
                <LoginIcon size={18} />
                {loading ? "Aguardando…" : "Acessar o Sistema"}
              </button>

              {/* Divisor */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 12px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--cream-200)" }} />
                <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500 }}>ou</span>
                <div style={{ flex: 1, height: 1, background: "var(--cream-200)" }} />
              </div>

              {/* Botão: Registrar Ponto */}
              <button
                onClick={loginToBaterPonto}
                disabled={loading}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "13px 22px",
                  borderRadius: "var(--radius-md)",
                  border: "2px solid var(--burgundy-600)",
                  background: "transparent",
                  color: "var(--burgundy-600)",
                  fontFamily: "var(--font-body)",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 180ms cubic-bezier(0.16,1,0.3,1)",
                  opacity: loading ? 0.55 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(122,30,38,0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <ClockIcon size={18} />
                Registrar Ponto
              </button>

              {/* Nota sobre as ações */}
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-500)",
                  textAlign: "center",
                  marginTop: 14,
                  lineHeight: 1.5
                }}
              >
                Ambas as ações exigem autenticação com sua conta institucional.
              </p>
            </div>
          </div>

          {/* Badges de segurança */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap" as const,
              gap: 8,
              justifyContent: "center",
              marginTop: 20
            }}
          >
            <SecurityBadge icon={<ShieldIcon />}>Não Repúdio</SecurityBadge>
            <SecurityBadge icon={<KeyIcon />}>PKCE S256</SecurityBadge>
            <SecurityBadge icon={<ShieldIcon />}>Keycloak SSO</SecurityBadge>
          </div>

          {/* Badge Dev — visível apenas em desenvolvimento */}
          {isDev && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <button
                onClick={async () => {
                  await devLogin();
                  navigate("/ponto", { replace: true });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  borderRadius: "var(--radius-full)",
                  border: "1.5px dashed rgba(122,30,38,0.35)",
                  background: "transparent",
                  color: "var(--ink-500)",
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                  transition: "all 150ms ease"
                }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "rgba(122,30,38,0.06)";
                  b.style.color = "var(--burgundy-600)";
                  b.style.borderColor = "rgba(122,30,38,0.55)";
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.background = "transparent";
                  b.style.color = "var(--ink-500)";
                  b.style.borderColor = "rgba(122,30,38,0.35)";
                }}
                title="Acesso de desenvolvimento — não disponível em produção"
              >
                <span style={{ fontSize: 9 }}>⚙</span>
                Login Dev
              </button>
            </div>
          )}

          {/* Rodapé institucional (Configurações → Instituição) */}
          <InstitutionFooter />
        </div>
      </div>
    </div>
  );
}
