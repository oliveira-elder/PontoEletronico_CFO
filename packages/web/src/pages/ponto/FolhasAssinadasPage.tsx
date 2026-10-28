import React from "react";
import { Link } from "react-router-dom";
import { FileTextIcon } from "../../components/icons";
import { FolhasAssinadasLista } from "../../components/assinatura/FolhasAssinadasLista";

/** Folhas de ponto assinadas do próprio funcionário (todas as categorias). */
export function FolhasAssinadasPage() {
  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto" }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>
        Ponto Eletrônico
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 20
        }}
      >
        <h1
          style={{
            fontSize: "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            lineHeight: 1.1
          }}
        >
          Folhas de ponto <em>assinadas</em>
        </h1>
        {/* Comprovantes de Registro de Ponto (art. 79): cada marcação do dia a dia. */}
        <Link to="/ponto/comprovantes" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <FileTextIcon size={14} />
          Comprovantes de ponto
        </Link>
      </div>
      <div className="card-flat">
        <FolhasAssinadasLista
          listaUrl="/ponto/assinaturas/folhas"
          downloadUrl={(id) => `/ponto/assinaturas/${id}/pdf`}
        />
      </div>
    </div>
  );
}
