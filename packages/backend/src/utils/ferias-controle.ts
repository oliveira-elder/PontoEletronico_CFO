/**
 * Controle geral de férias (aba global do RH). Função PURA: recebe funcionários e solicitações já carregados e devolve
 * todos os ciclos desde a admissão, com período concessivo e classificação de gravidade pela CLT.
 * Não altera nem substitui `calcularSaldoFeriasFuncionario` (usado nos pedidos). Datas civis AAAA-MM-DD, horário de Brasília.
 *
 * Base legal: período aquisitivo de 12 meses (CLT 130) + concessivo de 12 meses (134); férias fora do concessivo são
 * pagas em dobro (137); venda até 1/3 (143); fracionamento em até 3 períodos, um ≥ 14 dias e os demais ≥ 5 (134 §1º).
 */
import { diasCorridos, separarGozoPorData } from "./ferias-regras";
import { prazoDocumento, prazoVencido, situacaoDocumento } from "./ferias-documentos";
import { dataCivilPeriodo } from "./horario-brasilia";

export type GravidadeFerias =
  | "EM_DOBRO"
  | "VENCE_CRITICO"
  | "SEM_ADMISSAO"
  | "VENCE_EM_BREVE"
  | "NAO_PROGRAMADO"
  | "PARCIAL"
  | "FRACIONAMENTO_IRREGULAR"
  | "PROGRAMADO"
  | "EM_GOZO"
  | "EM_DIA";

/** Menor número = mais problemático (ordem de exibição). */
export const RANK_GRAVIDADE: Record<GravidadeFerias, number> = {
  EM_DOBRO: 1,
  VENCE_CRITICO: 2,
  VENCE_EM_BREVE: 3,
  NAO_PROGRAMADO: 4,
  PARCIAL: 5,
  FRACIONAMENTO_IRREGULAR: 6,
  PROGRAMADO: 7,
  EM_GOZO: 8,
  EM_DIA: 9,
  /** Pendência de cadastro (depende de configuração): fica por último. */
  SEM_ADMISSAO: 10
};

export type StatusFerias = "USUFRUIDO" | "PROGRAMADO" | "NAO_PROGRAMADO";

export interface SolicitacaoFeriasControle {
  id: string;
  status: string;
  metadados: unknown;
}

export interface FuncionarioControleEntrada {
  dataAdmissao: string | null;
  categoria: string;
  solicitacoes: SolicitacaoFeriasControle[];
}

export interface CicloControle {
  numero: number;
  inicio: string;
  fim: string;
  concessivoInicio: string;
  concessivoFim: string;
  /** Aquisitivo já cumprido (direito adquirido). */
  vencido: boolean;
  /** Concessivo já encerrado. */
  concessivoEncerrado: boolean;
  /** Anterior ao marco inicial do controle: não avaliado (sem histórico no sistema). */
  anteriorAoControle: boolean;
  dias: number;
  gozados: number;
  agendados: number;
  vendidos: number;
  /** Dias ainda sem gozo, venda ou agendamento. */
  naoProgramados: number;
  /** Dias não gozados/vendidos depois do concessivo (pagos em dobro). */
  diasEmDobro: number;
  diasParaVencer: number | null;
  emAnalise: boolean;
  adiantamento13: boolean | null;
  gravidade: GravidadeFerias;
}

export interface ItemControle {
  dataAdmissao: string | null;
  ciclos: CicloControle[];
  gozados: number;
  agendados: number;
  vendidos: number;
  naoProgramados: number;
  diasEmDobro: number;
  abono: boolean;
  adiantamento13: boolean | null;
  status: StatusFerias;
  gravidade: GravidadeFerias;
  proximoVencimento: string | null;
  emGozoHoje: boolean;
  fracionamentoIrregular: boolean;
  estagiario: boolean;
  /** Documentos de férias (Aviso/Recibo) enviados e ainda sem assinatura, e quantos já passaram do prazo. */
  docsPendentes: number;
  docsVencidos: number;
}

const COTA = 30;

