import { dataBrasiliaISO } from "./horario-brasilia";

type MetaHorario = { horarioInicio?: unknown; horarioFim?: unknown };

export type AfastamentoComHorario = {
  id?: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  horarioInicio?: string | null;
  horarioFim?: string | null;
  [key: string]: unknown;
};

/**
 * Completa horarioInicio/horarioFim de afastamentos ATESTADO a partir das
 * solicitações aprovadas (corrige históricos anteriores ao campo no Afastamento).
 * Se `persist` for true e o Prisma estiver disponível no caller, aktualiza o banco.
 */
export function horariosDeMetadados(meta: unknown): {
  horarioInicio: string;
  horarioFim: string;
} | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as MetaHorario;
  const hi =
    typeof m.horarioInicio === "string" && m.horarioInicio.trim() ? m.horarioInicio.trim() : null;
  const hf = typeof m.horarioFim === "string" && m.horarioFim.trim() ? m.horarioFim.trim() : null;
  if (!hi || !hf) return null;
  return { horarioInicio: hi, horarioFim: hf };
}

export function enriquecerAfastamentosComSolicitacoes<T extends AfastamentoComHorario>(
  afastamentos: T[],
  solicitacoes: Array<{
    dataInicio: Date | null;
    dataFim: Date | null;
    dataReferencia: Date;
    metadados: unknown;
  }>
): T[] {
  const solsParciais = solicitacoes
    .map((s) => {
      const h = horariosDeMetadados(s.metadados);
      if (!h) return null;
      return {
        diaInicio: dataBrasiliaISO(s.dataInicio ?? s.dataReferencia),
        diaFim: dataBrasiliaISO(s.dataFim ?? s.dataInicio ?? s.dataReferencia),
        ...h
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  if (!solsParciais.length) return afastamentos;

  return afastamentos.map((a) => {
    if (a.tipo !== "ATESTADO") return a;
    if (a.horarioInicio && a.horarioFim) return a;
    const aIni = dataBrasiliaISO(a.dataInicio);
    const aFim = dataBrasiliaISO(a.dataFim);
    const match = solsParciais.find((s) => s.diaInicio === aIni && s.diaFim === aFim);
    if (!match) return a;
    return {
      ...a,
      horarioInicio: match.horarioInicio,
      horarioFim: match.horarioFim
    };
  });
}
