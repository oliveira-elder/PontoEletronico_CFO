export type PeriodoPonto = "MATUTINO" | "VESPERTINO" | "NOTURNO";

/** Meio-dia: fronteira matutino → vespertino. */
export const LIMITE_PERIODO_MATUTINO = "12:00";
/** 18h: fronteira vespertino → noturno. */
export const LIMITE_PERIODO_VESPERTINO = "18:00";

function horarioParaMinutos(horaHHMM: string): number | null {
  const m = horaHHMM
    .trim()
    .substring(0, 5)
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Classifica o horário da batida em matutino, vespertino ou noturno.
 * — Matutino: 0h–12h
 * — Vespertino: 12h–18h
 * — Noturno: 18h–0h
 */
export function classificarPeriodoHorario(horaHHMM: string): PeriodoPonto | null {
  const hora = horarioParaMinutos(horaHHMM);
  if (hora == null) return null;
  const meioDia = 12 * 60;
  const inicioNoturno = 18 * 60;
  if (hora < meioDia) return "MATUTINO";
  if (hora < inicioNoturno) return "VESPERTINO";
  return "NOTURNO";
}

export function tituloPeriodoPonto(periodo: PeriodoPonto): string {
  if (periodo === "MATUTINO") {
    return "Registrado no período matutino (0h às 12h)";
  }
  if (periodo === "VESPERTINO") {
    return "Registrado no período vespertino (12h às 18h)";
  }
  return "Registrado no período noturno (18h às 0h)";
}

export function labelPeriodoPonto(periodo: PeriodoPonto): string {
  if (periodo === "VESPERTINO") return "Vespertino";
  if (periodo === "NOTURNO") return "Noturno";
  return "Matutino";
}
