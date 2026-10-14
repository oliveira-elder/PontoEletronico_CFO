/**
 * Leitura do documento enviado na página pública de verificação, feita NO NAVEGADOR (o arquivo
 * não sai do computador): texto do PDF (pdf.js) ou leitura da foto/escaneamento (OCR, tesseract).
 * O agrupamento em linhas é o mesmo do servidor (backend/src/utils/pdf-texto.ts), para que o texto
 * enviado e o do original arquivado sejam comparáveis.
 */

interface ItemTexto {
  str?: string;
  transform?: number[];
}

/** Agrupa os trechos por linha (mesma altura, tolerância de 2 pt) e ordena pela posição. */
function agruparLinhas(items: ItemTexto[]): string[] {
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

/** Texto do PDF em linhas (todas as páginas). */
export async function extrairLinhasPdf(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const linhas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();
    linhas.push(...agruparLinhas(conteudo.items as ItemTexto[]));
  }
  await doc.destroy();
  return linhas;
}

/** Leitura (OCR) de foto ou escaneamento, com os arquivos servidos pelo próprio sistema. */
export async function lerImagemOcr(
  file: File,
  aoProgredir?: (pct: number) => void
): Promise<string[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") aoProgredir?.(Math.round(m.progress * 100));
    }
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } finally {
    await worker.terminate();
  }
}
