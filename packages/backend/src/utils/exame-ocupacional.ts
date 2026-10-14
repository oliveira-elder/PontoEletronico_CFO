/** Exame médico ocupacional periódico: vencimento e situação (funções puras). */

export type SituacaoExame = "EM_DIA" | "A_VENCER" | "VENCIDO" | "SEM_EXAME";

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** `dataRealizacao + meses`, no último dia válido do mês (29/02 + 12 meses → 28/02). */
export function somarMesesIso(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dia = Math.min(d, diasNoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function vencimentoPeriodico(dataRealizacaoIso: string, periodicidadeMeses: number): string {
  return somarMesesIso(dataRealizacaoIso, periodicidadeMeses);
}

const diasEntre = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000
  );

/** Situação pelo vencimento do último exame **confirmado** (null = nunca teve). */
export function situacaoDoExame(
  proximoVencimentoIso: string | null,
  hojeIso: string,
  avisoDias: number
): { situacao: SituacaoExame; diasParaVencer: number | null } {
  if (!proximoVencimentoIso) return { situacao: "SEM_EXAME", diasParaVencer: null };
  const dias = diasEntre(hojeIso, proximoVencimentoIso);
  if (dias < 0) return { situacao: "VENCIDO", diasParaVencer: dias };
  if (dias <= avisoDias) return { situacao: "A_VENCER", diasParaVencer: dias };
  return { situacao: "EM_DIA", diasParaVencer: dias };
}
