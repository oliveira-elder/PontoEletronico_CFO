/**
 * Extrai o texto de um PDF em linhas (ordem de leitura: de cima para baixo, da esquerda para a
 * direita), com o pdf.js. Mesmo agrupamento usado no navegador (VerificarDocumentoPage), para
 * que o texto do arquivo enviado e o do original arquivado sejam comparáveis.
 */
import { pathToFileURL } from "url";

interface ItemTexto {
  str?: string;
  transform?: number[];
}

/* pdfjs-dist é ESM: o import dinâmico não pode virar require() na compilação CommonJS. */
const importarEsm = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;

export async function extrairLinhasPdf(buf: Buffer | Uint8Array): Promise<string[]> {
  /* Caminho resolvido pelo require (respeita node_modules/NODE_PATH de onde o backend roda). */
  const caminho = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href;
  const pdfjs = (await importarEsm(caminho)) as {
    getDocument: (o: object) => {
      promise: Promise<{
        numPages: number;
        getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: ItemTexto[] }> }>;
      }>;
    };
  };
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
  }).promise;
  const linhas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const { items } = await pagina.getTextContent();
    linhas.push(...agruparLinhas(items));
  }
  return linhas;
}

/** Agrupa os trechos por linha (mesma altura, tolerância de 2 pt) e ordena pela posição. */
export function agruparLinhas(items: ItemTexto[]): string[] {
  const porY = new Map<number, Array<{ x: number; s: string }>>();
  for (const it of items) {
    if (typeof it.str !== "string" || !it.transform) continue;
    const y = Math.round(it.transform[5] / 2) * 2;
    const lista = porY.get(y) ?? [];
    lista.push({ x: it.transform[4], s: it.str });
    porY.set(y, lista);
  }
  return [...porY.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, l]) =>
      l
        .sort((a, b) => a.x - b.x)
        .map((t) => t.s)
        .join(" ")
        .trim()
    )
    .filter(Boolean);
}

/** Texto compacto para comparação: sem acentos, minúsculo, sem espaços e pontuação solta. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:/+\-.,]/g, "");
}

/** Datas, horários e durações de uma linha (o que a OCR consegue ler com segurança). */
export function tokensNumericos(s: string): string[] {
  return (
    s
      .match(/\d{2}\/\d{2}\/\d{4}|\d{1,2}:\d{2}|[+-]?\d{1,3}h\d{2}m?/gi)
      ?.map((t) => t.toLowerCase()) ?? []
  );
}
