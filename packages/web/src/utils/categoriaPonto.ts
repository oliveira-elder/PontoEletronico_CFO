/** Categorias sem obrigação de bater ponto por si só (independente de isManager/isFiscal). */
export const CATEGORIAS_SEM_REGISTRO_PONTO = ["ASSESSOR"] as const;

export function categoriaSemRegistroPonto(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_REGISTRO_PONTO as readonly string[]).includes(categoria);
}

/**
 * "Chefe" (isManager) e "Fiscal" (isFiscal) deixaram de ser categorias próprias (GERENTE)
 * e passaram a ser características combináveis com qualquer categoria.
 */
export type SituacaoRegistroPonto = {
  categoria?: string | null;
  isManager?: boolean | null;
  isFiscal?: boolean | null;
  registroPontoObrigatorio?: boolean | null;
};

export function funcionarioSemRegistroPonto(s: SituacaoRegistroPonto): boolean {
  if (s.registroPontoObrigatorio === true) return false;
  if (s.registroPontoObrigatorio === false) return true;
  return categoriaSemRegistroPonto(s.categoria) || !!s.isManager || !!s.isFiscal;
}

/**
 * Estagiário e Jovem Aprendiz não veem banco de horas (página, links, relatórios self-service).
 * O cálculo permanece no backend; RH vê em auditoria.
 */
export const CATEGORIAS_SEM_VISIBILIDADE_BANCO_HORAS = ["ESTAGIARIO", "MENOR_APRENDIZ"] as const;

export function categoriaSemVisibilidadeBancoHoras(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_VISIBILIDADE_BANCO_HORAS as readonly string[]).includes(categoria);
}

export function labelSemRegistroPonto(s: SituacaoRegistroPonto): string {
  if (s.isManager) return "Chefe";
  if (s.isFiscal) return "Fiscal";
  return "Comissionado";
}

/** Texto do ícone informativo — solicitações de assessor/gerente no histórico. */
export const MSG_SOLICITACAO_APENAS_INFORMATIVA =
  "Registro apenas informativo: não serve de base de cálculo de banco de horas, faltas ou jornada — inclusive após eventual mudança para categoria com obrigação de ponto.";

export function diaEmPeriodoSemObrigacao(
  isoKey: string,
  periodos: Array<{ inicio: string; fim: string | null }> | undefined,
  fallback?: { semRegistroPonto?: boolean; pontoObrigatorioDesde?: string | null }
): boolean {
  if (periodos && periodos.length > 0) {
    return periodos.some((p) => isoKey >= p.inicio && (p.fim == null || isoKey <= p.fim));
  }
  if (fallback?.semRegistroPonto) return true;
  if (fallback?.pontoObrigatorioDesde && isoKey < fallback.pontoObrigatorioDesde) return true;
  return false;
}
