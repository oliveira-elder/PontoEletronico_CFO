import { jsPDF } from "jspdf";
import type { ResumoHistorico } from "./historicoTransform";

export type RelatorioMesPdf = ResumoHistorico & {
  funcionario?: { matricula: string; cargo: string };
};

/** Formata minutos para PDF — usa hífen ASCII (jsPDF não renderiza bem o sinal Unicode −). */
function minToPdf(min: number): string {
  const abs = Math.abs(min);
  const hm = `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
  if (min < 0) return `-${hm}`;
  if (min > 0) return `+${hm}`;
  return hm;
}

function minToPdfNeutro(min: number): string {
  const abs = Math.abs(min);
  return `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

function nomeMesCurto(m: number): string {
  return new Date(2026, m - 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function diasUteisMes(mes: number, ano: number): number {
  const hoje = new Date();
  const isCurrentMonth = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, mes - 1, d);
    if (isCurrentMonth && dt > hoje) break;
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function linha(doc: jsPDF, y: number, margin: number, pageWidth: number) {
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
}

function tituloSecao(doc: jsPDF, texto: string, y: number, margin: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(122, 30, 38);
  doc.text(texto, margin, y);
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

function parChaveValor(
  doc: jsPDF,
  chave: string,
  valor: string,
  y: number,
  margin: number,
  colValor = 90
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(chave, margin, y);
  doc.setFont("helvetica", "bold");
  doc.text(valor, margin + colValor, y);
  return y + 6;
}

export function gerarRelatorioPdf(
  rel: RelatorioMesPdf,
  trend: RelatorioMesPdf[],
  opts: { nomeUsuario: string }
): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const colTrab = pageWidth - margin - 52;
  const colSaldo = pageWidth - margin;
  let y = margin;

  const periodo = new Date(rel.ano, rel.mes - 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  const diasUteis = diasUteisMes(rel.mes, rel.ano);
  const pctDias = diasUteis > 0 ? (rel.diasTrabalhados / diasUteis) * 100 : 0;
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(122, 30, 38);
  doc.text("Relatório de Frequência", margin, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("Sistema de Ponto Eletrônico — CFO", margin, y);
  y += 10;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(periodo.charAt(0).toUpperCase() + periodo.slice(1), margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Funcionário: ${opts.nomeUsuario}`, margin, y);
  y += 5;
  if (rel.funcionario) {
    doc.text(
      `Matrícula: ${rel.funcionario.matricula}  ·  Cargo: ${rel.funcionario.cargo}`,
      margin,
      y
    );
    y += 5;
  }
  doc.text(`Gerado em: ${geradoEm}`, margin, y);
  y += 8;

  linha(doc, y, margin, pageWidth);
  y += 8;

  y = tituloSecao(doc, "Síntese do Período", y, margin);
  y = parChaveValor(
    doc,
    "Horas trabalhadas",
    minToPdfNeutro(rel.horasTrabalhadasMinutos),
    y,
    margin
  );
  y = parChaveValor(
    doc,
    "Horas esperadas (jornada)",
    minToPdfNeutro(rel.horasEsperadasMinutos),
    y,
    margin
  );
  y = parChaveValor(doc, "Saldo mensal", minToPdf(rel.saldoMinutos), y, margin);
  y = parChaveValor(doc, "Horas extras", minToPdfNeutro(rel.horasExtrasMinutos), y, margin);
  y = parChaveValor(doc, "Horas de falta", minToPdfNeutro(rel.horasFaltaMinutos), y, margin);
  y += 2;

  y = tituloSecao(doc, "Assiduidade", y, margin);
  y = parChaveValor(
    doc,
    "Dias trabalhados",
    `${rel.diasTrabalhados} de ${diasUteis} dias úteis (${pctDias.toFixed(0)}%)`,
    y,
    margin,
    70
  );
  y += 2;

  y = tituloSecao(doc, "Distribuição de Horas", y, margin);
  const distribuicao = [
    ["Trabalhadas", minToPdfNeutro(rel.horasTrabalhadasMinutos)],
    ["Esperadas (jornada)", minToPdfNeutro(rel.horasEsperadasMinutos)],
    ["Horas extras", minToPdfNeutro(rel.horasExtrasMinutos)],
    ["Horas de falta", minToPdfNeutro(rel.horasFaltaMinutos)]
  ];
  for (const [label, val] of distribuicao) {
    y = parChaveValor(doc, label, val, y, margin);
  }
  y += 2;

  if (trend.length > 0) {
    y = tituloSecao(doc, "Tendência — Últimos 6 Meses", y, margin);
    y += 1;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Mês", margin, y);
    doc.text("Horas trabalhadas", colTrab, y, { align: "right" });
    doc.text("Saldo", colSaldo, y, { align: "right" });
    y += 4;
    linha(doc, y, margin, pageWidth);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const m of trend) {
      const mesLabel = `${nomeMesCurto(m.mes)}/${m.ano}`;
      const destaque = m.mes === rel.mes && m.ano === rel.ano;
      if (destaque) doc.setFont("helvetica", "bold");

      doc.text(mesLabel, margin, y);
      doc.text(minToPdfNeutro(m.horasTrabalhadasMinutos), colTrab, y, { align: "right" });
      doc.text(minToPdf(m.saldoMinutos), colSaldo, y, { align: "right" });

      if (destaque) doc.setFont("helvetica", "normal");
      y += 7;
    }
  }

  const filename = `relatorio-frequencia-${String(rel.mes).padStart(2, "0")}-${rel.ano}.pdf`;
  doc.save(filename);
}
