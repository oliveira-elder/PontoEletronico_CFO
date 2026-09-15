import React from "react";

const statValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "var(--ink-900)",
  lineHeight: 1,
  fontFamily: "var(--font-display)"
};

export function StatCard({
  label,
  value,
  sub,
  color,
  icon,
  onClick
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const clicavel = typeof onClick === "function";
  return (
    <div
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clicavel
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        borderTop: `3px solid ${color ?? "var(--burgundy-600)"}`,
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        boxSizing: "border-box",
        cursor: clicavel ? "pointer" : "default",
        transition: clicavel ? "border-color 150ms, box-shadow 150ms" : undefined
      }}
      onMouseEnter={
        clicavel
          ? (e) => {
              e.currentTarget.style.boxShadow = "0 2px 10px rgba(122,30,38,0.08)";
            }
          : undefined
      }
      onMouseLeave={
        clicavel
          ? (e) => {
              e.currentTarget.style.boxShadow = "none";
            }
          : undefined
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {icon && (
          <span style={{ color: color ?? "var(--burgundy-600)", opacity: 0.85 }}>{icon}</span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-500)"
          }}
        >
          {label}
        </span>
      </div>
      <span style={{ ...statValueStyle, ...(color ? { color } : {}) }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}>{sub}</span>}
    </div>
  );
}
