import React, { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { RequireAuth } from "../components/auth/RequireAuth";
import { RouteErrorPage } from "../components/RouteErrorPage";
import { LoginPage } from "../pages/LoginPage";
import { VerificarDocumentoPage } from "../pages/VerificarDocumentoPage";
import { DashboardPage } from "../pages/ponto/DashboardPage";
import { RegistroPontoPage } from "../pages/ponto/RegistroPontoPage";

/* Páginas pesadas fora do grafo inicial — o retorno do SSO não espera Auditoria (~10k linhas). */
const HistoricoPage = lazy(() =>
  import("../pages/ponto/HistoricoPage").then((m) => ({ default: m.HistoricoPage }))
);
const RelatoriosPage = lazy(() =>
  import("../pages/ponto/RelatoriosPage").then((m) => ({ default: m.RelatoriosPage }))
);
const SolicitacoesPage = lazy(() =>
  import("../pages/ponto/SolicitacoesPage").then((m) => ({ default: m.SolicitacoesPage }))
);
const GestaoPage = lazy(() =>
  import("../pages/ponto/GestaoPage").then((m) => ({ default: m.GestaoPage }))
);
const FuncionarioFormPage = lazy(() =>
  import("../pages/ponto/FuncionarioFormPage").then((m) => ({ default: m.FuncionarioFormPage }))
);
const GerenciasPage = lazy(() =>
  import("../pages/ponto/GerenciasPage").then((m) => ({ default: m.GerenciasPage }))
);
const ConfiguracoesPage = lazy(() =>
  import("../pages/ponto/ConfiguracoesPage").then((m) => ({ default: m.ConfiguracoesPage }))
);
const PerfisRhPage = lazy(() =>
  import("../pages/ponto/PerfisRhPage").then((m) => ({ default: m.PerfisRhPage }))
);
const GestaoUsuariosPage = lazy(() =>
  import("../pages/ponto/GestaoUsuariosPage").then((m) => ({ default: m.GestaoUsuariosPage }))
);
const AuditoriaPage = lazy(() =>
  import("../pages/ponto/AuditoriaPage").then((m) => ({ default: m.AuditoriaPage }))
);
const DashboardConsolidadoPage = lazy(() =>
  import("../pages/ponto/DashboardConsolidadoPage").then((m) => ({
    default: m.DashboardConsolidadoPage
  }))
);
const AprovacaoGestorPage = lazy(() =>
  import("../pages/ponto/AprovacaoGestorPage").then((m) => ({ default: m.AprovacaoGestorPage }))
);
const FolhasAssinadasPage = lazy(() =>
  import("../pages/ponto/FolhasAssinadasPage").then((m) => ({ default: m.FolhasAssinadasPage }))
);
const BancoHorasPage = lazy(() =>
  import("../pages/ponto/BancoHorasPage").then((m) => ({ default: m.BancoHorasPage }))
);
const DocumentosRhPage = lazy(() =>
  import("../pages/ponto/DocumentosRhPage").then((m) => ({ default: m.DocumentosRhPage }))
);
const RequisicaoRhAdminPage = lazy(() =>
  import("../pages/ponto/RequisicaoRhAdminPage").then((m) => ({ default: m.RequisicaoRhAdminPage }))
);
const MinhasRequisicoesRhPage = lazy(() =>
  import("../pages/ponto/MinhasRequisicoesRhPage").then((m) => ({
    default: m.MinhasRequisicoesRhPage
  }))
);
const LogsPage = lazy(() =>
  import("../pages/ponto/LogsPage").then((m) => ({ default: m.LogsPage }))
);
const NotificacoesPage = lazy(() =>
  import("../pages/ponto/NotificacoesPage").then((m) => ({ default: m.NotificacoesPage }))
);
const SistemaSuperAdminPage = lazy(() =>
  import("../pages/ponto/SistemaSuperAdminPage").then((m) => ({ default: m.SistemaSuperAdminPage }))
);

export const router = createBrowserRouter([
  /* Página de login — pública */
  { path: "/login", element: <LoginPage />, errorElement: <RouteErrorPage /> },

  /* Verificação pública de documento assinado (QR Code) — sem login */
  {
    path: "/verificar/:codigo?",
    element: <VerificarDocumentoPage />,
    errorElement: <RouteErrorPage />
  },

  /* Redireciona raiz para /login */
  { path: "/", element: <Navigate to="/login" replace /> },

  /* Sistema de Ponto Eletrônico — protegido */
  {
    path: "/ponto",
    errorElement: <RouteErrorPage />,
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "registrar", element: <RegistroPontoPage /> },
      { path: "historico", element: <HistoricoPage /> },
      { path: "banco-horas", element: <BancoHorasPage /> },
      { path: "folhas-assinadas", element: <FolhasAssinadasPage /> },
      { path: "saude-ocupacional", element: <Navigate to="/ponto/auditoria" replace /> },
      { path: "documentos-rh", element: <DocumentosRhPage /> },
      { path: "relatorios", element: <RelatoriosPage /> },
      { path: "solicitacoes", element: <SolicitacoesPage /> },
      { path: "gestao", element: <GestaoPage /> },
      { path: "gestao/novo", element: <FuncionarioFormPage /> },
      { path: "gestao/:id/editar", element: <FuncionarioFormPage /> },
      { path: "gerencias", element: <GerenciasPage /> },
      { path: "usuarios", element: <GestaoUsuariosPage /> },
      { path: "perfis-rh", element: <PerfisRhPage /> },
      { path: "sistema", element: <SistemaSuperAdminPage /> },
      { path: "configuracoes", element: <ConfiguracoesPage /> },
      { path: "auditoria", element: <AuditoriaPage /> },
      { path: "dashboard", element: <DashboardConsolidadoPage /> },
      { path: "aprovacoes", element: <AprovacaoGestorPage /> },
      { path: "requisicoes-rh", element: <RequisicaoRhAdminPage /> },
      { path: "minhas-requisicoes", element: <MinhasRequisicoesRhPage /> },
      { path: "logs", element: <LogsPage /> },
      { path: "notificacoes", element: <NotificacoesPage /> }
    ]
  }
]);
