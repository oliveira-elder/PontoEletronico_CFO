import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { RequireAuth } from "../components/auth/RequireAuth";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/ponto/DashboardPage";
import { RegistroPontoPage } from "../pages/ponto/RegistroPontoPage";
import { HistoricoPage } from "../pages/ponto/HistoricoPage";
import { RelatoriosPage } from "../pages/ponto/RelatoriosPage";
import { SolicitacoesPage } from "../pages/ponto/SolicitacoesPage";
import { GestaoPage } from "../pages/ponto/GestaoPage";
import { GerenciasPage } from "../pages/ponto/GerenciasPage";
import { ConfiguracoesPage } from "../pages/ponto/ConfiguracoesPage";
import { GestaoUsuariosPage } from "../pages/ponto/GestaoUsuariosPage";
import { AuditoriaPage } from "../pages/ponto/AuditoriaPage";
import { AprovacaoGestorPage } from "../pages/ponto/AprovacaoGestorPage";

export const router = createBrowserRouter([
  /* Página de login — pública */
  { path: "/login", element: <LoginPage /> },

  /* Redireciona raiz para /login */
  { path: "/", element: <Navigate to="/login" replace /> },

  /* Sistema de Ponto Eletrônico — protegido */
  {
    path: "/ponto",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "registrar", element: <RegistroPontoPage /> },
      { path: "historico", element: <HistoricoPage /> },
      { path: "relatorios", element: <RelatoriosPage /> },
      { path: "solicitacoes", element: <SolicitacoesPage /> },
      { path: "gestao", element: <GestaoPage /> },
      { path: "gerencias", element: <GerenciasPage /> },
      { path: "usuarios", element: <GestaoUsuariosPage /> },
      { path: "configuracoes", element: <ConfiguracoesPage /> },
      { path: "auditoria", element: <AuditoriaPage /> },
      { path: "aprovacoes", element: <AprovacaoGestorPage /> }
    ]
  }
]);
