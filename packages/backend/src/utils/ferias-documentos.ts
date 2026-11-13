/**
 * Prazos e lembretes dos documentos de férias (Aviso e Recibo). Funções PURAS, datas civis AAAA-MM-DD de Brasília.
 *  - Aviso de Férias: assinar até o 1º dia de gozo do período (inclusive).
 *  - Recibo de Férias: assinar até o último dia do mês em que o gozo do período termina.
 * Lembretes ao funcionário: 1 por semana e, nos últimos 4 dias do prazo (incluindo o último), 1 por dia.
 */
import { diasCorridos, somarDiasIso } from "./ferias-regras";

export type TipoDocumentoFerias = "AVISO" | "RECIBO" | "OUTROS";
export type SituacaoDocumentoFerias = "ENVIADO" | "ASSINADO" | "REJEITADO";

export interface DocumentoFeriasBase {
  tipo: string;
  urlAssinado?: string;
  rejeicao?: unknown;
  enviadoEm?: string;
  ultimoLembreteEm?: string;
  prazoProrrogadoAte?: string;
}

export const DIAS_LEMBRETE_DIARIO = 4;
export const INTERVALO_LEMBRETE_SEMANAL = 7;

/** Prazo do Aviso: o próprio 1º dia do gozo. */
export function prazoAviso(inicioPeriodo: string): string {
  return inicioPeriodo.slice(0, 10);
}

/** Prazo do Recibo: último dia do mês do fim do gozo. */
export function prazoRecibo(fimPeriodo: string): string {
  const [y, m] = fimPeriodo.slice(0, 10).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

/** Prazo do documento (OUTROS não tem prazo). */
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
  /* Prorrogação feita pelo RH: vale só se for posterior ao prazo legal. */
  const prorrogado = prorrogadoAte?.slice(0, 10);
  if (legal && prorrogado && /^\d{4}-\d{2}-\d{2}$/.test(prorrogado) && prorrogado > legal) {
    return prorrogado;
  }
  return legal;
}

/** Valida a nova data de prazo pedida pelo RH: formato, não no passado e posterior ao prazo vigente. */
export function validarProrrogacao(
  prazoVigente: string | null,
  novoPrazo: string,
  hojeIso: string
): string | null {
  if (!prazoVigente) return "Este documento não tem prazo para prorrogar.";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(novoPrazo) ||
    Number.isNaN(Date.parse(`${novoPrazo}T12:00:00Z`))
  ) {
    return "Informe a nova data limite (AAAA-MM-DD).";
  }
  if (novoPrazo < hojeIso) return "A nova data limite não pode estar no passado.";
  if (novoPrazo <= prazoVigente) {
    return "A nova data limite deve ser posterior ao prazo atual.";
  }
  return null;
}

export function situacaoDocumento(d: DocumentoFeriasBase): SituacaoDocumentoFerias {
  if (d.urlAssinado) return "ASSINADO";
  if (d.rejeicao) return "REJEITADO";
  return "ENVIADO";
}

/** Dias que faltam para o prazo (0 = vence hoje; negativo = vencido). */
export function diasParaPrazo(prazo: string, hojeIso: string): number {
  return diasCorridos(hojeIso, prazo) - 1;
}

export const prazoVencido = (prazo: string | null, hojeIso: string) =>
  !!prazo && diasParaPrazo(prazo, hojeIso) < 0;

/**
 * Deve lembrar o funcionário hoje? Só documento ENVIADO (não assinado, não rejeitado) e dentro do prazo.
 * Nos últimos 4 dias: diário; antes: semanal (a contar do envio ou do último lembrete). Nunca 2x no mesmo dia.
 */
export function precisaLembrete(
  doc: DocumentoFeriasBase,
  prazo: string | null,
  hojeIso: string
): boolean {
  if (situacaoDocumento(doc) !== "ENVIADO" || !prazo) return false;
  const dias = diasParaPrazo(prazo, hojeIso);
  if (dias < 0) return false;
  const ultimo = doc.ultimoLembreteEm?.slice(0, 10);
  if (ultimo === hojeIso) return false;
  if (dias <= DIAS_LEMBRETE_DIARIO - 1) return true;
  const referencia = ultimo ?? doc.enviadoEm?.slice(0, 10);
  if (!referencia) return false; /* sem data de envio confiável: não dispara em massa */
  return diasCorridos(referencia, hojeIso) - 1 >= INTERVALO_LEMBRETE_SEMANAL;
}

/** Data (dia civil) a partir da qual o RH deve ser alertado de documento vencido, repetido semanalmente. */
export function precisaAlertaVencidoRh(
  doc: DocumentoFeriasBase & { ultimoAlertaRhEm?: string },
  prazo: string | null,
  hojeIso: string
): boolean {
  if (situacaoDocumento(doc) !== "ENVIADO" || !prazoVencido(prazo, hojeIso)) return false;
  const ult = doc.ultimoAlertaRhEm?.slice(0, 10);
  if (ult === hojeIso) return false;
  if (!ult) return true;
  return diasCorridos(ult, hojeIso) - 1 >= INTERVALO_LEMBRETE_SEMANAL;
}

export { somarDiasIso };
