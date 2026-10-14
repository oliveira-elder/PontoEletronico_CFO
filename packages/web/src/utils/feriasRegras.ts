/**
 * Regras de marcação de férias (Configurações → Solicitações). Espelho de
 * backend/src/utils/ferias-regras.ts — mantenha os dois iguais.
 * Datas sempre como dia civil de Brasília (YYYY-MM-DD).
 */

export interface RegrasFerias {
  antecedenciaMinDias: number;
  minimoGrandePeriodo: number;
  minimoOutrosPeriodos: number;
  maxPeriodos: number;
  maxDiasVenda: number;
  vedacaoPreFeriadoDias: number;
}

/** Calendário usado pela vedação: dias úteis da jornada (dom=0…sáb=6) e feriados integrais. */
export interface CalendarioFerias {
  diasUteis: boolean[];
  /** Feriados do dia todo (exceto abono do RH), YYYY-MM-DD. */
  feriados: string[];
}

export interface PeriodoFerias {
  inicio: string;
  fim: string;
}

const NOME_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function somarDiasIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function diasCorridos(inicio: string, fim: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(fim) - utc(inicio)) / 86400000) + 1;
}

const fmtBr = (iso: string) => iso.split("-").reverse().join("/");

function diaSemana(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Vedação (CLT art. 134, §3º): a férias não pode começar em dia sem expediente nem nos
 * `dias` dias que antecedem feriado ou dia de repouso (dia não útil da jornada).
 * Devolve o motivo, ou null se o início é permitido.
 */
export function motivoVedacaoInicio(
  inicio: string,
  dias: number,
  cal: CalendarioFerias
): string | null {
  if (dias <= 0) return null;
  const feriados = new Set(cal.feriados);
  const descanso = (iso: string) => feriados.has(iso) || cal.diasUteis[diaSemana(iso)] === false;
  if (feriados.has(inicio)) return `${fmtBr(inicio)} é feriado.`;
  if (cal.diasUteis[diaSemana(inicio)] === false) {
    return `${fmtBr(inicio)} é ${NOME_DIA[diaSemana(inicio)]}, dia sem expediente.`;
  }
  for (let i = 1; i <= dias; i++) {
    const dia = somarDiasIso(inicio, i);
    if (descanso(dia)) {
      const oQue = feriados.has(dia)
        ? `o feriado de ${fmtBr(dia)}`
        : `o repouso de ${NOME_DIA[diaSemana(dia)]} (${fmtBr(dia)})`;
      return `${fmtBr(inicio)} fica nos ${dias} dias que antecedem ${oQue}.`;
    }
  }
  return null;
}

/**
 * Valida os períodos de gozo + venda (regime CLT; estagiário não usa estas regras).
 * `novos`: índices dos períodos sujeitos a antecedência e vedação (numa alteração, os
 * períodos mantidos da solicitação original não são reavaliados). Sem `novos`, todos.
 * Agendamento pelo RH: `ignorarAntecedencia` (qualquer data, inclusive passada) e
 * `ignorarVedacao` (o RH assume, com justificativa).
 */
export function validarPeriodosFerias(opts: {
  periodos: PeriodoFerias[];
  diasVenda: number;
  regras: RegrasFerias;
  hoje: string;
  calendario: CalendarioFerias;
  /** Data mínima de gozo (ciclo ainda em formação): só vale a partir do período aquisitivo. */
  liberaEm?: string | null;
  novos?: Set<number>;
  ignorarAntecedencia?: boolean;
  ignorarVedacao?: boolean;
}): string[] {
  const { periodos, diasVenda, regras, hoje, calendario } = opts;
  const erros: string[] = [];
  if (!periodos.length) return ["Informe ao menos um período de gozo."];

  const maxGozo = diasVenda > 0 ? regras.maxPeriodos - 1 : regras.maxPeriodos;
  if (periodos.length > maxGozo) {
    erros.push(
      diasVenda > 0
        ? `Com venda de dias, o máximo é ${maxGozo} período(s) de gozo (a venda conta como 1 período).`
        : `Máximo de ${maxGozo} períodos de gozo.`
    );
  }
  if (diasVenda > regras.maxDiasVenda) {
    erros.push(`Venda máxima de ${regras.maxDiasVenda} dias.`);
  }

  const minInicio = somarDiasIso(hoje, regras.antecedenciaMinDias);
  periodos.forEach((p, i) => {
    const n = i + 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(p.fim)) {
      erros.push(`Período ${n}: datas inválidas.`);
      return;
    }
    const dias = diasCorridos(p.inicio, p.fim);
    if (dias <= 0) {
      erros.push(`Período ${n}: a data fim deve ser igual ou posterior ao início.`);
      return;
    }
    if (dias < regras.minimoOutrosPeriodos) {
      erros.push(`Período ${n}: mínimo de ${regras.minimoOutrosPeriodos} dias.`);
    }
    if (opts.novos && !opts.novos.has(i)) return;
    if (opts.liberaEm && p.inicio < opts.liberaEm) {
      erros.push(
        `Período ${n}: as férias só podem ser usufruídas a partir de ${fmtBr(opts.liberaEm)} (fim do período aquisitivo).`
      );
    }
    if (!opts.ignorarAntecedencia && p.inicio < minInicio) {
      erros.push(
        `Período ${n}: início deve ter pelo menos ${regras.antecedenciaMinDias} dia(s) de antecedência (a partir de ${fmtBr(minInicio)}).`
      );
    }
    const vedado = opts.ignorarVedacao
      ? null
      : motivoVedacaoInicio(p.inicio, regras.vedacaoPreFeriadoDias, calendario);
    if (vedado) {
      erros.push(
        `Período ${n}: férias não podem começar em dia sem expediente nem nos ${regras.vedacaoPreFeriadoDias} dias que antecedem feriado ou repouso semanal — ${vedado}`
      );
    }
  });

  if (!periodos.some((p) => diasCorridos(p.inicio, p.fim) >= regras.minimoGrandePeriodo)) {
    erros.push(
      `Ao menos um período deve ter no mínimo ${regras.minimoGrandePeriodo} dias corridos.`
    );
  }

  const ordenados = [...periodos].sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].inicio <= ordenados[i - 1].fim) {
      erros.push("Os períodos de gozo não podem se sobrepor.");
      break;
    }
  }
  return erros;
}

