import React from "react";
import { textoAvisoOriginais, type TipoRequerimento } from "../utils/requerimentos";

/** Destaque: os documentos originais do requerimento devem ser apresentados no RH. */
export function AvisoOriginaisRh({ tipo }: { tipo: TipoRequerimento }) {
  return (
    <p
      role="note"
      style={{
        margin: 0,
        padding: "9px 12px",
        borderRadius: "var(--radius-md)",
        background: "rgba(247,196,55,0.12)",
        border: "1px solid rgba(247,196,55,0.45)",
        color: "#6b5200",
        fontSize: 12.5,
        lineHeight: 1.5
      }}
    >
      <strong>Atenção:</strong> {textoAvisoOriginais(tipo)}
    </p>
  );
}
