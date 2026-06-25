export const FUSO_BRASILIA = "America/Sao_Paulo";
const OFFSET_BRASILIA = "-03:00";

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
export function formatTimeBrasilia(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_BRASILIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);
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
