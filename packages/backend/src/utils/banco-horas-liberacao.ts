import type { PeriodoAbono } from "./abono-periodos";

/**
 * Tempo do banco de horas liberado pelo RH para o funcionário usar via Abono.
 *
 * - A liberação debita o saldo do banco na data em que o RH libera (linha no extrato).
 * - O tempo vira um crédito com validade (sobrevive à zeragem do ciclo).
 * - O abono que usa o crédito só o consome (`metadados.creditoBanco`); não mexe mais no banco.
 */

export const MINUTOS_MINIMOS_LIBERACAO = 15;
export const STATUS_SOLICITACAO_CREDITO_EM_USO = ["PENDENTE", "AGUARDANDO_RH", "APROVADA"] as const;

export interface LiberacaoBase {
  id: string;
  minutos: number;
  /** YYYY-MM-DD */
  validaAte: string;
  minutosRevogados: number;
  devolvidoAoBancoMin: number;
  /** YYYY-MM-DD (Brasília) em que o RH liberou */
  dataLiberacao: string;
  /** YYYY-MM-DD (Brasília) em que o RH revogou */
  dataRevogacao: string | null;
  cicloInicio: string | null;
}

export interface AlocacaoCredito {
  liberacaoId: string;
  minutos: number;
}

export interface CreditoBancoSolicitacao {
  minutosTotal: number;
  dias: Array<{ data: string; minutos: number }>;
  alocacao: AlocacaoCredito[];
}

export interface SituacaoLiberacao {
  id: string;
  minutosEfetivos: number;
  usadoMinutos: number;
  disponivelMinutos: number;
  vencida: boolean;
  validaAte: string;
}

export const fmtHoraMin = (min: number): string => {
  const sinal = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
};

/** Lê `metadados.creditoBanco` de uma solicitação de abono (null se não usa crédito). */
export function creditoBancoDaSolicitacao(metadados: unknown): CreditoBancoSolicitacao | null {
  const meta = (metadados ?? {}) as Record<string, unknown>;
  const c = meta.creditoBanco as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return null;
  const alocacao = Array.isArray(c.alocacao)
    ? (c.alocacao as Array<Record<string, unknown>>)
        .map((a) => ({ liberacaoId: String(a.liberacaoId ?? ""), minutos: Number(a.minutos ?? 0) }))
        .filter((a) => a.liberacaoId && a.minutos > 0)
    : [];
  const dias = Array.isArray(c.dias)
    ? (c.dias as Array<Record<string, unknown>>).map((d) => ({
        data: String(d.data ?? ""),
        minutos: Number(d.minutos ?? 0)
      }))
    : [];
  return { minutosTotal: Number(c.minutosTotal ?? 0), dias, alocacao };
}

/** Soma dos minutos já alocados por liberação, entre as solicitações de abono em uso. */
export function usoPorLiberacao(solicitacoes: Array<{ metadados: unknown }>): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const s of solicitacoes) {
    const c = creditoBancoDaSolicitacao(s.metadados);
    if (!c) continue;
    for (const a of c.alocacao) mapa.set(a.liberacaoId, (mapa.get(a.liberacaoId) ?? 0) + a.minutos);
  }
  return mapa;
}

export function situacaoDasLiberacoes(
  liberacoes: LiberacaoBase[],
  uso: Map<string, number>,
  hojeIso: string
): SituacaoLiberacao[] {
  return liberacoes.map((l) => {
    const minutosEfetivos = Math.max(0, l.minutos - l.minutosRevogados);
    const usadoMinutos = Math.min(minutosEfetivos, uso.get(l.id) ?? 0);
    const vencida = l.validaAte < hojeIso;
    return {
      id: l.id,
      minutosEfetivos,
      usadoMinutos,
      disponivelMinutos: vencida ? 0 : minutosEfetivos - usadoMinutos,
      vencida,
      validaAte: l.validaAte
    };
  });
}

export function totalDisponivel(situacoes: SituacaoLiberacao[]): number {
  return situacoes.reduce((s, x) => s + x.disponivelMinutos, 0);
}

/**
 * Aloca `minutos` nas liberações, da validade mais próxima para a mais distante.
 * `ateData`: último dia do abono — só usa liberações válidas até essa data.
 * Retorna null se não houver crédito suficiente.
 */
export function alocarCredito(
  situacoes: SituacaoLiberacao[],
  minutos: number,
  ultimaDataAbono: string
): AlocacaoCredito[] | null {
  const elegiveis = situacoes
    .filter((s) => s.disponivelMinutos > 0 && s.validaAte >= ultimaDataAbono)
    .sort((a, b) => a.validaAte.localeCompare(b.validaAte));
  let falta = minutos;
  const aloc: AlocacaoCredito[] = [];
  for (const s of elegiveis) {
    if (falta <= 0) break;
    const usa = Math.min(falta, s.disponivelMinutos);
    aloc.push({ liberacaoId: s.id, minutos: usa });
    falta -= usa;
  }
  return falta > 0 ? null : aloc;
}

const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

