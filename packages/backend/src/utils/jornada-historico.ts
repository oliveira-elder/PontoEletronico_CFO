import { dataBrasiliaISO, hojeBrasiliaISO } from "./horario-brasilia";

export interface JornadaHistoricoContext {
  anteriorMin: number;
  atualMin: number;
  vigenciaDesde: string | null;
  horaEntrada?: string;
  horaSaida?: string;
}

export interface FuncionarioJornadaInput {
  jornadaPeriodoId?: string | null;
  jornadaHorasDia?: number | null;
  jornadaPeriodoDesde?: Date | null;
  jornadaPeriodoAssociadoEm?: Date | null;
  jornadaPeriodo?: { jornadaDiariaMin: number; horaEntrada?: string; horaSaida?: string } | null;
  configuracaoHoraEntrada?: string | null;
  configuracaoHoraSaida?: string | null;
}

/** Resolve jornada anterior (padrão) vs atual (período) e data de vigência. */
export function resolverJornadaHistoricoContexto(
  func: FuncionarioJornadaInput | null | undefined
): JornadaHistoricoContext {
  const anteriorMin = (func?.jornadaHorasDia ?? 8) * 60;
  const atualMin = func?.jornadaPeriodo?.jornadaDiariaMin ?? anteriorMin;

  let vigenciaDesde: string | null = null;
  if (func?.jornadaPeriodoDesde) {
    vigenciaDesde = dataBrasiliaISO(func.jornadaPeriodoDesde);
  } else if (func?.jornadaPeriodoAssociadoEm) {
    vigenciaDesde = dataBrasiliaISO(func.jornadaPeriodoAssociadoEm);
  } else if (func?.jornadaPeriodoId) {
    vigenciaDesde = hojeBrasiliaISO();
  }

  const horaEntrada = func?.jornadaPeriodo?.horaEntrada ?? func?.configuracaoHoraEntrada ?? "08:00";
  const horaSaida = func?.jornadaPeriodo?.horaSaida ?? func?.configuracaoHoraSaida ?? "17:00";

  return { anteriorMin, atualMin, vigenciaDesde, horaEntrada, horaSaida };
}

/** Calcula a jornada obrigatória (min) para um feriado parcial com marco de horário.
 *  Retorna a proporção da jornadaDiariaMin correspondente ao período não-feriado. */
export function calcularJornadaParcialFeriado(
  marcoHorario: string,
  marcoLado: string | null | undefined,
  jornada: { horaEntrada: string; horaSaida: string; jornadaDiariaMin: number }
): number {
  const horaParaMin = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  };
  const entradaMin = horaParaMin(jornada.horaEntrada);
  const saidaMin = horaParaMin(jornada.horaSaida);
  const marcoMin = horaParaMin(marcoHorario);
  const totalTurno = saidaMin - entradaMin;
  if (totalTurno <= 0) return 0;
  const propObrigatoria =
    marcoLado === "ANTES"
      ? (saidaMin - marcoMin) / totalTurno // parte depois do marco é obrigatória
      : (marcoMin - entradaMin) / totalTurno; // parte antes do marco é obrigatória
  return Math.round(jornada.jornadaDiariaMin * Math.max(0, Math.min(1, propObrigatoria)));
}

/** Jornada diária esperada (min) para um dia civil YYYY-MM-DD. */
export function jornadaEsperadaMin(isoDate: string, ctx: JornadaHistoricoContext): number {
  if (ctx.vigenciaDesde && isoDate >= ctx.vigenciaDesde) return ctx.atualMin;
  return ctx.anteriorMin;
}

/**
 * Margem do cálculo diário (Configurações → Períodos → toleranciaCalculoMin).
 * Se |saldo| ≤ N minutos, o dia é completo (saldo 0).
 * Se |saldo| > N, conta o delta integral (ex.: N=5 e +6 min → +6, não +1).
 */
export function aplicarMargemCalculoDiario(
  saldoMinutos: number,
  toleranciaCalculoMin: number | null | undefined
): number {
  const margem = Math.max(0, Number(toleranciaCalculoMin) || 0);
  if (margem > 0 && Math.abs(saldoMinutos) <= margem) return 0;
  return saldoMinutos;
}
