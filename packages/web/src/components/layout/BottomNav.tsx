import React from "react";
import { NavLink } from "react-router-dom";
import { HomeIcon, ClockIcon, CalendarIcon, BarChart2Icon, InboxIcon } from "../icons";

const ITEMS = [
  { path: "/ponto", label: "Início", icon: HomeIcon, end: true },
  { path: "/ponto/registrar", label: "Registrar", icon: ClockIcon, end: false },
  { path: "/ponto/historico", label: "Histórico", icon: CalendarIcon, end: false },
  { path: "/ponto/relatorios", label: "Relatórios", icon: BarChart2Icon, end: false },
  { path: "/ponto/solicitacoes", label: "Pedidos", icon: InboxIcon, end: false }
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {ITEMS.map(({ path, label, icon: Icon, end }) => (
        <NavLink
          key={path}
          to={path}
          end={end}
          className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
        >
          <Icon size={22} />
          <span className="bottom-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
