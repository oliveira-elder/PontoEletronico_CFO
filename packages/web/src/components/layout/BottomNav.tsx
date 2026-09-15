import React from "react";
import { NavLink } from "react-router-dom";
import {
  HomeIcon,
  ClockIcon,
  CalendarIcon,
  BarChart2Icon,
  InboxIcon,
  ActivityIcon
} from "../icons";
import { useAuth } from "../../auth/AuthContext";

const ITEMS = [
  { path: "/ponto", label: "Início", icon: HomeIcon, end: true },
  { path: "/ponto/registrar", label: "Registrar", icon: ClockIcon, end: false },
  { path: "/ponto/historico", label: "Histórico", icon: CalendarIcon, end: false },
  { path: "/ponto/relatorios", label: "Relatórios", icon: BarChart2Icon, end: false },
  { path: "/ponto/solicitacoes", label: "Pedidos", icon: InboxIcon, end: false }
];

const ITEM_DASHBOARD = {
  path: "/ponto/dashboard",
  label: "Dashboard",
  icon: ActivityIcon,
  end: false
};

export function BottomNav() {
  const { user, hasRole } = useAuth();
  const isRH =
    !!user?.isSuperAdmin ||
    hasRole("RH_AUDITORIA") ||
    hasRole("ponto-admin") ||
    hasRole("PONTO_ADMIN");
  const itens = isRH ? [...ITEMS, ITEM_DASHBOARD] : ITEMS;

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {itens.map(({ path, label, icon: Icon, end }) => (
        <NavLink
          key={path}
          to={path}
          end={end}
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <Icon size={20} />
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
