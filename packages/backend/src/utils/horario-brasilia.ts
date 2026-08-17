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

/** Data civil (YYYY-MM-DD) de um instante, no fuso de Brasília. */
export function dataBrasiliaISO(data: Date): string {
  const { year, month, day } = dataBrasiliaParaPartes(data);
  return `${year}-${month}-${day}`;
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
  const norm = normalizarHorarioParcial(horario) || horario;
  const [h, m] = norm.split(":").map(Number);
  const { year, month, day } = dataBrasiliaParaPartes(dataBase);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return new Date(`${year}-${month}-${day}T${hh}:${mm}:00${OFFSET_BRASILIA}`);
}

/** Data/hora completa em pt-BR no fuso de Brasília. */
export function formatDateTimeBrasilia(
  data: Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "medium" }
): string {
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: FUSO_BRASILIA }).format(data);
}

export function horarioDeDataBrasilia(data: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_BRASILIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(data);
  const hRaw = parts.find((p) => p.type === "hour")?.value;
  const mRaw = parts.find((p) => p.type === "minute")?.value;
  if (hRaw != null && mRaw != null) {
    const h = Number(hRaw) % 24;
    const m = Number(mRaw);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_BRASILIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(data)
    .replace(/[^\d]/g, "")
    .replace(/^(\d{2})(\d{2}).*/, "$1:$2");
}

/**
 * Completa horário parcial: minutos omitidos viram 00.
 * "16" / "16:" → "16:00".
 */
export function normalizarHorarioParcial(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const comDoisPontos = t.match(/^(\d{1,2}):(\d{0,2})$/);
  if (comDoisPontos) {
    const h = Number(comDoisPontos[1]);
    const m = comDoisPontos[2] === "" ? 0 : Number(comDoisPontos[2]);
    if (h > 23 || m > 59 || Number.isNaN(h) || Number.isNaN(m)) return "";
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const digits = t.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 2) {
    const h = Number(digits);
    if (h > 23) return "";
    return `${String(h).padStart(2, "0")}:00`;
  }
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4).padEnd(2, "0"));
  if (h > 23 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function horarioParaMinutos(horario: string): number {
  const norm = normalizarHorarioParcial(horario) || horario;
  const [h, m] = norm.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

export function minutosParaHorario(minutos: number): string {
  const n = ((Math.round(minutos) % 1440) + 1440) % 1440;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
