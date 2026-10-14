import { somarDiasCivil } from "./horario-brasilia";

/** Categorias com carga horária corrida — sem intervalo de almoço no ponto. */
export const CATEGORIAS_SEM_INTERVALO_ALMOCO = ["ESTAGIARIO", "MENOR_APRENDIZ"] as const;

export type CategoriaSemIntervaloAlmoco = (typeof CATEGORIAS_SEM_INTERVALO_ALMOCO)[number];

export function categoriaSemIntervaloAlmoco(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_INTERVALO_ALMOCO as readonly string[]).includes(categoria);
}

/**
 * Categorias que não visualizam banco de horas (self-service / relatórios do próprio funcionário).
 * GET /ponto/historico e /ponto/relatorio pulam o cálculo do ciclo nessas categorias;
 * RH/auditoria usa calcularBancoHorasAdmin.
 */
export const CATEGORIAS_SEM_VISIBILIDADE_BANCO_HORAS = ["ESTAGIARIO", "MENOR_APRENDIZ"] as const;

export function categoriaSemVisibilidadeBancoHoras(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_VISIBILIDADE_BANCO_HORAS as readonly string[]).includes(categoria);
}

export function labelCategoriaSemIntervalo(categoria: string): string {
  return categoria === "MENOR_APRENDIZ" ? "Jovem aprendiz" : "Estagiário";
}

/** Estagiário e jovem aprendiz não fazem hora extra: o excedente é só informativo. */
export const CATEGORIAS_SEM_HORA_EXTRA = ["ESTAGIARIO", "MENOR_APRENDIZ"] as const;

export function categoriaSemHoraExtra(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_HORA_EXTRA as readonly string[]).includes(categoria);
}

/** Categorias sem obrigação de bater ponto por si só (independente de isManager/isFiscal). */
export const CATEGORIAS_SEM_REGISTRO_PONTO = ["ASSESSOR"] as const;

export type CategoriaSemRegistroPonto = (typeof CATEGORIAS_SEM_REGISTRO_PONTO)[number];

export function categoriaSemRegistroPonto(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  return (CATEGORIAS_SEM_REGISTRO_PONTO as readonly string[]).includes(categoria);
}

/**
 * Situação relevante para decidir isenção de registro de ponto. "Chefe" (isManager) e
 * "Fiscal" (isFiscal) deixaram de ser categorias próprias (GERENTE) e passaram a ser
 * características combináveis com qualquer categoria — por isso a isenção não depende
 * mais só da categoria.
 */
export type SituacaoRegistroPonto = {
  categoria?: string | null;
  isManager?: boolean | null;
  isFiscal?: boolean | null;
  /** Override manual do RH (select "Registro de ponto"). true/false vence a sugestão automática. */
  registroPontoObrigatorio?: boolean | null;
};

/** Alguma vigência do histórico já era sem obrigação de ponto (chefe/comissionado)? */
function historicoTemIsencao(historico: VigenciaCategoria[]): boolean {
  return historico.some((v) => funcionarioSemRegistroPonto(v));
}

/** true = sem obrigação de ponto. Fonte única de verdade para funcionário (situação atual ou vigência histórica). */
export function funcionarioSemRegistroPonto(s: SituacaoRegistroPonto): boolean {
  if (s.registroPontoObrigatorio === true) return false;
  if (s.registroPontoObrigatorio === false) return true;
  return categoriaSemRegistroPonto(s.categoria) || !!s.isManager || !!s.isFiscal;
}

export function labelSemRegistroPonto(s: SituacaoRegistroPonto): string {
  if (s.isManager) return "Chefe";
  if (s.isFiscal) return "Assessor";
  return "Comissionado";
}

/** Texto exibido quando solicitação/histórico é só informativo (não entra em cálculo). */
export const MSG_SOLICITACAO_APENAS_INFORMATIVA =
  "Registro apenas informativo: não serve de base de cálculo de banco de horas, faltas ou jornada — inclusive após eventual mudança para categoria com obrigação de ponto.";

export type VigenciaCategoria = {
  categoria: string;
  /** Era chefe (isManager) durante esta vigência — ver FuncionarioCategoriaHistorico.isManager. */
  isManager?: boolean;
  /** Fiscal durante esta vigência (histórico de isenção). */
  isFiscal?: boolean;
  /** Override "registro de ponto" do RH durante esta vigência. */
  registroPontoObrigatorio?: boolean | null;
  vigenciaDesde: string; // YYYY-MM-DD
  vigenciaAte: string | null; // YYYY-MM-DD ou null = vigente
};

