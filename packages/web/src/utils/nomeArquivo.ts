/** Nomes de arquivo padronizados: "Relatório setembro 2026" (mês por extenso, minúsculo). */
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

export const nomeDoMes = (mes: number) => MESES[Math.min(12, Math.max(1, mes)) - 1];

const limpar = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function nomeArquivoRelatorioMes(
  mes: number,
  ano: number,
  opts?: { nomePessoa?: string | null; rascunho?: boolean; extensao?: string; prefixo?: string }
): string {
  let nome = `${opts?.prefixo ?? "Relatório"} ${nomeDoMes(mes)} ${ano}`;
  if (opts?.rascunho) nome += " (rascunho)";
  if (opts?.nomePessoa) nome += ` - ${limpar(opts.nomePessoa)}`;
  return `${nome}.${opts?.extensao ?? "pdf"}`;
}

export function nomeArquivoRelatorioCiclo(inicioIso: string, fimIso: string, assinado = false) {
  const fmt = (iso: string) => {
    const [a, m] = iso.split("-").map(Number);
    return `${nomeDoMes(m)} ${a}`;
  };
  return `Relatório banco de horas ${fmt(inicioIso)} a ${fmt(fimIso)}${assinado ? " (assinado)" : ""}.pdf`;
}
