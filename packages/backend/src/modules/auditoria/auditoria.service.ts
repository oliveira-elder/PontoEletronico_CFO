import { grupoDoCid, normalizarCid } from "../../utils/cid";
import { listarCidGrupos } from "../../utils/licenca-db";
import { mascararNome, registrarDocumentoEmitido } from "../../utils/documentos-emitidos";
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { Prisma, type StatusSolicitacao } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  MINUTOS_MINIMOS_LIBERACAO,
  creditoBancoDaSolicitacao,
  fmtHoraMin,
  situacaoDasLiberacoes,
  totalDisponivel
} from "../../utils/banco-horas-liberacao";
import { carregarLiberacoes, carregarUsoCredito } from "../../utils/banco-horas-liberacao-db";
import { NotificacaoService } from "../notificacao/notificacao.service";
import { buildPersonCondition, buildQuerySearchCondition } from "../logs/log-search.util";
import { matchEndpoint } from "../logs/endpoint-catalog";
import {
  aplicarHorarioBrasilia,
  horarioDeDataBrasilia,
  horarioParaMinutos,
  validarHorarioPermitido,
  dataBrasiliaISO,
  dataCivilISO,
  hojeBrasiliaISO,
  intervaloColunaDate,
  intervaloDiaBrasilia,
  fimDiaCivilBrasilia,
  dataCivilPeriodo
} from "../../utils/horario-brasilia";
import { appendObservacao, criarObservacaoAjuste } from "../../utils/registro-observacoes";
import { assertMesAposGoLive, getDataInicioProducao } from "../../utils/inicio-producao";
import { inicioAtividadesUsuario } from "../../utils/inicio-atividades";
import {
  resolverJornadaHistoricoContexto,
  isAfastamentoParcial
} from "../../utils/jornada-historico";
import { enriquecerAfastamentosComSolicitacoes } from "../../utils/atestado-parcial-enrich";
import { DocumentoService } from "../ponto/documento.service";
import { PontoService } from "../ponto/ponto.service";
import { ConfigSolicitacoesService } from "../ponto/config-solicitacoes.service";
import { resolverCicloBancoHoras } from "../../utils/banco-horas-marco";
import { toleranciaFechamentoDias } from "../../utils/tolerancia-fechamento";
import {
  funcionarioSemRegistroPonto,
  periodosSemObrigacaoPonto,
  MSG_SOLICITACAO_APENAS_INFORMATIVA
} from "../../utils/categoria-jornada";
import { ensureCategoriaHistorico } from "../../utils/categoria-historico";
import { periodosCessao } from "../../utils/cessao-historico";
import { calcHorasTrabalhadasMinutos } from "../../utils/calc-horas-trabalhadas";
import { observacaoForcaSemIntervalo } from "../../utils/turno-entrada";
import { codigoCienciaGestorExibido } from "../../utils/assinatura-codigo";
import { periodosDoAbono } from "../../utils/abono-periodos";
import { interjornadaCurtaPorDia, textoNotaInterjornada } from "../../utils/interjornada";
import { exigenciasCicloPresencial } from "../../utils/ciclo-completo-presencial";
import { Cron } from "@nestjs/schedule";
import {
  ordemArquivoRodada,
  periodosComRodada,
  rodadasDe,
  type DocumentoRodadaFerias,
  type RodadaFeriasMeta
} from "../../utils/ferias-rodadas";
import {
  diasCorridos,
  somarDiasIso,
  validarPeriodosEstagiario,
  validarPeriodosFerias
} from "../../utils/ferias-regras";
import {
  carregarContextoHoraExtra,
  diasCicloCompletoEmCasa,
  rotulosModalidadePorDia
} from "../../utils/hora-extra-decisao";
import {
  validarItensCorrecaoPontoPausa,
  type ItemCorrecaoPonto
} from "../../utils/correcao-ponto-pausa";

/** Metadados de autenticidade da ciência/assinatura do gestor no atestado */
export interface GestorCienciaMeta {
  ipReal: string;
  ipGateway: string | null;
  userAgent: string | null;
}

export interface PeriodoPontoRaw {
  id: string;
  funcionarioId: string;
  mes: number;
  ano: number;
  horasTrabalhadasMinutos: number;
  horasExtrasMinutos: number;
  horasFaltaMinutos: number;
  diasTrabalhados: number;
  status: string;
  fechadoEm: Date | null;
  aprovadoPor: string | null;
}

/** Metadados sem a assinatura do funcionário (reenvio dos documentos pelo RH). */
function semAssinaturaFerias(meta: Record<string, unknown>): Record<string, unknown> {
  const resto = { ...meta };
  delete resto.assinaturaFerias;
  delete resto.rejeicaoDocumentoFerias;
  return resto;
}

const fmtDataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Documento de férias enviado pelo RH: AVISO, RECIBO ou OUTROS (com `rotulo`). */
export interface DocumentoFeriasEntrada {
  tipo: string;
  rotulo?: string;
  arquivoBase64: string;
  nomeArquivo?: string;
  mimeType?: string;
}

