import React from "react";

/** Agrupa StatCards relacionados visualmente (ex.: Total/Ativos/Inativos). */
export function StatGroup({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-stat-group">{children}</div>;
}

/** Separador vertical "|" entre grupos de StatCards. */
export function StatDivider() {
  return (
    <div
      aria-hidden
      style={{
        width: 1,
        alignSelf: "stretch",
        minHeight: 90,
        background:
          "linear-gradient(to bottom, transparent, rgba(122,30,38,0.16) 15%, rgba(122,30,38,0.16) 85%, transparent)"
      }}
    />
  );
}