/** Soma de meses em data civil UTC (mesma regra do saldo: dia que não existe rola para o mês seguinte). */
export function somarMesesISO(iso: string, meses: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function somarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

type Periodo = { dataInicio?: string; dataFim?: string; dias?: number };

function periodosDe(
  meta: Record<string, unknown>
): { inicio: string; fim: string; dias: number }[] {
  const arr = Array.isArray(meta.periodos) ? (meta.periodos as Periodo[]) : [];
  return arr
    .map((p) => {
      const inicio = String(p.dataInicio ?? "").slice(0, 10);
      const fim = String(p.dataFim ?? p.dataInicio ?? "").slice(0, 10);
      return {
        inicio,
        fim,
        dias: Number(p.dias ?? (inicio && fim ? diasCorridos(inicio, fim) : 0))
      };
    })
    .filter((p) => p.inicio && p.fim);
}

/** Fracionamento fora do art. 134 §1º: mais de 3 períodos, ou (com mais de um) nenhum de 14+ dias ou algum com menos de 5. */
export function fracionamentoIrregular(periodos: { dias: number }[]): boolean {
  if (periodos.length <= 1) return false;
  if (periodos.length > 3) return true;
  return Math.max(...periodos.map((p) => p.dias)) < 14 || periodos.some((p) => p.dias < 5);
}

const EM_ANALISE = [
  "PENDENTE",
  "AGUARDANDO_RH",
  "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
  "AGUARDANDO_GESTOR_RH"
];

export function calcularControleFerias(
  func: FuncionarioControleEntrada,
  hojeISO: string,
  marcoInicial: string | null
): ItemControle {
  const estagiario = func.categoria === "ESTAGIARIO";
  const vazio = {
    gozados: 0,
    agendados: 0,
    vendidos: 0,
    naoProgramados: 0,
    diasEmDobro: 0,
    abono: false,
    adiantamento13: null as boolean | null,
    proximoVencimento: null as string | null,
    emGozoHoje: false,
    fracionamentoIrregular: false,
    estagiario,
    docsPendentes: 0,
    docsVencidos: 0
  };
  if (!func.dataAdmissao) {
    return {
      ...vazio,
      dataAdmissao: null,
      ciclos: [],
      status: "NAO_PROGRAMADO",
      gravidade: "SEM_ADMISSAO"
    };
  }
  const admissao = func.dataAdmissao.slice(0, 10);

  /* Ciclos desde a admissão até o que já começou. */
  const ciclos: CicloControle[] = [];
  for (let n = 1; ; n++) {
    const inicio = somarMesesISO(admissao, (n - 1) * 12);
    if (inicio > hojeISO) break;
    const fim = somarDiasISO(somarMesesISO(admissao, n * 12), -1);
    const concessivoInicio = somarDiasISO(fim, 1);
    const concessivoFim = somarDiasISO(somarMesesISO(concessivoInicio, 12), -1);
    ciclos.push({
      numero: n,
      inicio,
      fim,
      concessivoInicio,
      concessivoFim,
      vencido: fim < hojeISO,
      concessivoEncerrado: concessivoFim < hojeISO,
      anteriorAoControle: !!marcoInicial && concessivoFim < marcoInicial,
      dias: COTA,
      gozados: 0,
      agendados: 0,
      vendidos: 0,
      naoProgramados: COTA,
      diasEmDobro: 0,
      diasParaVencer: null,
      emAnalise: false,
      adiantamento13: null,
      gravidade: "EM_DIA"
    });
    if (n > 80) break;
  }

  /* Solicitações vigentes: as APROVADAS (a original continua valendo enquanto a alteração está em análise) e os
     pedidos novos em análise. Alterações em análise só marcam o ciclo "em análise". */
  let emGozoHoje = false;
  let abono = false;
  let fracionamento = false;
  const analiseAlteracaoDe = new Set<string>();
  for (const s of func.solicitacoes) {
    const m = (s.metadados ?? {}) as Record<string, unknown>;
    if (EM_ANALISE.includes(s.status) && typeof m.alteracaoDeId === "string")
      analiseAlteracaoDe.add(m.alteracaoDeId);
  }
  const porNumero = new Map(ciclos.map((c) => [c.numero, c]));
  const fifo = ciclos.filter((c) => c.vencido);
  const livre = (c: CicloControle) => COTA - c.gozados - c.agendados - c.vendidos;

  const aplicar = (c: CicloControle, g: number, a: number, v: number) => {
    c.gozados += g;
    c.agendados += a;
    c.vendidos += v;
  };

  for (const s of func.solicitacoes) {
    const m = (s.metadados ?? {}) as Record<string, unknown>;
    const aprovada = s.status === "APROVADA";
    const analise = EM_ANALISE.includes(s.status);
    if (!aprovada && !analise) continue;
    const ehAlteracao = typeof m.alteracaoDeId === "string";
    const cicloMeta = m.cicloNumero != null && m.cicloNumero !== "" ? Number(m.cicloNumero) : null;
    if (analise && ehAlteracao) {
      const alvo = cicloMeta != null ? porNumero.get(cicloMeta) : undefined;
      if (alvo) alvo.emAnalise = true;
      continue;
    }
    const periodos = periodosDe(m);
    const total = Number(m.totalDiasGozo ?? periodos.reduce((a, p) => a + p.dias, 0));
    const venda = Number(m.diasVendidos ?? 0);
    if (total + venda <= 0) continue;
    const { gozados: gozTot } = aprovada ? separarGozoPorData(m, hojeISO) : { gozados: 0 };
    const gozados = Math.min(total, gozTot);
    if (aprovada) {
      if (venda > 0) abono = true;
      if (periodos.some((p) => p.inicio <= hojeISO && hojeISO <= p.fim)) emGozoHoje = true;
      if (!estagiario && fracionamentoIrregular(periodos)) fracionamento = true;
    }
    const ad = typeof m.adiantamento13 === "boolean" ? m.adiantamento13 : null;

    /* Distribui por ciclo: o explícito primeiro; o excedente (ou sem ciclo) vai FIFO pelos ciclos vencidos. */
    let gRest = gozados;
    let aRest = total - gozados;
    let vRest = venda;
    const alvoExplicito = cicloMeta != null ? porNumero.get(cicloMeta) : undefined;
    const ordem = alvoExplicito
      ? [alvoExplicito, ...fifo.filter((c) => c !== alvoExplicito)]
      : fifo;
    for (const c of ordem) {
      if (gRest + aRest + vRest <= 0) break;
      let espaco = Math.max(0, livre(c));
      if (espaco <= 0) continue;
      const g = Math.min(gRest, espaco);
      espaco -= g;
      const v = Math.min(vRest, espaco);
      espaco -= v;
      const a = Math.min(aRest, espaco);
      aplicar(c, g, a, v);
      gRest -= g;
      vRest -= v;
      aRest -= a;
      if (analise) c.emAnalise = true;
      if (ad !== null) c.adiantamento13 = c.adiantamento13 === true ? true : ad;
    }
    /* Sem ciclo vencido com espaço (ex.: 1º ano): usa o ciclo em curso. */
    if (gRest + aRest + vRest > 0) {
      const c = alvoExplicito ?? ciclos[ciclos.length - 1];
      if (c) {
        aplicar(c, gRest, aRest, vRest);
        if (analise) c.emAnalise = true;
        if (ad !== null) c.adiantamento13 = c.adiantamento13 === true ? true : ad;
      }
    }
  }
  /* Alterações em análise cujo alvo não foi marcado (original sem cicloNumero). */
  for (const s of func.solicitacoes) {
    if (analiseAlteracaoDe.has(s.id)) {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      const c = m.cicloNumero != null ? porNumero.get(Number(m.cicloNumero)) : undefined;
      if (c) c.emAnalise = true;
    }
  }

  /* Classificação por ciclo. */
  for (const c of ciclos) {
    const usados = c.gozados + c.vendidos;
    c.naoProgramados = Math.max(0, COTA - usados - c.agendados);
    const faltaUsufruir = Math.max(0, COTA - usados);
    c.diasParaVencer = c.vencido ? diasEntre(hojeISO, c.concessivoFim) : null;
    if (!c.vencido) {
      c.gravidade = c.agendados > 0 ? "PROGRAMADO" : "EM_DIA";
      continue;
    }
    if (c.anteriorAoControle) {
      c.gravidade = "EM_DIA";
      continue;
    }
    if (faltaUsufruir === 0) {
      c.gravidade = "EM_DIA";
    } else if (c.concessivoEncerrado) {
      c.diasEmDobro = faltaUsufruir;
      c.gravidade = "EM_DOBRO";
    } else if (c.naoProgramados === 0) {
      c.gravidade = "PROGRAMADO";
    } else if (c.diasParaVencer! <= 30) {
      c.gravidade = "VENCE_CRITICO";
    } else if (c.diasParaVencer! <= 90) {
      c.gravidade = "VENCE_EM_BREVE";
    } else {
      c.gravidade = usados + c.agendados > 0 ? "PARCIAL" : "NAO_PROGRAMADO";
    }
  }

  const avaliados = ciclos.filter((c) => c.vencido && !c.anteriorAoControle);
  const pior = ciclos.reduce<GravidadeFerias | null>(
    (acc, c) =>
      acc === null || RANK_GRAVIDADE[c.gravidade] < RANK_GRAVIDADE[acc] ? c.gravidade : acc,
    null
  );
  let gravidade: GravidadeFerias = pior ?? "EM_DIA";
  /* Com o pior ciclo "em dia"/programado, destaca fracionamento irregular e férias em gozo. */
  if (RANK_GRAVIDADE[gravidade] > RANK_GRAVIDADE.FRACIONAMENTO_IRREGULAR && fracionamento)
    gravidade = "FRACIONAMENTO_IRREGULAR";
  if (gravidade === "EM_DIA" && emGozoHoje) gravidade = "EM_GOZO";
  if (gravidade === "PROGRAMADO" && emGozoHoje) gravidade = "EM_GOZO";

  const naoProgramados = avaliados.reduce((a, c) => a + c.naoProgramados, 0);
  const agendados = ciclos.reduce((a, c) => a + c.agendados, 0);
  const status: StatusFerias =
    naoProgramados > 0
      ? "NAO_PROGRAMADO"
      : agendados > 0 || emGozoHoje
        ? "PROGRAMADO"
        : "USUFRUIDO";
  const venc = avaliados
    .filter((c) => c.naoProgramados > 0 || c.diasEmDobro > 0)
    .map((c) => c.concessivoFim)
    .sort()[0];
  const adiantamentos = ciclos.map((c) => c.adiantamento13).filter((v) => v !== null);

  return {
    dataAdmissao: admissao,
    ciclos,
    gozados: ciclos.reduce((a, c) => a + c.gozados, 0),
    agendados,
    vendidos: ciclos.reduce((a, c) => a + c.vendidos, 0),
    naoProgramados,
    diasEmDobro: avaliados.reduce((a, c) => a + c.diasEmDobro, 0),
    abono,
    adiantamento13: adiantamentos.length ? adiantamentos.some((v) => v === true) : null,
    status,
    gravidade,
    proximoVencimento: venc ?? null,
    emGozoHoje,
    fracionamentoIrregular: fracionamento,
    estagiario,
    docsPendentes: resumoDocumentos(func.solicitacoes, hojeISO).pendentes,
    docsVencidos: resumoDocumentos(func.solicitacoes, hojeISO).vencidos
  };
}

/** Aviso/Recibo enviados e não assinados (1º período e rodadas), com prazo vencido. */
function resumoDocumentos(
  solicitacoes: SolicitacaoFeriasControle[],
  hojeISO: string
): { pendentes: number; vencidos: number } {
  let pendentes = 0;
  let vencidos = 0;
  for (const sol of solicitacoes) {
    if (!["APROVADA", "AGUARDANDO_RH", "AGUARDANDO_DOCUMENTO_FUNCIONARIO"].includes(sol.status))
      continue;
    const meta = (sol.metadados ?? {}) as Record<string, unknown>;
    const periodos = (
      Array.isArray(meta.periodos)
        ? (meta.periodos as Array<{ dataInicio?: string; dataFim?: string }>)
        : []
    )
      .map((p) => ({
        inicio: dataCivilPeriodo(String(p.dataInicio ?? "")),
        fim: dataCivilPeriodo(String(p.dataFim ?? p.dataInicio ?? ""))
      }))
      .filter((p) => p.inicio && p.fim)
      .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
    const conta = (
      docs: Array<{
        tipo: string;
        urlAssinado?: string;
        rejeicao?: unknown;
        prazoProrrogadoAte?: string;
      }>,
      periodo?: { inicio: string; fim: string }
    ) => {
      for (const d of docs) {
        if (situacaoDocumento(d) === "ASSINADO") continue;
        pendentes++;
        const prazo = periodo ? prazoDocumento(d.tipo, periodo, d.prazoProrrogadoAte) : null;
        if (prazoVencido(prazo, hojeISO)) vencidos++;
      }
    };
    conta(
      Array.isArray(meta.documentosFerias) ? (meta.documentosFerias as never[]) : [],
      periodos[0]
    );
    const rodadas = meta.rodadasFerias;
    if (rodadas && typeof rodadas === "object" && !Array.isArray(rodadas)) {
      for (const r of Object.values(
        rodadas as Record<string, { inicio: string; fim: string; documentos?: never[] }>
      )) {
        conta(r.documentos ?? [], { inicio: r.inicio, fim: r.fim });
      }
    }
  }
  return { pendentes, vencidos };
}

function diasEntre(deISO: string, ateISO: string): number {
  const u = (i: string) => Date.parse(`${i}T00:00:00Z`);
  return Math.round((u(ateISO) - u(deISO)) / 86400000);
}
