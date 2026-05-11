import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  HomeIcon,
  ClockIcon,
  CalendarIcon,
  BarChart2Icon,
  InboxIcon,
  UsersIcon,
  SettingsIcon,
  LogOutIcon
} from "../icons";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const mainNav: NavItem[] = [
  { path: "/ponto", label: "Início", icon: <HomeIcon size={18} /> },
  { path: "/ponto/registrar", label: "Registrar Ponto", icon: <ClockIcon size={18} /> },
  { path: "/ponto/historico", label: "Histórico", icon: <CalendarIcon size={18} /> },
  { path: "/ponto/relatorios", label: "Relatórios", icon: <BarChart2Icon size={18} /> },
  { path: "/ponto/solicitacoes", label: "Solicitações", icon: <InboxIcon size={18} /> }
];

const adminNav: NavItem[] = [
  { path: "/ponto/gestao", label: "Gestão", icon: <UsersIcon size={18} />, adminOnly: true }
];

const bottomNav: NavItem[] = [
  { path: "/ponto/configuracoes", label: "Configurações", icon: <SettingsIcon size={18} /> }
];

/* ─── Single nav link ─── */
function SidebarLink({ item, expanded }: { item: NavItem; expanded: boolean }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === "/ponto"}
      className={({ isActive }) => `sidebar-item${isActive ? " active" : ""}`}
      data-tooltip={!expanded ? item.label : undefined}
      title={!expanded ? item.label : undefined}
      style={{
        padding: expanded ? "10px 12px" : "10px 0",
        justifyContent: expanded ? "flex-start" : "center"
      }}
    >
      <span className="sidebar-icon">{item.icon}</span>
      {expanded && <span className="sidebar-label">{item.label}</span>}
    </NavLink>
  );
}

/* ─── Sidebar ─── */
export function Sidebar({ onExpandChange }: { onExpandChange?: (v: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);

  function setExp(v: boolean) {
    setExpanded(v);
    onExpandChange?.(v);
  }

  return (
    <aside
      onMouseEnter={() => setExp(true)}
      onMouseLeave={() => setExp(false)}
      className={expanded ? "" : "sidebar-collapsed"}
      style={{
        position: "fixed",
        left: 0,
        top: "var(--topbar-h)",
        height: "calc(100vh - var(--topbar-h))",
        width: expanded ? "var(--sidebar-expanded)" : "var(--sidebar-collapsed)",
        background: "var(--burgundy-900)",
        zIndex: 40,
        transition: "width 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 6,
        gap: 2
      }}
    >
      {/* ── Brand area — espelha o topbar ── */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        {/* Faixa branca com identidade */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "var(--radius-lg)",
            height: 52,
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            gap: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--burgundy-600)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                color: "white",
                fontSize: 11,
                lineHeight: 1
              }}
            >
              PE
            </span>
          </div>
          {expanded && (
            <div style={{ overflow: "hidden" }}>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontStyle: "italic",
                  color: "var(--burgundy-600)",
                  fontSize: 12.5,
                  lineHeight: 1.2,
                  margin: 0,
                  whiteSpace: "nowrap"
                }}
              >
                Ponto Eletrônico
              </p>
              <p
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink-500)",
                  margin: 0,
                  whiteSpace: "nowrap"
                }}
              >
                CFO · Frequência
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Navegação principal ── */}
      <nav
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
          overflowX: "hidden"
        }}
      >
        {mainNav.map((item) => (
          <SidebarLink key={item.path} item={item} expanded={expanded} />
        ))}

        {/* Seção admin */}
        {adminNav.length > 0 && (
          <>
            {expanded && (
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.28)",
                  padding: "12px 12px 4px",
                  margin: 0,
                  whiteSpace: "nowrap"
                }}
              >
                Administração
              </p>
            )}
            {!expanded && <div style={{ height: 12 }} />}
            {adminNav.map((item) => (
              <SidebarLink key={item.path} item={item} expanded={expanded} />
            ))}
          </>
        )}
      </nav>

      {/* ── Rodapé ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0
        }}
      >
        {bottomNav.map((item) => (
          <SidebarLink key={item.path} item={item} expanded={expanded} />
        ))}

        {/* Sair */}
        <button
          className="sidebar-item"
          data-tooltip={!expanded ? "Sair" : undefined}
          style={{
            padding: expanded ? "10px 12px" : "10px 0",
            justifyContent: expanded ? "flex-start" : "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            width: "100%",
            color: "rgba(255,255,255,0.50)"
          }}
          aria-label="Sair do sistema"
        >
          <span className="sidebar-icon">
            <LogOutIcon size={18} />
          </span>
          {expanded && <span className="sidebar-label">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
