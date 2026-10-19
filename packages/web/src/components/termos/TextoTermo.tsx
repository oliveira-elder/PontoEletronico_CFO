import React from "react";

/** Negrito **texto** dentro de uma linha. */
function inline(t: string): React.ReactNode[] {
  return t
    .split(/(\*\*[^*]+\*\*)/g)
    .map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p
    );
}

/**
 * Exibe o texto dos Termos de Uso (Markdown simples: # título, ## seção, - item, **negrito**).
 */
export function TextoTermo({ conteudo }: { conteudo: string }) {
  const blocos: React.ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (!lista.length) return;
    blocos.push(
      <ul key={`ul-${blocos.length}`} style={{ margin: "4px 0 10px", paddingLeft: 20 }}>
        {lista.map((l, i) => (
          <li key={i} style={{ marginBottom: 3 }}>
            {inline(l)}
          </li>
        ))}
      </ul>
    );
    lista = [];
  };
  for (const linha of conteudo.split(/\r?\n/)) {
    const t = linha.trim();
    if (/^[-*] /.test(t)) {
      lista.push(t.slice(2));
      continue;
    }
    fecharLista();
    if (!t) continue;
    if (t.startsWith("## ")) {
      blocos.push(
        <h3
          key={blocos.length}
          style={{ fontSize: 14.5, margin: "16px 0 6px", color: "var(--burgundy-600)" }}
        >
          {inline(t.slice(3))}
        </h3>
      );
    } else if (t.startsWith("# ")) {
      blocos.push(
        <h2
          key={blocos.length}
          style={{
            fontSize: 16.5,
            margin: "0 0 10px",
            fontFamily: "var(--font-display)",
            textAlign: "center"
          }}
        >
          {inline(t.slice(2))}
        </h2>
      );
    } else {
      blocos.push(
        <p key={blocos.length} style={{ margin: "0 0 8px", textAlign: "justify" }}>
          {inline(t)}
        </p>
      );
    }
  }
  fecharLista();
  return <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-900)" }}>{blocos}</div>;
}
