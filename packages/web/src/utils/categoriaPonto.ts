/** Categorias sem obrigação de bater ponto (mantêm solicitações e demais fluxos). */
export const CATEGORIAS_SEM_REGISTRO_PONTO = ["ASSESSOR", "GERENTE"] as const;

export function categoriaSemRegistroPonto(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_REGISTRO_PONTO as readonly string[]).includes(categoria);
}

export function labelCategoriaSemRegistroPonto(categoria: string): string {
  return categoria === "GERENTE" ? "Gerente" : "Assessor";
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
