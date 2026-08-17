import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificacaoService } from "../notificacao/notificacao.service";
import {
  aplicarHorarioBrasilia,
  horarioDeDataBrasilia,
  horarioParaMinutos,
  validarHorarioPermitido,
  dataBrasiliaISO,
  hojeBrasiliaISO,
  intervaloDiaBrasilia
} from "../../utils/horario-brasilia";
import { appendObservacao, criarObservacaoAjuste } from "../../utils/registro-observacoes";
import { assertMesAposGoLive, getDataInicioProducao } from "../../utils/inicio-producao";
import {
  jornadaEsperadaMin as jornadaMinParaDia,
  resolverJornadaHistoricoContexto,
  calcularJornadaParcialFeriado,
  calcularJornadaComAtestadoParcial,
  calcularSaldoAtestadoParcialPorExpediente,
  prepararRegsCalculoAtestadoParcial,
  isAfastamentoParcial,
  dispensarAlmocoPorAtestadoParcial,
  normalizarRegsAtestadoSemAlmoco,
  aplicarMargemCalculoDiario,
  creditoAlmocoDireitoDoDia
} from "../../utils/jornada-historico";
import { enriquecerAfastamentosComSolicitacoes } from "../../utils/atestado-parcial-enrich";
import { DocumentoService } from "../ponto/documento.service";
import { PontoService } from "../ponto/ponto.service";
import { resolverCicloBancoHoras } from "../../utils/banco-horas-marco";
import {
  categoriaSemRegistroPonto,
  categoriaSemIntervaloAlmoco,
  periodosSemObrigacaoPonto,
  MSG_SOLICITACAO_APENAS_INFORMATIVA
} from "../../utils/categoria-jornada";
import { ensureCategoriaHistorico } from "../../utils/categoria-historico";
import { calcHorasTrabalhadasMinutos } from "../../utils/calc-horas-trabalhadas";
import { observacaoForcaSemIntervalo } from "../../utils/turno-entrada";
import { codigoCienciaGestorExibido } from "../../utils/assinatura-codigo";
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

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentoService: DocumentoService,
    private readonly pontoService: PontoService,
    private readonly notificacaoService: NotificacaoService
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
            d.setDate(d.getDate() - 6);
            return dataBrasiliaISO(d);
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
      topMenosAbonos: [] as RankingQuantidade[]
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
      }
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
        jornadaPeriodoId: true,
        jornadaHorasDia: true,
        jornadaPeriodoDesde: true,
        jornadaPeriodoAssociadoEm: true,
        jornadaPeriodo: {
          select: { jornadaDiariaMin: true, horaEntrada: true, horaSaida: true }
        },
        user: { select: { name: true, createdAt: true } }
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

    const { inicio: iniFer, fim: fimFer } = {
      inicio: intervaloDiaBrasilia(dataInicio).inicio,
      fim: intervaloDiaBrasilia(dataFim).fim
    };
    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: iniFer, lte: fimFer } },
      select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
    });
    const feriadoMap = new Map(feriados.map((f) => [dataBrasiliaISO(f.data), f]));

    const afastamentos = await this.prisma.afastamento.findMany({
      where: { dataInicio: { lte: fimFer }, dataFim: { gte: iniFer } },
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

      const inicioAtividades = f.user.createdAt ? dataBrasiliaISO(f.user.createdAt) : null;
      if (inicioAtividades && dia < inicioAtividades) continue;

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
      topMenosAbonos: abonos.topMenos
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

    const [registros, func, cfgJornada] = await Promise.all([
      this.prisma.registroPonto.findMany({
        where,
        orderBy: { dataHora: "asc" }
      }),
      this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: {
          categoria: true,
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
          }
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
      })
    ]);

    const historicoCat = await ensureCategoriaHistorico(this.prisma, funcionarioId);
    const pontoObrigatorioDesde = func?.pontoObrigatorioDesde
      ? dataBrasiliaISO(func.pontoObrigatorioDesde)
      : null;
    const periodosSemObrigacao = periodosSemObrigacaoPonto(historicoCat, {
      pontoObrigatorioDesde,
      categoriaAtual: func?.categoria
    });

    return {
      registros,
      categoria: func?.categoria ?? null,
      periodosSemObrigacao,
      semRegistroPonto: categoriaSemRegistroPonto(func?.categoria),
      pontoObrigatorioDesde,
      jornada: resolverJornadaHistoricoContexto({
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
      })
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
      select: { id: true, isManager: true, section: true }
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
    } else if (meuFunc?.isManager && meuFunc.section) {
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
        "Apenas solicitações com status PENDENTE podem ser resolvidas pelo gestor."
      );
    }

    // Super admin tem autoridade sobre qualquer funcionário
    if (!isSuperAdmin) {
      const equipe = await this.getEquipeDoGestor(keycloakSub);
      const pertenceEquipe = equipe.some((f) => f.id === solicitacao.funcionarioId);
      if (!pertenceEquipe) {
        throw new ForbiddenException("Você não tem autoridade sobre este funcionário.");
      }
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
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

      const gestorNome = user?.name ?? "Gestor";
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
      if (solicitacao.tipo === "FERIAS") {
        if (!solicitacao.guiaMedicoUrl) {
          throw new BadRequestException(
            "Envie a folha de pagamento de férias ao funcionário antes de aprovar."
          );
        }
        if (!solicitacao.documentoRetornoUrl) {
          throw new BadRequestException(
            "Aguardando o funcionário enviar a folha de pagamento de férias assinada antes da aprovação."
          );
        }
      }
    }

    const rhUser = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
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

  async rhEnviarFolhaFerias(
    id: string,
    folhaBase64: string,
    observacao: string,
    keycloakSub: string
  ) {
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });

    if (solicitacao.status !== "AGUARDANDO_RH") {
      throw new BadRequestException(
        "Apenas solicitações aguardando RH podem receber a folha de férias."
      );
    }
    if (solicitacao.tipo !== "FERIAS") {
      throw new BadRequestException(
        "A folha de férias só pode ser enviada para solicitações de férias."
      );
    }

    const url = await this.documentoService.salvarGuiaMedica(id, folhaBase64);
    const rhUser = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    const obsFinal = observacao || "Folha de pagamento de férias enviada para assinatura.";

    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        guiaMedicoUrl: url,
        guiaMedicoEnviadaEm: new Date(),
        guiaMedicoObservacao: obsFinal,
        status: "AGUARDANDO_DOCUMENTO_FUNCIONARIO",
        rhUserId: rhUser?.id
      }
    });

    this.notificarDocumentoRhEnviado(
      atualizada.funcionarioId,
      "folha de pagamento de férias",
      obsFinal
    ).catch((e) => this.logger.error(`Falha ao notificar RH_DOCUMENTO_ENVIADO: ${e}`));
    this.notificarDocumentoRetornoPendente(
      atualizada.funcionarioId,
      "folha de pagamento de férias assinada"
    ).catch((e) => this.logger.error(`Falha ao notificar DOCUMENTO_RETORNO_PENDENTE: ${e}`));

    return atualizada;
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
          " já foi assinado pelo funcionário e pelo gestor. Correções não são permitidas."
      );
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });

    const funcCat = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { categoria: true }
    });
    const apenasInformativo = categoriaSemRegistroPonto(funcCat?.categoria);

    const dataRefIso = dataBrasiliaISO(new Date(body.dataReferencia));
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
    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString("pt-BR");
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
        select: { categoria: true }
      });
      apenasInformativo = categoriaSemRegistroPonto(funcCat?.categoria);
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
                acao: "CORRIGIR"
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
              acao: "INCLUIR"
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
            acao: "CORRIGIR"
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
          acao: "INCLUIR"
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
          await this.prisma.afastamento.create({
            data: {
              funcionarioId: funcId,
              tipo: "FERIAS",
              dataInicio: new Date(p.dataInicio),
              dataFim: new Date(p.dataFim),
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
    } else if (tipo === "LICENCA") {
      await this.prisma.afastamento.create({
        data: {
          funcionarioId: funcId,
          tipo: "LICENCA_MEDICA",
          dataInicio: ref,
          dataFim: fim,
          justificativa: solicitacao.descricao || obsInformativo,
          aprovadoPor: rhKeycloakSub,
          apenasInformativo
        }
      });
    } else if (tipo === "ABONO") {
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
          tipo: "ABONO",
          dataInicio: ref,
          dataFim: fim,
          horarioInicio,
          horarioFim,
          justificativa: solicitacao.descricao || obsInformativo,
          aprovadoPor: rhKeycloakSub,
          apenasInformativo
        }
      });
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

  /** Ciclo atual do banco de horas: começa no dia seguinte à última data marco
   *  já passada (ou desde sempre, se nenhuma marco passou ainda). */
  private async getCicloBancoHoras() {
    const marcos = await this.prisma.bancoHorasMarco.findMany();
    const hojeIso = hojeBrasiliaISO();
    const { cicloInicio, proximaZeragem } = resolverCicloBancoHoras(marcos, hojeIso);
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

  /** Saldo do banco de horas no ciclo atual, iterando todos os dias úteis
   *  e contabilizando feriados/afastamentos como saldo neutro (0). */
  private async calcularBancoHoras(
    funcionarioId: string,
    cicloInicio: string | null,
    hojeIso: string
  ) {
    const funcJornada = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        categoria: true,
        jornadaPeriodoId: true,
        jornadaHorasDia: true,
        jornadaPeriodoDesde: true,
        jornadaPeriodoAssociadoEm: true,
        jornadaPeriodo: {
          select: {
            nome: true,
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
        }
      }
    });
    const semIntervaloCategoria = categoriaSemIntervaloAlmoco(funcJornada?.categoria);
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: {
        diasUteis: true,
        horaEntrada: true,
        horaSaida: true,
        toleranciaCalculoMin: true,
        toleranciaEntradaMin: true,
        toleranciaSaidaMin: true,
        almocoMinMin: true,
        almocoPodeIniciarA: true,
        almocoPodeIniciarAte: true,
        horaExtraLimiteAuto: true
      }
    });
    let periodoJornada = funcJornada?.jornadaPeriodo ?? null;
    if (!periodoJornada) {
      periodoJornada = await this.prisma.jornadaPeriodo.findFirst({
        where: { ePadrao: true, ativo: true },
        select: {
          nome: true,
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
      });
    }
    const jornadaCtx = resolverJornadaHistoricoContexto({
      ...funcJornada,
      jornadaPeriodo: periodoJornada,
      configuracaoHoraEntrada: cfg?.horaEntrada ?? null,
      configuracaoHoraSaida: cfg?.horaSaida ?? null,
      configuracaoAlmocoMinMin: cfg?.almocoMinMin ?? null,
      configuracaoAlmocoPodeIniciarA: cfg?.almocoPodeIniciarA ?? null,
      configuracaoAlmocoPodeIniciarAte: cfg?.almocoPodeIniciarAte ?? null,
      configuracaoToleranciaEntradaMin: cfg?.toleranciaEntradaMin ?? null,
      configuracaoToleranciaSaidaMin: cfg?.toleranciaSaidaMin ?? null,
      configuracaoToleranciaCalculoMin: cfg?.toleranciaCalculoMin ?? null,
      configuracaoHoraExtraLimiteAuto: cfg?.horaExtraLimiteAuto ?? null
    });
    const diasUteisCfg: boolean[] = JSON.parse(
      cfg?.diasUteis ?? "[false,true,true,true,true,true,false]"
    );

    // Preferência: tolerância do período do funcionário; senão Configuração → Períodos
    let toleranciaCalculoMin = cfg?.toleranciaCalculoMin ?? 0;
    if (funcJornada?.jornadaPeriodoId) {
      const jp = await this.prisma.jornadaPeriodo.findUnique({
        where: { id: funcJornada.jornadaPeriodoId },
        select: { toleranciaCalculoMin: true }
      });
      if (jp) toleranciaCalculoMin = jp.toleranciaCalculoMin;
    } else {
      const padrao = await this.prisma.jornadaPeriodo.findFirst({
        where: { ePadrao: true, ativo: true },
        select: { toleranciaCalculoMin: true }
      });
      if (padrao) toleranciaCalculoMin = padrao.toleranciaCalculoMin;
    }

    // Sem marco: inicia do primeiro registro do funcionário (evita iterar desde 1970)
    let cicloInicioEfetivo = cicloInicio;
    if (!cicloInicioEfetivo) {
      const primeiroRegistro = await this.prisma.registroPonto.findFirst({
        where: { funcionarioId },
        orderBy: { dataHora: "asc" },
        select: { dataHora: true }
      });
      cicloInicioEfetivo = primeiroRegistro ? dataBrasiliaISO(primeiroRegistro.dataHora) : hojeIso;
    }

    const { inicio } = intervaloDiaBrasilia(cicloInicioEfetivo);
    const { fim } = intervaloDiaBrasilia(hojeIso);

    const registros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" },
      select: { tipo: true, dataHora: true, observacoes: true }
    });

    const porDia = new Map<string, { tipo: string; dataHora: Date; observacoes?: unknown }[]>();
    for (const r of registros) {
      const key = dataBrasiliaISO(r.dataHora);
      if (!porDia.has(key)) porDia.set(key, []);
      porDia.get(key)!.push(r);
    }

    const afastamentosRaw = await this.prisma.afastamento.findMany({
      where: { funcionarioId, dataInicio: { lte: fim }, dataFim: { gte: inicio } },
      select: {
        id: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        horarioInicio: true,
        horarioFim: true
      }
    });
    const solsAtestado = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: { in: ["ATESTADO", "ABONO"] },
        status: "APROVADA",
        OR: [
          { dataInicio: { lte: fim }, dataFim: { gte: inicio } },
          { dataReferencia: { gte: inicio, lte: fim } }
        ]
      },
      select: { dataInicio: true, dataFim: true, dataReferencia: true, metadados: true }
    });
    const afastamentos = enriquecerAfastamentosComSolicitacoes(afastamentosRaw, solsAtestado);

    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
    });
    const feriadoMap = new Map(
      feriados.map((f) => [
        dataBrasiliaISO(f.data),
        { nome: f.nome, marcoHorario: f.marcoHorario, marcoLado: f.marcoLado }
      ])
    );

    const cfgMult = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasSabadoPct: true, bancoHorasDomingoPct: true, bancoHorasFeriadoPct: true }
    });
    const sabadoPct = cfgMult?.bancoHorasSabadoPct ?? 100;
    const domingoPct = cfgMult?.bancoHorasDomingoPct ?? 200;
    const feriadoPct = cfgMult?.bancoHorasFeriadoPct ?? 200;

    const dias: {
      data: string;
      horasTrabalhadasMinutos: number;
      jornadaEsperadaMinutos: number;
      saldoDiaMinutos: number;
      saldoAcumuladoMinutos: number;
      observacao?: string;
    }[] = [];

    let saldoAcumulado = 0;
    let dataAtual = cicloInicioEfetivo;

    while (dataAtual <= hojeIso) {
      const [year, month, day] = dataAtual.split("-").map(Number);
      const diaSemana = new Date(year, month - 1, day).getDay();
      const eDiaUtil = diasUteisCfg[diaSemana];
      const feriadoDia = feriadoMap.get(dataAtual);
      const nomeFeriado = feriadoDia?.nome;
      const afastamento = afastamentos.find((a) => {
        const aInicio = dataBrasiliaISO(a.dataInicio);
        const aFim = dataBrasiliaISO(a.dataFim);
        return dataAtual >= aInicio && dataAtual <= aFim;
      });
      const temAfastamentoIntegral = !!afastamento && !isAfastamentoParcial(afastamento);
      const afastamentoParcial = !!afastamento && isAfastamentoParcial(afastamento);
      const regsDodia = porDia.get(dataAtual) ?? [];
      const eHoje = dataAtual === hojeIso;
      /* Mesma regra do Histórico: em dias passados o trecho aberto (ex. retorno
         sem saída) NÃO conta; no dia corrente usa o horário atual como teto. */
      const capMs = eHoje ? Date.now() : undefined;

      if (eDiaUtil) {
        const entradaDia = regsDodia.find((r) => r.tipo === "ENTRADA");
        const optsDispAlmocoDia = {
          horarioInicio: afastamento?.horarioInicio,
          horarioFim: afastamento?.horarioFim,
          almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
          almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
          almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00"
        };
        const semAlmocoDia =
          semIntervaloCategoria ||
          !!observacaoForcaSemIntervalo(entradaDia?.observacoes) ||
          dispensarAlmocoPorAtestadoParcial(afastamentoParcial, regsDodia, optsDispAlmocoDia);
        const regsCalcDia = semAlmocoDia ? normalizarRegsAtestadoSemAlmoco(regsDodia) : regsDodia;
        let horasTrabalhadasMinutos = this.calcHorasMinutos(regsCalcDia, capMs, {
          exigirIntervalo: !semAlmocoDia,
          almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00",
          horaEntrada: jornadaCtx.horaEntrada ?? "08:00",
          horaSaida: jornadaCtx.horaSaida ?? "17:00",
          toleranciaEntradaMin: jornadaCtx.toleranciaEntradaMin ?? 5,
          toleranciaSaidaMin: jornadaCtx.toleranciaEntradaMin ?? jornadaCtx.toleranciaSaidaMin ?? 5
        });
        let saldoDiaMinutos: number;
        let jornadaDia: number;
        let obs: string | undefined;

        if (temAfastamentoIntegral) {
          saldoDiaMinutos = 0;
          jornadaDia = 0;
          obs = "Afastamento";
        } else if (afastamentoParcial && afastamento) {
          const jornadaDiaMin = jornadaMinParaDia(dataAtual, jornadaCtx);
          const jornadaMandatoria = calcularJornadaComAtestadoParcial(
            afastamento.horarioInicio!,
            afastamento.horarioFim!,
            {
              horaEntrada: jornadaCtx.horaEntrada ?? "08:00",
              horaSaida: jornadaCtx.horaSaida ?? "17:00",
              jornadaDiariaMin: jornadaDiaMin,
              almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
              almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
              almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00"
            }
          );
          const regsMinDia = regsDodia.map((r) => ({
            tipo: r.tipo,
            minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora).substring(0, 5))
          }));
          const prep = prepararRegsCalculoAtestadoParcial({
            registros: regsMinDia,
            horarioInicio: afastamento.horarioInicio!,
            horarioFim: afastamento.horarioFim!,
            horaEntrada: jornadaCtx.horaEntrada ?? "08:00",
            horaSaida: jornadaCtx.horaSaida ?? "17:00",
            almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
            almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
            almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00",
            fecharVespertinoNoMarco: !eHoje
          });
          horasTrabalhadasMinutos = calcHorasTrabalhadasMinutos(prep.registros, {
            exigirIntervalo: !prep.semAlmoco,
            almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00",
            horaEntrada: jornadaCtx.horaEntrada ?? "08:00",
            horaSaida: jornadaCtx.horaSaida ?? "17:00",
            toleranciaEntradaMin: jornadaCtx.toleranciaEntradaMin ?? 5,
            toleranciaSaidaMin:
              jornadaCtx.toleranciaEntradaMin ?? jornadaCtx.toleranciaSaidaMin ?? 5
          });
          saldoDiaMinutos = calcularSaldoAtestadoParcialPorExpediente({
            horarioInicioAtestado: afastamento.horarioInicio!,
            horarioFimAtestado: afastamento.horarioFim!,
            horaEntrada: jornadaCtx.horaEntrada ?? "08:00",
            horaSaida: jornadaCtx.horaSaida ?? "17:00",
            fimTrabalhoMin: prep.fimTrabalhoMin,
            almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
            almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
            toleranciaCalculoMin: toleranciaCalculoMin ?? 0,
            horaExtraLimiteMin: jornadaCtx.horaExtraLimiteAuto ?? 120
          });
          saldoDiaMinutos += creditoAlmocoDireitoDoDia({
            registros: regsDodia,
            horarioInicioAtestado: afastamento.horarioInicio,
            horarioFimAtestado: afastamento.horarioFim,
            almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00",
            agoraMin: eHoje
              ? horarioParaMinutos(horarioDeDataBrasilia(new Date()).substring(0, 5))
              : undefined,
            exigirIntervalo: !semAlmocoDia
          });
          jornadaDia = jornadaMandatoria;
          obs =
            afastamento.tipo === "ABONO"
              ? `Abono parcial ${afastamento.horarioInicio}–${afastamento.horarioFim}`
              : `Atestado parcial ${afastamento.horarioInicio}–${afastamento.horarioFim}`;
        } else if (feriadoDia) {
          const jornadaDiaMin = jornadaMinParaDia(dataAtual, jornadaCtx);
          if (feriadoDia.marcoHorario) {
            const jornadaMandatoria = calcularJornadaParcialFeriado(
              feriadoDia.marcoHorario,
              feriadoDia.marcoLado,
              {
                horaEntrada: jornadaCtx.horaEntrada ?? "08:00",
                horaSaida: jornadaCtx.horaSaida ?? "17:00",
                jornadaDiariaMin: jornadaDiaMin
              }
            );
            saldoDiaMinutos = aplicarMargemCalculoDiario(
              horasTrabalhadasMinutos - jornadaMandatoria,
              toleranciaCalculoMin
            );
            jornadaDia = jornadaMandatoria;
            obs = `Feriado parcial: ${feriadoDia.nome} (${feriadoDia.marcoLado === "ANTES" ? "até" : "após"} ${feriadoDia.marcoHorario})`;
          } else if (regsDodia.length > 0) {
            saldoDiaMinutos = Math.round((horasTrabalhadasMinutos * feriadoPct) / 100);
            jornadaDia = 0;
            obs = `Feriado trabalhado: ${feriadoDia.nome} (${feriadoPct}%)`;
          } else {
            saldoDiaMinutos = 0;
            jornadaDia = 0;
            obs = `Feriado: ${feriadoDia.nome}`;
          }
        } else {
          const jornadaDiaMin = jornadaMinParaDia(dataAtual, jornadaCtx);
          saldoDiaMinutos = aplicarMargemCalculoDiario(
            horasTrabalhadasMinutos - jornadaDiaMin,
            toleranciaCalculoMin
          );
          saldoDiaMinutos += creditoAlmocoDireitoDoDia({
            registros: regsDodia,
            almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00",
            agoraMin: eHoje
              ? horarioParaMinutos(horarioDeDataBrasilia(new Date()).substring(0, 5))
              : undefined,
            exigirIntervalo: !semAlmocoDia
          });
          jornadaDia = jornadaDiaMin;
          obs = undefined;
        }

        saldoAcumulado += saldoDiaMinutos;
        dias.push({
          data: dataAtual,
          horasTrabalhadasMinutos,
          jornadaEsperadaMinutos: jornadaDia,
          saldoDiaMinutos,
          saldoAcumuladoMinutos: saldoAcumulado,
          observacao: obs
        });
      } else if (!temAfastamentoIntegral && regsDodia.length > 0) {
        // Fim de semana com registros: aplica multiplicador
        const entradaDia = regsDodia.find((r) => r.tipo === "ENTRADA");
        const horasTrabalhadasMinutos = this.calcHorasMinutos(regsDodia, capMs, {
          exigirIntervalo:
            !semIntervaloCategoria && !observacaoForcaSemIntervalo(entradaDia?.observacoes),
          almocoMinMin: jornadaCtx.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornadaCtx.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornadaCtx.almocoPodeIniciarAte ?? "13:00",
          horaEntrada: jornadaCtx.horaEntrada ?? "08:00",
          horaSaida: jornadaCtx.horaSaida ?? "17:00",
          toleranciaEntradaMin: jornadaCtx.toleranciaEntradaMin ?? 5,
          toleranciaSaidaMin: jornadaCtx.toleranciaEntradaMin ?? jornadaCtx.toleranciaSaidaMin ?? 5
        });
        const pct = nomeFeriado ? feriadoPct : diaSemana === 6 ? sabadoPct : domingoPct;
        const saldoDiaMinutos = Math.round((horasTrabalhadasMinutos * pct) / 100);
        const tipoLabel = nomeFeriado
          ? `Feriado: ${nomeFeriado}`
          : diaSemana === 6
            ? "Sábado"
            : "Domingo";
        saldoAcumulado += saldoDiaMinutos;
        dias.push({
          data: dataAtual,
          horasTrabalhadasMinutos,
          jornadaEsperadaMinutos: 0,
          saldoDiaMinutos,
          saldoAcumuladoMinutos: saldoAcumulado,
          observacao: `Trabalho em ${tipoLabel} (${pct}%)`
        });
      }

      const prox = new Date(year, month - 1, day);
      prox.setDate(prox.getDate() + 1);
      dataAtual = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
    }

    return { saldoAtualMinutos: saldoAcumulado, dias };
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
    const { cicloInicio, proximaZeragem, hojeIso } = await this.getCicloBancoHoras();
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
    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {
        ...(filtros.dataInicio ? { gte: new Date(filtros.dataInicio) } : {}),
        ...(filtros.dataFim ? { lte: new Date(filtros.dataFim + "T23:59:59") } : {})
      };
    }

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
      return { ...l, nomeUsuario: u?.name ?? null, emailUsuario: u?.email ?? null };
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
    const { cicloInicio, hojeIso } = await this.getCicloBancoHoras();
    const { dias: diasBanco } = await this.calcularBancoHoras(funcionarioId, cicloInicio, hojeIso);
    const diasMesBanco = diasBanco.filter((d) => d.data.startsWith(mesPrefix));

    const horasTrabalhadasMinutos = diasMesBanco.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
    const jornadaEsperadaMin = diasMesBanco.reduce((s, d) => s + d.jornadaEsperadaMinutos, 0);
    const horasExtrasMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos > 0)
      .reduce((s, d) => s + d.saldoDiaMinutos, 0);
    const horasFaltaMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos < 0)
      .reduce((s, d) => s + Math.abs(d.saldoDiaMinutos), 0);
    const saldoMinutos = diasMesBanco.reduce((s, d) => s + d.saldoDiaMinutos, 0);
    const diasTrabalhados = diasMesBanco.filter(
      (d) => d.horasTrabalhadasMinutos > 0 && d.observacao !== "Afastamento"
    ).length;

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

  private readonly TIPO_LABEL: Record<string, string> = {
    FERIAS: "Férias",
    ATESTADO: "Atestado",
    LICENCA: "Licença",
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
        ? `O gestor deu ciência (com assinatura digital) no atestado de ${funcNome} ` +
          "e o documento aguarda análise do RH.\n\nAcesse o sistema para revisar."
        : `A solicitação de ${tipoLabel} de ${funcNome} foi aprovada pelo gestor ` +
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
    const inicioStr = inicio.toLocaleDateString("pt-BR");
    const fimStr = fim.toLocaleDateString("pt-BR");
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
