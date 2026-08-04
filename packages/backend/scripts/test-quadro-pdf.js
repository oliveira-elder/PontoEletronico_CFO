/**
 * Smoke test: gera PDF de exemplo e verifica se cabe em 1 página.
 * Uso: node scripts/test-quadro-pdf.js
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const PdfPrinter = require("pdfmake/src/printer");

const {
  buildQuadroPdfDocDefinition,
  loadAssetBase64
} = require("../dist/modules/assinatura/quadro-registro-pdf.builder");
const { getPdfFonts } = require("../dist/modules/assinatura/pdf-fonts");

const PDF_FONTS = getPdfFonts();

function countPdfPages(buffer) {
  const text = buffer.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

function buildSampleRelatorio(mes, ano) {
  const dias = [];
  for (let d = 1; d <= new Date(ano, mes, 0).getDate(); d++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(ano, mes - 1, d).getDay();
    const fimDeSemana = dow === 0 || dow === 6;
    const trabalhado = d >= 12 && d <= 15 && !fimDeSemana;
    dias.push({
      iso,
      entrada: trabalhado ? "08:00" : null,
      inicioIntervalo: trabalhado ? "12:00" : null,
      fimIntervalo: trabalhado ? "13:00" : null,
      saida: trabalhado ? "18:00" : null,
      pausas: d === 12 ? [{ inicio: "10:15", fim: "10:45" }] : [],
      horasMin: trabalhado ? (d === 12 ? 746 : 480) : 0,
      horasFormatado: trabalhado ? (d === 12 ? "12h26m" : "8h00m") : "—",
      saldoMin: trabalhado ? (d === 12 ? 266 : 0) : null,
      saldoFormatado: trabalhado ? (d === 12 ? "+4h26m" : "0h00m") : "—",
      status: fimDeSemana
        ? "Sem Expediente"
        : trabalhado
          ? "Trabalhado"
          : d <= 11
            ? "Afastamento"
            : "Sem registro",
      statusInterno: fimDeSemana ? "FOLGA" : trabalhado ? "OK" : d <= 11 ? "AFASTAMENTO" : "FALTA"
    });
  }
  return {
    dias,
    diasTrabalhados: 4,
    horasTrabalhadasMinutos: 746,
    horasTrabalhadasFormatado: "12h26m",
    saldoFormatado: "-19h34m",
    saldoMinutos: -1174
  };
}

const mes = 5;
const ano = 2026;

const docDefinition = buildQuadroPdfDocDefinition({
  mes,
  ano,
  funcionario: {
    matricula: "elder.oliveira",
    cpf: "12372954400",
    cargo: "Analista de Desenvolvimento - TI",
    section: "gerti",
    categoria: "CONCURSADO",
    jornadaHorasDia: 8,
    user: { name: "Elder Oliveira" },
    gerencia: { nome: "GERTI", sigla: "G" }
  },
  assinatura: {
    assinadoFuncionarioEm: new Date("2026-06-18T14:39:53"),
    assinadoFuncionarioIp: "192.168.10.45",
    assinadoFuncionarioIpGateway: "200.18.42.1",
    assinadoFuncionarioUserAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    assinadoGestorEm: new Date("2026-06-19T09:15:48"),
    assinadoGestorIp: "192.168.10.12",
    assinadoGestorIpGateway: "200.18.42.1",
    assinadoGestorUserAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    assinadoGestorNome: "elder oliveira",
    bancoHorasSaldoTotalMinutos: -4488
  },
  relatorio: buildSampleRelatorio(mes, ano),
  logoBase64: loadAssetBase64("logo.png"),
  certificadoBase64: loadAssetBase64("certificado-digital.png")
});

const printer = new PdfPrinter(PDF_FONTS);
const pdfDoc = printer.createPdfKitDocument(docDefinition);
const out = path.join(__dirname, "..", "test-quadro-output.pdf");
const chunks = [];

pdfDoc.on("data", (chunk) => chunks.push(chunk));
pdfDoc.on("end", () => {
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(out, buffer);
  const pages = countPdfPages(buffer);
  console.log("PDF gerado:", out, `(${buffer.length} bytes, ${pages} página(s))`);
  console.log("Logo:", loadAssetBase64("logo.png") ? "ok" : "missing");
  console.log("Certificado:", loadAssetBase64("certificado-digital.png") ? "ok" : "missing");
  if (pages !== 1) {
    console.error("ERRO: documento deve ter exatamente 1 página");
    process.exit(1);
  }
});
pdfDoc.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
pdfDoc.end();