/** Resolve a vigência (categoria + isManager) vigente em um dia civil (YYYY-MM-DD). */
export function vigenciaNaData(
  diaIso: string,
  historico: VigenciaCategoria[]
): VigenciaCategoria | null {
  for (const v of historico) {
    if (diaIso < v.vigenciaDesde) continue;
    if (v.vigenciaAte && diaIso > v.vigenciaAte) continue;
    return v;
  }
  return null;
}

/**
 * Dia sem obrigação de ponto:
 * - vigência com categoria ASSESSOR e/ou isManager/isFiscal; ou
 * - antes da primeira vigência com obrigação (ex.: sempre foi assessor até virar concursado);
 * - fallback sem histórico: pontoObrigatorioDesde / situação atual.
 */
export function diaSemObrigacaoPonto(
  diaIso: string,
  opts: {
    historico: VigenciaCategoria[];
    categoriaAtual?: string | null;
    isManagerAtual?: boolean | null;
    isFiscalAtual?: boolean | null;
    registroPontoObrigatorioAtual?: boolean | null;
    pontoObrigatorioDesde?: string | null;
  }
): boolean {
  const { historico, pontoObrigatorioDesde } = opts;
  const atual: SituacaoRegistroPonto = {
    categoria: opts.categoriaAtual,
    isManager: opts.isManagerAtual,
    isFiscal: opts.isFiscalAtual,
    registroPontoObrigatorio: opts.registroPontoObrigatorioAtual
  };

  if (historico.length > 0) {
    const v = vigenciaNaData(diaIso, historico);
    if (v) {
      if (funcionarioSemRegistroPonto(v)) return true;
      /* O histórico guarda só categoria e "é chefe". Indicadores sem histórico (fiscal e o
         "ponto obrigatório" manual) valem pelo cadastro atual quando o histórico não tem
         nenhum período isento — igual ao Histórico do funcionário. Sem isso, um fiscal
         aparecia com falta e não conseguia assinar a folha. */
      return !historicoTemIsencao(historico) && funcionarioSemRegistroPonto(atual);
    }

    /* Antes de qualquer vigência registrada */
    const primeira = [...historico].sort((a, b) =>
      a.vigenciaDesde.localeCompare(b.vigenciaDesde)
    )[0];
    if (diaIso < primeira.vigenciaDesde) {
      if (pontoObrigatorioDesde) return diaIso < pontoObrigatorioDesde;
      return funcionarioSemRegistroPonto(primeira);
    }
    return funcionarioSemRegistroPonto(atual);
  }

  if (pontoObrigatorioDesde && diaIso < pontoObrigatorioDesde) return true;
  return funcionarioSemRegistroPonto(atual);
}

/** Lista períodos [inicio, fim] em que não havia obrigação de ponto. */
export function periodosSemObrigacaoPonto(
  historico: VigenciaCategoria[],
  opts?: {
    pontoObrigatorioDesde?: string | null;
    categoriaAtual?: string | null;
    isManagerAtual?: boolean | null;
    isFiscalAtual?: boolean | null;
    registroPontoObrigatorioAtual?: boolean | null;
  }
): Array<{ inicio: string; fim: string | null }> {
  const periodos: Array<{ inicio: string; fim: string | null }> = [];
  const atual: SituacaoRegistroPonto = {
    categoria: opts?.categoriaAtual,
    isManager: opts?.isManagerAtual,
    isFiscal: opts?.isFiscalAtual,
    registroPontoObrigatorio: opts?.registroPontoObrigatorioAtual
  };

  if (historico.length === 0) {
    if (opts?.pontoObrigatorioDesde) {
      periodos.push({ inicio: "1900-01-01", fim: somarDiasCivil(opts.pontoObrigatorioDesde, -1) });
    } else if (funcionarioSemRegistroPonto(atual)) {
      periodos.push({ inicio: "1900-01-01", fim: null });
    }
    return periodos;
  }

  const ordenado = [...historico].sort((a, b) => a.vigenciaDesde.localeCompare(b.vigenciaDesde));
  for (const v of ordenado) {
    if (funcionarioSemRegistroPonto(v)) {
      periodos.push({ inicio: v.vigenciaDesde, fim: v.vigenciaAte });
    }
  }

  /* Fiscal / "ponto obrigatório" manual não têm histórico: sem nenhum período isento no
     histórico, valem os indicadores do cadastro atual (mesma regra de diaSemObrigacaoPonto). */
  if (periodos.length === 0 && funcionarioSemRegistroPonto(atual)) {
    periodos.push({ inicio: "1900-01-01", fim: null });
  }

  return periodos;
}

/** Dia civil anterior (YYYY-MM-DD). */
export function diaAnteriorIso(diaIso: string): string {
  return somarDiasCivil(diaIso, -1);
}

/** Dia civil seguinte (YYYY-MM-DD). */
export function diaSeguinteIso(diaIso: string): string {
  return somarDiasCivil(diaIso, 1);
}
