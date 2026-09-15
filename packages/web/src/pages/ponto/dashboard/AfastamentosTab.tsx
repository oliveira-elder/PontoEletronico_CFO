import React, { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_PALETTE } from "../../../utils/chartPalette";
import { DashboardPanel } from "../../../components/dashboard/DashboardPanel";
import { MiniDonut } from "../../../components/dashboard/MiniDonut";
import { MiniBarChart } from "../../../components/dashboard/MiniBarChart";
import {
  RankingHorizontalChart,
  abbreviarNome
} from "../../../components/dashboard/RankingHorizontalChart";
import { LABEL_TIPO_AFASTAMENTO, LABEL_CATEGORIA_FUNC, type AuditoriaDashboardData } from "./types";

export function AfastamentosTab({ data }: { data: AuditoriaDashboardData }) {
  const [modoAtestado, setModoAtestado] = useState<"mais" | "menos">("mais");

  const rankingAtestado =
    modoAtestado === "mais" ? (data.topMaisAtestados ?? []) : (data.topMenosAtestados ?? []);
  const chartAtestado = rankingAtestado.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    quantidade: r.quantidade,
    label: String(r.quantidade)
  }));

  const donutAfastamentosPorTipo = (data.afastamentosPorTipo ?? []).map((a) => ({
    name: LABEL_TIPO_AFASTAMENTO[a.tipo] ?? a.tipo,
    value: a.total
  }));
  const barAfastamentosPorCategoria = (data.afastamentosPorCategoria ?? []).map((a) => ({
    name: LABEL_CATEGORIA_FUNC[a.categoria] ?? a.categoria,
    value: a.total
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "18px 20px",
          minWidth: 0
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap"
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: 0
            }}
          >
            Top 10 {modoAtestado === "mais" ? "mais atestados" : "menos atestados"}
          </p>
          <button
            type="button"
            onClick={() => setModoAtestado((m) => (m === "mais" ? "menos" : "mais"))}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.20)",
              background: "transparent",
              color: "var(--burgundy-600)",
              cursor: "pointer"
            }}
          >
            Ver {modoAtestado === "mais" ? "menos atestados" : "mais atestados"}
          </button>
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <RankingHorizontalChart
            chart={chartAtestado}
            dataKey="quantidade"
            corPositiva="var(--red)"
            corNegativa="var(--green)"
            modoNegativo={modoAtestado !== "mais"}
          />
        </div>
      </div>

      <DashboardPanel title="Atestados por mês">
        <div style={{ width: "100%", height: 280 }}>
          {(data.atestadosPorMes ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
              Sem dados.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.atestadosPorMes}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
                <Tooltip
                  formatter={(v) => [v, "Atestados"] as [number, string]}
                  labelFormatter={(_l: unknown, p: unknown) => {
                    const payload = p as
                      | Array<{ payload?: { mes?: string; label?: string } }>
                      | undefined;
                    const mes = payload?.[0]?.payload?.mes;
                    if (!mes) return payload?.[0]?.payload?.label ?? "";
                    const [y, m] = mes.split("-").map(Number);
                    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
                      month: "long",
                      year: "numeric"
                    });
                  }}
                />
                <Bar
                  dataKey="total"
                  name="Atestados"
                  fill={CHART_PALETTE[0]}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </DashboardPanel>

      <DashboardPanel title="Férias por mês (sazonalidade)">
        <MiniBarChart
          data={(data.feriasPorMes ?? []).map((m) => ({ name: m.label, value: m.total }))}
          color={CHART_PALETTE[2]}
        />
      </DashboardPanel>

      <div className="dashboard-grid-2">
        <DashboardPanel title="Afastamentos por Tipo">
          <MiniDonut data={donutAfastamentosPorTipo} />
        </DashboardPanel>
        <DashboardPanel title="Afastamentos por Categoria do Funcionário">
          <MiniBarChart data={barAfastamentosPorCategoria} color={CHART_PALETTE[5]} />
        </DashboardPanel>
      </div>
    </div>
  );
}
