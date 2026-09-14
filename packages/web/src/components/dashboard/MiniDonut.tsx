import React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CHART_PALETTE } from "../../utils/chartPalette";
import type { ChartDatum, RechartsClickEntry } from "./chartTypes";

/** Donut genérico reutilizado pelos painéis de dashboard (Gestão e Auditoria). */
export function MiniDonut({
  data,
  colors = CHART_PALETTE,
  height = 220,
  onItemClick
}: {
  data: ChartDatum[];
  colors?: string[];
  height?: number;
  onItemClick?: (item: ChartDatum) => void;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (!total) {
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
  const legendReserve = 56;
  const outerRadius = Math.max(36, Math.min(78, Math.floor((height - legendReserve) / 2)));
  const innerRadius = Math.round(outerRadius * 0.59);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          onClick={
            onItemClick
              ? (entry: unknown) => onItemClick(entry as RechartsClickEntry<ChartDatum>)
              : undefined
          }
          style={onItemClick ? { cursor: "pointer" } : undefined}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) =>
            [`${v} (${((Number(v) / total) * 100).toFixed(0)}%)`, ""] as [string, string]
          }
        />
        <Legend verticalAlign="bottom" height={48} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