/** Entrada do RH para agendar/alterar férias (Auditoria → Funcionário → Férias). */
export interface FeriasRhEntrada {
  cicloNumero?: number;
  periodos: Array<{ inicio: string; fim: string }>;
  diasVendidos?: number;
  justificativa: string;
  ignorarVedacao?: boolean;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentoService: DocumentoService,
    private readonly pontoService: PontoService,
    private readonly notificacaoService: NotificacaoService,
    private readonly configSolicitacoesService: ConfigSolicitacoesService
  ) {}

  private startOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private readonly solicitacaoFuncionarioInclude = {
    funcionario: {
      select: {
        id: true,
        matricula: true,
        cargo: true,
        fotoPerfilUrl: true,
        user: { select: { name: true, email: true, emailReal: true } },
        gerencia: { select: { nome: true, sigla: true } }
      }
    }
  };

  private async enriquecerSolicitacoesComGestor<T extends { gestorUserId: string | null }>(
    solicitacoes: T[]
  ): Promise<(T & { gestorUser: { name: string } | null })[]> {
    const ids = [
      ...new Set(solicitacoes.map((s) => s.gestorUserId).filter((id): id is string => !!id))
    ];
    if (!ids.length) {
      return solicitacoes.map((s) => ({ ...s, gestorUser: null }));
    }
    const gestores = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true }
    });
    const map = new Map(gestores.map((g) => [g.id, g]));
    return solicitacoes.map((s) => ({
      ...s,
      gestorUser: s.gestorUserId ? (map.get(s.gestorUserId) ?? null) : null
    }));
  }

  private formatMinutes(min: number): string {
    const sign = min < 0 ? "-" : "";
    const abs = Math.abs(min);
    return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}m`;
  }

  private static readonly STATUS_SOLICITACAO_ABERTA = [
    "PENDENTE",
    "AGUARDANDO_RH",
    "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
    "AGUARDANDO_GESTOR_RH"
  ] as const;

  private mesIntervaloBrasilia(mes: number, ano: number) {
    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dd = String(ultimoDia).padStart(2, "0");
    return {
      inicio: intervaloDiaBrasilia(`${ano}-${mm}-01`).inicio,
      fim: intervaloDiaBrasilia(`${ano}-${mm}-${dd}`).fim
    };
  }

  private calcResumoMensalFromRegistros(
    porDia: Map<string, { tipo: string; dataHora: Date }[]>,
    jornadaHorasDia: number,
    hojeIso: string
  ) {
    let totalMinutos = 0;
    let diasTrabalhados = 0;

    for (const [diaIso, regs] of porDia) {
      /* Mesma regra do Histórico: trecho aberto só conta no dia corrente. */
      const capMs = diaIso === hojeIso ? Date.now() : undefined;
      const minutos = this.calcHorasMinutos(regs, capMs);
      if (minutos > 0) diasTrabalhados++;
      totalMinutos += minutos;
    }

    const jornadaEsperadaMin = diasTrabalhados * jornadaHorasDia * 60;
    const saldo = totalMinutos - jornadaEsperadaMin;

    return {
      horasTrabalhadasMinutos: totalMinutos,
      horasExtrasMinutos: Math.max(0, saldo),
      horasFaltaMinutos: Math.max(0, -saldo),
      diasTrabalhados
    };
  }

  /* ─── Dashboard ─── */

  async getDashboard(filtros?: { dataInicio?: string; dataFim?: string }) {
    const hojeIso = hojeBrasiliaISO();
    const dataFim =
      filtros?.dataFim && /^\d{4}-\d{2}-\d{2}$/.test(filtros.dataFim) ? filtros.dataFim : hojeIso;
    const dataInicio =
      filtros?.dataInicio && /^\d{4}-\d{2}-\d{2}$/.test(filtros.dataInicio)
        ? filtros.dataInicio
        : (() => {
            const d = new Date(`${dataFim}T12:00:00-03:00`);
            d.setMonth(d.getMonth() - 1);
            return dataCivilISO(d);
          })();
    const inicio = dataInicio <= dataFim ? dataInicio : dataFim;
    const fim = dataInicio <= dataFim ? dataFim : dataInicio;

    const { inicio: inicioHoje, fim: fimHoje } = intervaloDiaBrasilia(hojeIso);
    const { inicio: inicioPeriodo, fim: fimPeriodo } = {
      inicio: intervaloDiaBrasilia(inicio).inicio,
      fim: intervaloDiaBrasilia(fim).fim
    };

    const [
      totalFuncionarios,
      funcionariosAtivos,
      registrosHoje,
      solicitacoesPendentes,
      periodosAbertos,
      periodosFechados,
      periodosAprovados
    ] = await Promise.all([
      this.prisma.funcionario.count(),
      this.prisma.funcionario.count({ where: { ativo: true } }),
      this.prisma.registroPonto.count({ where: { dataHora: { gte: inicioHoje, lte: fimHoje } } }),
      this.prisma.solicitacao.count({ where: { status: "PENDENTE" } }),
      this.prisma.periodoPonto.count({ where: { status: "ABERTO" } }),
      this.prisma.periodoPonto.count({ where: { status: "FECHADO" } }),
      this.prisma.periodoPonto.count({ where: { status: "APROVADO" } })
    ]);

    /* Funcionários trabalhando agora e em intervalo */
    const registrosDeHoje = await this.prisma.registroPonto.findMany({
      where: { dataHora: { gte: inicioHoje, lte: fimHoje } },
      orderBy: { dataHora: "asc" },
      select: { funcionarioId: true, tipo: true }
    });

    const estadoPorFunc = new Map<string, string>();
    for (const r of registrosDeHoje) {
      estadoPorFunc.set(r.funcionarioId, r.tipo);
    }

    let trabalhando = 0;
    let emIntervalo = 0;
    let pausados = 0;
    for (const [, tipo] of estadoPorFunc) {
      if (tipo === "ENTRADA" || tipo === "FIM_INTERVALO" || tipo === "REINICIAR_EXPEDIENTE")
        trabalhando++;
      else if (tipo === "INICIO_INTERVALO") emIntervalo++;
      else if (tipo === "INTERROMPER_EXPEDIENTE") pausados++;
    }

    /* Afastamentos ativos hoje */
    const afastamentosAtivos = await this.prisma.afastamento.count({
      where: {
        dataInicio: { lte: fimHoje },
        dataFim: { gte: inicioHoje }
      }
    });

    /* Série de registros por dia no intervalo filtrado */
    const registrosPeriodo = await this.prisma.registroPonto.findMany({
      where: { dataHora: { gte: inicioPeriodo, lte: fimPeriodo } },
      select: { dataHora: true, tipo: true, funcionarioId: true },
      orderBy: { dataHora: "asc" }
    });

    const porDiaSerie: Record<string, number> = {};
    let cursor = inicio;
    while (cursor <= fim) {
      porDiaSerie[cursor] = 0;
      const [y, m, d] = cursor.split("-").map(Number);
      const prox = new Date(y, m - 1, d);
      prox.setDate(prox.getDate() + 1);
      cursor = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
    }
    for (const r of registrosPeriodo) {
      const key = dataBrasiliaISO(r.dataHora);
      if (key in porDiaSerie) porDiaSerie[key]++;
    }
    const registrosPorTempo = Object.entries(porDiaSerie).map(([data, total]) => ({
      data,
      total
    }));

    /* Compat: entradas nos últimos 7 dias (ou no filtro) */
    const registrosPorDia = registrosPorTempo.map((d) => ({
      data: d.data,
      entradas: registrosPeriodo.filter(
        (r) => r.tipo === "ENTRADA" && dataBrasiliaISO(r.dataHora) === d.data
      ).length
    }));

    /* Últimos 10 logs */
    const ultimosLogs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10
    });

    /* Distribuição de origem hoje */
    const origens = await this.prisma.registroPonto.groupBy({
      by: ["origem"],
      where: { dataHora: { gte: inicioHoje, lte: fimHoje } },
      _count: { _all: true }
    });

    /* Distribuição de origem — todo o histórico (para o card Mobile vs Desktop) */
    const origensTotal = await this.prisma.registroPonto.groupBy({
      by: ["origem"],
      _count: { _all: true }
    });

    const toOrigem = (arr: { origem: string; _count: { _all: number } }[]) =>
      arr.map((o) => ({ origem: o.origem, total: o._count._all }));

    const origensHistorico = toOrigem(origensTotal);
    const totalHistorico = origensHistorico.reduce((s, o) => s + o.total, 0);
    const totalMobile = origensHistorico.find((o) => o.origem === "MOBILE")?.total ?? 0;
    const totalDesktop = origensHistorico.find((o) => o.origem === "DESKTOP")?.total ?? 0;
    const totalWeb = origensHistorico.find((o) => o.origem === "WEB")?.total ?? 0;
    const totalTotem = origensHistorico.find((o) => o.origem === "TOTEM")?.total ?? 0;

    /* Série: atestados por mês (últimos 12 meses até dataFim) */
    const atestadosPorMes = await this.calcularAtestadosPorMes(fim);

    /* Rankings: isolados — falha não derruba o dashboard */
    type RankingMinutos = {
      funcionarioId: string;
      nome: string;
      matricula: string;
      minutos: number;
      minutosFormatado: string;
    };
    type RankingQuantidade = {
      funcionarioId: string;
      nome: string;
      matricula: string;
      quantidade: number;
    };
    let rankings = {
      topAtrasados: [] as RankingMinutos[],
      topAdiantados: [] as RankingMinutos[],
      topBancoNegativo: [] as RankingMinutos[],
      topBancoPositivo: [] as RankingMinutos[],
      topMaisAtestados: [] as RankingQuantidade[],
      topMenosAtestados: [] as RankingQuantidade[],
      topMaisAbonos: [] as RankingQuantidade[],
      topMenosAbonos: [] as RankingQuantidade[],
      atrasoMedioPorGerencia: [] as {
        gerenciaId: string;
        nome: string;
        minutos: number;
        funcionarios: number;
      }[]
    };
    try {
      rankings = await this.calcularRankingsDashboard(inicio, fim, registrosPeriodo);
    } catch (err) {
      this.logger.warn(
        `Rankings do dashboard falharam (${inicio}..${fim}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    /* Novos indicadores (afastamentos/solicitações/assinatura/gerência) — isolados,
       falha não derruba o dashboard. */
    let indicadoresExtras = {
      afastamentosPorTipo: [] as { tipo: string; total: number }[],
      solicitacoesPorStatus: [] as { status: string; total: number }[],
      solicitacoesPorTipo: [] as { tipo: string; total: number }[],
      tempoMedioAprovacao: { gestorHoras: 0, rhHoras: 0, amostraGestor: 0, amostraRh: 0 },
      assinaturaPorStatus: [] as { status: string; total: number }[],
      registrosAjustados: { total: 0, ajustados: 0, pct: 0 },
      feriasPorMes: [] as { mes: string; label: string; total: number }[],
      afastamentosPorCategoria: [] as { categoria: string; total: number }[]
    };
    try {
      indicadoresExtras = await this.calcularIndicadoresExtras(inicioPeriodo, fimPeriodo, fim);
    } catch (err) {
      this.logger.warn(
        `Indicadores extras do dashboard falharam (${inicio}..${fim}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    return {
      totalFuncionarios,
      funcionariosAtivos,
      registrosHoje,
      trabalhando,
      emIntervalo,
      pausados,
      solicitacoesPendentes,
      afastamentosAtivos,
      periodosAbertos,
      periodosFechados,
      periodosAprovados,
      registrosPorDia,
      registrosPorTempo,
      topAtrasados: rankings.topAtrasados,
      topAdiantados: rankings.topAdiantados,
      topBancoNegativo: rankings.topBancoNegativo,
      topBancoPositivo: rankings.topBancoPositivo,
      topMaisAtestados: rankings.topMaisAtestados,
      topMenosAtestados: rankings.topMenosAtestados,
      topMaisAbonos: rankings.topMaisAbonos,
      topMenosAbonos: rankings.topMenosAbonos,
      atrasoMedioPorGerencia: rankings.atrasoMedioPorGerencia,
      atestadosPorMes,
      filtro: { dataInicio: inicio, dataFim: fim },
      ultimosLogs,
      origens: toOrigem(origens),
      usoCanal: {
        totalRegistros: totalHistorico,
        mobile: totalMobile,
        desktop: totalDesktop,
        web: totalWeb,
        totem: totalTotem,
        pctMobile: totalHistorico > 0 ? Math.round((totalMobile / totalHistorico) * 100) : 0,
        pctDesktop: totalHistorico > 0 ? Math.round((totalDesktop / totalHistorico) * 100) : 0,
        pctWeb: totalHistorico > 0 ? Math.round((totalWeb / totalHistorico) * 100) : 0,
        pctTotem: totalHistorico > 0 ? Math.round((totalTotem / totalHistorico) * 100) : 0
      },
      afastamentosPorTipo: indicadoresExtras.afastamentosPorTipo,
      solicitacoesPorStatus: indicadoresExtras.solicitacoesPorStatus,
      solicitacoesPorTipo: indicadoresExtras.solicitacoesPorTipo,
      tempoMedioAprovacao: indicadoresExtras.tempoMedioAprovacao,
      assinaturaPorStatus: indicadoresExtras.assinaturaPorStatus,
      registrosAjustados: indicadoresExtras.registrosAjustados,
      feriasPorMes: indicadoresExtras.feriasPorMes,
      afastamentosPorCategoria: indicadoresExtras.afastamentosPorCategoria
    };
  }

  /** Quantidade de registros por minuto (HH:MM) em um dia (Brasília). */
  async getRegistrosPorHora(data?: string) {
    const dia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeBrasiliaISO();
    const { inicio, fim } = intervaloDiaBrasilia(dia);
    const registros = await this.prisma.registroPonto.findMany({
      where: { dataHora: { gte: inicio, lte: fim } },
      select: { dataHora: true },
      orderBy: { dataHora: "asc" }
    });

    const porMinutoMap = new Map<string, number>();
    for (const r of registros) {
      const label = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(r.dataHora);
      porMinutoMap.set(label, (porMinutoMap.get(label) ?? 0) + 1);
    }

    const porMinuto = Array.from(porMinutoMap.entries())
      .map(([label, total]) => {
        const [hh, mm] = label.split(":").map(Number);
        return { label, minuto: hh * 60 + mm, total };
      })
      .sort((a, b) => a.minuto - b.minuto);

    /* Também devolve por hora para compatibilidade */
    const porHora = Array.from({ length: 24 }, (_, h) => ({
      hora: h,
      label: `${String(h).padStart(2, "0")}h`,
      total: 0
    }));
    for (const p of porMinuto) {
      const h = Math.floor(p.minuto / 60);
      if (h >= 0 && h < 24) porHora[h].total += p.total;
    }

    return { data: dia, porMinuto, porHora, totalRegistros: registros.length };
  }

  /** Últimos 12 meses de solicitações ATESTADO (por createdAt, fuso Brasília). */
  private async calcularAtestadosPorMes(dataFim: string) {
    const [yFim, mFim] = dataFim.split("-").map(Number);
    const meses: { mes: string; label: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(yFim, mFim - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mes = `${y}-${String(m).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      meses.push({ mes, label: label.replace(".", ""), total: 0 });
    }

    const primeiro = meses[0].mes;
    const inicioSerie = intervaloDiaBrasilia(`${primeiro}-01`).inicio;
    const fimSerie = intervaloDiaBrasilia(dataFim).fim;

    const solicitacoes = await this.prisma.solicitacao.findMany({
      where: {
        tipo: "ATESTADO",
        status: { not: "CANCELADA" },
        createdAt: { gte: inicioSerie, lte: fimSerie }
      },
      select: { createdAt: true }
    });

    const contagem = new Map<string, number>();
    for (const s of solicitacoes) {
      const key = dataBrasiliaISO(s.createdAt).slice(0, 7);
      contagem.set(key, (contagem.get(key) ?? 0) + 1);
    }
    for (const item of meses) {
      item.total = contagem.get(item.mes) ?? 0;
    }
    return meses;
  }

  /** Últimos 12 meses de Afastamento tipo FERIAS (por dataInicio, fuso Brasília) —
   *  sazonalidade de quando as férias são de fato usufruídas (não quando foram pedidas). */
  private async calcularFeriasPorMes(dataFim: string) {
    const [yFim, mFim] = dataFim.split("-").map(Number);
    const meses: { mes: string; label: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(yFim, mFim - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const mes = `${y}-${String(m).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      meses.push({ mes, label: label.replace(".", ""), total: 0 });
    }

    const primeiro = meses[0].mes;
    const inicioSerie = intervaloDiaBrasilia(`${primeiro}-01`).inicio;
    const fimSerie = intervaloDiaBrasilia(dataFim).fim;

    const afastamentos = await this.prisma.afastamento.findMany({
      where: { tipo: "FERIAS", dataInicio: { gte: inicioSerie, lte: fimSerie } },
      select: { dataInicio: true }
    });

    const contagem = new Map<string, number>();
    for (const a of afastamentos) {
      const key = dataBrasiliaISO(a.dataInicio).slice(0, 7);
      contagem.set(key, (contagem.get(key) ?? 0) + 1);
    }
    for (const item of meses) {
      item.total = contagem.get(item.mes) ?? 0;
    }
    return meses;
  }

  /** Novos indicadores agregados do dashboard: afastamentos por tipo/categoria,
   *  solicitações por status/tipo, tempo médio de aprovação por etapa, status de
   *  assinatura do quadro de ponto e % de registros ajustados manualmente. */
  private async calcularIndicadoresExtras(inicioPeriodo: Date, fimPeriodo: Date, dataFim: string) {
    const [
      afastamentosPorTipoRaw,
      afastamentosComCategoria,
      solicitacoesPeriodo,
      assinaturaPorStatusRaw,
      registrosPeriodoTotal,
      registrosPeriodoAjustados,
      feriasPorMes
    ] = await Promise.all([
      this.prisma.afastamento.groupBy({
        by: ["tipo"],
        where: { dataInicio: { lte: fimPeriodo }, dataFim: { gte: inicioPeriodo } },
        _count: { _all: true }
      }),
      this.prisma.afastamento.findMany({
        where: { dataInicio: { lte: fimPeriodo }, dataFim: { gte: inicioPeriodo } },
        select: { funcionario: { select: { categoria: true } } }
      }),
      this.prisma.solicitacao.findMany({
        where: { createdAt: { gte: inicioPeriodo, lte: fimPeriodo } },
        select: {
          status: true,
          tipo: true,
          createdAt: true,
          gestorResolvidoEm: true,
          rhResolvidoEm: true,
          resolvidoEm: true
        }
      }),
      this.prisma.assinaturaQuadro.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      this.prisma.registroPonto.count({
        where: { dataHora: { gte: inicioPeriodo, lte: fimPeriodo } }
      }),
      this.prisma.registroPonto.count({
        where: { dataHora: { gte: inicioPeriodo, lte: fimPeriodo }, ajustado: true }
      }),
      this.calcularFeriasPorMes(dataFim)
    ]);

    const afastamentosPorTipo = afastamentosPorTipoRaw.map((a) => ({
      tipo: a.tipo,
      total: a._count._all
    }));

    const categoriaAgg = new Map<string, number>();
    for (const a of afastamentosComCategoria) {
      const cat = a.funcionario.categoria;
      categoriaAgg.set(cat, (categoriaAgg.get(cat) ?? 0) + 1);
    }
    const afastamentosPorCategoria = Array.from(categoriaAgg.entries()).map(
      ([categoria, total]) => ({
        categoria,
        total
      })
    );

    const contarPorChave = <T extends string>(itens: T[]): { chave: T; total: number }[] => {
      const m = new Map<T, number>();
      for (const c of itens) m.set(c, (m.get(c) ?? 0) + 1);
      return Array.from(m.entries()).map(([chave, total]) => ({ chave, total }));
    };
    const solicitacoesPorStatus = contarPorChave(solicitacoesPeriodo.map((s) => s.status)).map(
      (x) => ({ status: x.chave, total: x.total })
    );
    const solicitacoesPorTipo = contarPorChave(solicitacoesPeriodo.map((s) => s.tipo)).map((x) => ({
      tipo: x.chave,
      total: x.total
    }));

    /* Tempo médio de aprovação por etapa (horas): Gestor = resolvido−criado;
       RH = resolvido−(fim da etapa gestor, ou criado se não passou por gestor). */
    const horasEntre = (a: Date, b: Date) => (b.getTime() - a.getTime()) / (3600 * 1000);
    const temposGestor: number[] = [];
    const temposRh: number[] = [];
    for (const s of solicitacoesPeriodo) {
      if (s.gestorResolvidoEm) temposGestor.push(horasEntre(s.createdAt, s.gestorResolvidoEm));
      if (s.rhResolvidoEm) {
        temposRh.push(horasEntre(s.gestorResolvidoEm ?? s.createdAt, s.rhResolvidoEm));
      } else if (s.resolvidoEm && !s.gestorResolvidoEm) {
        temposRh.push(horasEntre(s.createdAt, s.resolvidoEm));
      }
    }
    const media = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const tempoMedioAprovacao = {
      gestorHoras: Math.round(media(temposGestor) * 10) / 10,
      rhHoras: Math.round(media(temposRh) * 10) / 10,
      amostraGestor: temposGestor.length,
      amostraRh: temposRh.length
    };

    const assinaturaPorStatus = assinaturaPorStatusRaw.map((a) => ({
      status: a.status,
      total: a._count._all
    }));

    const registrosAjustados = {
      total: registrosPeriodoTotal,
      ajustados: registrosPeriodoAjustados,
      pct:
        registrosPeriodoTotal > 0
          ? Math.round((registrosPeriodoAjustados / registrosPeriodoTotal) * 100)
          : 0
    };

    return {
      afastamentosPorTipo,
      solicitacoesPorStatus,
      solicitacoesPorTipo,
      tempoMedioAprovacao,
      assinaturaPorStatus,
      registrosAjustados,
      feriasPorMes,
      afastamentosPorCategoria
    };
  }

  /** Top 10 atraso/adiantamento e banco negativo/positivo.
   *  Banco: mesmas regras de /ponto/banco-horas e /ponto/historico (calcularBancoHoras).
   *  Pontualidade: 1ª ENTRADA em dias úteis do período, com tolerância e início de atividades. */
  private async calcularRankingsDashboard(
    dataInicio: string,
    dataFim: string,
    registrosPeriodo: { dataHora: Date; tipo: string; funcionarioId: string }[]
  ) {
    const funcionarios = await this.prisma.funcionario.findMany({
      where: { ativo: true },
      select: {
        id: true,
        matricula: true,
        categoria: true,
        gerenciaId: true,
        gerencia: { select: { nome: true } },
        jornadaPeriodoId: true,
        jornadaHorasDia: true,
        jornadaPeriodoDesde: true,
        jornadaPeriodoAssociadoEm: true,
        jornadaPeriodo: {
          select: { jornadaDiariaMin: true, horaEntrada: true, horaSaida: true }
        },
        user: { select: { name: true, primeiroLoginEm: true } }
      }
    });
    const funcMap = new Map(funcionarios.map((f) => [f.id, f]));

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: {
        horaEntrada: true,
        horaSaida: true,
        diasUteis: true,
        toleranciaEntradaMin: true
      }
    });
    const horaEntradaPadrao = cfg?.horaEntrada ?? "08:00";
    const toleranciaEntrada = cfg?.toleranciaEntradaMin ?? 5;
    const diasUteisCfg: boolean[] = JSON.parse(
      cfg?.diasUteis ?? "[false,true,true,true,true,true,false]"
    );

    const { inicio: iniFer, fim: fimFer } = intervaloColunaDate(dataInicio, dataFim);
    const { inicio: iniAfast, fim: fimAfast } = {
      inicio: intervaloDiaBrasilia(dataInicio).inicio,
      fim: intervaloDiaBrasilia(dataFim).fim
    };
    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: iniFer, lte: fimFer } },
      select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
    });
    const feriadoMap = new Map(feriados.map((f) => [dataCivilISO(f.data), f]));

    const afastamentos = await this.prisma.afastamento.findMany({
      where: { dataInicio: { lte: fimAfast }, dataFim: { gte: iniAfast } },
      select: {
        funcionarioId: true,
        dataInicio: true,
        dataFim: true,
        horarioInicio: true,
        horarioFim: true
      }
    });

    const emAfastamento = (funcionarioId: string, dia: string) =>
      afastamentos.some((a) => {
        if (a.funcionarioId !== funcionarioId) return false;
        if (isAfastamentoParcial(a)) return false; // parcial não zera o dia
        const aInicio = dataBrasiliaISO(a.dataInicio);
        const aFim = dataBrasiliaISO(a.dataFim);
        return dia >= aInicio && dia <= aFim;
      });

    /* Pontualidade: 1ª ENTRADA do dia vs horaEntrada esperada (dias úteis do período) */
    type Agg = { nome: string; matricula: string; somaMin: number; dias: number };
    const pontMap = new Map<string, Agg>();
    const entradasPorFuncDia = new Map<string, Date>();
    for (const r of registrosPeriodo) {
      if (r.tipo !== "ENTRADA") continue;
      const dia = dataBrasiliaISO(r.dataHora);
      if (dia < dataInicio || dia > dataFim) continue;
      const key = `${r.funcionarioId}|${dia}`;
      const atual = entradasPorFuncDia.get(key);
      if (!atual || r.dataHora < atual) entradasPorFuncDia.set(key, r.dataHora);
    }

    for (const [key, dataHora] of entradasPorFuncDia) {
      const pipeIdx = key.indexOf("|");
      const funcionarioId = key.slice(0, pipeIdx);
      const dia = key.slice(pipeIdx + 1);
      const f = funcMap.get(funcionarioId);
      if (!f) continue;

      const inicioAtividades = inicioAtividadesUsuario(f.user);
      if (dia < inicioAtividades) continue;

      const [y, m, d] = dia.split("-").map(Number);
      const diaSemana = new Date(y, m - 1, d).getDay();
      if (!diasUteisCfg[diaSemana]) continue;

      const feriado = feriadoMap.get(dia);
      if (feriado && !feriado.marcoHorario) continue;
      if (emAfastamento(funcionarioId, dia)) continue;

      const jornadaCtx = resolverJornadaHistoricoContexto({
        ...f,
        configuracaoHoraEntrada: cfg?.horaEntrada ?? null,
        configuracaoHoraSaida: cfg?.horaSaida ?? null
      });
      const esperadoMin = horarioParaMinutos(jornadaCtx.horaEntrada ?? horaEntradaPadrao);
      const realMin = horarioParaMinutos(horarioDeDataBrasilia(dataHora));
      let delta = realMin - esperadoMin;
      if (delta > 0 && delta <= toleranciaEntrada) delta = 0;
      if (delta < 0 && Math.abs(delta) <= toleranciaEntrada) delta = 0;
      if (delta === 0) continue;

      const agg = pontMap.get(f.id) ?? {
        nome: f.user.name,
        matricula: f.matricula ?? "",
        somaMin: 0,
        dias: 0
      };
      agg.somaMin += delta;
      agg.dias += 1;
      pontMap.set(f.id, agg);
    }

    const pontualidade = Array.from(pontMap.entries()).map(([id, a]) => ({
      funcionarioId: id,
      nome: a.nome,
      matricula: a.matricula,
      minutos: a.dias > 0 ? Math.round(a.somaMin / a.dias) : 0,
      minutosFormatado: this.formatMinutes(a.dias > 0 ? Math.round(a.somaMin / a.dias) : 0)
    }));

    /* Atraso médio por gerência (só quem tem atraso líquido > 0 no período). */
    const gerenciaAgg = new Map<string, { nome: string; somaMin: number; qtd: number }>();
    for (const p of pontualidade) {
      if (p.minutos <= 0) continue;
      const f = funcMap.get(p.funcionarioId);
      if (!f?.gerenciaId) continue;
      const atual = gerenciaAgg.get(f.gerenciaId) ?? {
        nome: f.gerencia?.nome ?? "—",
        somaMin: 0,
        qtd: 0
      };
      atual.somaMin += p.minutos;
      atual.qtd += 1;
      gerenciaAgg.set(f.gerenciaId, atual);
    }
    const atrasoMedioPorGerencia = Array.from(gerenciaAgg.entries())
      .map(([gerenciaId, a]) => ({
        gerenciaId,
        nome: a.nome,
        minutos: Math.round(a.somaMin / a.qtd),
        funcionarios: a.qtd
      }))
      .sort((a, b) => b.minutos - a.minutos)
      .slice(0, 10);

    const topAtrasados = [...pontualidade]
      .filter((p) => p.minutos > 0)
      .sort((a, b) => b.minutos - a.minutos)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        minutos: Math.abs(p.minutos),
        minutosFormatado: this.formatMinutes(Math.abs(p.minutos))
      }));

    const topAdiantados = [...pontualidade]
      .filter((p) => p.minutos < 0)
      .sort((a, b) => a.minutos - b.minutos)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        minutos: Math.abs(p.minutos),
        minutosFormatado: this.formatMinutes(Math.abs(p.minutos))
      }));

    /* Banco: saldo do ciclo atual (mesma regra de /ponto/banco-horas e /ponto/historico) */
    const bancoRows = (
      await Promise.all(
        funcionarios.map(async (f) => {
          const banco = await this.pontoService.calcularBancoHorasAdmin(f.id);
          const saldo = banco.saldoAtualMinutos;
          if (saldo === 0) return null;
          return {
            funcionarioId: f.id,
            nome: f.user.name,
            matricula: f.matricula ?? "",
            minutos: saldo,
            minutosFormatado: this.formatMinutes(saldo)
          };
        })
      )
    ).filter((r): r is NonNullable<typeof r> => r !== null);

    const topBancoNegativo = [...bancoRows]
      .filter((r) => r.minutos < 0)
      .sort((a, b) => a.minutos - b.minutos)
      .slice(0, 10)
      .map((r) => ({
        ...r,
        minutos: Math.abs(r.minutos),
        minutosFormatado: this.formatMinutes(Math.abs(r.minutos))
      }));

    const topBancoPositivo = [...bancoRows]
      .filter((r) => r.minutos > 0)
      .sort((a, b) => b.minutos - a.minutos)
      .slice(0, 10);

    /* Atestados / Abonos: contagem de solicitações submetidas no período */
    const solicitacoesPeriodo = await this.prisma.solicitacao.findMany({
      where: {
        tipo: { in: ["ATESTADO", "ABONO"] },
        status: { not: "CANCELADA" },
        createdAt: { gte: iniFer, lte: fimFer },
        funcionarioId: { in: funcionarios.map((f) => f.id) }
      },
      select: { funcionarioId: true, tipo: true }
    });

    const contarPorTipo = (tipo: "ATESTADO" | "ABONO") => {
      const contagem = new Map<string, number>();
      for (const s of solicitacoesPeriodo) {
        if (s.tipo !== tipo) continue;
        contagem.set(s.funcionarioId, (contagem.get(s.funcionarioId) ?? 0) + 1);
      }
      const rows = Array.from(contagem.entries())
        .map(([funcionarioId, quantidade]) => {
          const f = funcMap.get(funcionarioId);
          if (!f || quantidade <= 0) return null;
          return {
            funcionarioId,
            nome: f.user.name,
            matricula: f.matricula ?? "",
            quantidade
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const topMais = [...rows].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);
      const topMenos = [...rows].sort((a, b) => a.quantidade - b.quantidade).slice(0, 10);
      return { topMais, topMenos };
    };

    const atestados = contarPorTipo("ATESTADO");
    const abonos = contarPorTipo("ABONO");

    return {
      topAtrasados,
      topAdiantados,
      topBancoNegativo,
      topBancoPositivo,
      topMaisAtestados: atestados.topMais,
      topMenosAtestados: atestados.topMenos,
      topMaisAbonos: abonos.topMais,
      topMenosAbonos: abonos.topMenos,
      atrasoMedioPorGerencia
    };
  }

  /* ─── Funcionários ─── */

  /** Situação atual do ponto com base no último registro de hoje. */
  private statusPontoDeTipo(tipo?: string | null): "presente" | "ausente" {
    if (!tipo) return "ausente";
    if (tipo === "ENTRADA" || tipo === "FIM_INTERVALO" || tipo === "REINICIAR_EXPEDIENTE") {
      return "presente";
    }
    return "ausente";
  }

  /** Resolve o tipo vigente hoje: último do dia civil em Brasília. */
  private ultimoTipoDoDia(
    porDia: Map<string, { tipo: string; dataHora: Date }[]> | undefined,
    hojeIso: string,
    ultimoGeral?: { tipo: string; dataHora: Date } | null
  ): string | null {
    const regsHoje = porDia?.get(hojeIso);
    if (regsHoje && regsHoje.length > 0) {
      return regsHoje[regsHoje.length - 1].tipo;
    }
    if (ultimoGeral && dataBrasiliaISO(ultimoGeral.dataHora) === hojeIso) {
      return ultimoGeral.tipo;
    }
    return null;
  }

  async getFuncionarios(filtros: {
    busca?: string;
    gerenciaId?: string;
    ativo?: boolean;
    mes?: number;
    ano?: number;
    dataInicio?: string;
    dataFim?: string;
    statusPonto?: "presente" | "ausente";
  }) {
    const where: Record<string, unknown> = {};
    if (filtros.ativo !== undefined) where.ativo = filtros.ativo;
    if (filtros.gerenciaId) where.gerenciaId = filtros.gerenciaId;
    if (filtros.busca) {
      where.OR = [
        { user: { name: { contains: filtros.busca, mode: "insensitive" } } },
        { user: { email: { contains: filtros.busca, mode: "insensitive" } } },
        { matricula: { contains: filtros.busca, mode: "insensitive" } },
        { cargo: { contains: filtros.busca, mode: "insensitive" } }
      ];
    }

    const funcionarios = await this.prisma.funcionario.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        gerencia: { select: { id: true, nome: true, sigla: true } },
        _count: {
          select: {
            registros: true,
            solicitacoes: true,
            afastamentos: true
          }
        }
      }
    });

    const hojeIso = hojeBrasiliaISO();
    const dataInicio =
      filtros.dataInicio && /^\d{4}-\d{2}-\d{2}$/.test(filtros.dataInicio)
        ? filtros.dataInicio
        : undefined;
    const dataFim =
      filtros.dataFim && /^\d{4}-\d{2}-\d{2}$/.test(filtros.dataFim) ? filtros.dataFim : undefined;

    let inicioPeriodo: Date;
    let fimPeriodo: Date;
    let mes: number;
    let ano: number;

    if (dataInicio && dataFim) {
      inicioPeriodo = intervaloDiaBrasilia(dataInicio).inicio;
      fimPeriodo = intervaloDiaBrasilia(dataFim).fim;
      mes = Number(dataInicio.slice(5, 7));
      ano = Number(dataInicio.slice(0, 4));
    } else {
      mes = filtros.mes ?? new Date().getMonth() + 1;
      ano = filtros.ano ?? new Date().getFullYear();
      const intervalo = this.mesIntervaloBrasilia(mes, ano);
      inicioPeriodo = intervalo.inicio;
      fimPeriodo = intervalo.fim;
    }

    /* Buscar período (mês do início do intervalo) para snapshot oficial, se houver */
    const periodos = (await this.prisma.periodoPonto.findMany({
      where: {
        mes,
        ano,
        funcionarioId: { in: funcionarios.map((f) => f.id) }
      }
    })) as PeriodoPontoRaw[];
    const periodosMap = new Map<string, PeriodoPontoRaw>(periodos.map((p) => [p.funcionarioId, p]));

    const ids = funcionarios.map((f) => f.id);

    /* Registros do intervalo — horas e extras/falta */
    const registrosPeriodo = ids.length
      ? await this.prisma.registroPonto.findMany({
          where: { funcionarioId: { in: ids }, dataHora: { gte: inicioPeriodo, lte: fimPeriodo } },
          orderBy: { dataHora: "asc" },
          select: { funcionarioId: true, tipo: true, dataHora: true }
        })
      : [];

    const registrosPorFunc = new Map<string, Map<string, { tipo: string; dataHora: Date }[]>>();
    for (const r of registrosPeriodo) {
      if (!registrosPorFunc.has(r.funcionarioId)) {
        registrosPorFunc.set(r.funcionarioId, new Map());
      }
      const porDia = registrosPorFunc.get(r.funcionarioId)!;
      const dia = dataBrasiliaISO(r.dataHora);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia)!.push({ tipo: r.tipo, dataHora: r.dataHora });
    }

    /* Último registro geral (mantido no retorno) */
    const ultimosRegistros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId: { in: ids } },
      orderBy: { dataHora: "desc" },
      distinct: ["funcionarioId"],
      select: { funcionarioId: true, tipo: true, dataHora: true, origem: true }
    });
    const ultimosMap = new Map(
      ultimosRegistros.map((r) => [r.funcionarioId, r] as [string, typeof r])
    );

    /* Solicitações em aberto por funcionário */
    const pendentes = await this.prisma.solicitacao.groupBy({
      by: ["funcionarioId"],
      where: {
        status: { in: [...AuditoriaService.STATUS_SOLICITACAO_ABERTA] },
        funcionarioId: { in: ids }
      },
      _count: { _all: true }
    });
    const pendentesMap = new Map(
      pendentes.map((p) => [p.funcionarioId, p._count._all] as [string, number])
    );

    const resultado = funcionarios.map((f) => {
      const periodo = periodosMap.get(f.id) ?? null;
      const porDia = registrosPorFunc.get(f.id) ?? new Map();
      const resumo = this.calcResumoMensalFromRegistros(porDia, f.jornadaHorasDia, hojeIso);

      const intervaloEhMesCheio =
        !dataInicio &&
        !dataFim &&
        periodo &&
        (periodo.status === "FECHADO" || periodo.status === "APROVADO") &&
        periodo.horasTrabalhadasMinutos > 0;

      const horasTrabalhadasMinutos = intervaloEhMesCheio
        ? periodo!.horasTrabalhadasMinutos
        : resumo.horasTrabalhadasMinutos;
      const horasExtrasMinutos = intervaloEhMesCheio
        ? periodo!.horasExtrasMinutos
        : resumo.horasExtrasMinutos;
      const horasFaltaMinutos = intervaloEhMesCheio
        ? periodo!.horasFaltaMinutos
        : resumo.horasFaltaMinutos;

      const ultimo = ultimosMap.get(f.id) ?? null;
      const statusPonto = this.statusPontoDeTipo(this.ultimoTipoDoDia(porDia, hojeIso, ultimo));

      return {
        id: f.id,
        matricula: f.matricula,
        cargo: f.cargo,
        departamento: f.departamento,
        categoria: f.categoria,
        ativo: f.ativo,
        jornadaHorasDia: f.jornadaHorasDia,
        fotoPerfilUrl: f.fotoPerfilUrl,
        subsecao: f.subsecao,
        section: f.section,
        isManager: f.isManager,
        ramal: f.ramal,
        sala: f.sala,
        andar: f.andar,
        createdAt: f.createdAt,
        user: f.user,
        gerencia: f.gerencia,
        totalRegistros: f._count.registros,
        totalSolicitacoes: f._count.solicitacoes,
        totalAfastamentos: f._count.afastamentos,
        statusPonto,
        periodo: periodo
          ? {
              ...periodo,
              ...resumo,
              horasTrabalhadasMinutos,
              horasExtrasMinutos,
              horasFaltaMinutos
            }
          : {
              id: "",
              funcionarioId: f.id,
              mes,
              ano,
              ...resumo,
              status: "ABERTO",
              fechadoEm: null,
              aprovadoPor: null
            },
        periodoFormatado: {
          horasTrabalhadas: this.formatMinutes(horasTrabalhadasMinutos),
          horasExtras: this.formatMinutes(horasExtrasMinutos),
          horasFalta: this.formatMinutes(horasFaltaMinutos),
          status: periodo?.status ?? "ABERTO"
        },
        ultimoRegistro: ultimo,
        solicitacoesPendentes: pendentesMap.get(f.id) ?? 0
      };
    });

    if (!filtros.statusPonto) return resultado;
    return resultado.filter((f) => f.statusPonto === filtros.statusPonto);
  }

  async getFuncionarioDetalhe(id: string) {
    return this.prisma.funcionario.findUniqueOrThrow({
      where: { id },
      include: {
        user: true,
        gerencia: true,
        jornadas: true,
        enderecoResidencial: true,
        periodos: { orderBy: [{ ano: "desc" }, { mes: "desc" }] },
        _count: { select: { registros: true, solicitacoes: true, afastamentos: true } }
      }
    });
  }

  /* ─── Registros ─── */

  async getRegistros(filtros: {
    funcionarioId?: string;
    gerenciaId?: string;
    dataInicio?: string;
    dataFim?: string;
    tipo?: string;
    origem?: string;
    ajustado?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 100, 500);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filtros.funcionarioId) where.funcionarioId = filtros.funcionarioId;
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.origem) where.origem = filtros.origem;
    if (filtros.ajustado !== undefined) where.ajustado = filtros.ajustado;
    if (filtros.dataInicio || filtros.dataFim) {
      where.dataHora = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim + "T23:59:59") } : {})
      };
    }
    if (filtros.gerenciaId) {
      where.funcionario = { gerenciaId: filtros.gerenciaId };
    }

    const [total, registros] = await Promise.all([
      this.prisma.registroPonto.count({ where }),
      this.prisma.registroPonto.findMany({
        where,
        orderBy: { dataHora: "desc" },
        skip,
        take: limit,
        include: {
          funcionario: {
            select: {
              id: true,
              matricula: true,
              cargo: true,
              fotoPerfilUrl: true,
              user: { select: { name: true, email: true } },
              gerencia: { select: { nome: true, sigla: true } }
            }
          }
        }
      })
    ]);

    return { total, page, limit, registros };
  }

  async getRegistrosFuncionario(
    funcionarioId: string,
    filtros: { mes?: number; ano?: number; tipo?: string },
    isSuperAdmin = false
  ) {
    const mes = filtros.mes ?? new Date().getMonth() + 1;
    const ano = filtros.ano ?? new Date().getFullYear();
    const mesPrefix = `${ano}-${String(mes).padStart(2, "0")}`;
    const dataInicioProducao = await getDataInicioProducao(this.prisma);
    assertMesAposGoLive({
      mesAnoPrefixo: mesPrefix,
      dataInicioProducao,
      isSuperAdmin,
      contexto: "Auditoria"
    });
    const inicio = new Date(ano, mes - 1, 1, 0, 0, 0);
    const fim = new Date(ano, mes, 0, 23, 59, 59);

    const where: Record<string, unknown> = {
      funcionarioId,
      dataHora: { gte: inicio, lte: fim }
    };
    if (filtros.tipo) where.tipo = filtros.tipo;

    const ultimoDiaMes = new Date(ano, mes, 0).getDate();
    const primeiroDia = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const ultimoDiaIso = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDiaMes).padStart(2, "0")}`;
    const { inicio: feriadoIni, fim: feriadoFim } = intervaloColunaDate(primeiroDia, ultimoDiaIso);

    const [registros, func, cfgJornada, feriadosRaw, cfgSolicitacoes] = await Promise.all([
      this.prisma.registroPonto.findMany({
        where,
        orderBy: { dataHora: "asc" }
      }),
      this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: {
          categoria: true,
          isManager: true,
          isFiscal: true,
          registroPontoObrigatorio: true,
          pontoObrigatorioDesde: true,
          jornadaPeriodoId: true,
          jornadaHorasDia: true,
          jornadaPeriodoDesde: true,
          jornadaPeriodoAssociadoEm: true,
          jornadaPeriodo: {
            select: {
              jornadaDiariaMin: true,
              horaEntrada: true,
              horaSaida: true,
              almocoMinMin: true,
              almocoPodeIniciarA: true,
              almocoPodeIniciarAte: true,
              toleranciaEntradaMin: true,
              toleranciaSaidaMin: true,
              toleranciaCalculoMin: true,
              horaExtraLimiteAuto: true
            }
          },
          user: { select: { primeiroLoginEm: true } }
        }
      }),
      this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: {
          horaEntrada: true,
          horaSaida: true,
          almocoMinMin: true,
          almocoPodeIniciarA: true,
          almocoPodeIniciarAte: true,
          toleranciaEntradaMin: true,
          toleranciaSaidaMin: true,
          toleranciaCalculoMin: true,
          horaExtraLimiteAuto: true
        }
      }),
      this.prisma.feriadoConfig.findMany({
        where: { data: { gte: feriadoIni, lte: feriadoFim } },
        select: { data: true, nome: true, tipo: true, marcoHorario: true, marcoLado: true }
      }),
      this.configSolicitacoesService.getConfig()
    ]);

    const historicoCat = await ensureCategoriaHistorico(this.prisma, funcionarioId);
    const pontoObrigatorioDesde = func?.pontoObrigatorioDesde
      ? dataCivilISO(func.pontoObrigatorioDesde)
      : null;
    const periodosSemObrigacao = periodosSemObrigacaoPonto(historicoCat, {
      pontoObrigatorioDesde,
      categoriaAtual: func?.categoria,
      isManagerAtual: func?.isManager,
      isFiscalAtual: func?.isFiscal,
      registroPontoObrigatorioAtual: func?.registroPontoObrigatorio
    });

    const feriados = feriadosRaw.map((f) => ({
      data: `${dataCivilISO(f.data)}T12:00:00.000-03:00`,
      nome: f.nome,
      tipo: f.tipo,
      marcoHorario: f.marcoHorario,
      marcoLado: f.marcoLado
    }));

    /* Contexto de HE por dia: a tela aplica a mesma regra do banco (aplicarRegraHoraExtra). */
    const contextoHe = await carregarContextoHoraExtra(this.prisma, funcionarioId, inicio, fim);

    const cicloEmCasaAud = await diasCicloCompletoEmCasa(
      this.prisma,
      funcionarioId,
      intervaloDiaBrasilia(primeiroDia).inicio,
      intervaloDiaBrasilia(ultimoDiaIso).fim
    );
    const jornadaAud = {
      ...resolverJornadaHistoricoContexto({
        ...func,
        configuracaoHoraEntrada: cfgJornada?.horaEntrada ?? null,
        configuracaoHoraSaida: cfgJornada?.horaSaida ?? null,
        configuracaoAlmocoMinMin: cfgJornada?.almocoMinMin ?? null,
        configuracaoAlmocoPodeIniciarA: cfgJornada?.almocoPodeIniciarA ?? null,
        configuracaoAlmocoPodeIniciarAte: cfgJornada?.almocoPodeIniciarAte ?? null,
        configuracaoToleranciaEntradaMin: cfgJornada?.toleranciaEntradaMin ?? null,
        configuracaoToleranciaSaidaMin: cfgJornada?.toleranciaSaidaMin ?? null,
        configuracaoToleranciaCalculoMin: cfgJornada?.toleranciaCalculoMin ?? null,
        configuracaoHoraExtraLimiteAuto: cfgJornada?.horaExtraLimiteAuto ?? null
      }),
      atestadoTempoRetornoMin: cfgSolicitacoes.atestadoTempoRetornoMin,
      atestadoTempoIdaMin: cfgSolicitacoes.atestadoTempoIdaMin
    };

    return {
      registros,
      categoria: func?.categoria ?? null,
      periodosSemObrigacao,
      contextoHoraExtra: contextoHe,
      rotuloModalidadePorDia: await rotulosModalidadePorDia(
        this.prisma,
        funcionarioId,
        intervaloDiaBrasilia(primeiroDia).inicio,
        intervaloDiaBrasilia(ultimoDiaIso).fim
      ),
      interjornadaPorDia: await interjornadaCurtaPorDia(
        this.prisma,
        funcionarioId,
        intervaloDiaBrasilia(primeiroDia).inicio,
        intervaloDiaBrasilia(ultimoDiaIso).fim
      ),
      cicloCompletoPresencial: await exigenciasCicloPresencial(
        this.prisma,
        funcionarioId,
        intervaloDiaBrasilia(primeiroDia).inicio,
        intervaloDiaBrasilia(ultimoDiaIso).fim,
        jornadaAud,
        cicloEmCasaAud.dias
      ),
      cicloCompletoEmCasa: cicloEmCasaAud,
      periodosCessao: await periodosCessao(this.prisma, funcionarioId),
      semRegistroPonto: funcionarioSemRegistroPonto(func ?? {}),
      pontoObrigatorioDesde,
      inicioAtividades: inicioAtividadesUsuario(func?.user),
      feriados,
      jornada: jornadaAud
    };
  }

  /* ─── Solicitações ─── */

  async getSolicitacoes(filtros: {
    status?: string;
    tipo?: string;
    funcionarioId?: string;
    gerenciaId?: string;
    dataInicio?: string;
    dataFim?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filtros.status) {
      const statusList = filtros.status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = statusList.length === 1 ? statusList[0] : { in: statusList };
    }
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.funcionarioId) where.funcionarioId = filtros.funcionarioId;
    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim + "T23:59:59") } : {})
      };
    }
    if (filtros.gerenciaId) {
      where.funcionario = { gerenciaId: filtros.gerenciaId };
    }

    const [total, rows] = await Promise.all([
      this.prisma.solicitacao.count({ where }),
      this.prisma.solicitacao.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: this.solicitacaoFuncionarioInclude
      })
    ]);

    const solicitacoes = await this.enriquecerSolicitacoesComGestor(rows);
    return { total, page, limit, solicitacoes };
  }

  async atualizarStatusSolicitacao(
    id: string,
    status: "APROVADA" | "REJEITADA",
    observacaoGestor: string,
    resolvidoPor: string
  ) {
    const sol = await this.prisma.solicitacao.findUniqueOrThrow({
      where: { id },
      select: { funcionarioId: true, metadados: true }
    });
    await this.assertNaoEhProprioPorSub(sol.funcionarioId, resolvidoPor);
    if (status === "APROVADA") {
      const quem = await this.prisma.user.findFirst({
        where: { externalId: resolvidoPor },
        select: { id: true }
      });
      this.assertCriadorNaoAprova(sol.metadados, quem?.id);
    }
    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        status,
        observacaoGestor,
        resolvidoPor,
        resolvidoEm: new Date()
      }
    });
  }

  /* ─── Fluxo Bifásico: Gestor ─── */

  async getEquipeDoGestor(keycloakSub: string, isSuperAdmin = false, temRoleGestor = false) {
    const includeBase = {
      user: { select: { name: true, email: true, emailReal: true } },
      gerencia: true
    } as const;

    if (isSuperAdmin) {
      return this.prisma.funcionario.findMany({
        where: { ativo: true },
        include: includeBase,
        orderBy: { createdAt: "asc" }
      });
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) return [];

    const meuFunc = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        isManager: true,
        section: true,
        subsecao: true,
        categoria: true,
        gerenciaId: true
      }
    });

    const ids = new Set<string>();

    if (meuFunc?.id) {
      const supervisionados = await this.prisma.funcionario.findMany({
        where: {
          ativo: true,
          supervisorEstagioId: meuFunc.id,
          categoria: { in: ["ESTAGIARIO", "MENOR_APRENDIZ"] }
        },
        select: { id: true }
      });
      for (const f of supervisionados) ids.add(f.id);
    }

    /* Exceção de coordenação: um Chefe cuja subseção contém "coordenação" (ex.:
       "Coordenacao de Especialidades") é chefe apenas dos funcionários daquela
       subseção — não de toda a gerência/seção, ao contrário do chefe comum. */
    const ehChefeDeCoordenacao =
      !!meuFunc?.isManager && !!meuFunc.subsecao && /coordena/i.test(meuFunc.subsecao);

    if (ehChefeDeCoordenacao && meuFunc?.gerenciaId) {
      const daCoordenacao = await this.prisma.funcionario.findMany({
        where: {
          ativo: true,
          gerenciaId: meuFunc.gerenciaId,
          subsecao: meuFunc.subsecao,
          NOT: { id: meuFunc.id }
        },
        select: { id: true, categoria: true, supervisorEstagioId: true }
      });
      for (const f of daCoordenacao) {
        const estágioComOutroSupervisor =
          (f.categoria === "ESTAGIARIO" || f.categoria === "MENOR_APRENDIZ") &&
          f.supervisorEstagioId &&
          f.supervisorEstagioId !== meuFunc?.id;
        if (!estágioComOutroSupervisor) ids.add(f.id);
      }
    } else {
      const gerencias = await this.prisma.gerencia.findMany({
        where: { responsavelUserId: user.id }
      });

      if (gerencias.length) {
        const daGerencia = await this.prisma.funcionario.findMany({
          where: { gerenciaId: { in: gerencias.map((g) => g.id) }, ativo: true },
          select: { id: true, categoria: true, supervisorEstagioId: true }
        });
        for (const f of daGerencia) {
          const estágioComOutroSupervisor =
            (f.categoria === "ESTAGIARIO" || f.categoria === "MENOR_APRENDIZ") &&
            f.supervisorEstagioId &&
            f.supervisorEstagioId !== meuFunc?.id;
          if (!estágioComOutroSupervisor) ids.add(f.id);
        }
      }

      /* Chefe de seção (ex.: RH): inclui colegas da seção mesmo se também for
         responsável de gerência — permite dupla confirmação (chefe + RH). */
      if (meuFunc?.isManager && meuFunc.section) {
        const daSecao = await this.prisma.funcionario.findMany({
          where: {
            ativo: true,
            section: meuFunc.section,
            NOT: { userId: user.id }
          },
          select: { id: true, categoria: true, supervisorEstagioId: true }
        });
        for (const f of daSecao) {
          const estágioComOutroSupervisor =
            (f.categoria === "ESTAGIARIO" || f.categoria === "MENOR_APRENDIZ") &&
            f.supervisorEstagioId &&
            f.supervisorEstagioId !== meuFunc.id;
          if (!estágioComOutroSupervisor) ids.add(f.id);
        }
      }
    }

    if (ids.size > 0) {
      return this.prisma.funcionario.findMany({
        where: { id: { in: Array.from(ids) } },
        include: includeBase,
        orderBy: { createdAt: "asc" }
      });
    }

    if (temRoleGestor) {
      return this.prisma.funcionario.findMany({
        where: { ativo: true, NOT: { userId: user.id } },
        include: includeBase,
        take: 200
      });
    }

    return [];
  }

  async getSolicitacoesGestor(
    keycloakSub: string,
    filtros: {
      status?: string;
      tipo?: string;
      dataInicio?: string;
      dataFim?: string;
      page?: number;
      limit?: number;
    },
    isSuperAdmin = false,
    temRoleGestor = false
  ) {
    const equipe = await this.getEquipeDoGestor(keycloakSub, isSuperAdmin, temRoleGestor);
    const ids = equipe.map((f) => f.id);
    if (!ids.length) return { total: 0, page: 1, limit: 50, solicitacoes: [] };

    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const statusFiltro = filtros.status ?? "PENDENTE";
    const statusList = statusFiltro
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const historicoGestor = statusFiltro === "HISTORICO_GESTOR";

    const where: Record<string, unknown> = { funcionarioId: { in: ids } };

    if (historicoGestor) {
      // Todas as solicitações em que o gestor já decidiu (inclui fluxo finalizado pelo RH)
      where.OR = [
        { gestorResolvidoEm: { not: null } },
        {
          gestorResolvidoEm: null,
          observacaoGestor: { not: null },
          status: { not: "PENDENTE" }
        }
      ];
    } else {
      where.status = statusList.length === 1 ? statusList[0] : { in: statusList };
    }

    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim + "T23:59:59") } : {})
      };
    }

    const orderBy = historicoGestor
      ? [{ gestorResolvidoEm: "desc" as const }, { createdAt: "desc" as const }]
      : { createdAt: "desc" as const };

    const [total, rows] = await Promise.all([
      this.prisma.solicitacao.count({ where }),
      this.prisma.solicitacao.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          funcionario: {
            select: {
              id: true,
              matricula: true,
              cargo: true,
              fotoPerfilUrl: true,
              user: { select: { name: true, email: true, emailReal: true } },
              gerencia: { select: { nome: true, sigla: true } }
            }
          }
        }
      })
    ]);

    const solicitacoes = await this.enriquecerSolicitacoesComGestor(rows);
    return { total, page, limit, solicitacoes };
  }

  /**
   * Mesma regra de assertNaoEhAutoaprovacao, a partir do login (Keycloak sub): ninguém —
   * nem RH, chefe ou Gerente de RH — dá andamento a uma demanda de RH de si mesmo.
   */
  private async assertNaoEhProprioPorSub(
    funcionarioId: string,
    keycloakSub: string,
    mensagem = "Você não pode aprovar ou rejeitar sua própria solicitação."
  ) {
    const user = await this.prisma.user.findFirst({
      where: { externalId: keycloakSub },
      select: { id: true }
    });
    if (!user) return;
    const dono = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { userId: true }
    });
    if (dono?.userId === user.id) throw new ForbiddenException(mensagem);
  }

  /** Quem abriu a solicitação em nome do funcionário não dá a aprovação final da etapa RH. */
  private assertCriadorNaoAprova(metadados: unknown, aprovadorUserId?: string | null) {
    const criador = ((metadados ?? {}) as { criadaPorRh?: { userId?: string | null } }).criadaPorRh
      ?.userId;
    if (criador && aprovadorUserId && criador === aprovadorUserId) {
      throw new ForbiddenException(
        "Quem abriu a solicitação em nome do funcionário não pode dar a aprovação final. Outro membro do RH deve aprovar."
      );
    }
  }

  /** Impede que o próprio solicitante aprove/rejeite a sua solicitação, mesmo tendo o papel de gestor/RH. */
  private async assertNaoEhAutoaprovacao(funcionarioId: string, aprovadorUserId?: string | null) {
    if (!aprovadorUserId) return;
    const dono = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { userId: true }
    });
    if (dono?.userId === aprovadorUserId) {
      throw new ForbiddenException("Você não pode aprovar ou rejeitar sua própria solicitação.");
    }
  }

  async gestorResolverSolicitacao(
    id: string,
    decisao: "APROVAR" | "REJEITAR",
    observacao: string,
    keycloakSub: string,
    isSuperAdmin = false,
    cienciaMeta?: GestorCienciaMeta
  ) {
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });
    if (solicitacao.status !== "PENDENTE") {
      throw new BadRequestException(
        "Apenas solicitações com status PENDENTE podem ser resolvidas pelo chefe."
      );
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    await this.assertNaoEhAutoaprovacao(solicitacao.funcionarioId, user?.id);

    // Super admin tem autoridade sobre qualquer funcionário
    if (!isSuperAdmin) {
      const equipe = await this.getEquipeDoGestor(keycloakSub);
      const pertenceEquipe = equipe.some((f) => f.id === solicitacao.funcionarioId);
      if (!pertenceEquipe) {
        throw new ForbiddenException("Você não tem autoridade sobre este funcionário.");
      }
    }

    const agora = new Date();

    /* Correção de ponto: aprovação do gestor já finaliza — não precisa de RH */
    if (decisao === "APROVAR" && solicitacao.tipo === "CORRECAO_PONTO") {
      await this.aplicarMudancaSolicitacao(solicitacao, keycloakSub);
      const aprovada = await this.prisma.solicitacao.update({
        where: { id },
        data: {
          status: "APROVADA",
          gestorUserId: user?.id,
          gestorObservacao: observacao,
          gestorResolvidoEm: agora,
          resolvidoPor: keycloakSub,
          resolvidoEm: agora
        }
      });
      this.notificarSolicitacaoFuncionario(
        solicitacao.funcionarioId,
        "APROVADA",
        solicitacao.tipo,
        observacao
      ).catch((e) => this.logger.error(`Falha ao notificar SOLICITACAO_APROVADA: ${e}`));
      return aprovada;
    }

    /* Atestado médico: ciência do gestor com assinatura digital no documento → RH */
    let metadadosUpdate: Record<string, unknown> | undefined;
    if (decisao === "APROVAR" && solicitacao.tipo === "ATESTADO") {
      const meta =
        solicitacao.metadados && typeof solicitacao.metadados === "object"
          ? ({ ...(solicitacao.metadados as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      const documentoUrl = typeof meta.documentoUrl === "string" ? meta.documentoUrl : null;
      if (!documentoUrl) {
        throw new BadRequestException(
          "O atestado médico precisa ter o documento anexado para o gestor dar ciência."
        );
      }
      if (!cienciaMeta?.ipReal) {
        throw new BadRequestException(
          "Metadados de assinatura digital são obrigatórios para ciência do atestado."
        );
      }

      const gestorNome = user?.name ?? "Chefe";
      const documentoAssinadoUrl = await this.documentoService.assinarAtestadoCienciaGestor({
        documentoUrl,
        funcionarioId: solicitacao.funcionarioId,
        solicitacaoId: solicitacao.id,
        assinatura: {
          gestorNome,
          assinadoEm: agora,
          ipReal: cienciaMeta.ipReal,
          ipGateway: cienciaMeta.ipGateway,
          userAgent: cienciaMeta.userAgent
        }
      });

      const funcNome =
        (
          await this.prisma.funcionario.findUnique({
            where: { id: solicitacao.funcionarioId },
            select: { user: { select: { name: true } } }
          })
        )?.user?.name ?? "";
      void registrarDocumentoEmitido(this.prisma, {
        tipo: "CIENCIA_ATESTADO",
        referenciaId: solicitacao.id,
        url: documentoAssinadoUrl,
        titulo: "Atestado médico com ciência do chefe",
        detalhes: {
          funcionario: mascararNome(funcNome),
          assinadoPor: gestorNome,
          assinadoEm: agora.toISOString()
        }
      });
      metadadosUpdate = {
        ...meta,
        documentoOriginalUrl: meta.documentoOriginalUrl ?? documentoUrl,
        documentoUrl: documentoAssinadoUrl,
        cienciaGestor: {
          em: agora.toISOString(),
          gestorUserId: user?.id ?? null,
          gestorNome,
          ipReal: cienciaMeta.ipReal,
          ipGateway: cienciaMeta.ipGateway ?? null,
          userAgent: cienciaMeta.userAgent ?? null,
          codigoHash: codigoCienciaGestorExibido(
            gestorNome,
            agora,
            cienciaMeta.ipReal,
            cienciaMeta.userAgent
          )
        }
      };
    }

    /* Demais tipos: fluxo bifásico normal (gestor → RH) */
    const novoStatus = decisao === "APROVAR" ? "AGUARDANDO_RH" : "REJEITADA_GESTOR";
    const resolvida = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        status: novoStatus,
        gestorUserId: user?.id,
        gestorObservacao: observacao,
        gestorResolvidoEm: agora,
        ...(metadadosUpdate ? { metadados: metadadosUpdate as Prisma.InputJsonValue } : {})
      },
      include: {
        funcionario: { include: { user: { select: { name: true } } } }
      }
    });

    if (novoStatus === "REJEITADA_GESTOR") {
      this.notificarSolicitacaoFuncionario(
        solicitacao.funcionarioId,
        "RECUSADA",
        solicitacao.tipo,
        observacao
      ).catch((e) => this.logger.error(`Falha ao notificar SOLICITACAO_RECUSADA: ${e}`));
      /* Férias programadas pelo RH recusadas pelo chefe: o RH autor é avisado. */
      const metaRec = solicitacao.metadados as Record<string, unknown> | null;
      if (solicitacao.tipo === "FERIAS" && metaRec?.origem === "RH") {
        this.notificarRhFeriasRecusadasPeloChefe(
          resolvida.funcionario.user?.name ?? "Funcionário",
          metaRec,
          user?.name ?? "Chefe",
          observacao
        ).catch((e) => this.logger.error(`Falha ao notificar RH (férias recusadas): ${e}`));
      }
    }

    if (novoStatus === "AGUARDANDO_RH") {
      this.notificarSolicitacaoAguardandoRh(
        resolvida.funcionario.user?.name ?? "Funcionário",
        solicitacao.tipo
      ).catch((e) => this.logger.error(`Falha ao notificar SOLICITACAO_AGUARDANDO_RH: ${e}`));
    }

    return resolvida;
  }

  /* ─── Fluxo Bifásico: RH ─── */

  async getSolicitacoesParaRH(filtros: {
    tipo?: string;
    funcionarioId?: string;
    gerenciaId?: string;
    dataInicio?: string;
    dataFim?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      status: { in: ["AGUARDANDO_RH", "AGUARDANDO_DOCUMENTO_FUNCIONARIO"] }
    };
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.funcionarioId) where.funcionarioId = filtros.funcionarioId;
    if (filtros.gerenciaId) where.funcionario = { gerenciaId: filtros.gerenciaId };
    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim + "T23:59:59") } : {})
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.solicitacao.count({ where }),
      this.prisma.solicitacao.findMany({
        where,
        orderBy: { gestorResolvidoEm: "asc" },
        skip,
        take: limit,
        include: this.solicitacaoFuncionarioInclude
      })
    ]);

    const solicitacoes = await this.enriquecerSolicitacoesComGestor(rows);
    return { total, page, limit, solicitacoes };
  }

  async rhResolverSolicitacao(
    id: string,
    decisao: "APROVAR" | "REJEITAR",
    observacao: string,
    keycloakSub: string
  ) {
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({
      where: { id }
    });

    if (solicitacao.status !== "AGUARDANDO_RH") {
      throw new BadRequestException(
        "Apenas solicitações aguardando RH podem ser resolvidas nesta etapa."
      );
    }

    const rhUser = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    await this.assertNaoEhAutoaprovacao(solicitacao.funcionarioId, rhUser?.id);
    if (decisao === "APROVAR") this.assertCriadorNaoAprova(solicitacao.metadados, rhUser?.id);

    if (decisao === "APROVAR") {
      const metadados = solicitacao.metadados as Record<string, unknown> | null;
      const requerHomologacao = metadados?.requerHomologacao === true;
      if (
        solicitacao.tipo === "ATESTADO" &&
        requerHomologacao &&
        !solicitacao.documentoRetornoUrl
      ) {
        throw new BadRequestException(
          "Aguardando o funcionário enviar o documento de retorno da consulta médica antes da aprovação."
        );
      }
      const docsFerias = Array.isArray(metadados?.documentosFerias)
        ? (metadados!.documentosFerias as Array<{ tipo?: string }>)
        : null;
      if (solicitacao.tipo === "FERIAS" && docsFerias) {
        /* Fluxo atual: Aviso + Recibo enviados pelo RH e assinados pelo funcionário. */
        if (
          !docsFerias.some((d) => d.tipo === "AVISO") ||
          !docsFerias.some((d) => d.tipo === "RECIBO")
        ) {
          throw new BadRequestException(
            "Envie o Aviso de Férias e o Recibo de Férias ao funcionário antes de aprovar."
          );
        }
        const rejeicao = metadados?.rejeicaoDocumentoFerias as
          | { documento?: string; justificativa?: string }
          | undefined;
        if (rejeicao) {
          throw new BadRequestException(
            `O funcionário rejeitou "${rejeicao.documento ?? "um documento"}": ` +
              `${rejeicao.justificativa ?? ""} — corrija e reenvie os documentos de férias.`
          );
        }
        if (!metadados?.assinaturaFerias) {
          throw new BadRequestException(
            "Aguardando o funcionário assinar pelo sistema cada documento de férias."
          );
        }
      } else if (solicitacao.tipo === "FERIAS") {
        /* Envios antigos (folha única + documento de retorno). */
        if (!solicitacao.guiaMedicoUrl) {
          throw new BadRequestException(
            "Envie o Aviso e o Recibo de Férias ao funcionário antes de aprovar."
          );
        }
        if (!solicitacao.documentoRetornoUrl) {
          throw new BadRequestException(
            "Aguardando o funcionário enviar a folha de pagamento de férias assinada antes da aprovação."
          );
        }
      }
    }

    const agora = new Date();

    if (decisao === "REJEITAR") {
      const rejeitada = await this.prisma.solicitacao.update({
        where: { id },
        data: {
          status: "REJEITADA_RH",
          rhUserId: rhUser?.id,
          rhObservacao: observacao,
          rhResolvidoEm: agora,
          resolvidoPor: keycloakSub,
          resolvidoEm: agora
        }
      });
      this.notificarSolicitacaoFuncionario(
        solicitacao.funcionarioId,
        "RECUSADA",
        solicitacao.tipo,
        observacao
      ).catch((e) => this.logger.error(`Falha ao notificar SOLICITACAO_RECUSADA: ${e}`));
      return rejeitada;
    }

    // Aprovar: aplicar a mudança conforme o tipo
    await this.aplicarMudancaSolicitacao(solicitacao, keycloakSub);

    // Se for uma alteração de férias, cancela a solicitação original substituída
    const metaAprov = solicitacao.metadados as Record<string, unknown> | null;
    if (solicitacao.tipo === "FERIAS" && typeof metaAprov?.alteracaoDeId === "string") {
      /* Remove os afastamentos da férias substituída — antes eles continuavam valendo
         junto com os novos. */
      const original = await this.prisma.solicitacao.findUnique({
        where: { id: metaAprov.alteracaoDeId }
      });
      if (original) await this.removerAfastamentosDaSolicitacao(this.prisma, original);
      await this.prisma.solicitacao.update({
        where: { id: metaAprov.alteracaoDeId },
        data: { status: "CANCELADA" }
      });
    }

    const aprovada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        status: "APROVADA",
        rhUserId: rhUser?.id,
        rhObservacao: observacao,
        rhResolvidoEm: agora,
        resolvidoPor: keycloakSub,
        resolvidoEm: agora
      }
    });
    this.notificarSolicitacaoFuncionario(
      solicitacao.funcionarioId,
      "APROVADA",
      solicitacao.tipo,
      observacao
    ).catch((e) => this.logger.error(`Falha ao notificar SOLICITACAO_APROVADA: ${e}`));
    /* Férias programadas pelo RH que não passaram pelo chefe (sem chefe disponível): ele é
       só informado da aprovação. As que ele aprovou já o envolveram. */
    if (solicitacao.tipo === "FERIAS" && metaAprov?.origem === "RH" && !solicitacao.gestorUserId) {
      this.notificarChefeFeriasRhAprovadas(solicitacao.funcionarioId, metaAprov).catch((e) =>
        this.logger.error(`Falha ao notificar FERIAS_RH (aprovação): ${e}`)
      );
    }
    return aprovada;
  }

  async rhEnviarGuiaMedica(
    id: string,
    guiaMedicoBase64: string,
    observacao: string,
    keycloakSub: string
  ) {
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({
      where: { id }
    });

    await this.assertNaoEhProprioPorSub(
      solicitacao.funcionarioId,
      keycloakSub,
      "Você não pode dar andamento à sua própria solicitação. Outro membro do RH deve tratá-la."
    );

    if (solicitacao.status !== "AGUARDANDO_RH") {
      throw new BadRequestException(
        "Apenas solicitações aguardando RH podem receber a guia médica."
      );
    }

    if (solicitacao.tipo !== "ATESTADO") {
      throw new BadRequestException("A guia médica só pode ser enviada para atestados.");
    }

    const url = await this.documentoService.salvarGuiaMedica(id, guiaMedicoBase64);
    const rhUser = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });

    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        guiaMedicoUrl: url,
        guiaMedicoEnviadaEm: new Date(),
        guiaMedicoObservacao: observacao,
        status: "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
        rhUserId: rhUser?.id
      }
    });

    this.notificarDocumentoRhEnviado(atualizada.funcionarioId, "guia médica", observacao).catch(
      (e) => this.logger.error(`Falha ao notificar RH_DOCUMENTO_ENVIADO: ${e}`)
    );
    this.notificarDocumentoRetornoPendente(atualizada.funcionarioId, "atestado assinado").catch(
      (e) => this.logger.error(`Falha ao notificar DOCUMENTO_RETORNO_PENDENTE: ${e}`)
    );

    return atualizada;
  }

  /**
   * RH envia os documentos de férias ao funcionário (Aviso de Férias, Recibo de Férias e
   * outros) — etapa AGUARDANDO_RH → AGUARDANDO_DOCUMENTO_FUNCIONARIO. Aceita vários
   * arquivos em `documentos`; `folhaBase64` (um arquivo) continua aceito.
   */
  async rhEnviarFolhaFerias(
    id: string,
    entrada: { documentos?: DocumentoFeriasEntrada[]; folhaBase64?: string },
    observacao: string,
    keycloakSub: string
  ) {
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });

    await this.assertNaoEhProprioPorSub(
      solicitacao.funcionarioId,
      keycloakSub,
      "Você não pode dar andamento à sua própria solicitação. Outro membro do RH deve tratá-la."
    );

    if (solicitacao.status !== "AGUARDANDO_RH") {
      throw new BadRequestException(
        "Apenas solicitações aguardando RH podem receber os documentos de férias."
      );
    }
    if (solicitacao.tipo !== "FERIAS") {
      throw new BadRequestException(
        "Os documentos de férias só podem ser enviados para solicitações de férias."
      );
    }

    const docsEntrada: DocumentoFeriasEntrada[] = Array.isArray(entrada.documentos)
      ? entrada.documentos.filter((d) => typeof d?.arquivoBase64 === "string" && d.arquivoBase64)
      : entrada.folhaBase64
        ? [
            {
              tipo: "OUTROS",
              rotulo: "Folha de pagamento de férias",
              arquivoBase64: entrada.folhaBase64
            }
          ]
        : [];
    if (
      !docsEntrada.some((d) => d.tipo === "AVISO") ||
      !docsEntrada.some((d) => d.tipo === "RECIBO")
    ) {
      throw new BadRequestException(
        "Anexe o Aviso de Férias e o Recibo de Férias (obrigatórios); “Outros” é opcional."
      );
    }
    const ROTULO: Record<string, string> = {
      AVISO: "Aviso de Férias",
      RECIBO: "Recibo de Férias"
    };
    const documentos: Array<{ tipo: string; rotulo: string; nome: string | null; url: string }> =
      [];
    for (const [i, d] of docsEntrada.entries()) {
      const tipo = ["AVISO", "RECIBO", "OUTROS"].includes(d.tipo) ? d.tipo : "OUTROS";
      const rotulo = (ROTULO[tipo] ?? (d.rotulo ?? "").trim()) || "Outro documento";
      const url = await this.documentoService.salvarDocumentoFerias({
        solicitacaoId: id,
        ordem: i + 1,
        tipo,
        arquivoBase64: d.arquivoBase64,
        mimeType: d.mimeType
      });
      documentos.push({ tipo, rotulo, nome: d.nomeArquivo?.trim() || null, url });
    }

    const rhUser = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    const obsFinal = observacao || "Documentos de férias enviados para assinatura.";

    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        /* O 1º documento fica no campo antigo (links e retorno assinado continuam valendo). */
        guiaMedicoUrl: documentos[0].url,
        guiaMedicoEnviadaEm: new Date(),
        guiaMedicoObservacao: obsFinal,
        status: "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
        rhUserId: rhUser?.id,
        /* Reenvio: a assinatura anterior não vale para os documentos novos. */
        documentoRetornoUrl: null,
        documentoRetornoEm: null,
        metadados: {
          ...semAssinaturaFerias((solicitacao.metadados ?? {}) as Record<string, unknown>),
          documentosFerias: documentos
        } as Prisma.InputJsonValue
      }
    });

    const lista = documentos.map((d) => d.rotulo).join(", ");
    this.notificarDocumentoRhEnviado(
      atualizada.funcionarioId,
      `documentação de férias (${lista})`,
      obsFinal
    ).catch((e) => this.logger.error(`Falha ao notificar RH_DOCUMENTO_ENVIADO: ${e}`));
    this.notificacaoService
      .getFuncionarioDestinatario(atualizada.funcionarioId)
      .then((dest) =>
        dest
          ? this.notificacaoService.dispararEvento(
              "DOCUMENTO_RETORNO_PENDENTE",
              "Assine os documentos das suas férias",
              `O RH enviou ${lista} para a sua assinatura.\n\n` +
                "Assine pelo sistema em Solicitações → Férias ou em Minhas Requisições do RH. " +
                "A aprovação das férias depende da sua assinatura.",
              [dest]
            )
          : undefined
      )
      .catch((e) => this.logger.error(`Falha ao notificar DOCUMENTO_RETORNO_PENDENTE: ${e}`));

    return atualizada;
  }

  /* ─── Férias divididas: Aviso e Recibo do 2º e 3º período ─── */

  /** Férias aprovadas com período futuro (2º/3º) que ainda não teve a rodada concluída. */
  async listarRodadasFeriasPendentes() {
    const hoje = hojeBrasiliaISO();
    const cfg = await this.configSolicitacoesService.getConfig();
    const sols = await this.prisma.solicitacao.findMany({
      where: {
        tipo: "FERIAS",
        status: "APROVADA",
        dataFim: { gte: new Date(`${hoje}T00:00:00-03:00`) }
      },
      select: {
        id: true,
        funcionarioId: true,
        metadados: true,
        funcionario: { select: { matricula: true, user: { select: { name: true } } } }
      },
      orderBy: { createdAt: "asc" }
    });
    const linhas: Array<{
      solicitacaoId: string;
      funcionarioId: string;
      funcionarioNome: string;
      matricula: string | null;
      ordem: number;
      inicio: string;
      fim: string;
      diasParaInicio: number;
      noPrazo: boolean;
      situacao: string;
      documentos: Array<{ tipo: string; rotulo?: string; url: string; urlAssinado?: string }>;
    }> = [];
    for (const s of sols) {
      const meta = (s.metadados ?? {}) as Record<string, unknown>;
      const rodadas = rodadasDe(meta);
      for (const p of periodosComRodada(meta, hoje)) {
        const r = rodadas[String(p.ordem)];
        if (r?.situacao === "CONCLUIDA") continue;
        const diasParaInicio = diasCorridos(hoje, p.inicio) - 1;
        linhas.push({
          solicitacaoId: s.id,
          funcionarioId: s.funcionarioId,
          funcionarioNome: s.funcionario?.user?.name ?? "Funcionário",
          matricula: s.funcionario?.matricula ?? null,
          ordem: p.ordem,
          inicio: p.inicio,
          fim: p.fim,
          diasParaInicio,
          noPrazo: diasParaInicio <= cfg.feriasRodadaAvisoDias,
          situacao: r?.situacao ?? "PENDENTE_RH",
          documentos: (r?.documentos ?? []).map((d) => ({
            tipo: d.tipo,
            rotulo: d.rotulo,
            url: d.url,
            urlAssinado: d.urlAssinado
          }))
        });
      }
    }
    return linhas.sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  }

  /** RH anexa o Aviso e o Recibo do 2º/3º período e o funcionário é avisado para assinar. */
  async rhEnviarRodadaFerias(
    id: string,
    ordem: number,
    entrada: { documentos?: DocumentoFeriasEntrada[] },
    observacao: string,
    keycloakSub: string
  ) {
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });
    await this.assertNaoEhProprioPorSub(
      solicitacao.funcionarioId,
      keycloakSub,
      "Você não pode dar andamento à sua própria solicitação. Outro membro do RH deve tratá-la."
    );
    if (solicitacao.tipo !== "FERIAS" || solicitacao.status !== "APROVADA") {
      throw new BadRequestException("Só férias aprovadas têm rodadas de Aviso e Recibo.");
    }
    const meta = (solicitacao.metadados ?? {}) as Record<string, unknown>;
    const periodo = periodosComRodada(meta, hojeBrasiliaISO()).find((p) => p.ordem === ordem);
    if (!periodo) {
      throw new BadRequestException(
        "Este período não existe, é o 1º (já tem seus documentos) ou já começou."
      );
    }
    const atual = rodadasDe(meta)[String(ordem)];
    if (atual?.situacao === "CONCLUIDA") {
      throw new BadRequestException("Os documentos deste período já foram assinados.");
    }
    const docsEntrada = (Array.isArray(entrada.documentos) ? entrada.documentos : []).filter(
      (d) => typeof d?.arquivoBase64 === "string" && d.arquivoBase64
    );
    if (
      !docsEntrada.some((d) => d.tipo === "AVISO") ||
      !docsEntrada.some((d) => d.tipo === "RECIBO")
    ) {
      throw new BadRequestException(
        "Anexe o Aviso de Férias e o Recibo de Férias (obrigatórios); “Outros” é opcional."
      );
    }
    const ROTULO: Record<string, string> = { AVISO: "Aviso de Férias", RECIBO: "Recibo de Férias" };
    const documentos: DocumentoRodadaFerias[] = [];
    for (const [i, d] of docsEntrada.entries()) {
      const tipo = ["AVISO", "RECIBO", "OUTROS"].includes(d.tipo) ? d.tipo : "OUTROS";
      const rotulo = (ROTULO[tipo] ?? (d.rotulo ?? "").trim()) || "Outro documento";
      const url = await this.documentoService.salvarDocumentoFerias({
        solicitacaoId: id,
        ordem: ordemArquivoRodada(ordem, i),
        tipo,
        arquivoBase64: d.arquivoBase64,
        mimeType: d.mimeType
      });
      documentos.push({ tipo, rotulo, nome: d.nomeArquivo?.trim() || null, url });
    }
    const obsFinal = observacao || "Documentos do período de férias enviados para assinatura.";
    const rodada: RodadaFeriasMeta = {
      ordem,
      inicio: periodo.inicio,
      fim: periodo.fim,
      avisoRhEm: atual?.avisoRhEm,
      situacao: "AGUARDANDO_ASSINATURA",
      documentos,
      observacao: obsFinal,
      enviadaEm: new Date().toISOString()
    };
    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        metadados: {
          ...meta,
          rodadasFerias: { ...rodadasDe(meta), [String(ordem)]: rodada }
        } as unknown as Prisma.InputJsonValue
      }
    });

    const lista = documentos.map((d) => d.rotulo).join(", ");
    this.notificacaoService
      .getFuncionarioDestinatario(atualizada.funcionarioId)
      .then((dest) =>
        dest
          ? this.notificacaoService.dispararEvento(
              "FERIAS_RODADA_ASSINAR",
              `Assine os documentos do ${ordem}º período das suas férias`,
              `O RH enviou ${lista} do ${ordem}º período de férias ` +
                `(${fmtDataBr(periodo.inicio)} a ${fmtDataBr(periodo.fim)}) para a sua assinatura.\n\n` +
                "Assine pelo sistema em Solicitações → Férias ou em Minhas Requisições do RH.",
              [dest]
            )
          : undefined
      )
      .catch((e) => this.logger.error(`Falha ao notificar FERIAS_RODADA_ASSINAR: ${e}`));
    return atualizada;
  }

  /** Todo dia: avisa o RH dos períodos futuros que já entraram na janela do Aviso/Recibo. */
  @Cron("40 7 * * *", { timeZone: "America/Sao_Paulo" })
  async avisarRodadasFeriasPendentes() {
    try {
      const pend = (await this.listarRodadasFeriasPendentes()).filter(
        (r) => r.noPrazo && r.situacao === "PENDENTE_RH"
      );
      if (!pend.length) return;
      const rh = await this.notificacaoService.getUsuariosRh();
      for (const r of pend) {
        const sol = await this.prisma.solicitacao.findUnique({
          where: { id: r.solicitacaoId },
          select: { metadados: true }
        });
        const meta = (sol?.metadados ?? {}) as Record<string, unknown>;
        const atual = rodadasDe(meta)[String(r.ordem)];
        if (atual?.avisoRhEm) continue;
        if (rh.length) {
          await this.notificacaoService.dispararEvento(
            "FERIAS_RODADA_PENDENTE_RH",
            `Aviso e Recibo pendentes — ${r.funcionarioNome}`,
            `O ${r.ordem}º período de férias de ${r.funcionarioNome} começa em ` +
              `${fmtDataBr(r.inicio)} (${r.diasParaInicio} dia(s)). Envie o Aviso e o Recibo ` +
              "em Aprovações → Rodadas de férias.",
            rh
          );
        }
        await this.prisma.solicitacao.update({
          where: { id: r.solicitacaoId },
          data: {
            metadados: {
              ...meta,
              rodadasFerias: {
                ...rodadasDe(meta),
                [String(r.ordem)]: {
                  ...(atual ?? { ordem: r.ordem, inicio: r.inicio, fim: r.fim }),
                  avisoRhEm: new Date().toISOString()
                }
              }
            } as unknown as Prisma.InputJsonValue
          }
        });
      }
    } catch (e) {
      this.logger.error(`Falha ao avisar rodadas de férias pendentes: ${(e as Error).message}`);
    }
  }

  async getSaldoFeriasFuncionario(funcionarioId: string) {
    return this.pontoService.calcularSaldoFeriasFuncionario(funcionarioId);
  }

  /* ─── Correção de ponto criada pelo RH → aguarda aprovação do PONTO_ADMIN ─── */

  async criarCorrecaoRH(
    keycloakSub: string,
    funcionarioId: string,
    body: {
      dataReferencia: string;
      justificativa: string;
      correcoes: Array<{
        acao: "CORRIGIR" | "INCLUIR" | "EXCLUIR";
        tipoRegistro: string;
        horario: string;
        registroId?: string;
        horarioOriginal?: string;
      }>;
    }
  ) {
    /* A correção do RH pula a aprovação do chefe: não vale para o próprio ponto. */
    await this.assertNaoEhProprioPorSub(
      funcionarioId,
      keycloakSub,
      "Você não pode lançar correção no seu próprio ponto. Solicite a correção pelo fluxo normal (chefe e, depois, outro membro do RH)."
    );

    const dataRef = new Date(body.dataReferencia);
    const mes = dataRef.getUTCMonth() + 1;
    const ano = dataRef.getUTCFullYear();

    const periodo = await this.prisma.periodoPonto.findUnique({
      where: { funcionarioId_mes_ano: { funcionarioId, mes, ano } },
      include: { assinatura: { select: { status: true } } }
    });

    if (periodo?.assinatura?.status === "CONCLUIDA") {
      throw new BadRequestException(
        "O período de " +
          new Date(ano, mes - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) +
          " já foi assinado pelo funcionário e pelo chefe. Correções não são permitidas."
      );
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });

    const funcCat = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { categoria: true, isManager: true, isFiscal: true, registroPontoObrigatorio: true }
    });
    const apenasInformativo = funcionarioSemRegistroPonto(funcCat ?? {});

    const dataRefIso = dataCivilISO(new Date(body.dataReferencia));
    if (dataRefIso >= hojeBrasiliaISO()) {
      throw new BadRequestException(
        "Correção de ponto só pode ser solicitada para dias anteriores. O dia de hoje e datas futuras não são permitidos."
      );
    }
    const { inicio, fim } = intervaloDiaBrasilia(dataRefIso);
    const registrosDoDia = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lt: fim } },
      select: { tipo: true, dataHora: true },
      orderBy: { dataHora: "asc" }
    });
    const erroPausa = validarItensCorrecaoPontoPausa({
      correcoes: body.correcoes as ItemCorrecaoPonto[],
      dataRefIso,
      hojeIso: hojeBrasiliaISO(),
      registrosDoDia
    });
    if (erroPausa) throw new BadRequestException(erroPausa);

    return this.prisma.solicitacao.create({
      data: {
        funcionarioId,
        tipo: "CORRECAO_PONTO",
        dataReferencia: new Date(body.dataReferencia),
        descricao: body.justificativa,
        status: "AGUARDANDO_GESTOR_RH",
        apenasInformativo,
        metadados: {
          criadoPeloRH: true,
          criadoPorNome: user?.name ?? keycloakSub,
          correcoesDia: body.correcoes
        }
      }
    });
  }

  async adminAprovarCorrecaoRH(
    id: string,
    decisao: "APROVAR" | "REJEITAR",
    observacao: string,
    keycloakSub: string
  ) {
    const sol = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });

    if (sol.status !== "AGUARDANDO_GESTOR_RH") {
      throw new BadRequestException(
        "Esta solicitação não está aguardando aprovação do Gerente de RH."
      );
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    await this.assertNaoEhAutoaprovacao(sol.funcionarioId, user?.id);

    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const meta = (sol.metadados ?? {}) as Record<string, unknown>;
    const criadoPorNome = (meta.criadoPorNome as string) ?? "RH";
    const marker = `Modificado pelo RH (${criadoPorNome}) em ${dataFormatada} — aprovado pelo Gerente de RH`;

    if (decisao === "REJEITAR") {
      return this.prisma.solicitacao.update({
        where: { id },
        data: {
          status: "REJEITADA_RH",
          rhObservacao: observacao || "Correção rejeitada pelo Gerente de RH.",
          rhResolvidoEm: agora,
          rhUserId: user?.id
        }
      });
    }

    const correcoes = (meta.correcoesDia ?? []) as Array<{
      acao: string;
      tipoRegistro: string;
      horario: string;
      registroId?: string;
      horarioOriginal?: string;
    }>;

    const apenasInformativo = !!sol.apenasInformativo;

    for (const c of correcoes) {
      if (c.acao === "CORRIGIR" && c.registroId) {
        const atual = await this.prisma.registroPonto.findUnique({
          where: { id: c.registroId }
        });
        if (atual) {
          const novaDataHora = aplicarHorarioBrasilia(atual.dataHora, c.horario);
          const novaObs = criarObservacaoAjuste({
            tipoRegistro: c.tipoRegistro,
            horarioAnterior: c.horarioOriginal ?? horarioDeDataBrasilia(atual.dataHora),
            horarioNovo: c.horario,
            solicitacaoId: id,
            acao: "CORRIGIR",
            autorRH: criadoPorNome
          });
          const observacoes = appendObservacao(atual.observacoes, novaObs);
          await this.prisma.registroPonto.update({
            where: { id: atual.id },
            data: {
              dataHora: novaDataHora,
              ajustado: true,
              ajustadoPor: keycloakSub,
              observacao: marker,
              observacoes: observacoes as unknown as Prisma.InputJsonValue,
              ...(apenasInformativo ? { apenasInformativo: true } : {})
            }
          });
        }
      } else if (c.acao === "INCLUIR") {
        const dataHora = aplicarHorarioBrasilia(sol.dataReferencia, c.horario);
        const novaObs = criarObservacaoAjuste({
          tipoRegistro: c.tipoRegistro,
          horarioNovo: c.horario,
          solicitacaoId: id,
          acao: "INCLUIR",
          autorRH: criadoPorNome
        });
        await this.prisma.registroPonto.create({
          data: {
            funcionarioId: sol.funcionarioId,
            tipo: c.tipoRegistro as import("@prisma/client").TipoPonto,
            dataHora,
            origem: "WEB",
            modoRegistro: "DESKTOP",
            ajustado: true,
            ajustadoPor: keycloakSub,
            observacao: marker,
            observacoes: [novaObs] as unknown as Prisma.InputJsonValue,
            apenasInformativo
          }
        });
      } else if (c.acao === "EXCLUIR" && c.registroId) {
        await this.prisma.registroPonto.delete({ where: { id: c.registroId } }).catch(() => null);
      }
    }

    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        status: "APROVADA",
        rhObservacao: observacao || marker,
        rhResolvidoEm: agora,
        rhUserId: user?.id,
        resolvidoEm: agora,
        resolvidoPor: keycloakSub
      }
    });
  }

  private async obterLimitesHorarioPonto() {
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { pontoHorarioMinimo: true, pontoHorarioMaximo: true }
    });
    return {
      min: cfg?.pontoHorarioMinimo ?? "06:00",
      max: cfg?.pontoHorarioMaximo ?? "23:59"
    };
  }

  private async aplicarMudancaSolicitacao(
    solicitacao: {
      id: string;
      tipo: string;
      funcionarioId: string;
      dataReferencia: Date;
      dataInicio: Date | null;
      dataFim: Date | null;
      descricao: string;
      metadados: unknown;
      apenasInformativo?: boolean;
    },
    rhKeycloakSub: string
  ) {
    const tipo = solicitacao.tipo;
    const funcId = solicitacao.funcionarioId;
    const meta = (solicitacao.metadados ?? {}) as Record<string, unknown>;
    const ref = solicitacao.dataInicio ?? solicitacao.dataReferencia;
    const fim = solicitacao.dataFim ?? ref;
    const obs = `Aprovado via solicitação #${solicitacao.id}`;

    let apenasInformativo = !!solicitacao.apenasInformativo;
    if (!apenasInformativo) {
      const funcCat = await this.prisma.funcionario.findUnique({
        where: { id: funcId },
        select: { categoria: true, isManager: true, isFiscal: true, registroPontoObrigatorio: true }
      });
      apenasInformativo = funcionarioSemRegistroPonto(funcCat ?? {});
    }
    /* Abono com tempo liberado pelo RH tem efeito mesmo para quem não registra ponto. */
    if (
      tipo === "ABONO" &&
      (creditoBancoDaSolicitacao(solicitacao.metadados) ||
        (meta.cotaAbono && typeof meta.cotaAbono === "object"))
    ) {
      apenasInformativo = false;
    }
    const obsInformativo = apenasInformativo
      ? `${obs} — ${MSG_SOLICITACAO_APENAS_INFORMATIVA}`
      : obs;

    if (tipo === "CORRECAO_PONTO") {
      const limites = await this.obterLimitesHorarioPonto();

      // Suporte ao novo formato com múltiplas correções de uma só vez (correcoesDia)
      const correcoesDia = Array.isArray(meta.correcoesDia)
        ? (meta.correcoesDia as Array<{
            acao: string;
            tipoRegistro: string;
            horario: string;
            registroId?: string;
            horarioOriginal?: string;
          }>)
        : null;

      /* Entrada que desrespeita o descanso de interjornada, aprovada pelo chefe e pelo RH:
         o aviso registrado no pedido vira nota na observação do registro. */
      const notaInterjornada = textoNotaInterjornada(meta.avisoInterjornada);

      if (correcoesDia) {
        for (const c of correcoesDia) {
          if (!c.horario && c.acao !== "EXCLUIR") continue;
          if (c.horario) {
            const v = validarHorarioPermitido(c.horario, limites.min, limites.max);
            if (!v.ok) throw new BadRequestException(v.message);
          }
          if (c.acao === "CORRIGIR" && c.registroId) {
            const atual = await this.prisma.registroPonto.findUnique({
              where: { id: c.registroId }
            });
            if (atual) {
              const novaDataHora = aplicarHorarioBrasilia(atual.dataHora, c.horario);
              const novaObs = criarObservacaoAjuste({
                tipoRegistro: c.tipoRegistro,
                horarioAnterior: c.horarioOriginal ?? horarioDeDataBrasilia(atual.dataHora),
                horarioNovo: c.horario,
                solicitacaoId: solicitacao.id,
                acao: "CORRIGIR",
                textoExtra: c.tipoRegistro === "ENTRADA" ? notaInterjornada : undefined
              });
              const observacoes = appendObservacao(atual.observacoes, novaObs);
              await this.prisma.registroPonto.update({
                where: { id: atual.id },
                data: {
                  dataHora: novaDataHora,
                  ajustado: true,
                  ajustadoPor: rhKeycloakSub,
                  observacao: obsInformativo,
                  observacoes: observacoes as unknown as Prisma.InputJsonValue,
                  ...(apenasInformativo ? { apenasInformativo: true } : {})
                }
              });
            }
          } else if (c.acao === "INCLUIR") {
            const dataHora = aplicarHorarioBrasilia(solicitacao.dataReferencia, c.horario);
            const novaObs = criarObservacaoAjuste({
              tipoRegistro: c.tipoRegistro,
              horarioNovo: c.horario,
              solicitacaoId: solicitacao.id,
              acao: "INCLUIR",
              textoExtra: c.tipoRegistro === "ENTRADA" ? notaInterjornada : undefined
            });
            await this.prisma.registroPonto.create({
              data: {
                funcionarioId: funcId,
                tipo: c.tipoRegistro as import("@prisma/client").TipoPonto,
                dataHora,
                origem: "WEB",
                modoRegistro: "DESKTOP",
                ajustado: true,
                ajustadoPor: rhKeycloakSub,
                observacao: obsInformativo,
                observacoes: [novaObs] as unknown as Prisma.InputJsonValue,
                apenasInformativo
              }
            });
          } else if (c.acao === "EXCLUIR" && c.registroId) {
            await this.prisma.registroPonto
              .delete({ where: { id: c.registroId } })
              .catch(() => null);
          }
        }
        return; // correcoesDia aplicado — encerra aqui
      }

      // Formato legado: ação única
      const acao = meta.acao as string;
      const horario = meta.horarioSolicitado as string;
      const tipoRegistro = (meta.tipoRegistro as string) ?? "ENTRADA";
      const validacao = validarHorarioPermitido(horario, limites.min, limites.max);
      if (!validacao.ok) {
        throw new BadRequestException(validacao.message);
      }

      if (acao === "CORRIGIR" && meta.registroId) {
        const registroAtual = await this.prisma.registroPonto.findUnique({
          where: { id: meta.registroId as string }
        });
        if (registroAtual) {
          const horarioAnterior =
            (meta.horarioOriginal as string | undefined) ??
            horarioDeDataBrasilia(registroAtual.dataHora);
          const novaDataHora = aplicarHorarioBrasilia(registroAtual.dataHora, horario);
          const novaObs = criarObservacaoAjuste({
            tipoRegistro,
            horarioAnterior,
            horarioNovo: horario,
            solicitacaoId: solicitacao.id,
            acao: "CORRIGIR",
            textoExtra:
              tipoRegistro === "ENTRADA" ? textoNotaInterjornada(meta.avisoInterjornada) : undefined
          });
          const observacoes = appendObservacao(registroAtual.observacoes, novaObs);
          await this.prisma.registroPonto.update({
            where: { id: registroAtual.id },
            data: {
              dataHora: novaDataHora,
              ajustado: true,
              ajustadoPor: rhKeycloakSub,
              observacao: obsInformativo,
              observacoes: observacoes as unknown as Prisma.InputJsonValue,
              ...(apenasInformativo ? { apenasInformativo: true } : {})
            }
          });
        }
      } else if (acao === "INCLUIR") {
        const dataHora = aplicarHorarioBrasilia(solicitacao.dataReferencia, horario);
        const novaObs = criarObservacaoAjuste({
          tipoRegistro,
          horarioNovo: horario,
          solicitacaoId: solicitacao.id,
          acao: "INCLUIR",
          textoExtra:
            tipoRegistro === "ENTRADA" ? textoNotaInterjornada(meta.avisoInterjornada) : undefined
        });
        await this.prisma.registroPonto.create({
          data: {
            funcionarioId: funcId,
            tipo: tipoRegistro as import("@prisma/client").TipoPonto,
            dataHora,
            origem: "WEB",
            modoRegistro: "DESKTOP",
            ajustado: true,
            ajustadoPor: rhKeycloakSub,
            observacao: obsInformativo,
            observacoes: [novaObs] as unknown as Prisma.InputJsonValue,
            apenasInformativo
          }
        });
      }
    } else if (tipo === "FERIAS") {
      const periodos = Array.isArray(meta.periodos)
        ? (meta.periodos as Array<{ dataInicio: string; dataFim: string }>)
        : null;
      if (periodos && periodos.length > 0) {
        // Cria um afastamento por período
        for (const p of periodos) {
          /* Dia civil de Brasília do período (aceita o formato legado, data civil em UTC,
             que lido como instante deslocaria o início para o dia anterior). */
          const iniCivil = dataCivilPeriodo(String(p.dataInicio));
          const fimCivil = dataCivilPeriodo(String(p.dataFim));
          await this.prisma.afastamento.create({
            data: {
              funcionarioId: funcId,
              solicitacaoId: solicitacao.id,
              tipo: "FERIAS",
              dataInicio: intervaloDiaBrasilia(iniCivil).inicio,
              dataFim: fimDiaCivilBrasilia(fimCivil),
              justificativa: solicitacao.descricao || obsInformativo,
              aprovadoPor: rhKeycloakSub,
              apenasInformativo
            }
          });
        }
      } else {
        await this.prisma.afastamento.create({
          data: {
            funcionarioId: funcId,
            solicitacaoId: solicitacao.id,
            tipo: "FERIAS",
            dataInicio: ref,
            dataFim: fim,
            justificativa: solicitacao.descricao || obsInformativo,
            aprovadoPor: rhKeycloakSub,
            apenasInformativo
          }
        });
      }
    } else if (tipo === "ATESTADO") {
      const horarioInicio =
        typeof meta.horarioInicio === "string" && meta.horarioInicio.trim()
          ? meta.horarioInicio.trim()
          : null;
      const horarioFim =
        typeof meta.horarioFim === "string" && meta.horarioFim.trim()
          ? meta.horarioFim.trim()
          : null;
      await this.prisma.afastamento.create({
        data: {
          funcionarioId: funcId,
          solicitacaoId: solicitacao.id,
          tipo: "ATESTADO",
          dataInicio: ref,
          dataFim: fim,
          horarioInicio,
          horarioFim,
          justificativa: solicitacao.descricao || obsInformativo,
          documentoUrl: typeof meta.documentoUrl === "string" ? meta.documentoUrl : null,
          aprovadoPor: rhKeycloakSub,
          apenasInformativo
        }
      });
    } else if (tipo === "LICENCA" && (meta.tipoLicenca as { nome?: string } | undefined)?.nome) {
      /* Licença com tipo configurável: um afastamento por período, com o nome do tipo. */
      const tl = meta.tipoLicenca as { nome: string; codigoSistema?: string | null };
      const tipoAfast =
        tl.codigoSistema === "MATERNIDADE"
          ? "LICENCA_MATERNIDADE"
          : tl.codigoSistema === "PATERNIDADE"
            ? "LICENCA_PATERNIDADE"
            : "LICENCA_MEDICA";
      const documentoUrl = typeof meta.documentoUrl === "string" ? meta.documentoUrl : null;
      for (const p of periodosDoAbono(solicitacao)) {
        await this.prisma.afastamento.create({
          data: {
            funcionarioId: funcId,
            solicitacaoId: solicitacao.id,
            tipo: tipoAfast,
            rotulo: tl.nome,
            dataInicio: intervaloDiaBrasilia(p.inicio).inicio,
            dataFim: fimDiaCivilBrasilia(p.fim),
            horarioInicio: p.horarioInicio,
            horarioFim: p.horarioFim,
            justificativa: solicitacao.descricao || obsInformativo,
            documentoUrl,
            aprovadoPor: rhKeycloakSub,
            apenasInformativo
          }
        });
      }
    } else if (tipo === "LICENCA") {
      await this.prisma.afastamento.create({
        data: {
          funcionarioId: funcId,
          solicitacaoId: solicitacao.id,
          tipo: "LICENCA_MEDICA",
          dataInicio: ref,
          dataFim: fim,
          justificativa: solicitacao.descricao || obsInformativo,
          aprovadoPor: rhKeycloakSub,
          apenasInformativo
        }
      });
    } else if (tipo === "ABONO") {
      const documentoUrl = typeof meta.documentoUrl === "string" ? meta.documentoUrl : null;
      if (Array.isArray(meta.periodos) && meta.periodos.length) {
        /* Vários períodos: um afastamento por período (dia inteiro ou parcial de 1 dia). */
        for (const p of periodosDoAbono(solicitacao)) {
          await this.prisma.afastamento.create({
            data: {
              funcionarioId: funcId,
              solicitacaoId: solicitacao.id,
              tipo: "ABONO",
              dataInicio: intervaloDiaBrasilia(p.inicio).inicio,
              dataFim: fimDiaCivilBrasilia(p.fim),
              horarioInicio: p.horarioInicio,
              horarioFim: p.horarioFim,
              justificativa: solicitacao.descricao || obsInformativo,
              documentoUrl,
              aprovadoPor: rhKeycloakSub,
              apenasInformativo
            }
          });
        }
      } else {
        const horarioInicio =
          typeof meta.horarioInicio === "string" && meta.horarioInicio.trim()
            ? meta.horarioInicio.trim()
            : null;
        const horarioFim =
          typeof meta.horarioFim === "string" && meta.horarioFim.trim()
            ? meta.horarioFim.trim()
            : null;
        await this.prisma.afastamento.create({
          data: {
            funcionarioId: funcId,
            solicitacaoId: solicitacao.id,
            tipo: "ABONO",
            dataInicio: ref,
            dataFim: fim,
            horarioInicio,
            horarioFim,
            justificativa: solicitacao.descricao || obsInformativo,
            documentoUrl,
            aprovadoPor: rhKeycloakSub,
            apenasInformativo
          }
        });
      }
    }
    /* HORA_EXTRA / ENVIO_DOCUMENTO_RH: aprovação registrada no status; sem efeito adicional no banco */

    if (["FERIAS", "ATESTADO", "LICENCA", "ABONO"].includes(tipo)) {
      this.notificarAfastamentoRegistrado(funcId, tipo, ref, fim).catch((e) =>
        this.logger.error(`Falha ao notificar AFASTAMENTO_REGISTRADO: ${e}`)
      );
    }
  }

  /* ─── Afastamentos ─── */

  async getAfastamentos(filtros: {
    funcionarioId?: string;
    gerenciaId?: string;
    tipo?: string;
    dataInicio?: string;
    dataFim?: string;
    ativo?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filtros.funcionarioId) where.funcionarioId = filtros.funcionarioId;
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.gerenciaId) {
      where.funcionario = { gerenciaId: filtros.gerenciaId };
    }
    if (filtros.ativo) {
      const hoje = new Date();
      where.dataInicio = { lte: this.endOfDay(hoje) };
      where.dataFim = { gte: this.startOfDay(hoje) };
    } else if (filtros.dataInicio || filtros.dataFim) {
      where.dataInicio = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim + "T23:59:59") } : {})
      };
    }

    const [total, afastamentosRaw] = await Promise.all([
      this.prisma.afastamento.count({ where }),
      this.prisma.afastamento.findMany({
        where,
        orderBy: { dataInicio: "desc" },
        skip,
        take: limit,
        include: {
          funcionario: {
            select: {
              id: true,
              matricula: true,
              cargo: true,
              fotoPerfilUrl: true,
              user: { select: { name: true, email: true } },
              gerencia: { select: { nome: true, sigla: true } }
            }
          }
        }
      })
    ]);

    let afastamentos = afastamentosRaw;
    if (filtros.funcionarioId) {
      const sols = await this.prisma.solicitacao.findMany({
        where: {
          funcionarioId: filtros.funcionarioId,
          tipo: { in: ["ATESTADO", "ABONO"] },
          status: "APROVADA"
        },
        select: { dataInicio: true, dataFim: true, dataReferencia: true, metadados: true }
      });
      afastamentos = enriquecerAfastamentosComSolicitacoes(afastamentosRaw, sols);
      for (let i = 0; i < afastamentos.length; i++) {
        const a = afastamentos[i];
        const raw = afastamentosRaw[i];
        if (
          (a.tipo === "ATESTADO" || a.tipo === "ABONO") &&
          a.horarioInicio &&
          a.horarioFim &&
          (!raw.horarioInicio || !raw.horarioFim)
        ) {
          await this.prisma.afastamento
            .update({
              where: { id: a.id },
              data: { horarioInicio: a.horarioInicio, horarioFim: a.horarioFim }
            })
            .catch(() => {});
        }
      }
    }

    return { total, page, limit, afastamentos };
  }

  /* ─── Períodos ─── */

  async getPeriodos(filtros: {
    mes?: number;
    ano?: number;
    gerenciaId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filtros.mes) where.mes = filtros.mes;
    if (filtros.ano) where.ano = filtros.ano;
    if (filtros.status) where.status = filtros.status;
    if (filtros.gerenciaId) {
      where.funcionario = { gerenciaId: filtros.gerenciaId };
    }

    const [total, periodos] = await Promise.all([
      this.prisma.periodoPonto.count({ where }),
      this.prisma.periodoPonto.findMany({
        where,
        orderBy: [{ ano: "desc" }, { mes: "desc" }],
        skip,
        take: limit,
        include: {
          funcionario: {
            select: {
              id: true,
              matricula: true,
              cargo: true,
              jornadaHorasDia: true,
              fotoPerfilUrl: true,
              user: { select: { name: true, email: true } },
              gerencia: { select: { nome: true, sigla: true } }
            }
          }
        }
      })
    ]);

    return {
      total,
      page,
      limit,
      periodos: periodos.map((p) => ({
        ...p,
        horasTrabalhadasFormatado: this.formatMinutes(p.horasTrabalhadasMinutos as number),
        horasExtrasFormatado: this.formatMinutes(p.horasExtrasMinutos as number),
        horasFaltaFormatado: this.formatMinutes(p.horasFaltaMinutos as number)
      }))
    };
  }

  async atualizarStatusPeriodo(id: string, status: "FECHADO" | "APROVADO", aprovadoPor: string) {
    const atual = await this.prisma.periodoPonto.findUniqueOrThrow({
      where: { id },
      select: { funcionarioId: true }
    });
    await this.assertNaoEhProprioPorSub(
      atual.funcionarioId,
      aprovadoPor,
      "Você não pode fechar ou aprovar o seu próprio período de ponto."
    );
    const periodo = await this.prisma.periodoPonto.update({
      where: { id },
      data: {
        status,
        ...(status === "FECHADO" ? { fechadoEm: new Date() } : {}),
        ...(status === "APROVADO" ? { aprovadoPor } : {})
      },
      include: {
        funcionario: { include: { user: { select: { name: true } } } }
      }
    });

    if (status === "FECHADO") {
      const mesNome = new Date(periodo.ano, periodo.mes - 1).toLocaleString("pt-BR", {
        month: "long"
      });
      this.notificarPeriodoFechado(periodo.funcionarioId, mesNome, periodo.ano).catch((e) =>
        this.logger.error(`Falha ao notificar PERIODO_FECHADO: ${e}`)
      );
    }

    return periodo;
  }

  /* ─── Banco de Horas ─── */

  /** Ciclo atual do banco de horas: começa na última data marco já atingida
   *  (o dia da virada entra no ciclo novo) ou desde sempre, se nenhum marco passou. */
  private async getCicloBancoHoras(funcionarioId?: string) {
    const marcos = await this.prisma.bancoHorasMarco.findMany();
    const hojeIso = hojeBrasiliaISO();
    const tolerancia = funcionarioId
      ? await toleranciaFechamentoDias(this.prisma, funcionarioId)
      : 0;
    const { cicloInicio, proximaZeragem } = resolverCicloBancoHoras(marcos, hojeIso, tolerancia);
    return { cicloInicio, proximaZeragem, hojeIso };
  }

  /** Soma minutos trabalhados — mesma regra do Histórico (HH:MM Brasília + almoço mínimo).
   *  Trecho em aberto só conta se `capMs` for informado (dia corrente). */
  private calcHorasMinutos(
    registros: { tipo: string; dataHora: Date; observacoes?: unknown }[],
    capMs?: number,
    opts?: {
      exigirIntervalo?: boolean;
      almocoMinMin?: number;
      almocoPodeIniciarA?: string;
      almocoPodeIniciarAte?: string;
      horaEntrada?: string;
      horaSaida?: string;
      toleranciaEntradaMin?: number;
      toleranciaSaidaMin?: number;
    }
  ): number {
    const entrada = registros.find((r) => r.tipo === "ENTRADA");
    return calcHorasTrabalhadasMinutos(
      registros.map((r) => ({
        tipo: r.tipo,
        minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora))
      })),
      {
        agoraMin:
          capMs !== undefined
            ? horarioParaMinutos(horarioDeDataBrasilia(new Date(capMs)))
            : undefined,
        exigirIntervalo:
          opts?.exigirIntervalo ?? !observacaoForcaSemIntervalo(entrada?.observacoes),
        almocoMinMin: opts?.almocoMinMin ?? 60,
        almocoPodeIniciarA: opts?.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: opts?.almocoPodeIniciarAte ?? "13:00",
        horaEntrada: opts?.horaEntrada,
        horaSaida: opts?.horaSaida,
        toleranciaEntradaMin: opts?.toleranciaEntradaMin,
        toleranciaSaidaMin: opts?.toleranciaSaidaMin
      }
    );
  }

  /**
   * Banco de horas do ciclo atual. Usa a MESMA conta da página Banco de Horas do funcionário
   * (PontoService) — antes havia uma cópia própria que divergia (isenção, primeiro acesso,
   * atestados), gerando saldos diferentes na Auditoria, na folha e na assinatura.
   */
  private async calcularBancoHoras(
    funcionarioId: string,
    _cicloInicio: string | null,
    _hojeIso: string
  ): Promise<{
    saldoAtualMinutos: number;
    dias: Awaited<ReturnType<PontoService["calcularBancoHorasAdmin"]>>["dias"];
  }> {
    void _cicloInicio;
    void _hojeIso;
    const r = await this.pontoService.calcularBancoHorasAdmin(funcionarioId);
    return { saldoAtualMinutos: r.saldoAtualMinutos, dias: r.dias };
  }

  /** Banco de horas de um intervalo (folha mensal), mesma conta da página do funcionário. */
  bancoHorasDoIntervalo(funcionarioId: string, inicioIso: string, fimIso: string) {
    return this.pontoService.bancoHorasDoIntervalo(funcionarioId, inicioIso, fimIso);
  }

  /* ─── Tempo do banco de horas liberado pelo RH para abono ─── */

  /** Situação do saldo, do que o RH já liberou e do que o funcionário ainda pode usar. */
  async getLiberacoesBancoRh(funcionarioId: string) {
    await this.prisma.funcionario.findUniqueOrThrow({ where: { id: funcionarioId } });
    const { cicloInicio, hojeIso } = await this.getCicloBancoHoras(funcionarioId);
    const [{ saldoAtualMinutos }, rows, { uso }, cfg] = await Promise.all([
      this.calcularBancoHoras(funcionarioId, cicloInicio, hojeIso),
      this.prisma.bancoHorasLiberacao.findMany({
        where: { funcionarioId },
        orderBy: { createdAt: "desc" }
      }),
      carregarUsoCredito(this.prisma, funcionarioId),
      this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: { bancoHorasLiberacaoValidadeDias: true }
      })
    ]);
    const bases = await carregarLiberacoes(this.prisma, funcionarioId);
    const situacoes = situacaoDasLiberacoes(bases, uso, hojeIso);
    const porId = new Map(situacoes.map((x) => [x.id, x]));
    const liberacoes = rows.map((r) => {
      const sit = porId.get(r.id)!;
      return {
        id: r.id,
        minutos: r.minutos,
        minutosEfetivos: sit.minutosEfetivos,
        usadoMinutos: sit.usadoMinutos,
        disponivelMinutos: sit.disponivelMinutos,
        validaAte: sit.validaAte,
        vencida: sit.vencida,
        revogada: r.minutosRevogados > 0,
        minutosRevogados: r.minutosRevogados,
        devolvidoAoBancoMin: r.devolvidoAoBancoMin,
        justificativa: r.justificativa,
        liberadoPorNome: r.liberadoPorNome,
        createdAt: r.createdAt,
        revogadaEm: r.revogadaEm,
        revogadaPorNome: r.revogadaPorNome,
        revogacaoJustificativa: r.revogacaoJustificativa
      };
    });
    return {
      saldoAtualMinutos,
      liberavelMinutos: Math.max(0, saldoAtualMinutos),
      minutoMinimo: MINUTOS_MINIMOS_LIBERACAO,
      disponivelMinutos: totalDisponivel(situacoes),
      usadoMinutos: situacoes.reduce((t, x) => t + x.usadoMinutos, 0),
      validadePadraoDias: cfg?.bancoHorasLiberacaoValidadeDias ?? 180,
      liberacoes
    };
  }

  async liberarBancoHorasRh(
    funcionarioId: string,
    body: { minutos: number; validaAte: string; justificativa: string },
    keycloakSub: string
  ) {
    await this.assertNaoEhProprioPorSub(
      funcionarioId,
      keycloakSub,
      "Você não pode liberar tempo do seu próprio banco de horas. Outro membro do RH deve fazê-lo."
    );
    const minutos = Math.round(Number(body.minutos));
    const justificativa = (body.justificativa ?? "").trim();
    if (!Number.isFinite(minutos) || minutos < MINUTOS_MINIMOS_LIBERACAO) {
      throw new BadRequestException(
        `Informe ao menos ${MINUTOS_MINIMOS_LIBERACAO} minutos para liberar.`
      );
    }
    if (justificativa.length < 10) {
      throw new BadRequestException("Informe a justificativa (mínimo de 10 caracteres).");
    }
    const hojeIso = hojeBrasiliaISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.validaAte ?? "") || body.validaAte < hojeIso) {
      throw new BadRequestException("Informe uma data de validade a partir de hoje.");
    }
    const func = await this.prisma.funcionario.findUniqueOrThrow({
      where: { id: funcionarioId },
      select: { id: true }
    });
    const { cicloInicio } = await this.getCicloBancoHoras(funcionarioId);
    const { saldoAtualMinutos } = await this.calcularBancoHoras(func.id, cicloInicio, hojeIso);
    const liberavel = Math.max(0, saldoAtualMinutos);
    if (minutos > liberavel) {
      throw new BadRequestException(
        liberavel > 0
          ? `O saldo positivo do banco é de ${fmtHoraMin(liberavel)}; não é possível liberar ${fmtHoraMin(minutos)}.`
          : "O funcionário não tem saldo positivo no banco de horas para liberar."
      );
    }
    const rh = await this.prisma.user.findFirst({
      where: { externalId: keycloakSub },
      select: { id: true, name: true }
    });
    const criada = await this.prisma.bancoHorasLiberacao.create({
      data: {
        funcionarioId: func.id,
        minutos,
        validaAte: new Date(`${body.validaAte}T00:00:00.000Z`),
        justificativa,
        liberadoPorNome: rh?.name ?? keycloakSub,
        liberadoPorUserId: rh?.id ?? null,
        cicloInicio: cicloInicio ?? null
      }
    });
    this.notificarBancoHorasLiberado(
      func.id,
      "LIBERADO",
      minutos,
      body.validaAte,
      justificativa,
      rh?.name ?? "RH"
    ).catch((e) => this.logger.error(`Falha ao notificar BANCO_HORAS_LIBERADO: ${e}`));
    return criada;
  }

  /** Revoga o tempo ainda não usado. Devolve ao banco só se o ciclo da liberação ainda é o atual. */
  async revogarLiberacaoBancoRh(
    funcionarioId: string,
    liberacaoId: string,
    justificativaBruta: string,
    keycloakSub: string
  ) {
    await this.assertNaoEhProprioPorSub(
      funcionarioId,
      keycloakSub,
      "Você não pode revogar liberações do seu próprio banco de horas."
    );
    const justificativa = (justificativaBruta ?? "").trim();
    if (justificativa.length < 10) {
      throw new BadRequestException("Informe a justificativa (mínimo de 10 caracteres).");
    }
    const lib = await this.prisma.bancoHorasLiberacao.findFirst({
      where: { id: liberacaoId, funcionarioId }
    });
    if (!lib) throw new NotFoundException("Liberação não encontrada.");
    const hojeIso = hojeBrasiliaISO();
    const bases = await carregarLiberacoes(this.prisma, funcionarioId);
    const { uso } = await carregarUsoCredito(this.prisma, funcionarioId);
    const sit = situacaoDasLiberacoes(bases, uso, hojeIso).find((x) => x.id === lib.id)!;
    if (sit.vencida) throw new BadRequestException("Esta liberação já venceu.");
    if (sit.disponivelMinutos <= 0) {
      throw new BadRequestException("Não há tempo disponível para revogar nesta liberação.");
    }
    const { cicloInicio } = await this.getCicloBancoHoras(funcionarioId);
    const mesmoCiclo = (lib.cicloInicio ?? null) === (cicloInicio ?? null);
    const rh = await this.prisma.user.findFirst({
      where: { externalId: keycloakSub },
      select: { name: true }
    });
    const restante = sit.disponivelMinutos;
    const atualizada = await this.prisma.bancoHorasLiberacao.update({
      where: { id: lib.id },
      data: {
        minutosRevogados: { increment: restante },
        devolvidoAoBancoMin: { increment: mesmoCiclo ? restante : 0 },
        revogadaEm: new Date(),
        revogadaPorNome: rh?.name ?? keycloakSub,
        revogacaoJustificativa: justificativa
      }
    });
    this.notificarBancoHorasLiberado(
      funcionarioId,
      "REVOGADO",
      restante,
      dataCivilISO(lib.validaAte),
      justificativa,
      rh?.name ?? "RH"
    ).catch((e) => this.logger.error(`Falha ao notificar BANCO_HORAS_LIBERADO: ${e}`));
    return { ...atualizada, devolvidoAoBanco: mesmoCiclo, minutosRevogadosAgora: restante };
  }

  private async notificarBancoHorasLiberado(
    funcionarioId: string,
    acao: "LIBERADO" | "REVOGADO",
    minutos: number,
    validaAteIso: string,
    justificativa: string,
    rhNome: string
  ) {
    const [func, dest, chefe] = await Promise.all([
      this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { user: { select: { name: true } } }
      }),
      this.notificacaoService.getFuncionarioDestinatario(funcionarioId),
      this.notificacaoService.getGestorDoFuncionario(funcionarioId)
    ]);
    const nome = func?.user?.name ?? "Funcionário";
    const validade = validaAteIso.split("-").reverse().join("/");
    const tempo = fmtHoraMin(minutos);
    const liberado = acao === "LIBERADO";
    const corpoFunc = liberado
      ? `O RH (${rhNome}) liberou ${tempo} do seu banco de horas para você usar como abono, ` +
        `com validade até ${validade}.\n\nJustificativa do RH: ${justificativa}\n\n` +
        'Para usar, acesse Solicitações → Abono e marque "Usar o tempo liberado pelo RH".'
      : `O RH (${rhNome}) revogou ${tempo} do tempo de banco de horas liberado para abono.` +
        `\n\nJustificativa do RH: ${justificativa}`;
    if (dest) {
      await this.notificacaoService.dispararEvento(
        "BANCO_HORAS_LIBERADO",
        liberado
          ? `Tempo de banco de horas liberado pelo RH: ${tempo}`
          : `Tempo de banco de horas revogado pelo RH: ${tempo}`,
        corpoFunc,
        [dest]
      );
    }
    if (chefe && chefe.externalId !== dest?.externalId) {
      await this.notificacaoService.dispararEvento(
        "BANCO_HORAS_LIBERADO",
        liberado
          ? `Banco de horas de ${nome}: ${tempo} liberados pelo RH`
          : `Banco de horas de ${nome}: ${tempo} revogados pelo RH`,
        `${liberado ? `O RH (${rhNome}) liberou ${tempo} do banco de horas de ${nome} para abono` : `O RH (${rhNome}) revogou ${tempo} do tempo liberado para abono de ${nome}`}` +
          `${liberado ? `, com validade até ${validade}` : ""} (apenas informativo).\n\n` +
          `Justificativa do RH: ${justificativa}`,
        [chefe]
      );
    }
  }

  /** Todo dia: avisa funcionário e RH sobre tempo liberado e não usado que vence em 15 dias. */
  @Cron("20 7 * * *", { timeZone: "America/Sao_Paulo" })
  async avisarLiberacoesBancoVencendo() {
    try {
      const hojeIso = hojeBrasiliaISO();
      const limite = somarDiasIso(hojeIso, 15);
      const candidatas = await this.prisma.bancoHorasLiberacao.findMany({
        where: {
          avisoVencimentoEm: null,
          validaAte: {
            gte: new Date(`${hojeIso}T00:00:00.000Z`),
            lte: new Date(`${limite}T00:00:00.000Z`)
          }
        },
        select: { funcionarioId: true }
      });
      const ids = [...new Set(candidatas.map((c) => c.funcionarioId))];
      for (const funcionarioId of ids) {
        const bases = await carregarLiberacoes(this.prisma, funcionarioId);
        const { uso } = await carregarUsoCredito(this.prisma, funcionarioId);
        const vencendo = situacaoDasLiberacoes(bases, uso, hojeIso).filter(
          (x) => x.disponivelMinutos > 0 && x.validaAte <= limite
        );
        if (!vencendo.length) continue;
        const [func, dest, rh] = await Promise.all([
          this.prisma.funcionario.findUnique({
            where: { id: funcionarioId },
            select: { user: { select: { name: true } } }
          }),
          this.notificacaoService.getFuncionarioDestinatario(funcionarioId),
          this.notificacaoService.getUsuariosRh()
        ]);
        const nome = func?.user?.name ?? "Funcionário";
        const detalhe = vencendo
          .map(
            (v) =>
              `${fmtHoraMin(v.disponivelMinutos)} até ${v.validaAte.split("-").reverse().join("/")}`
          )
          .join("\n");
        if (dest) {
          await this.notificacaoService.dispararEvento(
            "BANCO_HORAS_LIBERADO_VENCENDO",
            "Tempo de banco de horas liberado está perto de vencer",
            `Você tem tempo liberado pelo RH, ainda não usado, perto de vencer:\n${detalhe}\n\n` +
              "Programe o abono em Solicitações → Abono.",
            [dest]
          );
        }
        if (rh.length) {
          await this.notificacaoService.dispararEvento(
            "BANCO_HORAS_LIBERADO_VENCENDO",
            `Tempo liberado de ${nome} perto de vencer`,
            `${nome} tem tempo de banco de horas liberado e não usado perto de vencer:\n${detalhe}`,
            rh
          );
        }
        await this.prisma.bancoHorasLiberacao.updateMany({
          where: { id: { in: vencendo.map((v) => v.id) } },
          data: { avisoVencimentoEm: new Date() }
        });
      }
    } catch (e) {
      this.logger.error(`Falha no aviso de vencimento de banco de horas liberado: ${e}`);
    }
  }

  async getBancoHorasGeral(filtros: {
    busca?: string;
    gerenciaId?: string;
    status?: "POSITIVO" | "NEGATIVO" | "EXCEDIDO";
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasLimiteMin: true }
    });
    const limiteMinutos = cfg?.bancoHorasLimiteMin ?? 120;
    const { cicloInicio, proximaZeragem, hojeIso } = await this.getCicloBancoHoras();

    const where: Record<string, unknown> = { ativo: true };
    if (filtros.gerenciaId) where.gerenciaId = filtros.gerenciaId;
    if (filtros.busca) {
      where.OR = [
        { user: { name: { contains: filtros.busca, mode: "insensitive" } } },
        { matricula: { contains: filtros.busca, mode: "insensitive" } }
      ];
    }

    const funcionarios = await this.prisma.funcionario.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { name: true, email: true } },
        gerencia: { select: { nome: true, sigla: true } }
      }
    });

    let itens = await Promise.all(
      funcionarios.map(async (f) => {
        const { saldoAtualMinutos } = await this.calcularBancoHoras(f.id, cicloInicio, hojeIso);
        const excedeLimite = Math.abs(saldoAtualMinutos) > limiteMinutos;
        return {
          funcionario: { id: f.id, matricula: f.matricula, nome: f.user.name, email: f.user.email },
          gerencia: f.gerencia,
          cicloInicio,
          proximaZeragem,
          saldoAtualMinutos,
          saldoFormatado: this.formatMinutes(saldoAtualMinutos),
          limiteMinutos,
          excedeLimite
        };
      })
    );

    if (filtros.status === "POSITIVO") itens = itens.filter((i) => i.saldoAtualMinutos >= 0);
    else if (filtros.status === "NEGATIVO") itens = itens.filter((i) => i.saldoAtualMinutos < 0);
    else if (filtros.status === "EXCEDIDO") itens = itens.filter((i) => i.excedeLimite);

    const total = itens.length;
    const skip = (page - 1) * limit;

    return { total, page, limit, itens: itens.slice(skip, skip + limit) };
  }

  async getAtestadoDoDia(funcionarioId: string, diaISO: string) {
    return this.pontoService.getAtestadoDoDia(funcionarioId, diaISO);
  }

  /** Saldo e histórico da cota de abono diário (acordo coletivo) do funcionário. */
  async getCotaAbonoFuncionario(funcionarioId: string) {
    await this.prisma.funcionario.findUniqueOrThrow({ where: { id: funcionarioId } });
    return this.pontoService.getCotaAbonoPorFuncionario(funcionarioId);
  }

  /* ─── RH abre solicitação em nome do funcionário ─── */

  private async alvoSolicitacaoRh(funcionarioId: string, keycloakSub: string) {
    await this.assertNaoEhProprioPorSub(
      funcionarioId,
      keycloakSub,
      "Você não pode abrir solicitações em seu próprio nome. Outro membro do RH deve fazê-lo."
    );
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        id: true,
        categoria: true,
        isManager: true,
        isFiscal: true,
        registroPontoObrigatorio: true,
        user: { select: { name: true, primeiroLoginEm: true } }
      }
    });
    if (!func) throw new NotFoundException("Funcionário não encontrado.");
    if (!func.user?.primeiroLoginEm) {
      throw new BadRequestException(
        "Este funcionário ainda não acessou o sistema. A solicitação só pode ser aberta depois do primeiro acesso."
      );
    }
    return { ref: `@func:${func.id}`, func };
  }

  /** Dados que os formulários usam do próprio funcionário (categoria etc.). */
  async getPerfilSolicitacaoRh(funcionarioId: string, keycloakSub: string) {
    const { func } = await this.alvoSolicitacaoRh(funcionarioId, keycloakSub);
    return {
      nome: func.user?.name ?? "Funcionário",
      categoria: func.categoria,
      isEstagiario: func.categoria === "ESTAGIARIO",
      semRegistroPonto: funcionarioSemRegistroPonto(func)
    };
  }

  async getCreditoBancoRh(funcionarioId: string, keycloakSub: string) {
    const { ref } = await this.alvoSolicitacaoRh(funcionarioId, keycloakSub);
    return this.pontoService.getCreditoBanco(ref);
  }

  async simularCreditoBancoRh(
    funcionarioId: string,
    body: Parameters<PontoService["simularCreditoBanco"]>[1],
    keycloakSub: string
  ) {
    const { ref } = await this.alvoSolicitacaoRh(funcionarioId, keycloakSub);
    return this.pontoService.simularCreditoBanco(ref, body);
  }

  async getCotaAbonoRh(funcionarioId: string, keycloakSub: string) {
    const { ref } = await this.alvoSolicitacaoRh(funcionarioId, keycloakSub);
    return this.pontoService.getCotaAbono(ref);
  }

  async getTiposLicencaRh(funcionarioId: string, keycloakSub: string) {
    const { ref } = await this.alvoSolicitacaoRh(funcionarioId, keycloakSub);
    return this.pontoService.getTiposLicenca(ref);
  }

  /** Cria a solicitação em nome do funcionário: mesmo fluxo do funcionário, marcada como do RH. */
  async criarSolicitacaoPeloRh(
    funcionarioId: string,
    body: Parameters<PontoService["criarSolicitacao"]>[1] & {
      rh?: { dispensarPrazos?: boolean; justificativa?: string };
    },
    keycloakSub: string
  ) {
    const { ref } = await this.alvoSolicitacaoRh(funcionarioId, keycloakSub);
    if (["FERIAS", "CORRECAO_PONTO"].includes(body.tipo)) {
      throw new BadRequestException(
        body.tipo === "FERIAS"
          ? "Férias são agendadas na aba Férias do funcionário."
          : "A correção de ponto é feita pelo Histórico do funcionário."
      );
    }
    const dispensar = !!body.rh?.dispensarPrazos;
    const justificativa = (body.rh?.justificativa ?? "").trim();
    if (dispensar && justificativa.length < 10) {
      throw new BadRequestException(
        "Informe a justificativa da dispensa de prazos (mínimo de 10 caracteres)."
      );
    }
    const rh = await this.prisma.user.findFirst({
      where: { externalId: keycloakSub },
      select: { id: true, name: true }
    });
    const { rh: _rh, ...corpo } = body;
    void _rh;
    return this.pontoService.criarSolicitacao(ref, corpo, {
      origemRh: {
        userId: rh?.id ?? null,
        nome: rh?.name ?? "RH",
        dispensar,
        justificativa
      }
    });
  }

  /** Fechamentos do banco por mudança de situação (virou chefe/fiscal/assessor ou voltou a bater). */
  async listarFechamentosSituacao(funcionarioId: string) {
    await this.prisma.funcionario.findUniqueOrThrow({ where: { id: funcionarioId } });
    const rows = await this.prisma.fechamentoSituacao.findMany({
      where: { funcionarioId },
      orderBy: { dataMudanca: "desc" },
      take: 50
    });
    return rows.map((r) => ({
      id: r.id,
      dataMudanca: dataCivilISO(r.dataMudanca),
      de: r.deRotulo,
      para: r.paraRotulo,
      paraSemRegistro: r.paraSemRegistro,
      saldoMinutos: r.saldoMinutos,
      cicloInicio: r.cicloInicio,
      alteradoPorNome: r.alteradoPorNome,
      createdAt: r.createdAt
    }));
  }

  /** RH completa/corrige o grupo do CID de um atestado já enviado. */
  async alterarCidAtestado(
    solicitacaoId: string,
    body: { cidCodigo?: string; cidGrupoId?: string; justificativa?: string },
    keycloakSub: string
  ) {
    const sol = await this.prisma.solicitacao.findUnique({ where: { id: solicitacaoId } });
    if (!sol || sol.tipo !== "ATESTADO") throw new NotFoundException("Atestado não encontrado.");
    const justificativa = (body.justificativa ?? "").trim();
    if (justificativa.length < 10) {
      throw new BadRequestException("Informe a justificativa (mínimo de 10 caracteres).");
    }
    const categoria = body.cidCodigo ? normalizarCid(body.cidCodigo) : null;
    if (body.cidCodigo && !categoria) {
      throw new BadRequestException(
        "CID inválido. Informe 1 letra seguida de 2 números (ex.: Z13)."
      );
    }
    const grupo = categoria
      ? grupoDoCid(categoria, await listarCidGrupos(this.prisma, true))
      : body.cidGrupoId
        ? await this.prisma.cidGrupo.findUnique({ where: { id: body.cidGrupoId } })
        : null;
    if (!categoria && !grupo) throw new BadRequestException("Informe o CID (ex.: Z13).");
    const rh = await this.prisma.user.findFirst({
      where: { externalId: keycloakSub },
      select: { name: true }
    });
    const meta = (sol.metadados ?? {}) as Record<string, unknown>;
    return this.prisma.solicitacao.update({
      where: { id: sol.id },
      data: {
        metadados: JSON.parse(
          JSON.stringify({
            ...meta,
            ...(categoria ? { cidCodigo: categoria } : {}),
            cidGrupo: grupo
              ? { id: grupo.id, codigo: grupo.codigo, descricao: grupo.descricao }
              : undefined,
            cidAlteradoPor: {
              nome: rh?.name ?? keycloakSub,
              em: new Date().toISOString(),
              justificativa
            }
          })
        )
      }
    });
  }

  async getBancoHorasFuncionario(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUniqueOrThrow({
      where: { id: funcionarioId },
      include: {
        user: { select: { name: true, email: true } },
        gerencia: { select: { nome: true, sigla: true } }
      }
    });

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasLimiteMin: true, tipoFlexibilidade: true }
    });
    const limiteMinutos = cfg?.bancoHorasLimiteMin ?? 120;
    const { cicloInicio, proximaZeragem, hojeIso } = await this.getCicloBancoHoras(func.id);
    const { saldoAtualMinutos, dias } = await this.calcularBancoHoras(
      func.id,
      cicloInicio,
      hojeIso
    );

    return {
      funcionario: {
        id: func.id,
        matricula: func.matricula,
        nome: func.user.name,
        email: func.user.email
      },
      gerencia: func.gerencia,
      cicloInicio,
      proximaZeragem,
      saldoAtualMinutos,
      saldoFormatado: this.formatMinutes(saldoAtualMinutos),
      limiteMinutos,
      tipoFlexibilidade: cfg?.tipoFlexibilidade ?? "FIXO",
      dias
    };
  }

  async getDocumentosRhFuncionario(funcionarioId: string) {
    await this.prisma.funcionario.findUniqueOrThrow({ where: { id: funcionarioId } });

    const [legados, solicitacoes] = await Promise.all([
      this.prisma.documentoRhEnvio.findMany({
        where: { funcionarioId },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.solicitacao.findMany({
        where: { funcionarioId, tipo: "ENVIO_DOCUMENTO_RH" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          descricao: true,
          status: true,
          metadados: true,
          createdAt: true,
          rhObservacao: true,
          rhResolvidoEm: true
        }
      })
    ]);

    const deSolicitacoes = solicitacoes.map((s) => {
      const meta = (s.metadados ?? {}) as Record<string, unknown>;
      const arquivoUrl = typeof meta.documentoUrl === "string" ? meta.documentoUrl : "";
      const nomeArquivo = typeof meta.nomeArquivo === "string" ? meta.nomeArquivo : null;
      return {
        id: s.id,
        descricao: s.descricao,
        arquivoUrl,
        nomeArquivo,
        mimeType: null as string | null,
        createdAt: s.createdAt,
        origem: "SOLICITACAO" as const,
        status: s.status,
        solicitacaoId: s.id,
        rhObservacao: s.rhObservacao,
        rhResolvidoEm: s.rhResolvidoEm
      };
    });

    const deLegados = legados.map((d) => ({
      ...d,
      origem: "LEGADO" as const,
      status: null as string | null,
      solicitacaoId: null as string | null,
      rhObservacao: null as string | null,
      rhResolvidoEm: null as Date | null
    }));

    return [...deSolicitacoes, ...deLegados].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async excluirDocumentoRhFuncionario(funcionarioId: string, documentoId: string) {
    const doc = await this.prisma.documentoRhEnvio.findFirst({
      where: { id: documentoId, funcionarioId }
    });
    if (!doc) {
      throw new NotFoundException("Documento não encontrado.");
    }

    await this.documentoService.excluirDocumento(doc.arquivoUrl);
    await this.prisma.documentoRhEnvio.delete({ where: { id: documentoId } });
    return { ok: true };
  }

  /* ─── Logs de Auditoria ─── */

  async getLogs(filtros: {
    action?: string;
    actorUserId?: string;
    method?: string;
    usuario?: string;
    q?: string;
    dataInicio?: string;
    dataFim?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filtros.page ?? 1;
    const limit = Math.min(filtros.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filtros.action) where.action = { contains: filtros.action, mode: "insensitive" };
    if (filtros.actorUserId) where.actorUserId = filtros.actorUserId;
    if (filtros.method) where.method = filtros.method.toUpperCase();
    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim + "T23:59:59") } : {})
      };
    }

    const condicoesExtras: Record<string, unknown>[] = [];
    if (filtros.usuario?.trim()) {
      condicoesExtras.push(await buildPersonCondition(this.prisma, filtros.usuario.trim()));
    }
    if (filtros.q?.trim()) {
      const buscaLivre = await buildQuerySearchCondition(this.prisma, filtros.q);
      if (buscaLivre) condicoesExtras.push(buscaLivre);
    }
    if (condicoesExtras.length) where.AND = condicoesExtras;

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      })
    ]);

    /* Enriquece com nome completo do usuário via externalId (Keycloak sub) */
    const subs = [
      ...new Set(logs.map((l) => l.actorUserId).filter((id): id is string => id !== null))
    ];
    const usuarios = subs.length
      ? await this.prisma.user.findMany({
          where: { externalId: { in: subs } },
          select: { externalId: true, name: true, email: true }
        })
      : [];
    const userMap = new Map(usuarios.map((u) => [u.externalId!, u] as [string, typeof u]));

    const logsEnriquecidos = logs.map((l) => {
      const u = l.actorUserId ? (userMap.get(l.actorUserId) ?? null) : null;
      return {
        ...l,
        nomeUsuario: u?.name ?? null,
        emailUsuario: u?.email ?? null,
        endpointInfo: matchEndpoint(l.method, l.path)
      };
    });

    return { total, page, limit, logs: logsEnriquecidos };
  }

  /* ─── Relatório Mensal por Funcionário ─── */

  async getRelatorioMensal(funcionarioId: string, mes: number, ano: number, isSuperAdmin = false) {
    const mesPrefixCheck = `${ano}-${String(mes).padStart(2, "0")}`;
    const dataInicioProducao = await getDataInicioProducao(this.prisma);
    assertMesAposGoLive({
      mesAnoPrefixo: mesPrefixCheck,
      dataInicioProducao,
      isSuperAdmin,
      contexto: "Relatório de auditoria"
    });

    const func = await this.prisma.funcionario.findUniqueOrThrow({
      where: { id: funcionarioId },
      include: { user: true, gerencia: true }
    });

    const inicio = new Date(ano, mes - 1, 1, 0, 0, 0);
    const fim = new Date(ano, mes, 0, 23, 59, 59);
    const mesPrefix = `${ano}-${String(mes).padStart(2, "0")}`;

    const registros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" }
    });

    const solicitacoes = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        dataReferencia: { gte: inicio, lte: fim }
      },
      orderBy: { createdAt: "asc" }
    });

    const afastamentos = await this.prisma.afastamento.findMany({
      where: {
        funcionarioId,
        dataInicio: { lte: fim },
        dataFim: { gte: inicio }
      }
    });

    /* Agrupar registros por dia (para detalhe expandido) */
    const porDia = new Map<string, typeof registros>();
    for (const r of registros) {
      const key = dataBrasiliaISO(r.dataHora);
      if (!porDia.has(key)) porDia.set(key, []);
      porDia.get(key)!.push(r);
    }

    /* Totais do card: mesmas regras da página Banco de Horas */
    const ultimoDiaMesBanco = String(new Date(ano, mes, 0).getDate()).padStart(2, "0");
    const { dias: diasMesBanco } = await this.bancoHorasDoIntervalo(
      funcionarioId,
      `${mesPrefix}-01`,
      `${mesPrefix}-${ultimoDiaMesBanco}`
    );

    const horasTrabalhadasMinutos = diasMesBanco.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
    const jornadaEsperadaMin = diasMesBanco.reduce((s, d) => s + d.jornadaEsperadaMinutos, 0);
    const horasExtrasMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos > 0)
      .reduce((s, d) => s + d.saldoDiaMinutos, 0);
    const horasFaltaMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos < 0)
      .reduce((s, d) => s + Math.abs(d.saldoDiaMinutos), 0);
    const saldoMinutos = diasMesBanco.reduce((s, d) => s + d.saldoDiaMinutos, 0);
    /* Mesma contagem do Histórico, da folha e do modal de assinatura. */
    const { diasTrabalhados } = await this.pontoService.calcularResumoMensalPorFuncionarioId(
      funcionarioId,
      mes,
      ano
    );

    const diasDetalhados = diasMesBanco.map((d) => {
      const regs = porDia.get(d.data) ?? [];
      return {
        data: d.data,
        registros: regs,
        horasTrabalhadasMinutos: d.horasTrabalhadasMinutos,
        horasTrabalhadasFormatado: this.formatMinutes(d.horasTrabalhadasMinutos),
        jornadaEsperadaMinutos: d.jornadaEsperadaMinutos,
        saldoDiaMinutos: d.saldoDiaMinutos,
        observacao: d.observacao
      };
    });

    return {
      funcionario: {
        id: func.id,
        matricula: func.matricula,
        cargo: func.cargo,
        nome: func.user.name,
        email: func.user.email,
        gerencia: func.gerencia
      },
      mes,
      ano,
      diasTrabalhados,
      totalRegistros: registros.length,
      horasTrabalhadasMinutos,
      horasTrabalhadasFormatado: this.formatMinutes(horasTrabalhadasMinutos),
      jornadaEsperadaMinutos: jornadaEsperadaMin,
      jornadaEsperadaFormatado: this.formatMinutes(jornadaEsperadaMin),
      horasExtrasMinutos,
      horasExtrasFormatado: this.formatMinutes(horasExtrasMinutos),
      horasFaltaMinutos,
      horasFaltaFormatado: this.formatMinutes(horasFaltaMinutos),
      saldoMinutos,
      saldoFormatado: this.formatMinutes(saldoMinutos),
      diasDetalhados,
      solicitacoes,
      afastamentos
    };
  }

  /* ─── Export CSV (dados para o frontend montar o arquivo) ─── */

  async exportRegistrosCSV(filtros: {
    funcionarioId?: string;
    gerenciaId?: string;
    dataInicio?: string;
    dataFim?: string;
    tipo?: string;
    origem?: string;
  }) {
    const resultado = await this.getRegistros({ ...filtros, limit: 500, page: 1 });
    return resultado.registros;
  }

  /* ─── Helpers de notificação ─── */

  /* ─── Férias agendadas pelo RH (Auditoria → Funcionário → Férias) ─── */

  /**
   * Remove os afastamentos gerados por uma solicitação (alteração/cancelamento de férias).
   * Usa o vínculo `solicitacaoId`; afastamentos antigos (sem vínculo) são achados pelas
   * datas dos períodos — inclusive no formato legado (data civil gravada em UTC).
   */
  private async removerAfastamentosDaSolicitacao(
    tx: Prisma.TransactionClient,
    sol: {
      id: string;
      funcionarioId: string;
      dataInicio: Date | null;
      dataFim: Date | null;
      dataReferencia: Date;
      metadados: unknown;
    }
  ): Promise<number> {
    const vinculados = await tx.afastamento.deleteMany({ where: { solicitacaoId: sol.id } });
    if (vinculados.count > 0) return vinculados.count;

    const meta = (sol.metadados ?? {}) as Record<string, unknown>;
    const periodos = Array.isArray(meta.periodos)
      ? (meta.periodos as Array<{ dataInicio?: string; dataFim?: string }>)
      : [];
    const pares: Array<{ inicios: Date[]; fins: Date[] }> = periodos.length
      ? periodos.map((p) => {
          const ini = dataCivilPeriodo(String(p.dataInicio ?? ""));
          const fim = dataCivilPeriodo(String(p.dataFim ?? p.dataInicio ?? ""));
          return {
            inicios: [new Date(String(p.dataInicio)), intervaloDiaBrasilia(ini).inicio],
            fins: [new Date(String(p.dataFim)), fimDiaCivilBrasilia(fim)]
          };
        })
      : [
          {
            inicios: [sol.dataInicio ?? sol.dataReferencia],
            fins: [sol.dataFim ?? sol.dataInicio ?? sol.dataReferencia]
          }
        ];
    let total = 0;
    for (const p of pares) {
      const r = await tx.afastamento.deleteMany({
        where: {
          funcionarioId: sol.funcionarioId,
          tipo: "FERIAS",
          solicitacaoId: null,
          dataInicio: { in: p.inicios.filter((d) => !Number.isNaN(d.getTime())) },
          dataFim: { in: p.fins.filter((d) => !Number.isNaN(d.getTime())) }
        }
      });
      total += r.count;
    }
    return total;
  }

  /** Calendário de vedação para o formulário do RH (feriados + dias úteis do funcionário). */
  async getCalendarioFeriasRh(funcionarioId: string, de: string, ate: string) {
    const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "");
    if (!ok(de) || !ok(ate) || de > ate) {
      throw new BadRequestException("Informe o intervalo (de/ate) no formato AAAA-MM-DD.");
    }
    const cfg = await this.configSolicitacoesService.getConfig();
    return {
      vedacaoPreFeriadoDias: cfg.feriasVedacaoPreFeriadoDias,
      ...(await this.pontoService.calendarioFerias(funcionarioId, de, ate))
    };
  }

  /**
   * Valida a entrada do RH: mesmas regras do funcionário, sem antecedência (qualquer data,
   * inclusive passada); vedação pode ser ignorada com `ignorarVedacao`. Devolve os períodos
   * normalizados e os totais.
   */
  private async validarEntradaFeriasRh(
    funcionarioId: string,
    entrada: FeriasRhEntrada,
    total: { exato?: number; maximo?: number }
  ) {
    const justificativa = (entrada.justificativa ?? "").trim();
    if (justificativa.length < 10) {
      throw new BadRequestException("Informe a justificativa do RH (mínimo de 10 caracteres).");
    }
    const periodos = (Array.isArray(entrada.periodos) ? entrada.periodos : []).map((p) => ({
      inicio: String(p.inicio ?? "").slice(0, 10),
      fim: String(p.fim ?? "").slice(0, 10)
    }));
    const diasVendidos = Math.max(0, Math.floor(Number(entrada.diasVendidos ?? 0)));
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { categoria: true }
    });
    if (!func) throw new NotFoundException("Funcionário não encontrado.");
    const isEstagiario = func.categoria === "ESTAGIARIO";

    const erros: string[] = [];
    const cfg = await this.configSolicitacoesService.getConfig();
    const datas = periodos
      .flatMap((p) => [p.inicio, p.fim])
      .filter((d) => d)
      .sort();
    const calendario =
      datas.length && !entrada.ignorarVedacao
        ? await this.pontoService.calendarioFerias(
            funcionarioId,
            datas[0],
            somarDiasIso(datas[datas.length - 1], cfg.feriasVedacaoPreFeriadoDias + 1)
          )
        : { diasUteis: [false, true, true, true, true, true, false], feriados: [] };
    /* Ciclo da entrada: limite por período do estagiário e data mínima de gozo. */
    const saldo = await this.pontoService.calcularSaldoFeriasFuncionario(funcionarioId);
    const ciclo =
      saldo?.ciclos.find((c) => c.numero === entrada.cicloNumero) ??
      saldo?.ciclos.find((c) => c.status === "DISPONIVEL" && c.diasDisponiveis > 0);
    const liberaEm = ciclo?.liberaEm ?? null;
    if (isEstagiario) {
      /* Estagiário: não vende dias; blocos de 5 dias, até 3 períodos (sem antecedência
         quando o RH agenda). */
      if (diasVendidos > 0) erros.push("Estagiários não podem vender dias de férias.");
      erros.push(
        ...validarPeriodosEstagiario({
          periodos,
          maxPeriodoDias: (ciclo?.diasPorCiclo ?? 30) <= 15 ? 10 : 30,
          regras: {
            antecedenciaMinDias: cfg.feriasAntecedenciaMinDias,
            vedacaoPreFeriadoDias: cfg.feriasVedacaoPreFeriadoDias
          },
          hoje: hojeBrasiliaISO(),
          calendario,
          liberaEm,
          ignorarAntecedencia: true,
          ignorarVedacao: !!entrada.ignorarVedacao
        })
      );
    } else {
      erros.push(
        ...validarPeriodosFerias({
          periodos,
          diasVenda: diasVendidos,
          regras: {
            antecedenciaMinDias: cfg.feriasAntecedenciaMinDias,
            minimoGrandePeriodo: cfg.feriasMinimoGrandePeriodo,
            minimoOutrosPeriodos: cfg.feriasMinimoOutrosPeriodos,
            maxPeriodos: cfg.feriasMaxPeriodos,
            maxDiasVenda: cfg.feriasMaxDiasVenda,
            vedacaoPreFeriadoDias: cfg.feriasVedacaoPreFeriadoDias
          },
          hoje: hojeBrasiliaISO(),
          calendario,
          liberaEm,
          ignorarAntecedencia: true,
          ignorarVedacao: !!entrada.ignorarVedacao
        })
      );
    }
    if (erros.length) throw new BadRequestException(erros.join(" "));

    const ordenados = [...periodos].sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
    const comDias = ordenados.map((p) => ({ ...p, dias: diasCorridos(p.inicio, p.fim) }));
    const totalDiasGozo = comDias.reduce((s, p) => s + p.dias, 0);
    const totalDias = totalDiasGozo + diasVendidos;
    if (total.exato != null && totalDias !== total.exato) {
      throw new BadRequestException(
        `Gozo + venda deve somar ${total.exato} dias (informado: ${totalDias}).`
      );
    }
    if (total.maximo != null && totalDias > total.maximo) {
      throw new BadRequestException(
        `Gozo + venda (${totalDias} dias) excede os ${total.maximo} dias disponíveis.`
      );
    }
    return {
      justificativa,
      periodos: comDias,
      diasVendidos,
      totalDiasGozo,
      totalDias,
      ignorouVedacao: !!entrada.ignorarVedacao
    };
  }

  /** Quem é o RH (nome + id) para o registro e os avisos. */
  private async rhAutor(keycloakSub: string) {
    const u = await this.prisma.user.findFirst({
      where: { externalId: keycloakSub },
      select: { id: true, name: true }
    });
    return { userId: u?.id ?? null, nome: u?.name ?? "RH" };
  }

  /** Metadados de uma solicitação de férias feita pelo RH. */
  private metadadosFeriasRh(
    v: Awaited<ReturnType<AuditoriaService["validarEntradaFeriasRh"]>>,
    extra: {
      cicloNumero: number | null;
      rhNome: string;
      rhUserId?: string | null;
      semChefe?: boolean;
      alteracaoDeId?: string;
      acao: string;
    }
  ): Prisma.InputJsonValue {
    return {
      periodos: v.periodos.map((p) => ({
        dataInicio: intervaloDiaBrasilia(p.inicio).inicio.toISOString(),
        dataFim: fimDiaCivilBrasilia(p.fim).toISOString(),
        dias: p.dias
      })),
      diasVendidos: v.diasVendidos,
      totalDiasGozo: v.totalDiasGozo,
      totalDias: v.totalDias,
      cicloNumero: extra.cicloNumero,
      origem: "RH",
      acaoRh: extra.acao,
      rhNome: extra.rhNome,
      ...(extra.rhUserId ? { rhAutorUserId: extra.rhUserId } : {}),
      justificativaRh: v.justificativa,
      ...(extra.semChefe ? { semChefe: true } : {}),
      ...(v.ignorouVedacao ? { ignorouVedacao: true } : {}),
      ...(extra.alteracaoDeId ? { alteracaoDeId: extra.alteracaoDeId } : {})
    };
  }

  /** Marca uma solicitação de férias como cancelada/substituída pelo RH. */
  private async cancelarFeriasPorRh(
    tx: Prisma.TransactionClient,
    sol: { id: string; metadados: unknown },
    motivo: "SUBSTITUIDA" | "ALTERADA" | "CANCELADA",
    rh: { userId: string | null; nome: string },
    justificativa: string
  ) {
    await tx.solicitacao.update({
      where: { id: sol.id },
      data: {
        status: "CANCELADA",
        rhUserId: rh.userId ?? undefined,
        rhResolvidoEm: new Date(),
        metadados: {
          ...((sol.metadados ?? {}) as Record<string, unknown>),
          canceladaPorRh: {
            motivo,
            nome: rh.nome,
            em: new Date().toISOString(),
            justificativa
          }
        } as Prisma.InputJsonValue
      }
    });
  }

  /**
   * Etapa inicial das férias feitas pelo RH, como no pedido do funcionário: primeiro o chefe
   * (PENDENTE), depois o RH (Aviso + Recibo → assinatura → aprovação). Se não houver chefe
   * que possa aprovar (nenhum encontrado, ou o próprio funcionário é o responsável), vai
   * direto para a etapa do RH, para não ficar parada.
   */
  private async etapaInicialFeriasRh(funcionarioId: string) {
    const [chefe, dest] = await Promise.all([
      this.notificacaoService.getGestorDoFuncionario(funcionarioId),
      this.notificacaoService.getFuncionarioDestinatario(funcionarioId)
    ]);
    const temChefe = !!chefe && chefe.externalId !== dest?.externalId;
    return {
      status: (temChefe ? "PENDENTE" : "AGUARDANDO_RH") as StatusSolicitacao,
      aguardaChefe: temChefe,
      semChefe: !temChefe
    };
  }

  private static readonly STATUS_FERIAS_EM_ANALISE: StatusSolicitacao[] = [
    "PENDENTE",
    "AGUARDANDO_RH",
    "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
    "AGUARDANDO_GESTOR_RH"
  ];

  /** RH agenda as férias de um ciclo (aprovadas na hora; substitui pedido pendente). */
  async agendarFeriasRh(funcionarioId: string, entrada: FeriasRhEntrada, keycloakSub: string) {
    await this.assertNaoEhProprioPorSub(
      funcionarioId,
      keycloakSub,
      "Você não pode agendar as suas próprias férias. Outro membro do RH deve fazê-lo."
    );
    const saldo = await this.pontoService.calcularSaldoFeriasFuncionario(funcionarioId);
    if (!saldo) {
      throw new BadRequestException(
        "Data de admissão não cadastrada: não é possível calcular os ciclos de férias."
      );
    }
    const cicloNumero = Number(entrada.cicloNumero);
    const ciclo = saldo.ciclos.find((c) => c.numero === cicloNumero);
    if (!ciclo) throw new BadRequestException("Ciclo de férias inválido.");

    /* Solicitações do ciclo: aprovadas bloqueiam (use Alterar); pendentes são substituídas. */
    const doFuncionario = await this.prisma.solicitacao.findMany({
      where: { funcionarioId, tipo: "FERIAS", status: { not: "CANCELADA" } },
      select: {
        id: true,
        status: true,
        metadados: true,
        dataInicio: true,
        dataFim: true,
        dataReferencia: true
      }
    });
    const doCiclo = doFuncionario.filter((s) => {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      return m.cicloNumero == null || Number(m.cicloNumero) === cicloNumero;
    });
    const pendentes = doCiclo.filter((s) =>
      AuditoriaService.STATUS_FERIAS_EM_ANALISE.includes(s.status)
    );
    const aprovadas = doCiclo.filter(
      (s) =>
        s.status === "APROVADA" &&
        Number(((s.metadados ?? {}) as Record<string, unknown>).cicloNumero) === cicloNumero
    );
    const isEstagiario = saldo.isEstagiario;
    const consumidoAprovado = aprovadas.reduce((acc, s) => {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      return acc + Number(m.totalDiasGozo ?? 0) + Number(m.diasVendidos ?? 0);
    }, 0);
    const disponivel = Math.max(0, ciclo.diasPorCiclo - consumidoAprovado);
    if (!isEstagiario && aprovadas.length) {
      throw new BadRequestException(
        `O ciclo ${cicloNumero} já tem férias aprovadas. Use "Alterar" nas férias do histórico.`
      );
    }
    if (disponivel <= 0) {
      throw new BadRequestException(`Não há dias disponíveis no ciclo ${cicloNumero}.`);
    }

    const v = await this.validarEntradaFeriasRh(
      funcionarioId,
      entrada,
      isEstagiario ? { maximo: disponivel } : { exato: disponivel }
    );
    const rh = await this.rhAutor(keycloakSub);
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { categoria: true, isManager: true, isFiscal: true, registroPontoObrigatorio: true }
    });
    const apenasInformativo = !!func && funcionarioSemRegistroPonto(func);
    const primeiro = v.periodos[0].inicio;
    const ultimo = v.periodos[v.periodos.length - 1].fim;
    const descricao = `Férias programadas pelo RH (${rh.nome}).`;

    /* Mesmo fluxo do pedido do funcionário: o chefe aprova, depois o RH anexa Aviso + Recibo,
       o funcionário assina e o RH aprova — só então os afastamentos são criados. */
    const etapa = await this.etapaInicialFeriasRh(funcionarioId);
    const criada = await this.prisma.$transaction(async (tx) => {
      for (const p of pendentes) {
        await this.cancelarFeriasPorRh(tx, p, "SUBSTITUIDA", rh, v.justificativa);
      }
      return tx.solicitacao.create({
        data: {
          funcionarioId,
          tipo: "FERIAS",
          status: etapa.status,
          dataReferencia: new Date(`${primeiro}T12:00:00-03:00`),
          dataInicio: intervaloDiaBrasilia(primeiro).inicio,
          dataFim: fimDiaCivilBrasilia(ultimo),
          descricao,
          apenasInformativo,
          metadados: this.metadadosFeriasRh(v, {
            cicloNumero,
            rhNome: rh.nome,
            rhUserId: rh.userId,
            semChefe: etapa.semChefe,
            acao: "AGENDADA"
          })
        }
      });
    });

    this.notificarFeriasRh(
      funcionarioId,
      "AGENDADA",
      v,
      rh.nome,
      pendentes.length > 0,
      etapa.aguardaChefe
    ).catch((e) => this.logger.error(`Falha ao notificar FERIAS_RH: ${e}`));
    return criada;
  }

  /** RH altera férias aprovadas ou em análise: nova solicitação aprovada substitui a original. */
  async alterarFeriasRh(
    funcionarioId: string,
    solicitacaoId: string,
    entrada: FeriasRhEntrada,
    keycloakSub: string
  ) {
    await this.assertNaoEhProprioPorSub(
      funcionarioId,
      keycloakSub,
      "Você não pode alterar as suas próprias férias. Outro membro do RH deve fazê-lo."
    );
    const original = await this.prisma.solicitacao.findFirst({
      where: { id: solicitacaoId, funcionarioId, tipo: "FERIAS" }
    });
    if (!original) throw new NotFoundException("Solicitação de férias não encontrada.");
    if (
      original.status !== "APROVADA" &&
      !AuditoriaService.STATUS_FERIAS_EM_ANALISE.includes(original.status)
    ) {
      throw new BadRequestException("Só é possível alterar férias aprovadas ou em análise.");
    }
    const metaOrig = (original.metadados ?? {}) as Record<string, unknown>;
    const totalOriginal =
      Number(metaOrig.totalDiasGozo ?? 0) + Number(metaOrig.diasVendidos ?? 0) ||
      Number(metaOrig.totalDias ?? 0);
    const saldo = await this.pontoService.calcularSaldoFeriasFuncionario(funcionarioId);
    const v = await this.validarEntradaFeriasRh(
      funcionarioId,
      entrada,
      saldo?.isEstagiario
        ? { maximo: totalOriginal + Math.max(0, saldo.diasDisponiveis) }
        : { exato: totalOriginal }
    );
    const rh = await this.rhAutor(keycloakSub);
    const cicloNumero = metaOrig.cicloNumero != null ? Number(metaOrig.cicloNumero) : null;
    /* Mudança pedida pelo funcionário e ainda em análise sobre esta férias: substituída. */
    const alteracoesPendentes = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: "FERIAS",
        status: { in: AuditoriaService.STATUS_FERIAS_EM_ANALISE },
        metadados: { path: ["alteracaoDeId"], equals: original.id }
      },
      select: { id: true, metadados: true }
    });
    const primeiro = v.periodos[0].inicio;
    const ultimo = v.periodos[v.periodos.length - 1].fim;

    /* A nova programação segue o fluxo: chefe → RH (Aviso + Recibo → assinatura → aprovação).
       Férias já aprovadas continuam valendo até a aprovação da nova — nesse momento a
       original é cancelada e os afastamentos trocados (rhResolverSolicitacao). Se a
       original ainda estava em análise, é substituída já. */
    const etapa = await this.etapaInicialFeriasRh(funcionarioId);
    const criada = await this.prisma.$transaction(async (tx) => {
      for (const p of alteracoesPendentes) {
        await this.cancelarFeriasPorRh(tx, p, "SUBSTITUIDA", rh, v.justificativa);
      }
      if (original.status !== "APROVADA") {
        await this.cancelarFeriasPorRh(tx, original, "ALTERADA", rh, v.justificativa);
      }
      return tx.solicitacao.create({
        data: {
          funcionarioId,
          tipo: "FERIAS",
          status: etapa.status,
          dataReferencia: new Date(`${primeiro}T12:00:00-03:00`),
          dataInicio: intervaloDiaBrasilia(primeiro).inicio,
          dataFim: fimDiaCivilBrasilia(ultimo),
          descricao: `Férias reprogramadas pelo RH (${rh.nome}).`,
          apenasInformativo: original.apenasInformativo,
          metadados: this.metadadosFeriasRh(v, {
            cicloNumero,
            rhNome: rh.nome,
            rhUserId: rh.userId,
            semChefe: etapa.semChefe,
            acao: "ALTERADA",
            alteracaoDeId: original.id
          })
        }
      });
    });

    this.notificarFeriasRh(
      funcionarioId,
      "ALTERADA",
      v,
      rh.nome,
      alteracoesPendentes.length > 0 || original.status !== "APROVADA",
      etapa.aguardaChefe
    ).catch((e) => this.logger.error(`Falha ao notificar FERIAS_RH: ${e}`));
    return criada;
  }

  /** RH cancela férias aprovadas ou em análise (libera o saldo e remove os afastamentos). */
  async cancelarFeriasRh(
    funcionarioId: string,
    solicitacaoId: string,
    justificativaBruta: string,
    keycloakSub: string
  ) {
    await this.assertNaoEhProprioPorSub(
      funcionarioId,
      keycloakSub,
      "Você não pode cancelar as suas próprias férias. Outro membro do RH deve fazê-lo."
    );
    const justificativa = (justificativaBruta ?? "").trim();
    if (justificativa.length < 10) {
      throw new BadRequestException("Informe a justificativa do RH (mínimo de 10 caracteres).");
    }
    const sol = await this.prisma.solicitacao.findFirst({
      where: { id: solicitacaoId, funcionarioId, tipo: "FERIAS" }
    });
    if (!sol) throw new NotFoundException("Solicitação de férias não encontrada.");
    if (
      sol.status !== "APROVADA" &&
      !AuditoriaService.STATUS_FERIAS_EM_ANALISE.includes(sol.status)
    ) {
      throw new BadRequestException("Só é possível cancelar férias aprovadas ou em análise.");
    }
    const rh = await this.rhAutor(keycloakSub);
    const alteracoesPendentes = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: "FERIAS",
        status: { in: AuditoriaService.STATUS_FERIAS_EM_ANALISE },
        metadados: { path: ["alteracaoDeId"], equals: sol.id }
      },
      select: { id: true, metadados: true }
    });
    await this.prisma.$transaction(async (tx) => {
      for (const p of alteracoesPendentes) {
        await this.cancelarFeriasPorRh(tx, p, "CANCELADA", rh, justificativa);
      }
      await this.removerAfastamentosDaSolicitacao(tx, sol);
      await this.cancelarFeriasPorRh(tx, sol, "CANCELADA", rh, justificativa);
    });

    const meta = (sol.metadados ?? {}) as Record<string, unknown>;
    const periodos = (
      Array.isArray(meta.periodos)
        ? (meta.periodos as Array<{ dataInicio?: string; dataFim?: string; dias?: number }>)
        : []
    ).map((p) => {
      const inicio = dataCivilPeriodo(String(p.dataInicio ?? ""));
      const fim = dataCivilPeriodo(String(p.dataFim ?? p.dataInicio ?? ""));
      return { inicio, fim, dias: Number(p.dias ?? diasCorridos(inicio, fim)) };
    });
    this.notificarFeriasRh(
      funcionarioId,
      "CANCELADA",
      {
        justificativa,
        periodos,
        diasVendidos: Number(meta.diasVendidos ?? 0)
      },
      rh.nome,
      false
    ).catch((e) => this.logger.error(`Falha ao notificar FERIAS_RH: ${e}`));
    return { ok: true };
  }

  /** RH autor: o chefe recusou a programação de férias feita por ele. */
  private async notificarRhFeriasRecusadasPeloChefe(
    funcNome: string,
    meta: Record<string, unknown>,
    chefeNome: string,
    observacao: string
  ) {
    const autorId = typeof meta.rhAutorUserId === "string" ? meta.rhAutorUserId : null;
    const autor = autorId
      ? await this.prisma.user.findUnique({
          where: { id: autorId },
          select: { externalId: true, email: true, emailReal: true }
        })
      : null;
    const destinatarios = autor ? [autor] : await this.notificacaoService.getUsuariosRh();
    if (!destinatarios.length) return;
    await this.notificacaoService.dispararEvento(
      "SOLICITACAO_RECUSADA",
      `Férias de ${funcNome} recusadas pelo chefe`,
      `O chefe ${chefeNome} recusou a programação de férias de ${funcNome} feita pelo RH.` +
        (observacao ? `\n\nJustificativa do chefe: ${observacao}` : "") +
        "\n\nAjuste a programação em Auditoria → Funcionário → Férias.",
      destinatarios
    );
  }

  /** Chefe: férias programadas pelo RH foram aprovadas (assinadas pelo funcionário). */
  private async notificarChefeFeriasRhAprovadas(
    funcionarioId: string,
    meta: Record<string, unknown>
  ) {
    const [func, chefe] = await Promise.all([
      this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { user: { select: { name: true } } }
      }),
      this.notificacaoService.getGestorDoFuncionario(funcionarioId)
    ]);
    if (!chefe) return;
    const nome = func?.user?.name ?? "Funcionário";
    const fmt = (iso: string) => iso.split("-").reverse().join("/");
    const periodos = (
      Array.isArray(meta.periodos)
        ? (meta.periodos as Array<{ dataInicio?: string; dataFim?: string }>)
        : []
    )
      .map((p, i) => {
        const ini = dataCivilPeriodo(String(p.dataInicio ?? ""));
        const fim = dataCivilPeriodo(String(p.dataFim ?? p.dataInicio ?? ""));
        return `${i + 1}º período: ${fmt(ini)} a ${fmt(fim)}`;
      })
      .join("\n");
    await this.notificacaoService.dispararEvento(
      "FERIAS_RH",
      `Férias de ${nome} aprovadas pelo RH`,
      `As férias de ${nome} programadas pelo RH foram aprovadas após a assinatura do Aviso ` +
        `e do Recibo de Férias (apenas informativo).\n\n${periodos}`,
      [chefe]
    );
  }

  /** Aviso ao funcionário e ao chefe (evento FERIAS_RH). */
  private async notificarFeriasRh(
    funcionarioId: string,
    acao: "AGENDADA" | "ALTERADA" | "CANCELADA",
    v: {
      justificativa: string;
      periodos: Array<{ inicio: string; fim: string; dias: number }>;
      diasVendidos: number;
    },
    rhNome: string,
    substituiuPedido: boolean,
    aguardaChefe = false
  ) {
    const [func, dest, chefe] = await Promise.all([
      this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { user: { select: { name: true } } }
      }),
      this.notificacaoService.getFuncionarioDestinatario(funcionarioId),
      this.notificacaoService.getGestorDoFuncionario(funcionarioId)
    ]);
    const nome = func?.user?.name ?? "Funcionário";
    const fmt = (iso: string) => iso.split("-").reverse().join("/");
    const verbo = { AGENDADA: "programou", ALTERADA: "reprogramou", CANCELADA: "cancelou" }[acao];
    const particip = {
      AGENDADA: "programadas",
      ALTERADA: "reprogramadas",
      CANCELADA: "canceladas"
    }[acao];
    /* Programação/reprogramação segue o fluxo: chefe → Aviso + Recibo → assinatura → aprovação. */
    const proximos =
      acao === "CANCELADA"
        ? ""
        : (aguardaChefe
            ? "\n\nPróximos passos: o chefe imediato analisa e aprova a programação; depois "
            : "\n\nPróximos passos: ") +
          "o RH enviará o Aviso e o Recibo de Férias para assinatura do funcionário pelo " +
          "sistema; após a assinatura, o RH conclui a aprovação.";
    const lista = v.periodos
      .map((p, i) => `${i + 1}º período: ${fmt(p.inicio)} a ${fmt(p.fim)} (${p.dias} dias)`)
      .join("\n");
    const venda = v.diasVendidos > 0 ? `\n+ ${v.diasVendidos} dia(s) vendido(s)` : "";
    const detalhe =
      `${lista}${venda}\n\nJustificativa do RH: ${v.justificativa}` +
      (substituiuPedido
        ? "\n\nO pedido de férias que estava em análise foi substituído por este agendamento do RH."
        : "") +
      proximos +
      "\n\nAcesse o sistema (Solicitações → Férias) para consultar.";

    if (dest) {
      await this.notificacaoService.dispararEvento(
        "FERIAS_RH",
        `Suas férias foram ${particip} pelo RH`,
        `O RH (${rhNome}) ${verbo} as suas férias.\n\n${detalhe}`,
        [dest]
      );
    }
    if (chefe && chefe.externalId !== dest?.externalId) {
      if (aguardaChefe) {
        /* Programação/reprogramação do RH precisa da aprovação do chefe (como o pedido do funcionário). */
        await this.notificacaoService.dispararEvento(
          "SOLICITACAO_NOVA_GESTOR",
          `Férias de ${nome} ${particip} pelo RH — aguardando sua aprovação`,
          `O RH (${rhNome}) ${verbo} as férias de ${nome} e a programação aguarda a sua ` +
            `aprovação.\n\n${detalhe}\n\nAcesse Aprovações para analisar.`,
          [chefe]
        );
      } else {
        await this.notificacaoService.dispararEvento(
          "FERIAS_RH",
          `Férias de ${nome} ${particip} pelo RH`,
          `O RH (${rhNome}) ${verbo} as férias de ${nome} (apenas informativo).\n\n${detalhe}`,
          [chefe]
        );
      }
    }
  }

  private readonly TIPO_LABEL: Record<string, string> = {
    FERIAS: "Férias",
    ATESTADO: "Atestado",
    LICENCA: "Licença e Outros",
    HORA_EXTRA: "Hora Extra",
    CORRECAO_PONTO: "Correção de Ponto",
    ABONO: "Abono",
    BANCO_HORAS: "Banco de Horas",
    DAY_OFF: "Day Off de Aniversário",
    ENVIO_DOCUMENTO_RH: "Envio de documento ao RH"
  };

  private async notificarSolicitacaoFuncionario(
    funcionarioId: string,
    decisao: "APROVADA" | "RECUSADA",
    tipo: string,
    observacao: string
  ) {
    const eventoId = decisao === "APROVADA" ? "SOLICITACAO_APROVADA" : "SOLICITACAO_RECUSADA";
    const [emailAtivo, sistemaAtivo] = await Promise.all([
      this.notificacaoService.isEmailAtivoParaEvento(eventoId),
      this.notificacaoService.isSistemaAtivoParaEvento(eventoId)
    ]);
    if (!emailAtivo && !sistemaAtivo) return;

    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { user: { select: { externalId: true, email: true, emailReal: true } } }
    });
    if (!func?.user) return;

    const tipoLabel = this.TIPO_LABEL[tipo] ?? tipo;
    const titulo =
      decisao === "APROVADA"
        ? `Solicitação de ${tipoLabel} aprovada`
        : `Solicitação de ${tipoLabel} recusada`;
    const corpo =
      decisao === "APROVADA"
        ? `Sua solicitação de ${tipoLabel} foi aprovada.${observacao ? `\n\nObservação: ${observacao}` : ""}`
        : `Sua solicitação de ${tipoLabel} foi recusada.${observacao ? `\n\nJustificativa: ${observacao}` : ""}`;

    const email = func.user.emailReal ?? func.user.email;
    if (emailAtivo && email) {
      await this.notificacaoService.enviarEmailSistema(email, titulo, corpo, eventoId);
    }
    if (sistemaAtivo && func.user.externalId) {
      await this.notificacaoService.criarNotificacaoParaUsuario(
        func.user.externalId,
        titulo,
        corpo,
        eventoId
      );
    }
  }

  private async notificarSolicitacaoAguardandoRh(funcNome: string, tipo: string) {
    const destinatarios = await this.notificacaoService.getUsuariosRh();
    if (!destinatarios.length) return;

    const tipoLabel = this.TIPO_LABEL[tipo] ?? tipo;
    const titulo = `Solicitação aguardando RH — ${funcNome}`;
    const corpo =
      tipo === "ATESTADO"
        ? `O chefe deu ciência (com assinatura digital) no atestado de ${funcNome} ` +
          "e o documento aguarda análise do RH.\n\nAcesse o sistema para revisar."
        : `A solicitação de ${tipoLabel} de ${funcNome} foi aprovada pelo chefe ` +
          "e aguarda análise do RH.\n\nAcesse o sistema para revisar.";

    await this.notificacaoService.dispararEvento(
      "SOLICITACAO_AGUARDANDO_RH",
      titulo,
      corpo,
      destinatarios
    );
  }

  private async notificarDocumentoRhEnviado(
    funcionarioId: string,
    documento: string,
    observacao?: string | null
  ) {
    const dest = await this.notificacaoService.getFuncionarioDestinatario(funcionarioId);
    if (!dest) return;

    const titulo = `Documento recebido do RH`;
    const corpo =
      `O RH enviou a ${documento} para você.` +
      (observacao ? `\n\nObservação: ${observacao}` : "") +
      "\n\nAcesse o sistema para visualizar.";

    await this.notificacaoService.dispararEvento("RH_DOCUMENTO_ENVIADO", titulo, corpo, [dest]);
  }

  private async notificarDocumentoRetornoPendente(funcionarioId: string, documento: string) {
    const dest = await this.notificacaoService.getFuncionarioDestinatario(funcionarioId);
    if (!dest) return;

    const titulo = `Envio de documento pendente`;
    const corpo =
      `É necessário enviar o ${documento} no sistema.\n\n` +
      "Acesse suas solicitações para anexar o documento de retorno.";

    await this.notificacaoService.dispararEvento("DOCUMENTO_RETORNO_PENDENTE", titulo, corpo, [
      dest
    ]);
  }

  private async notificarAfastamentoRegistrado(
    funcionarioId: string,
    tipo: string,
    inicio: Date,
    fim: Date
  ) {
    const dest = await this.notificacaoService.getFuncionarioDestinatario(funcionarioId);
    if (!dest) return;

    const tipoLabel = this.TIPO_LABEL[tipo] ?? tipo;
    /* Servidor em UTC: formata no fuso de Brasília (o fim do dia é 02:59 UTC do dia seguinte). */
    const inicioStr = inicio.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const fimStr = fim.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const titulo = `Afastamento registrado — ${tipoLabel}`;
    const corpo = `Foi registrado um afastamento de ${tipoLabel} no período de ${inicioStr} a ${fimStr}.`;

    await this.notificacaoService.dispararEvento("AFASTAMENTO_REGISTRADO", titulo, corpo, [dest]);
  }

  private async notificarPeriodoFechado(funcionarioId: string, mesNome: string, ano: number) {
    const dest = await this.notificacaoService.getFuncionarioDestinatario(funcionarioId);
    if (!dest) return;

    const titulo = `Período de ponto fechado — ${mesNome}/${ano}`;
    const corpo =
      `O período de ponto de ${mesNome}/${ano} foi fechado pelo RH.\n\n` +
      "Acesse o sistema para consultar seu quadro.";

    await this.notificacaoService.dispararEvento("PERIODO_FECHADO", titulo, corpo, [dest]);
  }

  /** Recalcula períodos de ponto de todos os funcionários (regra de almoço mínimo). */
  recalcularHistoricoAlmocoTodos() {
    return this.pontoService.recalcularHistoricoAlmocoTodos();
  }
}
