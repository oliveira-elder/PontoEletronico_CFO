/**
 * Prazos dos documentos de férias — espelho de packages/backend/src/utils/ferias-documentos.ts (mantenha iguais).
 *  - Aviso de Férias: assinar até o 1º dia de gozo do período (inclusive).
 *  - Recibo de Férias: assinar até o último dia do mês em que o gozo do período termina.
 */
import { dataCivilPeriodo } from "./horario-brasilia";

export const prazoAviso = (inicioPeriodo: string) => inicioPeriodo.slice(0, 10);

export function prazoRecibo(fimPeriodo: string): string {
  const [y, m] = fimPeriodo.slice(0, 10).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

export function prazoDocumento(
  tipo: string,
  periodo: { inicio: string; fim: string },
  prorrogadoAte?: string | null
): string | null {
  const legal =
    tipo === "AVISO"
      ? prazoAviso(periodo.inicio)
      : tipo === "RECIBO"
        ? prazoRecibo(periodo.fim)
        : null;
  const prorrogado = prorrogadoAte?.slice(0, 10);
  if (legal && prorrogado && /^\d{4}-\d{2}-\d{2}$/.test(prorrogado) && prorrogado > legal) {
    return prorrogado;
  }
  return legal;
}

/** Dias que faltam para o prazo (0 = vence hoje; negativo = vencido). */
export function diasParaPrazo(prazo: string, hojeIso: string): number {
  const u = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((u(prazo) - u(hojeIso)) / 86400000);
}

/** 1º período de gozo (ordem cronológica) dos metadados da solicitação de férias. */
export function primeiroPeriodoFerias(
  meta: Record<string, unknown> | null | undefined
): { inicio: string; fim: string } | null {
  const lista = Array.isArray(meta?.periodos)
    ? (meta!.periodos as Array<{ dataInicio?: string; dataFim?: string }>)
    : [];
  const ordenados = lista
    .map((p) => ({
      inicio: dataCivilPeriodo(String(p.dataInicio ?? "")),
      fim: dataCivilPeriodo(String(p.dataFim ?? p.dataInicio ?? ""))
    }))
    .filter((p) => p.inicio && p.fim)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  return ordenados[0] ?? null;
}

/** Texto do prazo: "prazo 14/12/2026 · faltam 5 dias" / "vence hoje" / "prazo vencido em …". */
export function textoPrazo(
  prazo: string | null,
  hojeIso: string
): { texto: string; vencido: boolean } | null {
  if (!prazo) return null;
  const dias = diasParaPrazo(prazo, hojeIso);
  const data = prazo.split("-").reverse().join("/");
  if (dias < 0) return { texto: `prazo vencido em ${data}`, vencido: true };
  if (dias === 0) return { texto: `prazo ${data} · vence hoje`, vencido: false };
  return {
    texto: `prazo ${data} · ${dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}`,
    vencido: false
  };
}
