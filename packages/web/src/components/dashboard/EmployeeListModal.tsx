import React from "react";
import { Modal } from "../Modal";

export interface EmployeeListItem {
  nome: string;
  matricula?: string | null;
  extra?: string | null;
}

/** Modal "quem está nesta barra" — lista de funcionários filtrada por uma dimensão do dashboard. */
export function EmployeeListModal({
  title,
  subtitle,
  items,
  onClose,
  rodape,
  vazio = "Nenhum funcionário encontrado."
}: {
  title: string;
  subtitle?: string;
  items: EmployeeListItem[];
  onClose: () => void;
  /** Conteúdo fixo no fim do modal (ex.: botão "Abrir tela"). */
  rodape?: React.ReactNode;
  vazio?: string;
}) {
  return (
    <Modal eyebrow="Dashboard" title={title} subtitle={subtitle} onClose={onClose}>
      {items.length === 0 ? (
        <p
          style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: "24px 0" }}
        >
          {vazio}
        </p>
      ) : (
        <div>
          <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "0 0 10px" }}>
            {items.length} registro{items.length === 1 ? "" : "s"}
          </p>
          {items.map((it, i) => (
            <div
              key={`${it.nome}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "8px 0",
                borderBottom: i < items.length - 1 ? "1px solid rgba(122,30,38,0.08)" : "none",
                fontSize: 13
              }}
            >
              <span style={{ color: "var(--ink-800)", fontWeight: 600 }}>{it.nome}</span>
              <span style={{ color: "var(--ink-500)", fontSize: 12, textAlign: "right" }}>
                {[it.matricula, it.extra].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
          ))}
        </div>
      )}
      {rodape && (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>{rodape}</div>
      )}
    </Modal>
  );
}
