import { validarPeriodosAbono, type PeriodoAbono } from "./abono-periodos";

/**
 * Tipos de licença configuráveis (art. 473 da CLT e ACT). As regras são editadas pelo RH em
 * Configurações → Solicitações; os valores abaixo são só os padrões carregados na 1ª consulta.
 */

export type ModoDuracao = "LIMITE" | "FIXO" | "LIVRE";
export type ContagemLicenca = "CORRIDOS" | "UTEIS";
export type UnidadeLicenca = "DIAS" | "OCORRENCIAS";
export type EfeitoLicenca = "AFASTAMENTO" | "REDUCAO_JORNADA";

export interface TipoLicencaRegra {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  categorias: string[];
  modoDuracao: ModoDuracao;
  limiteDias: number | null;
  prorrogacaoDias: number | null;
  contagem: ContagemLicenca;
  consecutivos: boolean;
  unidade: UnidadeLicenca;
  janelaMeses: number | null;
  limiteNaJanela: number | null;
  permiteParcial: boolean;
  exigeDocumento: boolean;
  orientacao: string | null;
  efeito: EfeitoLicenca;
  reducaoMaxPct: number | null;
  codigoSistema: string | null;
}

export type TipoLicencaEntrada = Omit<TipoLicencaRegra, "id" | "ordem" | "codigoSistema"> & {
  ordem?: number;
};

const base = (
  nome: string,
  o: Partial<TipoLicencaEntrada> & { codigoSistema?: string }
): Omit<TipoLicencaRegra, "id" | "ordem"> => ({
  nome,
  ativo: true,
  categorias: [],
  modoDuracao: "LIMITE",
  limiteDias: null,
  prorrogacaoDias: null,
  contagem: "CORRIDOS",
  consecutivos: true,
  unidade: "DIAS",
  janelaMeses: null,
  limiteNaJanela: null,
  permiteParcial: false,
  exigeDocumento: false,
  orientacao: null,
  efeito: "AFASTAMENTO",
  reducaoMaxPct: null,
  codigoSistema: null,
  ...o
});

/** Padrões do RH do conselho (todos editáveis; nenhum valor é mínimo legal imposto pelo sistema). */
export const TIPOS_LICENCA_PADRAO: Array<Omit<TipoLicencaRegra, "id" | "ordem">> = [
  base("Afastamento INSS", {
    modoDuracao: "LIVRE",
    exigeDocumento: true,
    orientacao: "Anexe o comprovante do afastamento (INSS)."
  }),
  base("Licença Maternidade", {
    codigoSistema: "MATERNIDADE",
    modoDuracao: "FIXO",
    limiteDias: 120,
    prorrogacaoDias: 60,
    exigeDocumento: true,
    orientacao: "Anexe a certidão de nascimento ou o atestado médico."
  }),
  base("Licença Paternidade", {
    codigoSistema: "PATERNIDADE",
    modoDuracao: "FIXO",
    limiteDias: 5,
    prorrogacaoDias: 15,
    exigeDocumento: true,
    orientacao: "Anexe a certidão de nascimento, adoção ou guarda."
  }),
  base("Licença Nojo", {
    limiteDias: 2,
    exigeDocumento: true,
    orientacao: "Anexe a certidão de óbito."
  }),
  base("Licença Gala", {
    limiteDias: 3,
    exigeDocumento: true,
    orientacao: "Anexe a certidão de casamento."
  }),
  base("Doação de Sangue", {
    limiteDias: 1,
    janelaMeses: 12,
    limiteNaJanela: 1,
    exigeDocumento: true,
    orientacao: "Anexe o comprovante de doação."
  }),
  base("Alistamento Eleitoral", {
    limiteDias: 2,
    consecutivos: false,
    exigeDocumento: true,
    orientacao: "Anexe o comprovante do alistamento."
  }),
  base("Comparecimento ao Tribunal do Júri", {
    modoDuracao: "LIVRE",
    exigeDocumento: true,
    orientacao: "Anexe a convocação ou a declaração de comparecimento."
  }),
  base("Comparecimento à Justiça Eleitoral", {
    modoDuracao: "LIVRE",
    exigeDocumento: true,
    orientacao: "Anexe a convocação ou a declaração de comparecimento."
  }),
  base("Serviço Militar", {
    modoDuracao: "LIVRE",
    exigeDocumento: true,
    orientacao: "Anexe a convocação ou o comprovante do período."
  }),
  base("Exames Preventivos de Câncer e do HPV", {
    limiteDias: 3,
    consecutivos: false,
    janelaMeses: 12,
    limiteNaJanela: 3,
    permiteParcial: true,
    exigeDocumento: true,
    orientacao: "Anexe o comprovante do exame."
  }),
  base("Consulta médica de filho (até 6 anos)", {
    limiteDias: 1,
    consecutivos: false,
    janelaMeses: 12,
    limiteNaJanela: 1,
    permiteParcial: true,
    exigeDocumento: true,
    orientacao: "Anexe o comprovante da consulta."
  }),
  base("Acompanhamento durante gravidez (até 6)", {
    unidade: "OCORRENCIAS",
    limiteDias: 6,
    consecutivos: false,
    janelaMeses: 12,
    limiteNaJanela: 6,
    permiteParcial: true,
    exigeDocumento: true,
    orientacao: "Anexe o comprovante de cada consulta ou exame."
  }),
  base("Redução de jornada para avaliações – Estagiário", {
    categorias: ["ESTAGIARIO"],
    efeito: "REDUCAO_JORNADA",
    reducaoMaxPct: 50,
    consecutivos: false,
    permiteParcial: true,
    exigeDocumento: true,
    orientacao: "Anexe o calendário de avaliações da instituição de ensino."
  })
];

