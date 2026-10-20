import React from "react";
import {
  ActivityIcon,
  BellIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  ClockIcon,
  FileTextIcon,
  HomeIcon,
  InboxIcon,
  MapPinIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UsersIcon
} from "../../icons";
import type { Estado } from "../tipos";

export type MenuId =
  | "inicio"
  | "registrar"
  | "historico"
  | "folhas"
  | "solicitacoes"
  | "manual"
  | "aprovacoes"
  | "dashboard"
  | "gestao"
  | "requisicoes"
  | "auditoria"
  | "configuracoes";

interface Item {
  id: MenuId;
  label: string;
  icon: React.ReactNode;
}

const I = (c: React.ComponentType<{ size?: number }>) => React.createElement(c, { size: 18 });

/** Itens do menu na ordem do sistema real (os administrativos aparecem conforme o perfil). */
const PRINCIPAIS: Item[] = [
  { id: "inicio", label: "Início", icon: I(HomeIcon) },
  { id: "registrar", label: "Registrar Ponto", icon: I(ClockIcon) },
  { id: "historico", label: "Histórico", icon: I(CalendarIcon) },
  { id: "folhas", label: "Folhas assinadas", icon: I(FileTextIcon) },
  { id: "solicitacoes", label: "Solicitações", icon: I(InboxIcon) },
  { id: "manual", label: "Manual do usuário", icon: I(BookOpenIcon) }
];
const GESTAO: Item[] = [{ id: "aprovacoes", label: "Aprovações", icon: I(CheckCircleIcon) }];
const RH: Item[] = [
  { id: "dashboard", label: "Dashboard", icon: I(ActivityIcon) },
  { id: "gestao", label: "Gestão", icon: I(UsersIcon) },
  { id: "requisicoes", label: "Requisições RH", icon: I(ClipboardListIcon) },
  { id: "auditoria", label: "Auditoria", icon: I(ShieldCheckIcon) },
  { id: "configuracoes", label: "Configurações", icon: I(SettingsIcon) }
];

export type PerfilTela = "funcionario" | "chefe" | "rh";

/**
 * Casca do sistema: faixa institucional, faixa branca com a identidade, menu lateral (recolhido,
 * expande com o mouse) e a área da página. Mesmos estilos e medidas da tela real de desktop.
 */