function diasDoPeriodo(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const cur = new Date(`${inicio}T12:00:00Z`);
  const end = new Date(`${fim}T12:00:00Z`);
  while (cur <= end && dias.length < 400) {
    dias.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dias;
}

const hhmmParaMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Minutos que o abono consome do crédito, dia a dia.
 * Dia inteiro = jornada do dia; parcial = faixa informada (limitada à jornada do dia).
 * Fim de semana (conforme `diasUteis`) e feriado contam 0.
 */
export function calcularMinutosDoAbono(opts: {
  periodos: PeriodoAbono[];
  diasUteis: boolean[];
  feriados: Set<string>;
  jornadaDiaMin: (iso: string) => number;
}): { minutosTotal: number; dias: Array<{ data: string; minutos: number }> } {
  const dias: Array<{ data: string; minutos: number }> = [];
  for (const p of opts.periodos) {
    for (const data of diasDoPeriodo(p.inicio, p.fim)) {
      const util = opts.diasUteis[diaDaSemana(data)] !== false && !opts.feriados.has(data);
      const jornada = util ? opts.jornadaDiaMin(data) : 0;
      let minutos = jornada;
      if (p.horarioInicio && p.horarioFim && jornada > 0) {
        const faixa = hhmmParaMin(p.horarioFim) - hhmmParaMin(p.horarioInicio);
        minutos = Math.max(0, Math.min(faixa, jornada));
      }
      dias.push({ data, minutos });
    }
  }
  return { minutosTotal: dias.reduce((s, d) => s + d.minutos, 0), dias };
}

export interface LinhaExtratoBanco {
  data: string;
  horasTrabalhadasMinutos: number;
  jornadaEsperadaMinutos: number;
  saldoDiaMinutos: number;
  saldoAcumuladoMinutos: number;
  observacao?: string;
  [k: string]: unknown;
}

/**
 * Aplica as liberações (−) e as devoluções por revogação (+) ao extrato do ciclo
 * [cicloInicio, cicloFim] e recalcula o acumulado. Devolve o extrato novo e o saldo final.
 */
export function aplicarLiberacoesNoExtrato<T extends LinhaExtratoBanco>(
  dias: T[],
  liberacoes: LiberacaoBase[],
  cicloInicio: string,
  cicloFim: string
): { dias: T[]; saldoAtualMinutos: number } {
  const movimentos: Array<{ data: string; minutos: number; texto: string }> = [];
  for (const l of liberacoes) {
    if (l.dataLiberacao >= cicloInicio && l.dataLiberacao <= cicloFim) {
      movimentos.push({
        data: l.dataLiberacao,
        minutos: -l.minutos,
        texto: `Liberado pelo RH para abono: −${fmtHoraMin(l.minutos)}`
      });
    }
    if (
      l.dataRevogacao &&
      l.devolvidoAoBancoMin > 0 &&
      l.dataRevogacao >= cicloInicio &&
      l.dataRevogacao <= cicloFim
    ) {
      movimentos.push({
        data: l.dataRevogacao,
        minutos: l.devolvidoAoBancoMin,
        texto: `Liberação revogada pelo RH: +${fmtHoraMin(l.devolvidoAoBancoMin)}`
      });
    }
  }
  if (!movimentos.length) {
    return { dias, saldoAtualMinutos: dias.at(-1)?.saldoAcumuladoMinutos ?? 0 };
  }

  const porData = new Map<string, T>();
  const lista: T[] = dias.map((d) => ({ ...d }));
  const acumOriginal = new Map<T, number>();
  for (const d of lista) {
    porData.set(d.data, d);
    acumOriginal.set(d, d.saldoAcumuladoMinutos);
  }
  const deltaPorLinha = new Map<T, number>();
  for (const m of movimentos) {
    let linha = porData.get(m.data);
    if (!linha) {
      linha = {
        data: m.data,
        horasTrabalhadasMinutos: 0,
        jornadaEsperadaMinutos: 0,
        saldoDiaMinutos: 0,
        saldoAcumuladoMinutos: 0
      } as T;
      lista.push(linha);
      porData.set(m.data, linha);
    }
    linha.saldoDiaMinutos += m.minutos;
    deltaPorLinha.set(linha, (deltaPorLinha.get(linha) ?? 0) + m.minutos);
    (linha as LinhaExtratoBanco).movimentoRhMinutos =
      Number((linha as LinhaExtratoBanco).movimentoRhMinutos ?? 0) + m.minutos;
    (linha as LinhaExtratoBanco).liberacaoRh = true;
    linha.observacao = linha.observacao ? `${linha.observacao} · ${m.texto}` : m.texto;
  }
  lista.sort((a, b) => a.data.localeCompare(b.data));
  /* Mantém o acumulado original (inclui zeragens internas) e soma só o efeito das liberações. */
  let acc = 0;
  let origAnterior = 0;
  let deltaAcum = 0;
  for (const d of lista) {
    deltaAcum += deltaPorLinha.get(d) ?? 0;
    const orig = acumOriginal.get(d) ?? origAnterior;
    origAnterior = orig;
    acc = orig + deltaAcum;
    d.saldoAcumuladoMinutos = acc;
  }
  return { dias: lista, saldoAtualMinutos: acc };
}