/* ─── Validação dos campos numéricos (sem negativo e sem zero à esquerda) ─── */

const INTEIRO_SEM_ZERO_ESQUERDA = /^(0|[1-9]\d*)$/;

/** Retorna o inteiro, null para vazio, ou lança Error com a mensagem do campo. */
export function inteiroConfig(valor: unknown, campo: string): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const txt = typeof valor === "number" ? String(valor) : String(valor).trim();
  if (txt === "") return null;
  if (!INTEIRO_SEM_ZERO_ESQUERDA.test(txt)) {
    throw new Error(`${campo}: use um número inteiro sem negativo e sem zero à esquerda.`);
  }
  const n = Number(txt);
  if (!Number.isSafeInteger(n) || n > 36500) {
    throw new Error(`${campo}: valor muito grande.`);
  }
  return n;
}

const CATEGORIAS_VALIDAS = ["ESTAGIARIO", "MENOR_APRENDIZ", "CONCURSADO", "ASSESSOR"];

/** Normaliza e valida a entrada do RH. Lança Error com a lista de problemas. */
export function normalizarTipoLicenca(
  entrada: Record<string, unknown>,
  categoriasConhecidas: string[] = CATEGORIAS_VALIDAS
): Omit<TipoLicencaRegra, "id" | "ordem" | "codigoSistema"> {
  const erros: string[] = [];
  const tenta = <T>(fn: () => T, padrao: T): T => {
    try {
      return fn();
    } catch (e) {
      erros.push((e as Error).message);
      return padrao;
    }
  };
  const nome = String(entrada.nome ?? "").trim();
  if (nome.length < 3) erros.push("Informe o nome do tipo (mínimo de 3 caracteres).");
  if (nome.length > 120) erros.push("Nome muito longo (máximo de 120 caracteres).");

  const modoDuracao = String(entrada.modoDuracao ?? "LIMITE") as ModoDuracao;
  if (!["LIMITE", "FIXO", "LIVRE"].includes(modoDuracao)) erros.push("Modo de duração inválido.");
  const contagem = String(entrada.contagem ?? "CORRIDOS") as ContagemLicenca;
  if (!["CORRIDOS", "UTEIS"].includes(contagem)) erros.push("Contagem inválida.");
  const unidade = String(entrada.unidade ?? "DIAS") as UnidadeLicenca;
  if (!["DIAS", "OCORRENCIAS"].includes(unidade)) erros.push("Unidade inválida.");
  const efeito = String(entrada.efeito ?? "AFASTAMENTO") as EfeitoLicenca;
  if (!["AFASTAMENTO", "REDUCAO_JORNADA"].includes(efeito)) erros.push("Efeito inválido.");

  const limiteDias = tenta(() => inteiroConfig(entrada.limiteDias, "Limite (dias)"), null);
  const prorrogacaoDias = tenta(
    () => inteiroConfig(entrada.prorrogacaoDias, "Prorrogação (dias)"),
    null
  );
  const janelaMeses = tenta(() => inteiroConfig(entrada.janelaMeses, "Janela (meses)"), null);
  const limiteNaJanela = tenta(
    () => inteiroConfig(entrada.limiteNaJanela, "Limite na janela"),
    null
  );
  const reducaoMaxPct = tenta(
    () => inteiroConfig(entrada.reducaoMaxPct, "Redução máxima (%)"),
    null
  );
  if (reducaoMaxPct !== null && reducaoMaxPct > 100) {
    erros.push("Redução máxima (%): não pode passar de 100.");
  }
  if (efeito === "REDUCAO_JORNADA" && !reducaoMaxPct) {
    erros.push("Informe a redução máxima (%) da jornada para este tipo.");
  }
  if (modoDuracao === "FIXO" && !limiteDias) {
    erros.push("Para duração fixa, informe a quantidade de dias (maior que zero).");
  }

  const categorias = Array.isArray(entrada.categorias)
    ? (entrada.categorias as unknown[]).map(String)
    : [];
  const invalida = categorias.find((c) => !categoriasConhecidas.includes(c));
  if (invalida) erros.push(`Categoria inválida: ${invalida}.`);

  if (erros.length) throw new Error(erros.join(" "));
  return {
    nome,
    ativo: entrada.ativo === undefined ? true : !!entrada.ativo,
    categorias,
    modoDuracao,
    limiteDias,
    prorrogacaoDias,
    contagem,
    consecutivos: entrada.consecutivos === undefined ? true : !!entrada.consecutivos,
    unidade,
    janelaMeses,
    limiteNaJanela,
    permiteParcial: !!entrada.permiteParcial,
    exigeDocumento: !!entrada.exigeDocumento,
    orientacao: String(entrada.orientacao ?? "").trim() || null,
    efeito,
    reducaoMaxPct,
    ...(entrada.ordem !== undefined ? { ordem: Number(entrada.ordem) } : {})
  } as Omit<TipoLicencaRegra, "id" | "ordem" | "codigoSistema">;
}

