export const FUSO_BRASILIA = "America/Sao_Paulo";
const OFFSET_BRASILIA = "-03:00";

export function dataBrasiliaParaPartes(data: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(data);

  return {
    year: parts.find((p) => p.type === "year")!.value,
    month: parts.find((p) => p.type === "month")!.value,
    day: parts.find((p) => p.type === "day")!.value
  };
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
export function hojeBrasiliaISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

/** Intervalo UTC correspondente a um dia civil em Brasília. */
export function intervaloDiaBrasilia(dataYYYYMMDD: string) {
  return {
    inicio: new Date(`${dataYYYYMMDD}T00:00:00${OFFSET_BRASILIA}`),
    fim: new Date(`${dataYYYYMMDD}T23:59:59.999${OFFSET_BRASILIA}`)
  };
}

/**
 * Aplica HH:mm no dia civil de dataBase (Brasília), retornando instante UTC correto.
 * Evita o deslocamento de 3h quando o servidor roda em UTC.
 */
export function aplicarHorarioBrasilia(dataBase: Date, horario: string): Date {
  const [h, m] = horario.split(":").map(Number);
  const { year, month, day } = dataBrasiliaParaPartes(dataBase);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return new Date(`${year}-${month}-${day}T${hh}:${mm}:00${OFFSET_BRASILIA}`);
}

export function horarioDeDataBrasilia(data: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_BRASILIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(data);
}

export function horarioParaMinutos(horario: string): number {
  const [h, m] = horario.split(":").map(Number);
  return h * 60 + m;
}

export function validarHorarioPermitido(
  horario: string,
  min: string,
  max: string
): { ok: true } | { ok: false; message: string } {
  const atual = horarioParaMinutos(horario);
  const minM = horarioParaMinutos(min);
  const maxM = horarioParaMinutos(max);
  if (atual < minM || atual > maxM) {
    return {
      ok: false,
      message: `Horário ${horario} fora da faixa permitida (${min}–${max}, horário de Brasília).`
    };
  }
  return { ok: true };
}