/**
 * Recesso do estagiário (Lei 11.788, proporcional): períodos em blocos de 5 dias, até 3
 * períodos, sem venda. Com 15 dias liberados (6 meses) cada período vai de 5 a 10 dias
 * (5+5+5, 5+10 ou 10+5 — nunca 15 corridos). Com 30 (1 ano) o bloco pode ir até 30.
 * `maxPeriodoDias`: 10 quando só há 15 dias liberados no ciclo, 30 nos demais casos.
 * `liberaEm`: data mínima de início (o gozo só vale depois do período aquisitivo).
 */
export function validarPeriodosEstagiario(opts: {
  periodos: PeriodoFerias[];
  maxPeriodoDias: number;
  regras: Pick<RegrasFerias, "antecedenciaMinDias" | "vedacaoPreFeriadoDias">;
  hoje: string;
  calendario: CalendarioFerias;
  liberaEm?: string | null;
  novos?: Set<number>;
  ignorarAntecedencia?: boolean;
  ignorarVedacao?: boolean;
}): string[] {
  const { periodos, regras, hoje, calendario } = opts;
  const erros: string[] = [];
  if (!periodos.length) return ["Informe ao menos um período de gozo."];
  if (periodos.length > 3) erros.push("Máximo de 3 períodos de recesso.");

  const minInicio = somarDiasIso(hoje, regras.antecedenciaMinDias);
  periodos.forEach((p, i) => {
    const n = i + 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(p.fim)) {
      erros.push(`Período ${n}: datas inválidas.`);
      return;
    }
    const dias = diasCorridos(p.inicio, p.fim);
    if (dias <= 0) {
      erros.push(`Período ${n}: a data fim deve ser igual ou posterior ao início.`);
      return;
    }
    if (dias % 5 !== 0) {
      erros.push(`Período ${n}: o recesso é dividido em blocos de 5 dias (informado: ${dias}).`);
    } else if (dias > opts.maxPeriodoDias) {
      erros.push(
        opts.maxPeriodoDias <= 10
          ? `Período ${n}: com 15 dias liberados divida em 5+5+5, 5+10 ou 10+5 (máximo de ${opts.maxPeriodoDias} dias por período).`
          : `Período ${n}: máximo de ${opts.maxPeriodoDias} dias.`
      );
    }
    if (opts.novos && !opts.novos.has(i)) return;
    if (opts.liberaEm && p.inicio < opts.liberaEm) {
      erros.push(
        `Período ${n}: o recesso só pode ser usufruído a partir de ${fmtBr(opts.liberaEm)}.`
      );
    }
    if (!opts.ignorarAntecedencia && p.inicio < minInicio) {
      erros.push(
        `Período ${n}: início deve ter pelo menos ${regras.antecedenciaMinDias} dia(s) de antecedência (a partir de ${fmtBr(minInicio)}).`
      );
    }
    const vedado = opts.ignorarVedacao
      ? null
      : motivoVedacaoInicio(p.inicio, regras.vedacaoPreFeriadoDias, calendario);
    if (vedado) {
      erros.push(
        `Período ${n}: o recesso não pode começar em dia sem expediente nem nos ${regras.vedacaoPreFeriadoDias} dias que antecedem feriado ou repouso semanal — ${vedado}`
      );
    }
  });

  const ordenados = [...periodos].sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].inicio <= ordenados[i - 1].fim) {
      erros.push("Os períodos de recesso não podem se sobrepor.");
      break;
    }
  }
  return erros;
}
