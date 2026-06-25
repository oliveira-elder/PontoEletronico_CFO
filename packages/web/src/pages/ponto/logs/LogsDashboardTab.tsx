import React, { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { api } from "../../../hooks/useApi";
import { useLogsStream, LogStreamEvent } from "../../../hooks/useLogsStream";
import { ActivityIcon, RefreshCwIcon } from "../../../components/icons";

interface DashboardData {
  volumeDiario: { date: string; category: string; count: number }[];
  categoryCounts: { category: string; count: number }[];
  topPaths: { path: string; count: number }[];
  topUsers: { username: string; count: number }[];
  totalRequests: number;
  avgLatencyMs: number;
}

interface SystemMetrics {
  uptimeSeconds: number;
  memoryHeapUsedMb: number;
  memoryHeapTotalMb: number;
  memoryRssMb: number;
  timestamp: string;
}

const CATEGORY_COLOR: Record<string, string> = {
  SUCCESS: "#22c55e",
  FAILURE: "#f59e0b",
  ERROR: "#ef4444"
};

function formatUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function buildChartData(raw: DashboardData["volumeDiario"]) {
  const byDate: Record<string, { date: string; SUCCESS: number; FAILURE: number; ERROR: number }> =
    {};
  for (const r of raw) {
    if (!byDate[r.date]) byDate[r.date] = { date: r.date, SUCCESS: 0, FAILURE: 0, ERROR: 0 };
    (byDate[r.date] as Record<string, number | string>)[r.category] = r.count;
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

export function LogsDashboardTab({ getToken }: { getToken?: () => string | undefined }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [liveLog, setLiveLog] = useState<LogStreamEvent | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<DashboardData>("/logs/dashboard");
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const m = await api.get<SystemMetrics>("/logs/metrics/system");
      setMetrics(m);
    } catch {
      // ignora falha silenciosa de métricas
    }
  }, []);

  useEffect(() => {
    void load();
    void loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, [load, loadMetrics]);

  useLogsStream(getToken, (e) => setLiveLog(e));

  const chartData = data ? buildChartData(data.volumeDiario) : [];
  const success = data?.categoryCounts.find((c) => c.category === "SUCCESS")?.count ?? 0;
  const failure = data?.categoryCounts.find((c) => c.category === "FAILURE")?.count ?? 0;
  const error = data?.categoryCounts.find((c) => c.category === "ERROR")?.count ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Cards principais */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 16
        }}
      >
        <StatCard
          label="Total Requisições (30d)"
          value={data?.totalRequests ?? "—"}
          color="#6366f1"
        />
        <StatCard
          label="Latência Média (30d)"
          value={data ? `${data.avgLatencyMs}ms` : "—"}
          color="#06b6d4"
        />
        <StatCard label="Sucesso" value={success} color="#22c55e" />
        <StatCard label="Falha (4xx)" value={failure} color="#f59e0b" />
        <StatCard label="Erro (5xx)" value={error} color="#ef4444" />
        <StatCard
          label="Memória Heap"
          value={metrics ? `${metrics.memoryHeapUsedMb}/${metrics.memoryHeapTotalMb}MB` : "—"}
          color="#8b5cf6"
        />
        <StatCard
          label="RSS Total"
          value={metrics ? `${metrics.memoryRssMb}MB` : "—"}
          color="#64748b"
        />
        <StatCard
          label="Uptime"
          value={metrics ? formatUptime(metrics.uptimeSeconds) : "—"}
          color="#0ea5e9"
        />
      </div>

      {/* Indicador ao vivo */}
      {liveLog && (
        <div
          style={{
            background: "var(--surface-raised, #f8fafc)",
            border: "1px solid var(--border, #e2e8f0)",
            borderLeft: `4px solid ${CATEGORY_COLOR[liveLog.category] ?? "#6366f1"}`,
            borderRadius: 8,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13
          }}
        >
          <ActivityIcon size={16} style={{ color: CATEGORY_COLOR[liveLog.category] }} />
          <span style={{ fontWeight: 600 }}>{liveLog.method}</span>
          <span style={{ color: "#64748b" }}>{liveLog.path}</span>
          <CategoryBadge category={liveLog.category} />
          <span style={{ color: "#94a3b8", marginLeft: "auto" }}>{liveLog.durationMs}ms</span>
          <span style={{ color: "#94a3b8" }}>{liveLog.username ?? "—"}</span>
        </div>
      )}

      {/* Gráfico de volume diário */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: 20,
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            Volume Diário — últimos 30 dias
          </h3>
          <button
            onClick={load}
            disabled={loading}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
          >
            <RefreshCwIcon size={16} />
          </button>
        </div>
        {loading ? (
          <div
            style={{
              height: 220,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8"
            }}
          >
            Carregando...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="SUCCESS"
                stackId="1"
                stroke="#22c55e"
                fill="#dcfce7"
                name="Sucesso"
              />
              <Area
                type="monotone"
                dataKey="FAILURE"
                stackId="1"
                stroke="#f59e0b"
                fill="#fef9c3"
                name="Falha"
              />
              <Area
                type="monotone"
                dataKey="ERROR"
                stackId="1"
                stroke="#ef4444"
                fill="#fee2e2"
                name="Erro"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top paths + top users */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <RankList
          title="Top Endpoints"
          items={data?.topPaths.map((p) => ({ label: p.path, value: p.count })) ?? []}
        />
        <RankList
          title="Top Usuários"
          items={data?.topUsers.map((u) => ({ label: u.username, value: u.count })) ?? []}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface-raised, #f8fafc)",
        border: "1px solid var(--border, #e2e8f0)",
        borderTop: `3px solid ${color}`,
        borderRadius: 10,
        padding: "16px 18px"
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#64748b",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    SUCCESS: { bg: "#dcfce7", text: "#15803d" },
    FAILURE: { bg: "#fef9c3", text: "#92400e" },
    ERROR: { bg: "#fee2e2", text: "#991b1b" }
  };
  const c = colors[category] ?? { bg: "#f1f5f9", text: "#475569" };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 600
      }}
    >
      {category}
    </span>
  );
}

function RankList({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div
      style={{
        background: "var(--surface-raised, #f8fafc)",
        borderRadius: 12,
        padding: 16,
        border: "1px solid var(--border, #e2e8f0)"
      }}
    >
      <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>{title}</h4>
      {items.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13 }}>Sem dados</div>}
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              marginBottom: 2
            }}
          >
            <span
              style={{
                color: "#334155",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "75%"
              }}
            >
              {item.label}
            </span>
            <span style={{ color: "#64748b", fontWeight: 600 }}>{item.value}</span>
          </div>
          <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2 }}>
            <div
              style={{
                height: "100%",
                width: `${(item.value / max) * 100}%`,
                background: "#6366f1",
                borderRadius: 2
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
