import React from "react";
import { FolhasAssinadasLista } from "../../components/assinatura/FolhasAssinadasLista";

/** Folhas de ponto assinadas do próprio funcionário (todas as categorias). */
export function FolhasAssinadasPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>
        Ponto Eletrônico
      </p>
      <h1
        style={{
          fontSize: "clamp(22px,3vw,28px)",
          fontFamily: "var(--font-display)",
          lineHeight: 1.1,
          marginBottom: 20
        }}
      >
        Folhas de ponto <em>assinadas</em>
      </h1>
      <div className="card-flat">
        <FolhasAssinadasLista
          listaUrl="/ponto/assinaturas/folhas"
          downloadUrl={(id) => `/ponto/assinaturas/${id}/pdf`}
        />
      </div>
    </div>
  );
}