/* ─── Resumo da regra (gerado a partir dos campos) ─── */

export function resumoRegra(
  t: Pick<
    TipoLicencaRegra,
    | "modoDuracao"
    | "limiteDias"
    | "prorrogacaoDias"
    | "contagem"
    | "consecutivos"
    | "unidade"
    | "janelaMeses"
    | "limiteNaJanela"
    | "efeito"
    | "reducaoMaxPct"
  >
): string {
  const partes: string[] = [];
  const dias = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;
  const adj = t.contagem === "UTEIS" ? "úteis" : t.consecutivos ? "consecutivos" : "corridos";
  if (t.efeito === "REDUCAO_JORNADA") {
    partes.push(`redução de até ${t.reducaoMaxPct ?? 0}% da jornada`);
  } else if (t.modoDuracao === "LIVRE" || !t.limiteDias) {
    partes.push("pelo tempo necessário");
  } else if (t.unidade === "OCORRENCIAS") {
    partes.push(`até ${t.limiteDias} ocorrência${t.limiteDias === 1 ? "" : "s"}`);
  } else if (t.modoDuracao === "FIXO") {
    partes.push(
      t.prorrogacaoDias ? `${t.limiteDias} + ${dias(t.prorrogacaoDias)}` : dias(t.limiteDias)
    );
  } else {
    partes.push(`até ${dias(t.limiteDias)} ${adj}`);
  }
  if (t.janelaMeses && t.limiteNaJanela) {
    partes.push(`máx. ${t.limiteNaJanela} a cada ${t.janelaMeses} meses`);
  }
  return partes.join("; ");
}

/* ─── Validação do pedido ─── */

export interface SaldoJanela {
  /** Datas (YYYY-MM-DD) já consumidas deste tipo, em pedidos em andamento ou aprovados. */
  datasUsadas: string[];
}

const somaMeses = (iso: string, meses: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + meses, d));
  return dt.toISOString().slice(0, 10);
};

const diaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

