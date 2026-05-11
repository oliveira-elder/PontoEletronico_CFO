import React from "react";
import { MapPinIcon, MailIcon, PhoneIcon, SearchIcon, BellIcon, UserIcon } from "../icons";
import { useAuth } from "../../auth/AuthContext";
import { useIsMobile } from "../../hooks/useIsMobile";

/* ─── Chip (faixa 1) ─── */
function TopChip({
  icon,
  children,
  variant = "default",
  href
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "amber";
  href?: string;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 10px 3px 6px",
    borderRadius: 100,
    fontSize: 11.5,
    fontWeight: variant === "amber" ? 600 : 500,
    fontFamily: "var(--font-body)",
    whiteSpace: "nowrap",
    cursor: href ? "pointer" : "default",
    textDecoration: "none",
    ...(variant === "amber"
      ? {
          background: "var(--amber)",
          color: "var(--ink-900)",
          border: "1px solid transparent"
        }
      : {
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.16)",
          color: "rgba(255,255,255,0.90)"
        })
  };

  const content = (
    <>
      {icon && <span style={{ opacity: variant === "amber" ? 0.8 : 0.7 }}>{icon}</span>}
      {children}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={base}>
        {content}
      </a>
    );
  }
  return <span style={base}>{content}</span>;
}

/* ─── Topbar ─── */
export function Topbar() {
  const { user, logout } = useAuth();
  const isMobile = useIsMobile(768);

  /* ── Versão compacta mobile ── */
  if (isMobile) {
    return (
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          height: "60px",
          background: "#fff",
          borderBottom: "1px solid rgba(122,30,38,0.10)",
          boxShadow: "0 2px 8px rgba(10,5,6,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 10
        }}
      >
        <img src="/logo.png" alt="CFO" style={{ height: 32, width: "auto", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 15,
              lineHeight: 1.1,
              margin: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            Ponto Eletrônico
          </p>
          <p
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: 0
            }}
          >
            CFO
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--burgundy-600)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff"
            }}
          >
            <UserIcon size={15} />
          </div>
          <button
            onClick={logout}
            title="Sair"
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--burgundy-600)"
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>
    );
  }

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: "var(--topbar-h)",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 2px 16px rgba(10,5,6,0.10)"
      }}
    >
      {/* ── Faixa 1 — Bordô institucional ── */}
      <div
        style={{
          background: "var(--cfo-bar)",
          height: "var(--topbar-bar-h)",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 10,
          flexShrink: 0
        }}
      >
        <TopChip icon={<MapPinIcon size={13} />}>Brasília — DF</TopChip>
        <TopChip icon={<MailIcon size={13} />} href="mailto:ouvidoria@cfo.org.br">
          ouvidoria@cfo.org.br
        </TopChip>
        <TopChip icon={<PhoneIcon size={13} />}>CFO Odonto</TopChip>

        <div style={{ flex: 1 }} />

        {/* LAI — obrigatório por lei */}
        <TopChip variant="amber">⚖ Acesso à Informação — LAI 12.527/2011</TopChip>
      </div>

      {/* ── Faixa 2 — Branca com identidade ── */}
      <div
        style={{
          background: "#ffffff",
          flex: 1,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 16,
          borderBottom: "1px solid rgba(122,30,38,0.08)"
        }}
      >
        {/* Logo */}
        <img
          src="/logo.png"
          alt="Logo CFO"
          style={{ height: 36, width: "auto", objectFit: "contain", flexShrink: 0 }}
        />

        {/* Divisor vertical */}
        <div
          style={{
            width: 1,
            height: 52,
            background: "rgba(122,30,38,0.10)",
            flexShrink: 0
          }}
        />

        {/* Nome e subtítulo do sistema */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 18,
              lineHeight: 1.2,
              margin: 0
            }}
          >
            Ponto Eletrônico
          </p>
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: 0,
              marginTop: 2
            }}
          >
            Conselho Federal de Odontologia · Controle de Frequência
          </p>
        </div>

        <div style={{ flex: 1 }} />

        {/* Ações do header */}
        <button className="btn-icon" aria-label="Pesquisar" title="Pesquisar">
          <SearchIcon size={18} />
        </button>
        <button
          className="btn-icon"
          aria-label="Notificações"
          title="Notificações"
          style={{ position: "relative" }}
        >
          <BellIcon size={18} />
          <span
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 7,
              height: 7,
              background: "var(--red)",
              borderRadius: "50%",
              border: "1.5px solid white"
            }}
          />
        </button>

        {/* Avatar do usuário autenticado */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              border: "1px solid rgba(122,30,38,0.14)",
              minHeight: 44
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--burgundy-600)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                flexShrink: 0
              }}
            >
              <UserIcon size={16} />
            </div>
            <div style={{ textAlign: "left" }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ink-900)",
                  lineHeight: 1.2,
                  margin: 0
                }}
              >
                {user?.name || user?.username || "Usuário"}
              </p>
              <p style={{ fontSize: 11, color: "var(--ink-500)", lineHeight: 1, margin: 0 }}>
                {user?.email || "Autenticado via SSO"}
              </p>
            </div>
          </div>

          {/* Botão de logout */}
          <button
            onClick={logout}
            title="Sair do sistema"
            aria-label="Sair"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--burgundy-600)",
              transition: "all 180ms ease"
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "rgba(122,30,38,0.06)";
              b.style.borderColor = "rgba(122,30,38,0.30)";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.background = "transparent";
              b.style.borderColor = "rgba(122,30,38,0.14)";
            }}
          >
            {/* Ícone de sair (logout) */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
