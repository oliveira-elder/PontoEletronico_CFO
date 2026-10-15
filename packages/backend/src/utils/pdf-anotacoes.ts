/**
 * QR Codes e link de verificação como ANOTAÇÕES do PDF (não como desenho da página).
 * Word e a maioria dos conversores importam só o conteúdo da página e descartam anotações:
 * a cópia convertida/editada sai sem QR e sem link. As posições vêm dos retângulos-marcadores
 * reservados pelo builder (quadro-registro-pdf.builder.ts).
 */
import {
  MARCADOR_LINK_DECLARACAO,
  MARCADOR_QR_DECLARACAO,
  MARCADOR_QR_PAGINA
} from "../modules/assinatura/quadro-registro-pdf.builder";

/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrEnc = require("pdfmake/src/qrEnc") as {
  measure: (n: { qr: string; fit: number }) => {
    _canvas: Array<{ x: number; y: number; w: number; h: number }>;
    _width: number;
  };
};

const n3 = (v: number) => Number(v.toFixed(3)).toString();

/** Texto para content stream PDF (WinAnsi: acentos em octal). */
function textoPdf(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (c < 128) out += ch;
    else if (c <= 255) out += `\\${c.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}

function anotarQr(doc: any, x: number, y: number, w: number, h: number, url: string) {
  const qr = qrEnc.measure({ qr: url, fit: w });
  const escala = w / qr._width;
  const modulos = qr._canvas
    .slice(1)
    .map(
      (r) =>
        `${n3(r.x * escala)} ${n3(h - (r.y + r.h) * escala)} ${n3(r.w * escala)} ${n3(r.h * escala)} re`
    )
    .join("\n");
  const form = doc.ref({ Type: "XObject", Subtype: "Form", BBox: [0, 0, w, h], Resources: {} });
  form.end(`q 1 1 1 rg 0 0 ${n3(w)} ${n3(h)} re f 0 0 0 rg\n${modulos}\nf Q`);
  doc.annotate(x, y, w, h, {
    Subtype: "Stamp",
    Name: "CFOVerificacao",
    AP: { N: form },
    F: 4,
    Contents: new String(`Verificação: ${url}`)
  });
  doc.link(x, y, w, h, url);
}

function anotarLinkTexto(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  url: string,
  codigo: string | null
) {
  const negrito = doc.ref({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica-Bold",
    Encoding: "WinAnsiEncoding"
  });
  negrito.end();
  const normal = doc.ref({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica",
    Encoding: "WinAnsiEncoding"
  });
  normal.end();
  const form = doc.ref({
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, w, h],
    Resources: { Font: { F1: negrito, F2: normal } }
  });
  form.end(
    `BT /F1 7 Tf 0.118 0.251 0.686 rg 0 ${n3(h - 8)} Td (${textoPdf(url)}) Tj ET\n` +
      `BT /F2 6.5 Tf 0.07 0.07 0.07 rg 0 ${n3(h - 19)} Td (${textoPdf(`Código: ${codigo ?? "—"}`)}) Tj ET`
  );
  doc.annotate(x, y, w, h, {
    Subtype: "Stamp",
    Name: "CFOLinkVerificacao",
    AP: { N: form },
    F: 4,
    Contents: new String(url)
  });
  doc.link(x, y, w, 10, url);
}

/** Percorre as páginas já desenhadas (bufferPages) e põe as anotações nos marcadores. */
export function aplicarAnotacoesVerificacao(
  doc: any,
  opts: {
    urlPagina: (pagina: number, total: number) => string;
    urlDeclaracao: string | null;
    codigo: string | null;
  }
) {
  const paginas = (doc._pdfMakePages ?? []) as Array<{ items: Array<{ type: string; item: any }> }>;
  const total = paginas.length;
  paginas.forEach((pg, i) => {
    doc.switchToPage(i);
    for (const it of pg.items) {
      const v = it.item;
      if (it.type !== "vector" || v?.type !== "rect") continue;
      const cor = String(v.color ?? "").toUpperCase();
      if (cor === MARCADOR_QR_PAGINA)
        anotarQr(doc, v.x, v.y, v.w, v.h, opts.urlPagina(i + 1, total));
      else if (cor === MARCADOR_QR_DECLARACAO && opts.urlDeclaracao) {
        anotarQr(doc, v.x, v.y, v.w, v.h, opts.urlDeclaracao);
      } else if (cor === MARCADOR_LINK_DECLARACAO && opts.urlDeclaracao) {
        anotarLinkTexto(doc, v.x, v.y, v.w, v.h, opts.urlDeclaracao, opts.codigo);
      }
    }
  });
}
