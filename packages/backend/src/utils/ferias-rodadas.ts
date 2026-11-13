import { dataCivilPeriodo } from "./horario-brasilia";

/**
 * Férias divididas: o 1º período segue o fluxo normal de Aviso + Recibo da solicitação.
 * Cada período seguinte (2º e 3º, em ordem cronológica) tem a sua própria "rodada" de
 * documentos e assinaturas, guardada em `metadados.rodadasFerias[ordem]`.
 */
export type SituacaoRodadaFerias = "AGUARDANDO_ASSINATURA" | "REJEITADA" | "CONCLUIDA";

export interface DocumentoRodadaFerias {
  tipo: string;
  rotulo?: string;
  nome?: string | null;
  url: string;
  urlAssinado?: string;
  assinatura?: Record<string, unknown>;
  rejeicao?: { nome: string; em: string; justificativa: string };
  /** Prorrogação do prazo feita pelo RH (data civil). */
  prazoProrrogadoAte?: string;
}

export interface RodadaFeriasMeta {
  ordem: number;
  inicio: string;
  fim: string;
  /** Sem situação = o RH ainda não enviou os documentos desta rodada. */
  situacao?: SituacaoRodadaFerias;
  documentos?: DocumentoRodadaFerias[];
  observacao?: string;
  enviadaEm?: string;
  concluidaEm?: string;
  /** Quando o RH foi avisado de que a rodada está perto do prazo. */
  avisoRhEm?: string;
}

export interface PeriodoRodada {
  ordem: number;
  inicio: string;
  fim: string;
}

/** Períodos a partir do 2º (ordem cronológica) que ainda não começaram. */
export function periodosComRodada(
  meta: Record<string, unknown> | null | undefined,
  hojeIso: string
): PeriodoRodada[] {
  const lista = Array.isArray(meta?.periodos)
    ? (meta!.periodos as Array<{ dataInicio?: string; dataFim?: string }>)
    : [];
  return lista
    .map((p) => ({
      inicio: dataCivilPeriodo(String(p.dataInicio ?? "")),
      fim: dataCivilPeriodo(String(p.dataFim ?? ""))
    }))
    .filter((p) => p.inicio && p.fim)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
    .map((p, i) => ({ ordem: i + 1, ...p }))
    .filter((p) => p.ordem >= 2 && p.inicio >= hojeIso);
}

/**
 * Situação da rodada a partir dos documentos já enviados (Aviso e Recibo independentes):
 * concluída só com Aviso e Recibo assinados; com algum rejeitado o RH precisa corrigir; senão, aguarda assinatura.
 */
export function situacaoDaRodada(
  docs: Array<{ tipo: string; urlAssinado?: string; rejeicao?: unknown }>
): SituacaoRodadaFerias {
  const assinado = (t: string) => docs.some((d) => d.tipo === t && !!d.urlAssinado);
  if (assinado("AVISO") && assinado("RECIBO")) return "CONCLUIDA";
  if (docs.some((d) => d.rejeicao && !d.urlAssinado)) return "REJEITADA";
  return "AGUARDANDO_ASSINATURA";
}

export function rodadasDe(
  meta: Record<string, unknown> | null | undefined
): Record<string, RodadaFeriasMeta> {
  const r = meta?.rodadasFerias;
  return r && typeof r === "object" && !Array.isArray(r)
    ? (r as Record<string, RodadaFeriasMeta>)
    : {};
}

/** Número usado no nome do arquivo (não colide com o 1º fluxo, que usa 1…n). */
export const ordemArquivoRodada = (ordem: number, indice: number) => ordem * 10 + indice + 1;
