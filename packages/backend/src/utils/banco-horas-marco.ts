/** Utilitários para datas marco do banco de horas (recorrência anual dia/mês). */

export type MarcoBancoHorasRef = {
  dia: number;
  mes: number;
  /** null = recorrente todo ano; preenchido = só naquele ano */
  ano?: number | null;
};

/** Último dia válido do mês (1–12) no ano informado. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Monta YYYY-MM-DD; dia inválido (ex. 31/02) é clampado ao último dia do mês. */
export function isoDeDiaMes(ano: number, mes: number, dia: number): string {
  const max = diasNoMes(ano, mes);
  const d = Math.min(Math.max(1, dia), max);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function chaveMarcoAnual(mes: number, dia: number): string {
  return `A-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function chaveMarcoUnico(ano: number, mes: number, dia: number): string {
  return `U-${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function diaSeguinteIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate()
  ).padStart(2, "0")}`;
}

/**
 * Expande marcos em datas civis YYYY-MM-DD no intervalo de anos [anoMin, anoMax].
 * Marcos anuais geram uma data por ano; marcos com ano fixo só naquele ano.
 */
export function expandirMarcosIso(
  marcos: MarcoBancoHorasRef[],
  anoMin: number,
  anoMax: number
): string[] {
  const set = new Set<string>();
  for (const m of marcos) {
    if (m.ano != null) {
      if (m.ano >= anoMin && m.ano <= anoMax) {
        set.add(isoDeDiaMes(m.ano, m.mes, m.dia));
      }
      continue;
    }
    for (let y = anoMin; y <= anoMax; y++) {
      set.add(isoDeDiaMes(y, m.mes, m.dia));
    }
  }
  return [...set].sort();
}

/** A partir de marcos e a data de hoje, calcula início do ciclo e próxima zeragem. */
export function resolverCicloBancoHoras(
  marcos: MarcoBancoHorasRef[],
  hojeIso: string
): { cicloInicio: string | null; proximaZeragem: string | null } {
  const [y] = hojeIso.split("-").map(Number);
  const marcosIso = expandirMarcosIso(marcos, y - 5, y + 2);
  const marcosPassados = marcosIso.filter((d) => d <= hojeIso);
  const marcosFuturos = marcosIso.filter((d) => d > hojeIso);

  const cicloInicio =
    marcosPassados.length > 0 ? diaSeguinteIso(marcosPassados[marcosPassados.length - 1]) : null;
  const proximaZeragem = marcosFuturos.length > 0 ? marcosFuturos[0] : null;
  return { cicloInicio, proximaZeragem };
}
