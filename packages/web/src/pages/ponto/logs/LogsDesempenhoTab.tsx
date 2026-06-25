import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import { api } from "../../../hooks/useApi";
import { RefreshCwIcon, ZapIcon } from "../../../components/icons";
import { formatHourLabelBrasilia } from "../../../utils/horario-brasilia";

interface PerformanceData {
  volumePorHora: { hour: string; count: number }[];
  latenciaPorHora: { hour: string; avgMs: number }[];
  p50: number;
  p95: number;
  maxMs: number;
  totalRequests: number;
  totalErrors: number;
  totalFailures: number;
  taxaErro: string;
  taxaFalha: string;
}

function hourLabel(iso: string) {
  return formatHourLabelBrasilia(iso);
}

export function LogsDesempenhoTab() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<PerformanceData>("/logs/performance");
      setData(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const barData = (data?.volumePorHora ?? []).map((r) => ({
    hora: hourLabel(r.hour),
    requisicoes: r.count
  }));

  const lineData = (data?.latenciaPorHora ?? []).map((r) => ({
    hora: hourLabel(r.hour),
    latencia: r.avgMs
  }));

  const taxaErroNum = parseFloat(data?.taxaErro ?? "0");
  const taxaFalhaNum = parseFloat(data?.taxaFalha ?? "0");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Cards de indicadores */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 14
        }}
      >
        <PerfCard label="Total Req (24h)" value={data?.totalRequests ?? "—"} color="#6366f1" />
        <PerfCard label="Erros (5xx)" value={data?.totalErrors ?? "—"} color="#ef4444" />
        <PerfCard label="Falhas (4xx)" value={data?.totalFailures ?? "—"} color="#f59e0b" />
        <PerfCard
          label="Taxa de Erro"
          value={data ? `${data.taxaErro}%` : "—"}
          color={taxaErroNum > 5 ? "#ef4444" : "#22c55e"}
        />
        <PerfCard
          label="Taxa de Falha"
          value={data ? `${data.taxaFalha}%` : "—"}
          color={taxaFalhaNum > 10 ? "#f59e0b" : "#22c55e"}
        />
        <PerfCard label="P50 (ms)" value={data ? `${data.p50}ms` : "—"} color="#06b6d4" />
        <PerfCard
          label="P95 (ms)"
          value={data ? `${data.p95}ms` : "—"}
          color={data && data.p95 > 1000 ? "#f59e0b" : "#06b6d4"}
        />
        <PerfCard
          label="Max (ms)"
          value={data ? `${data.maxMs}ms` : "—"}
          color={data && data.maxMs > 3000 ? "#ef4444" : "#64748b"}
        />
      </div>

      {/* Gauge de latência visual */}
      {data && (
        <div
          style={{
            background: "var(--surface-raised, #f8fafc)",
            border: "1px solid var(--border, #e2e8f0)",
            borderRadius: 12,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 32
          }}
        >
          <ZapIcon size={28} style={{ color: "#6366f1" }} />
          <LatencyBar label="P50" value={data.p50} max={data.maxMs} color="#22c55e" />
          <LatencyBar label="P95" value={data.p95} max={data.maxMs} color="#f59e0b" />
          <LatencyBar label="Max" value={data.maxMs} max={data.maxMs} color="#ef4444" />
        </div>
      )}

      {/* Gráfico de volume por hora */}
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
            Volume de Requisições por Hora (últimas 24h)
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
          <Skeleton />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="requisicoes" fill="#6366f1" name="Requisições" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico de latência por hora */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: 20,
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
          Latência Média por Hora (ms)
        </h3>
        {loading ? (
          <Skeleton />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="ms" />
              <Tooltip formatter={(v) => [`${v}ms`, "Latência Média"]} />
              <Legend />
              <Line
                type="monotone"
                dataKey="latencia"
                stroke="#06b6d4"
                strokeWidth={2}
                dot={false}
                name="Latência (ms)"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Linha do tempo de percentis */}
      {data && (
        <div
          style={{
            background: "var(--surface-raised, #f8fafc)",
            borderRadius: 12,
            padding: 20,
            border: "1px solid var(--border, #e2e8f0)"
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>
            Distribuição de Latência (últimas 24h)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <PercentileCard
              label="P50 — mediana"
              value={data.p50}
              description="50% das requisições respondem abaixo deste valor"
              color="#22c55e"
            />
            <PercentileCard
              label="P95 — cauda"
              value={data.p95}
              description="95% das requisições respondem abaixo deste valor"
              color="#f59e0b"
            />
            <PercentileCard
              label="Máximo observado"
              value={data.maxMs}
              description="A requisição mais lenta no período"
              color="#ef4444"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PerfCard({
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
        padding: "14px 16px"
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
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function LatencyBar({
  label,
  value,
  max,
  color
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{value}ms</span>
      </div>
      <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: "width 0.5s"
          }}
        />
      </div>
    </div>
  );
}

function PercentileCard({
  label,
  value,
  description,
  color
}: {
  label: string;
  value: number;
  description: string;
  color: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${color}40`,
        borderRadius: 8,
        padding: "14px 16px",
        background: `${color}08`
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, marginBottom: 6 }}>
        {value}
        <span style={{ fontSize: 14 }}>ms</span>
      </div>
      <div style={{ fontSize: 11, color: "#64748b" }}>{description}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div
      style={{
        height: 200,
        background: "#f1f5f9",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#94a3b8"
      }}
    >
      Carregando...
    </div>
  );
}
