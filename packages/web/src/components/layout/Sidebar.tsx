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
  LogOutIcon,
  ShieldCheckIcon,
  CheckCircleIcon
} from "../icons";
import { useAuth } from "../../auth/AuthContext";

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const mainNav: NavItem[] = [
  { path: "/ponto", label: "Início", icon: <HomeIcon size={18} /> },
  { path: "/ponto/registrar", label: "Registrar Ponto", icon: <ClockIcon size={18} /> },
  { path: "/ponto/historico", label: "Histórico", icon: <CalendarIcon size={18} /> },
  { path: "/ponto/relatorios", label: "Relatórios", icon: <BarChart2Icon size={18} /> },
  { path: "/ponto/solicitacoes", label: "Solicitações", icon: <InboxIcon size={18} /> }
];

/* Aprovações: exibidas para gestores (GESTOR_APROVACAO, isManager) */
const aprovacaoNav: NavItem[] = [
  { path: "/ponto/aprovacoes", label: "Aprovações", icon: <CheckCircleIcon size={18} /> }
];

/* Gestão de funcionários: apenas RH (RH_AUDITORIA) e admins/super admin */
const gestaoRhNav: NavItem[] = [
  { path: "/ponto/gestao", label: "Gestão", icon: <UsersIcon size={18} /> }
];

/* Auditoria: apenas para RH e admins */
const auditoriaNav: NavItem[] = [
  { path: "/ponto/auditoria", label: "Auditoria", icon: <ShieldCheckIcon size={18} /> }
];

/* Itens administrativos: apenas para admins/super admin */
const adminNav: NavItem[] = [
  { path: "/ponto/usuarios", label: "Usuários / Grupos", icon: <UsersIcon size={18} /> }
];

/* Configurações: apenas admin */
const adminBottomNav: NavItem[] = [
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
  const { user, hasRole, logout } = useAuth();

  const isAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  // PROVISÓRIO: isManager via campo do Funcionario enquanto responsavelUserId não está configurado
  const isManagerProvisorio = !!user?.funcionario?.isManager;
  const isGestor =
    isAdmin ||
    hasRole("gestor") ||
    hasRole("GESTOR_APROVACAO") ||
    hasRole("RH_AUDITORIA") ||
    isManagerProvisorio;
  const isRH = isAdmin || hasRole("RH_AUDITORIA");

  const visibleAprovacaoNav = isGestor ? aprovacaoNav : [];
  const visibleGestaoRhNav = isRH ? gestaoRhNav : [];
  const visibleAuditoriaNav = isRH ? auditoriaNav : [];
  const visibleAdminNav = isAdmin ? adminNav : [];
  const visibleAdminBottomNav = isAdmin ? adminBottomNav : [];

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

        {/* Seção administração */}
        {(visibleAprovacaoNav.length > 0 ||
          visibleGestaoRhNav.length > 0 ||
          visibleAuditoriaNav.length > 0 ||
          visibleAdminNav.length > 0) && (
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
            {visibleAprovacaoNav.map((item) => (
              <SidebarLink key={item.path} item={item} expanded={expanded} />
            ))}
            {visibleGestaoRhNav.map((item) => (
              <SidebarLink key={item.path} item={item} expanded={expanded} />
            ))}
            {visibleAuditoriaNav.map((item) => (
              <SidebarLink key={item.path} item={item} expanded={expanded} />
            ))}
            {visibleAdminNav.map((item) => (
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
        {visibleAdminBottomNav.map((item) => (
          <SidebarLink key={item.path} item={item} expanded={expanded} />
        ))}

        {/* Sair */}
        <button
          className="sidebar-item"
          onClick={logout}
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
