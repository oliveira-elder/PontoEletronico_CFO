import {
  dataBrasiliaISO,
  dataCivilFimAfastamento,
  dataCivilPeriodo,
  fimDiaCivilBrasilia,
  intervaloDiaBrasilia
} from "./horario-brasilia";

/**
 * Períodos de uma solicitação de abono (`metadados.periodos`). Cada período é um intervalo
 * de dias civis de Brasília; horário só em período de 1 dia (sem horário = dia inteiro).
 * Abonos antigos (sem `periodos`) viram um único período a partir dos campos da solicitação.
 */
export interface PeriodoAbono {
  /** YYYY-MM-DD */
  inicio: string;
  /** YYYY-MM-DD */
  fim: string;
  horarioInicio: string | null;
  horarioFim: string | null;
}

type SolicitacaoComPeriodos = {
  dataInicio: Date | null;
  dataFim: Date | null;
  dataReferencia: Date;
  metadados: unknown;
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function horario(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** 00:00–23:59 (ou vazio) = dia inteiro → null/null. */
export function normalizarHorariosAbono(
  hi: string | null,
  hf: string | null
): { horarioInicio: string | null; horarioFim: string | null } {
  if (!hi || !hf || (hi === "00:00" && hf === "23:59")) {
    return { horarioInicio: null, horarioFim: null };
  }
  return { horarioInicio: hi, horarioFim: hf };
}

export function periodosDoAbono(s: SolicitacaoComPeriodos): PeriodoAbono[] {
  const meta = (s.metadados ?? {}) as Record<string, unknown>;
  if (Array.isArray(meta.periodos) && meta.periodos.length) {
    return (meta.periodos as Array<Record<string, unknown>>).map((p) => ({
      inicio: dataCivilPeriodo(String(p.dataInicio ?? "")),
      fim: dataCivilPeriodo(String(p.dataFim ?? p.dataInicio ?? "")),
      ...normalizarHorariosAbono(horario(p.horarioInicio), horario(p.horarioFim))
    }));
  }
  const ini = s.dataInicio ?? s.dataReferencia;
  return [
    {
      inicio: dataBrasiliaISO(ini),
      fim: dataCivilFimAfastamento(ini, s.dataFim ?? ini),
      ...normalizarHorariosAbono(horario(meta.horarioInicio), horario(meta.horarioFim))
    }
  ];
}

/** Instantes (Brasília) de cada período, para checar conflito entre solicitações. */
export function intervalosDaSolicitacao(s: SolicitacaoComPeriodos): Array<[Date, Date]> {
  const meta = (s.metadados ?? {}) as Record<string, unknown>;
  if (Array.isArray(meta.periodos) && meta.periodos.length) {
    return (meta.periodos as Array<Record<string, unknown>>).map((p) => [
      intervaloDiaBrasilia(dataCivilPeriodo(String(p.dataInicio ?? ""))).inicio,
      fimDiaCivilBrasilia(dataCivilPeriodo(String(p.dataFim ?? p.dataInicio ?? "")))
    ]);
  }
  const ini = s.dataInicio ?? s.dataReferencia;
  return [[ini, s.dataFim ?? ini]];
}

const fmtBr = (iso: string) => iso.split("-").reverse().join("/");

/** Erros de preenchimento dos períodos de abono (vazio = válido). */
export function validarPeriodosAbono(periodos: PeriodoAbono[]): string[] {
  const erros: string[] = [];
  if (!periodos.length) return ["Informe ao menos um período de abono."];
  periodos.forEach((p, i) => {
    const n = i + 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(p.fim)) {
      erros.push(`Período ${n}: datas inválidas.`);
      return;
    }
    if (p.fim < p.inicio) erros.push(`Período ${n}: a data final é anterior à inicial.`);
    if (p.horarioInicio || p.horarioFim) {
      if (p.fim !== p.inicio) {
        erros.push(
          `Período ${n}: horário parcial só vale em período de 1 dia (vários dias = dia inteiro).`
        );
      } else if (!HORA.test(p.horarioInicio ?? "") || !HORA.test(p.horarioFim ?? "")) {
        erros.push(`Período ${n}: horário inválido (use HH:MM).`);
      } else if ((p.horarioFim ?? "") <= (p.horarioInicio ?? "")) {
        erros.push(`Período ${n}: a hora final deve ser depois da inicial.`);
      }
    }
  });
  for (let i = 0; i < periodos.length; i++) {
    for (let j = i + 1; j < periodos.length; j++) {
      const a = periodos[i];
      const b = periodos[j];
      if (a.inicio > b.fim || b.inicio > a.fim) continue;
      /* Mesmo dia com dois horários parciais que não se cruzam: permitido. */
      const ambosParciais =
        a.inicio === a.fim && b.inicio === b.fim && a.horarioInicio && b.horarioInicio;
      if (
        ambosParciais &&
        ((a.horarioFim ?? "") <= (b.horarioInicio ?? "") ||
          (b.horarioFim ?? "") <= (a.horarioInicio ?? ""))
      ) {
        continue;
      }
      erros.push(`Os períodos ${i + 1} e ${j + 1} se sobrepõem (${fmtBr(b.inicio)}).`);
    }
  }
  return erros;
}
