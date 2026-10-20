import MarkdownIt from "markdown-it";

/** Trecho renderizado de uma seção: HTML comum ou um diagrama Mermaid. */
export type Segmento = { tipo: "html"; html: string } | { tipo: "mermaid"; codigo: string };

export interface Titulo {
  id: string;
  texto: string;
  nivel: number;
}

/** Markdown da documentação: HTML bruto desligado (o conteúdo é do repositório, mas não confiamos em HTML). */
const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });

const linkAbrir = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
  const t = tokens[idx];
  t.attrSet("target", "_blank");
  t.attrSet("rel", "noopener noreferrer");
  return linkAbrir ? linkAbrir(tokens, idx, opts, env, self) : self.renderToken(tokens, idx, opts);
};
md.renderer.rules.table_open = () => '<div class="doc-tabela"><table>';
md.renderer.rules.table_close = () => "</table></div>";

export function slug(texto: string): string {
  return (
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "secao"
  );
}

/** Divide o Markdown em segmentos e extrai os títulos (id único por documento, com prefixo da seção). */
export function renderizarMarkdown(
  fonte: string,
  prefixo: string
): { segmentos: Segmento[]; titulos: Titulo[] } {
  const tokens = md.parse(fonte, {});
  const titulos: Titulo[] = [];
  const usados = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open") continue;
    const texto = tokens[i + 1]?.content ?? "";
    const base = `${prefixo}-${slug(texto)}`;
    const n = (usados.get(base) ?? 0) + 1;
    usados.set(base, n);
    const id = n > 1 ? `${base}-${n}` : base;
    t.attrSet("id", id);
    titulos.push({ id, texto, nivel: Number(t.tag.slice(1)) });
  }

  const segmentos: Segmento[] = [];
  let buffer: typeof tokens = [];
  const descarregar = () => {
    if (!buffer.length) return;
    segmentos.push({ tipo: "html", html: md.renderer.render(buffer, md.options, {}) });
    buffer = [];
  };
  for (const t of tokens) {
    if (t.type === "fence" && t.info.trim().toLowerCase() === "mermaid") {
      descarregar();
      segmentos.push({ tipo: "mermaid", codigo: t.content });
    } else {
      buffer.push(t);
    }
  }
  descarregar();
  return { segmentos, titulos };
}
