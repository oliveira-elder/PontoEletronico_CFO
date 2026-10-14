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

export function nomeMes(mes: number): string {
  return MESES[Math.min(12, Math.max(1, mes)) - 1];
}

const semCaracteresInvalidos = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Relatório do mês. O funcionário baixando o próprio documento recebe "Relatório setembro 2026";
 * RH/chefe baixando o de outra pessoa recebe "Relatório setembro 2026 - Nome" (evita colisão).
 */
export function nomeArquivoRelatorioMes(
  mes: number,
  ano: number,
  opts?: { nomePessoa?: string | null; rascunho?: boolean; extensao?: string }
): string {
  let nome = `Relatório ${nomeMes(mes)} ${ano}`;
  if (opts?.rascunho) nome += " (rascunho)";
  if (opts?.nomePessoa) nome += ` - ${semCaracteresInvalidos(opts.nomePessoa)}`;
  return `${nome}.${opts?.extensao ?? "pdf"}`;
}

/** Relatório do ciclo do banco de horas. */
export function nomeArquivoRelatorioCiclo(inicioIso: string, fimIso: string): string {
  const fmt = (iso: string) => {
    const [a, m] = iso.split("-").map(Number);
    return `${nomeMes(m)} ${a}`;
  };
  return `Relatório banco de horas ${fmt(inicioIso)} a ${fmt(fimIso)}.pdf`;
}

/** Cabeçalho Content-Disposition com nome UTF-8 (acentos) e alternativa ASCII. */
export function contentDispositionAnexo(filename: string): string {
  const ascii = filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
