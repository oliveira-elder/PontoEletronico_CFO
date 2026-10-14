import React from "react";
import { createPortal } from "react-dom";

/** Modal genérico (overlay + card), promovido do padrão usado em AuditoriaPage.tsx. */
export function Modal({
  eyebrow = "Dashboard",
  title,
  subtitle,
  onClose,
  children,
  maxWidth = 520,
  maxHeight = "min(80vh, 640px)"
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
  maxHeight?: string;
}) {
  /* Portal no <body>: um ancestral com transform/animation prende o position:fixed e encolhe o modal. */
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,5,6,0.50)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth,
          maxHeight,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(10,5,6,0.20)"
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, var(--burgundy-700) 0%, var(--burgundy-600) 100%)",
            padding: "20px 24px",
            flexShrink: 0
          }}
        >
          <p
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              margin: 0
            }}
          >
            {eyebrow}
          </p>
          <h2
            style={{
              color: "#fff",
              fontSize: 18,
              margin: "4px 0 0",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontWeight: 400
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", margin: "2px 0 0" }}>
              {subtitle}
            </p>
          )}
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto" }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
