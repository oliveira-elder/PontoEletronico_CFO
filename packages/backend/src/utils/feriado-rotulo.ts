/**
 * Abono do RH: tipo de dia configurado na aba Feriados que NÃO é feriado convencional.
 * O dia fica neutro no banco de horas para todos (mesmo com batidas), o registro de ponto
 * fica bloqueado e o status exibido nos históricos é exatamente o nome cadastrado.
 */
export const TIPO_ABONO = "ABONO";

export const TIPOS_FERIADO = ["NACIONAL", "DISTRITAL", "FACULTATIVO", "MANUAL", TIPO_ABONO];

export function ehDiaAbonado(f: { tipo?: string | null } | null | undefined): boolean {
  return f?.tipo === TIPO_ABONO;
}

/** Rótulo do dia nos históricos: abono → o nome puro; feriado → "Feriado: nome". */
export function rotuloFeriado(f: { nome: string; tipo?: string | null }): string {
  return ehDiaAbonado(f) ? f.nome : `Feriado: ${f.nome}`;
}
