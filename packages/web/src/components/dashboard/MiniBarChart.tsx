import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_PALETTE } from "../../utils/chartPalette";
import type { ChartDatum, RechartsClickEntry } from "./chartTypes";

/** Barra vertical genérica reutilizada pelos painéis de dashboard (Gestão e Auditoria). */
export function MiniBarChart({
  data,
  color = CHART_PALETTE[0],
  height = 220,
  onItemClick
}: {
  data: ChartDatum[];
  color?: string;
  height?: number;
  onItemClick?: (item: ChartDatum) => void;
}) {
  if (!data.length) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-400)",
          fontSize: 12.5
        }}
      >
        Sem dados no período.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10.5, fill: "#6b7280" }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={56}
        />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} allowDecimals={false} />
        <Tooltip />
        <Bar
          dataKey="value"
          fill={color}
          radius={[4, 4, 0, 0]}
          barSize={26}
          onClick={
            onItemClick
              ? (entry: unknown) => {
                  const e = entry as RechartsClickEntry<ChartDatum>;
                  onItemClick(e.payload ?? e);
                }
              : undefined
          }
          style={onItemClick ? { cursor: "pointer" } : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
