import React from "react";

export function DashboardPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "18px 20px",
        minWidth: 0
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-500)",
          margin: "0 0 12px"
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}
