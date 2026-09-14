import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function abbreviarNome(nome: string) {
  return nome.split(" ")[0] + (nome.split(" ")[1] ? ` ${nome.split(" ")[1][0]}.` : "");
}

/** Barra horizontal de ranking (Top 10) reutilizada pelos painéis de Auditoria. */
export function RankingHorizontalChart({
  chart,
  dataKey,
  unidade,
  corPositiva,
  corNegativa,
  modoNegativo
}: {
  chart: { nome: string; nomeCompleto: string; label: string; [k: string]: unknown }[];
  dataKey: string;
  unidade?: string;
  corPositiva: string;
  corNegativa: string;
  modoNegativo: boolean;
}) {
  if (chart.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
        Sem dados no período.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          unit={unidade}
          allowDecimals={!unidade}
        />
        <YAxis type="category" dataKey="nome" width={88} tick={{ fontSize: 11, fill: "#374151" }} />
        <Tooltip
          formatter={(v, _n, item?: { payload?: { label?: string } }) =>
            [item?.payload?.label ?? String(v), ""] as [string, string]
          }
          labelFormatter={(_l: unknown, p: unknown) => {
            const payload = p as Array<{ payload?: { nomeCompleto?: string } }> | undefined;
            return payload?.[0]?.payload?.nomeCompleto ?? "";
          }}
        />
        <Bar
          dataKey={dataKey}
          fill={modoNegativo ? corNegativa : corPositiva}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
