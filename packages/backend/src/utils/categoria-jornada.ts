/** Categorias com carga horária corrida — sem intervalo de almoço no ponto. */
export const CATEGORIAS_SEM_INTERVALO_ALMOCO = ["ESTAGIARIO"] as const;

export type CategoriaSemIntervaloAlmoco = (typeof CATEGORIAS_SEM_INTERVALO_ALMOCO)[number];

export function categoriaSemIntervaloAlmoco(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_INTERVALO_ALMOCO as readonly string[]).includes(categoria);
}

/**
 * Categorias que não visualizam banco de horas (self-service / relatórios do próprio funcionário).
 * O cálculo continua no backend; RH/auditoria mantém acesso.
 */
export const CATEGORIAS_SEM_VISIBILIDADE_BANCO_HORAS = ["ESTAGIARIO", "MENOR_APRENDIZ"] as const;

export function categoriaSemVisibilidadeBancoHoras(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_VISIBILIDADE_BANCO_HORAS as readonly string[]).includes(categoria);
}

export function labelCategoriaSemIntervalo(categoria: string): string {
  void categoria;
  return "Estagiário";
}

/** Categorias sem obrigação de bater ponto (mantêm solicitações e demais fluxos). */
export const CATEGORIAS_SEM_REGISTRO_PONTO = ["ASSESSOR", "GERENTE"] as const;

export type CategoriaSemRegistroPonto = (typeof CATEGORIAS_SEM_REGISTRO_PONTO)[number];

export function categoriaSemRegistroPonto(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_REGISTRO_PONTO as readonly string[]).includes(categoria);
}

export function labelCategoriaSemRegistroPonto(categoria: string): string {
  return categoria === "GERENTE" ? "Gerente" : "Assessor";
}

/** Texto exibido quando solicitação/histórico é só informativo (não entra em cálculo). */
export const MSG_SOLICITACAO_APENAS_INFORMATIVA =
  "Registro apenas informativo: não serve de base de cálculo de banco de horas, faltas ou jornada — inclusive após eventual mudança para categoria com obrigação de ponto.";

export type VigenciaCategoria = {
  categoria: string;
  vigenciaDesde: string; // YYYY-MM-DD
  vigenciaAte: string | null; // YYYY-MM-DD ou null = vigente
};

/** Resolve a categoria vigente em um dia civil (YYYY-MM-DD). */
export function categoriaNaData(diaIso: string, historico: VigenciaCategoria[]): string | null {
  for (const v of historico) {
    if (diaIso < v.vigenciaDesde) continue;
    if (v.vigenciaAte && diaIso > v.vigenciaAte) continue;
    return v.categoria;
  }
  return null;
}

/**
 * Dia sem obrigação de ponto:
 * - categoria vigente ASSESSOR/GERENTE; ou
 * - antes da primeira vigência com obrigação (ex.: sempre foi assessor até virar concursado);
 * - fallback sem histórico: pontoObrigatorioDesde / categoria atual.
 */
export function diaSemObrigacaoPonto(
  diaIso: string,
  opts: {
    historico: VigenciaCategoria[];
    categoriaAtual?: string | null;
    pontoObrigatorioDesde?: string | null;
  }
): boolean {
  const { historico, categoriaAtual, pontoObrigatorioDesde } = opts;

  if (historico.length > 0) {
    const cat = categoriaNaData(diaIso, historico);
    if (cat) return categoriaSemRegistroPonto(cat);

    /* Antes de qualquer vigência registrada */
    const primeira = [...historico].sort((a, b) =>
      a.vigenciaDesde.localeCompare(b.vigenciaDesde)
    )[0];
    if (diaIso < primeira.vigenciaDesde) {
      if (pontoObrigatorioDesde) return diaIso < pontoObrigatorioDesde;
      return categoriaSemRegistroPonto(primeira.categoria);
    }
    return categoriaSemRegistroPonto(categoriaAtual);
  }

  if (pontoObrigatorioDesde && diaIso < pontoObrigatorioDesde) return true;
  return categoriaSemRegistroPonto(categoriaAtual);
}

/** Lista períodos [inicio, fim] em que não havia obrigação de ponto. */
export function periodosSemObrigacaoPonto(
  historico: VigenciaCategoria[],
  opts?: { pontoObrigatorioDesde?: string | null; categoriaAtual?: string | null }
): Array<{ inicio: string; fim: string | null }> {
  const periodos: Array<{ inicio: string; fim: string | null }> = [];

  if (historico.length === 0) {
    if (opts?.pontoObrigatorioDesde) {
      const d = new Date(`${opts.pontoObrigatorioDesde}T12:00:00-03:00`);
      d.setDate(d.getDate() - 1);
      const fim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      periodos.push({ inicio: "1900-01-01", fim });
    } else if (categoriaSemRegistroPonto(opts?.categoriaAtual)) {
      periodos.push({ inicio: "1900-01-01", fim: null });
    }
    return periodos;
  }

  const ordenado = [...historico].sort((a, b) => a.vigenciaDesde.localeCompare(b.vigenciaDesde));
  for (const v of ordenado) {
    if (categoriaSemRegistroPonto(v.categoria)) {
      periodos.push({ inicio: v.vigenciaDesde, fim: v.vigenciaAte });
    }
  }

  return periodos;
}

/** Dia civil anterior (YYYY-MM-DD) em calendário local simples. */
export function diaAnteriorIso(diaIso: string): string {
  const [y, m, d] = diaIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Dia civil seguinte (YYYY-MM-DD). */
export function diaSeguinteIso(diaIso: string): string {
  const [y, m, d] = diaIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
