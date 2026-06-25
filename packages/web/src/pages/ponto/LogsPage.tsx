import React, { useState, lazy, Suspense } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Navigate } from "react-router-dom";
import {
  TerminalIcon,
  ActivityIcon,
  ZapIcon,
  ServerIcon,
  DatabaseIcon,
  KeyIcon
} from "../../components/icons";

const LogsDashboardTab = lazy(() =>
  import("./logs/LogsDashboardTab").then((m) => ({ default: m.LogsDashboardTab }))
);
const LogsEntradasTab = lazy(() =>
  import("./logs/LogsEntradasTab").then((m) => ({ default: m.LogsEntradasTab }))
);
const LogsDesempenhoTab = lazy(() =>
  import("./logs/LogsDesempenhoTab").then((m) => ({ default: m.LogsDesempenhoTab }))
);
const LogsIngestaoTab = lazy(() =>
  import("./logs/LogsIngestaoTab").then((m) => ({ default: m.LogsIngestaoTab }))
);
const LogsBackupTab = lazy(() =>
  import("./logs/LogsBackupTab").then((m) => ({ default: m.LogsBackupTab }))
);
const LogsApiServidoraTab = lazy(() =>
  import("./logs/LogsApiServidoraTab").then((m) => ({ default: m.LogsApiServidoraTab }))
);

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: <ActivityIcon size={15} /> },
  { id: "entradas", label: "Logs", icon: <TerminalIcon size={15} /> },
  { id: "desempenho", label: "Desempenho", icon: <ZapIcon size={15} /> },
  { id: "ingestao", label: "API de Ingestão", icon: <ServerIcon size={15} /> },
  { id: "backup", label: "API de Backup", icon: <DatabaseIcon size={15} /> },
  { id: "servidora", label: "API Servidora", icon: <KeyIcon size={15} /> }
] as const;

type TabId = (typeof TABS)[number]["id"];

export function LogsPage() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<TabId>("dashboard");

  if (!user?.isSuperAdmin) {
    return <Navigate to="/ponto" replace />;
  }

  // token é uma função () => string | undefined no AuthContext
  const getToken = token;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <TerminalIcon size={22} style={{ color: "#6366f1" }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
            Logs & Observabilidade
          </h1>
          <span
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: 999,
              padding: "2px 10px",
              fontSize: 11,
              fontWeight: 700
            }}
          >
            SUPER ADMIN
          </span>
        </div>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
          Monitoramento de acesso, desempenho de sistema e APIs de integração.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "2px solid var(--border, #e2e8f0)",
          marginBottom: 24,
          overflowX: "auto"
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 18px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "#6366f1" : "#64748b",
              borderBottom: tab === t.id ? "2px solid #6366f1" : "2px solid transparent",
              marginBottom: -2,
              whiteSpace: "nowrap",
              transition: "color 0.15s"
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <Suspense
        fallback={
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Carregando…</div>
        }
      >
        {tab === "dashboard" && <LogsDashboardTab getToken={getToken} />}
        {tab === "entradas" && <LogsEntradasTab getToken={getToken} />}
        {tab === "desempenho" && <LogsDesempenhoTab />}
        {tab === "ingestao" && <LogsIngestaoTab />}
        {tab === "backup" && <LogsBackupTab />}
        {tab === "servidora" && <LogsApiServidoraTab />}
      </Suspense>
    </div>
  );
}