export function Shell({
  ativo,
  e,
  perfil = "funcionario",
  usuario = "Maria Souza",
  children
}: {
  ativo: MenuId;
  e: Estado;
  perfil?: PerfilTela;
  usuario?: string;
  children: React.ReactNode;
}) {
  const aberto = !!e.menuAberto;
  const itens = [
    ...PRINCIPAIS,
    ...(perfil !== "funcionario" ? GESTAO : []),
    ...(perfil === "rh" ? RH : [])
  ];
  const largura = aberto ? 240 : 64;
  return (
    <div
      style={{
        width: 1280,
        minHeight: "inherit",
        position: "relative",
        background: "var(--cream-50)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Faixa 1 — bordô institucional */}
      <div
        style={{
          background: "var(--cfo-bar)",
          height: 44,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 10
        }}
      >
        <span className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <MapPinIcon size={13} /> Brasília — DF
        </span>
        <div style={{ flex: 1 }} />
        <span className="chip chip-amber">
          🔒 Lei Geral de Proteção de Dados — LGPD 13.709/2018
        </span>
      </div>

      {/* Faixa 2 — branca com identidade */}
      <div
        style={{
          background: "#fff",
          height: 88,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 16,
          borderBottom: "1px solid rgba(122,30,38,0.08)"
        }}
      >
        <img src="/logo.png" alt="" style={{ height: 36, width: "auto", objectFit: "contain" }} />
        <div style={{ width: 1, height: 52, background: "rgba(122,30,38,0.10)" }} />
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--burgundy-600)",
              fontSize: 18,
              lineHeight: 1.2
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
              marginTop: 2
            }}
          >
            Conselho Federal de Odontologia · Controle de Frequência
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <span
          data-alvo="btn-sino"
          style={{
            position: "relative",
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.14)",
            color: "var(--burgundy-600)"
          }}
        >
          <BellIcon size={22} />
          {Number(e.sinoN) > 0 && (
            <span
              data-alvo="badge-sino"
              style={{
                position: "absolute",
                top: 0,
                right: -2,
                minWidth: 22,
                height: 20,
                padding: "0 5px",
                background: "var(--burgundy-600)",
                color: "#fff",
                borderRadius: 10,
                border: "2px solid #fff",
                fontSize: 10.5,
                fontWeight: 700,
                lineHeight: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              {String(e.sinoN)}
            </span>
          )}
        </span>
        <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              minHeight: 44
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--burgundy-600)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600
              }}
            >
              {usuario[0]}
            </span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>{usuario}</p>
              <p style={{ fontSize: 11, color: "var(--ink-500)", lineHeight: 1 }}>
                {usuario.toLowerCase().replace(" ", ".")}@cfo.org.br
              </p>
            </div>
          </div>
          {[<BookOpenIcon key="a" size={16} />, <ShieldCheckIcon key="t" size={16} />].map(
            (ic, i) => (
              <span
                key={i}
                data-alvo={i === 0 ? "btn-ajuda" : "btn-termos"}
                style={{
                  width: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.14)",
                  color: "var(--burgundy-600)"
                }}
              >
                {ic}
              </span>
            )
          )}
        </div>
      </div>

      {!!e.sinoAberto && (
        <div
          data-alvo="popover-sino"
          style={{
            position: "absolute",
            top: 126,
            right: 360,
            width: 320,
            zIndex: 45,
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.14)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 14px 10px",
              borderBottom: "1px solid rgba(122,30,38,0.08)"
            }}
          >
            <BellIcon size={15} style={{ color: "var(--burgundy-600)" }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Notificações</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                background: "var(--red)",
                color: "#fff",
                borderRadius: 10,
                padding: "1px 6px"
              }}
            >
              {String(e.sinoN ?? 3)}
            </span>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", gap: 8 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--burgundy-600)",
                marginTop: 5,
                flexShrink: 0
              }}
            />
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>
                Folha de ponto de setembro/2026 aguarda a sua assinatura
              </p>
              <p style={{ fontSize: 11.5, color: "var(--ink-500)", lineHeight: 1.4 }}>
                Abra o Histórico para revisar e assinar.
              </p>
              <p style={{ fontSize: 10.5, color: "#9ca3af" }}>há 2 horas</p>
            </div>
          </div>
          <div
            data-alvo="ver-todas"
            style={{
              padding: "10px 14px",
              borderTop: "1px solid rgba(122,30,38,0.08)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--burgundy-600)",
              textAlign: "center",
              background: "var(--cream-50)"
            }}
          >
            Ver todas as notificações →
          </div>
        </div>
      )}

      {/* Menu lateral */}
      <aside
        data-alvo="menu-lateral"
        style={{
          position: "absolute",
          left: 0,
          top: 132,
          bottom: 0,
          width: largura,
          background: "var(--burgundy-900)",
          zIndex: 30,
          padding: 6,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "hidden",
          transition: "width 220ms cubic-bezier(0.16, 1, 0.3, 1)"
        }}
      >
        {itens.map((it) => (
          <div
            key={it.id}
            data-alvo={`menu-${it.id}`}
            className={`sidebar-item mk-sidebar-item${it.id === ativo ? " active" : ""}`}
            style={{
              padding: aberto ? "10px 12px" : "10px 0",
              justifyContent: aberto ? "flex-start" : "center"
            }}
          >
            <span className="sidebar-icon">{it.icon}</span>
            {aberto && <span className="sidebar-label">{it.label}</span>}
          </div>
        ))}
      </aside>

      {/* Página */}
      <main
        style={{
          flex: 1,
          marginLeft: 64,
          padding: "32px 32px 40px",
          background: "var(--cream-50)"
        }}
      >
        {children}
      </main>
    </div>
  );
}
