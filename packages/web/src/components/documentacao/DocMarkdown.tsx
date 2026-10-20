import React, { useMemo } from "react";
import { MermaidDiagrama } from "./MermaidDiagrama";
import { renderizarMarkdown, type Titulo } from "./markdown";

/** Renderiza o Markdown de uma seção (HTML sem script + diagramas Mermaid). */
export function DocMarkdown({
  fonte,
  prefixo,
  compacto,
  onTitulos
}: {
  fonte: string;
  prefixo: string;
  compacto?: boolean;
  onTitulos?: (t: Titulo[]) => void;
}) {
  const { segmentos, titulos } = useMemo(
    () => renderizarMarkdown(fonte, prefixo),
    [fonte, prefixo]
  );
  React.useEffect(() => {
    onTitulos?.(titulos);
  }, [titulos, onTitulos]);
  let n = 0;
  return (
    <div className="doc-md">
      {segmentos.map((s, i) =>
        s.tipo === "html" ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: s.html }} />
        ) : (
          <MermaidDiagrama
            key={i}
            codigo={s.codigo}
            titulo={`${prefixo}-diagrama-${++n}`}
            compacto={compacto}
          />
        )
      )}
    </div>
  );
}