function diasEntre(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const cur = new Date(`${inicio}T12:00:00Z`);
  const end = new Date(`${fim}T12:00:00Z`);
  while (cur <= end && dias.length < 1000) {
    dias.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dias;
}

const hhmm = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

export interface ResultadoValidacaoLicenca {
  erros: string[];
  /** Unidades consumidas (dias ou ocorrências). */
  unidades: number;
  /** Datas que contam (para o saldo da janela). */
  datas: string[];
  limiteAplicado: number | null;
}

/** Confere o pedido de licença contra as regras do tipo. */
export function validarPedidoLicenca(opts: {
  tipo: TipoLicencaRegra;
  categoria: string | null | undefined;
  periodos: PeriodoAbono[];
  comProrrogacao: boolean;
  saldo: SaldoJanela;
  diasUteis: boolean[];
  feriados: Set<string>;
  jornadaDiaMin: (iso: string) => number;
}): ResultadoValidacaoLicenca {
  const { tipo, periodos } = opts;
  const erros: string[] = [];
  const fmtBr = (iso: string) => iso.split("-").reverse().join("/");

  if (!tipo.ativo) erros.push("Este tipo de licença está desativado.");
  if (tipo.categorias.length && !tipo.categorias.includes(String(opts.categoria ?? ""))) {
    erros.push("Este tipo de licença não está disponível para a sua categoria.");
  }
  if (opts.comProrrogacao && !tipo.prorrogacaoDias) {
    erros.push("Este tipo de licença não tem prorrogação.");
  }
  erros.push(...validarPeriodosAbono(periodos));
  if (erros.length) return { erros, unidades: 0, datas: [], limiteAplicado: null };

  const algumParcial = periodos.some((p) => p.horarioInicio || p.horarioFim);
  if (algumParcial && !tipo.permiteParcial) {
    erros.push("Este tipo de licença não aceita horário parcial: use dias inteiros.");
  }
  if (tipo.consecutivos && periodos.length > 1) {
    erros.push("Este tipo de licença é um único período contínuo.");
  }

  /* Dias de cada período e quais contam. */
  const datas: string[] = [];
  let unidades = 0;
  for (const p of periodos) {
    const dias = diasEntre(p.inicio, p.fim);
    const contam =
      tipo.contagem === "UTEIS"
        ? dias.filter((d) => opts.diasUteis[diaSemana(d)] !== false && !opts.feriados.has(d))
        : dias;
    if (tipo.unidade === "OCORRENCIAS") {
      unidades += 1;
      datas.push(p.inicio);
    } else {
      unidades += contam.length;
      datas.push(...contam);
    }
  }

  if (tipo.efeito === "REDUCAO_JORNADA") {
    const pct = tipo.reducaoMaxPct ?? 0;
    for (const p of periodos) {
      if (p.inicio !== p.fim || !p.horarioInicio || !p.horarioFim) {
        erros.push(`${fmtBr(p.inicio)}: informe um dia com o horário dispensado (início e fim).`);
        continue;
      }
      const jornada = opts.jornadaDiaMin(p.inicio);
      const dispensado = hhmm(p.horarioFim) - hhmm(p.horarioInicio);
      const maximo = Math.floor((jornada * pct) / 100);
      if (jornada <= 0) {
        erros.push(`${fmtBr(p.inicio)} não é dia de jornada.`);
      } else if (dispensado > maximo) {
        erros.push(
          `${fmtBr(p.inicio)}: a redução máxima é de ${pct}% da jornada (${Math.floor(maximo / 60)}h${String(maximo % 60).padStart(2, "0")}).`
        );
      }
    }
    return { erros, unidades, datas, limiteAplicado: null };
  }

  /* Limite do pedido. */
  let limiteAplicado: number | null = null;
  if (tipo.modoDuracao !== "LIVRE" && tipo.limiteDias) {
    limiteAplicado = tipo.limiteDias + (opts.comProrrogacao ? (tipo.prorrogacaoDias ?? 0) : 0);
    const unid = tipo.unidade === "OCORRENCIAS" ? "ocorrência(s)" : "dia(s)";
    if (tipo.modoDuracao === "FIXO" && unidades !== limiteAplicado) {
      erros.push(
        `Esta licença é de exatamente ${limiteAplicado} ${unid}; o pedido tem ${unidades}.`
      );
    } else if (unidades > limiteAplicado) {
      erros.push(
        `O limite desta licença é de ${limiteAplicado} ${unid}; o pedido tem ${unidades}.`
      );
    }
  }

  /* Frequência (janela de meses). */
  if (tipo.janelaMeses && tipo.limiteNaJanela && datas.length) {
    const primeiro = [...datas].sort()[0];
    const ini = somaMeses(primeiro, -tipo.janelaMeses);
    const usados = opts.saldo.datasUsadas.filter((d) => d > ini && d <= primeiro).length;
    if (usados + unidades > tipo.limiteNaJanela) {
      erros.push(
        `Frequência: no máximo ${tipo.limiteNaJanela} a cada ${tipo.janelaMeses} meses; você já usou ${usados} e este pedido soma ${unidades}.`
      );
    }
  }
  return { erros, unidades, datas, limiteAplicado };
}

/** Datas já consumidas do tipo, a partir de `metadados.tipoLicenca.datas` dos pedidos. */
export function datasUsadasDoTipo(
  solicitacoes: Array<{ metadados: unknown }>,
  tipoId: string
): string[] {
  const out: string[] = [];
  for (const s of solicitacoes) {
    const m = ((s.metadados ?? {}) as Record<string, unknown>).tipoLicenca as
      | { id?: string; datas?: string[] }
      | undefined;
    if (m?.id === tipoId && Array.isArray(m.datas)) out.push(...m.datas);
  }
  return out;
}
