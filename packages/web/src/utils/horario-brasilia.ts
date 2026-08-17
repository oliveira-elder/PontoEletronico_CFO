export const FUSO_BRASILIA = "America/Sao_Paulo";
const OFFSET_BRASILIA = "-03:00";

/** YYYY-MM-DD de hoje no fuso de Brasília. */
export function hojeBrasiliaISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

type DateInput = string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data/hora completa em pt-BR no fuso de Brasília. */
export function formatDateTimeBrasilia(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "medium" }
): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: FUSO_BRASILIA }).format(d);
}

/** Somente data em pt-BR (Brasília). */
export function formatDateBrasilia(value: DateInput): string {
  return formatDateTimeBrasilia(value, { dateStyle: "short" });
}

/** Somente hora HH:mm em Brasília. */
export function horarioHHMMBrasilia(d: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: FUSO_BRASILIA,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(d);
    const hRaw = parts.find((p) => p.type === "hour")?.value;
    const mRaw = parts.find((p) => p.type === "minute")?.value;
    if (hRaw != null && mRaw != null) {
      const h = Number(hRaw) % 24;
      const m = Number(mRaw);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }
    }
  } catch {
    /* relógio local */
  }
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatTimeBrasilia(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "—";
  return horarioHHMMBrasilia(d);
}

/** Rótulo de hora para gráficos (ex.: 14h). */
export function formatHourLabelBrasilia(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "—";
  const hour = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASILIA,
    hour: "2-digit",
    hour12: false
  }).format(d);
  return `${hour}h`;
}

/** Converte valor de input datetime-local (sem fuso) para ISO UTC, interpretando como Brasília. */
export function datetimeLocalBrasiliaParaIso(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const d = new Date(`${normalized}${OFFSET_BRASILIA}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Completa horário parcial: minutos omitidos viram 00.
 * "16" / "16:" → "16:00"; "9" → "09:00"; "16:3" → "16:03".
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

  if (digits.length === 3) {
    const h2 = Number(digits.slice(0, 2));
    const m1 = Number(digits.slice(2));
    if (h2 <= 23 && m1 <= 59) {
      return `${String(h2).padStart(2, "0")}:${String(m1).padStart(2, "0")}`;
    }
    const h1 = Number(digits.slice(0, 1));
    const m2 = Number(digits.slice(1));
    if (h1 <= 23 && m2 <= 59) {
      return `${String(h1).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
    }
    return "";
  }

  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4));
  if (h > 23 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Data por extenso em pt-BR, com preposições em minúsculas.
 * Ex.: "Segunda-feira, 17 de agosto de 2026"
 */
export function formatarDataExtensoPt(
  d: Date,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }
): string {
  const raw = d.toLocaleDateString("pt-BR", options);
  if (!raw) return raw;
  return raw.charAt(0).toLocaleUpperCase("pt-BR") + raw.slice(1);
}
