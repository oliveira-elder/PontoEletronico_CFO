import { dataBrasiliaISO, hojeBrasiliaISO } from "./horario-brasilia";

export interface JornadaHistoricoContext {
  anteriorMin: number;
  atualMin: number;
  vigenciaDesde: string | null;
}

export interface FuncionarioJornadaInput {
  jornadaPeriodoId?: string | null;
  jornadaHorasDia?: number | null;
  jornadaPeriodoDesde?: Date | null;
  jornadaPeriodoAssociadoEm?: Date | null;
  jornadaPeriodo?: { jornadaDiariaMin: number } | null;
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

  return { anteriorMin, atualMin, vigenciaDesde };
}

/** Jornada diária esperada (min) para um dia civil YYYY-MM-DD. */
export function jornadaEsperadaMin(isoDate: string, ctx: JornadaHistoricoContext): number {
  if (ctx.vigenciaDesde && isoDate >= ctx.vigenciaDesde) return ctx.atualMin;
  return ctx.anteriorMin;
}
