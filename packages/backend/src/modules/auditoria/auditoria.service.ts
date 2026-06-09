import { Injectable, BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  aplicarHorarioBrasilia,
  horarioDeDataBrasilia,
  validarHorarioPermitido
} from "../../utils/horario-brasilia";
import { appendObservacao, criarObservacaoAjuste } from "../../utils/registro-observacoes";

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
  constructor(private readonly prisma: PrismaService) {}

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

  /* ─── Dashboard ─── */

  async getDashboard() {
    const hoje = new Date();
    const inicioHoje = this.startOfDay(hoje);
    const fimHoje = this.endOfDay(hoje);

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
    for (const [, tipo] of estadoPorFunc) {
      if (tipo === "ENTRADA" || tipo === "FIM_INTERVALO") trabalhando++;
      else if (tipo === "INICIO_INTERVALO") emIntervalo++;
    }

    /* Afastamentos ativos hoje */
    const afastamentosAtivos = await this.prisma.afastamento.count({
      where: {
        dataInicio: { lte: fimHoje },
        dataFim: { gte: inicioHoje }
      }
    });

    /* Registros dos últimos 7 dias (agrupado por dia) */
    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
    seteDiasAtras.setHours(0, 0, 0, 0);

    const registros7d = await this.prisma.registroPonto.findMany({
      where: { dataHora: { gte: seteDiasAtras } },
      select: { dataHora: true, tipo: true }
    });

    const porDia: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(seteDiasAtras);
      d.setDate(d.getDate() + i);
      porDia[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of registros7d) {
      const key = r.dataHora.toISOString().slice(0, 10);
      if (key in porDia && r.tipo === "ENTRADA") porDia[key]++;
    }
    const registrosPorDia = Object.entries(porDia).map(([data, entradas]) => ({ data, entradas }));

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

    return {
      totalFuncionarios,
      funcionariosAtivos,
      registrosHoje,
      trabalhando,
      emIntervalo,
      solicitacoesPendentes,
      afastamentosAtivos,
      periodosAbertos,
      periodosFechados,
      periodosAprovados,
      registrosPorDia,
      ultimosLogs,
      origens: toOrigem(origens),
      /* Uso por canal — período completo */
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

  /* ─── Funcionários ─── */

  async getFuncionarios(filtros: {
    busca?: string;
    gerenciaId?: string;
    ativo?: boolean;
    mes?: number;
    ano?: number;
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

    const mes = filtros.mes ?? new Date().getMonth() + 1;
    const ano = filtros.ano ?? new Date().getFullYear();

    /* Buscar período atual para cada funcionário */
    const periodos = (await this.prisma.periodoPonto.findMany({
      where: {
        mes,
        ano,
        funcionarioId: { in: funcionarios.map((f) => f.id) }
      }
    })) as PeriodoPontoRaw[];
    const periodosMap = new Map<string, PeriodoPontoRaw>(periodos.map((p) => [p.funcionarioId, p]));

    /* Último registro de cada funcionário */
    const ids = funcionarios.map((f) => f.id);
    const ultimosRegistros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId: { in: ids } },
      orderBy: { dataHora: "desc" },
      distinct: ["funcionarioId"],
      select: { funcionarioId: true, tipo: true, dataHora: true, origem: true }
    });
    const ultimosMap = new Map(
      ultimosRegistros.map((r) => [r.funcionarioId, r] as [string, typeof r])
    );

    /* Solicitações pendentes por funcionário */
    const pendentes = await this.prisma.solicitacao.groupBy({
      by: ["funcionarioId"],
      where: { status: "PENDENTE", funcionarioId: { in: ids } },
      _count: { _all: true }
    });
    const pendentesMap = new Map(
      pendentes.map((p) => [p.funcionarioId, p._count._all] as [string, number])
    );

    return funcionarios.map((f) => ({
      id: f.id,
      matricula: f.matricula,
      cargo: f.cargo,
      departamento: f.departamento,
      categoria: f.categoria,
      ativo: f.ativo,
      jornadaHorasDia: f.jornadaHorasDia,
      createdAt: f.createdAt,
      user: f.user,
      gerencia: f.gerencia,
      totalRegistros: f._count.registros,
      totalSolicitacoes: f._count.solicitacoes,
      totalAfastamentos: f._count.afastamentos,
      periodo: periodosMap.get(f.id) ?? null,
      periodoFormatado: periodosMap.get(f.id)
        ? {
            horasTrabalhadas: this.formatMinutes(periodosMap.get(f.id)!.horasTrabalhadasMinutos),
            horasExtras: this.formatMinutes(periodosMap.get(f.id)!.horasExtrasMinutos),
            horasFalta: this.formatMinutes(periodosMap.get(f.id)!.horasFaltaMinutos),
            status: periodosMap.get(f.id)!.status
          }
        : null,
      ultimoRegistro: ultimosMap.get(f.id) ?? null,
      solicitacoesPendentes: pendentesMap.get(f.id) ?? 0
    }));
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
    filtros: { mes?: number; ano?: number; tipo?: string }
  ) {
    const mes = filtros.mes ?? new Date().getMonth() + 1;
    const ano = filtros.ano ?? new Date().getFullYear();
    const inicio = new Date(ano, mes - 1, 1, 0, 0, 0);
    const fim = new Date(ano, mes, 0, 23, 59, 59);

    const where: Record<string, unknown> = {
      funcionarioId,
      dataHora: { gte: inicio, lte: fim }
    };
    if (filtros.tipo) where.tipo = filtros.tipo;

    return this.prisma.registroPonto.findMany({
      where,
      orderBy: { dataHora: "asc" }
    });
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
    };

    // Super admin vê todos os funcionários ativos sem restrição
    if (isSuperAdmin) {
      return this.prisma.funcionario.findMany({
        where: { ativo: true },
        include: includeBase,
        orderBy: { createdAt: "asc" }
      });
    }

    const user = await this.prisma.user.findFirst({ where: { externalId: keycloakSub } });
    if (!user) return [];

    // Fluxo principal: gerência vinculada via responsavelUserId
    const gerencias = await this.prisma.gerencia.findMany({
      where: { responsavelUserId: user.id }
    });
    if (gerencias.length) {
      return this.prisma.funcionario.findMany({
        where: { gerenciaId: { in: gerencias.map((g) => g.id) }, ativo: true },
        include: includeBase
      });
    }

    // PROVISÓRIO: ativa o fallback se o usuário tem isManager=true no DB (via sync da API Extensions)
    // OU se possui o papel GESTOR_APROVACAO/gestor no Keycloak (mas ainda não passou pelo sync).
    // Remover quando gerências estiverem configuradas via responsavelUserId.
    const funcGestor = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      select: { isManager: true, section: true }
    });

    const ehGestorProvisorio = funcGestor?.isManager || temRoleGestor; // PROVISÓRIO

    if (ehGestorProvisorio) {
      return this.prisma.funcionario.findMany({
        where: {
          isManager: false,
          ativo: true,
          section: "TI - Desenvolvimento", // PROVISÓRIO: hardcoded — remover quando gerências estiverem configuradas
          NOT: { userId: user.id }
        },
        include: includeBase
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
    isSuperAdmin = false
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
    const novoStatus = decisao === "APROVAR" ? "AGUARDANDO_RH" : "REJEITADA_GESTOR";

    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        status: novoStatus,
        gestorUserId: user?.id,
        gestorObservacao: observacao,
        gestorResolvidoEm: new Date()
      }
    });
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

    const where: Record<string, unknown> = { status: "AGUARDANDO_RH" };
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
    const agora = new Date();

    if (decisao === "REJEITAR") {
      return this.prisma.solicitacao.update({
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
    }

    // Aprovar: aplicar a mudança conforme o tipo
    await this.aplicarMudancaSolicitacao(solicitacao, keycloakSub);

    return this.prisma.solicitacao.update({
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
    },
    rhKeycloakSub: string
  ) {
    const tipo = solicitacao.tipo;
    const funcId = solicitacao.funcionarioId;
    const meta = (solicitacao.metadados ?? {}) as Record<string, unknown>;
    const ref = solicitacao.dataInicio ?? solicitacao.dataReferencia;
    const fim = solicitacao.dataFim ?? ref;
    const obs = `Aprovado via solicitação #${solicitacao.id}`;

    if (tipo === "CORRECAO_PONTO") {
      const acao = meta.acao as string;
      const horario = meta.horarioSolicitado as string;
      const tipoRegistro = (meta.tipoRegistro as string) ?? "ENTRADA";
      const limites = await this.obterLimitesHorarioPonto();
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
              observacao: obs,
              observacoes: observacoes as unknown as Prisma.InputJsonValue
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
            observacao: obs,
            observacoes: [novaObs] as unknown as Prisma.InputJsonValue
          }
        });
      }
    } else if (tipo === "FERIAS") {
      await this.prisma.afastamento.create({
        data: {
          funcionarioId: funcId,
          tipo: "FERIAS",
          dataInicio: ref,
          dataFim: fim,
          justificativa: solicitacao.descricao || obs,
          aprovadoPor: rhKeycloakSub
        }
      });
    } else if (tipo === "ATESTADO") {
      await this.prisma.afastamento.create({
        data: {
          funcionarioId: funcId,
          tipo: "ATESTADO",
          dataInicio: ref,
          dataFim: fim,
          justificativa: solicitacao.descricao || obs,
          aprovadoPor: rhKeycloakSub
        }
      });
    } else if (tipo === "LICENCA") {
      await this.prisma.afastamento.create({
        data: {
          funcionarioId: funcId,
          tipo: "LICENCA_MEDICA",
          dataInicio: ref,
          dataFim: fim,
          justificativa: solicitacao.descricao || obs,
          aprovadoPor: rhKeycloakSub
        }
      });
    }
    // ABONO: apenas registrado como aprovado; não há ação automática adicional
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

    const [total, afastamentos] = await Promise.all([
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
              user: { select: { name: true, email: true } },
              gerencia: { select: { nome: true, sigla: true } }
            }
          }
        }
      })
    ]);

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
    return this.prisma.periodoPonto.update({
      where: { id },
      data: {
        status,
        ...(status === "FECHADO" ? { fechadoEm: new Date() } : {}),
        ...(status === "APROVADO" ? { aprovadoPor } : {})
      }
    });
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

  async getRelatorioMensal(funcionarioId: string, mes: number, ano: number) {
    const func = await this.prisma.funcionario.findUniqueOrThrow({
      where: { id: funcionarioId },
      include: { user: true, gerencia: true }
    });

    const inicio = new Date(ano, mes - 1, 1, 0, 0, 0);
    const fim = new Date(ano, mes, 0, 23, 59, 59);

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

    /* Agrupar registros por dia */
    const porDia = new Map<string, typeof registros>();
    for (const r of registros) {
      const key = r.dataHora.toISOString().slice(0, 10);
      if (!porDia.has(key)) porDia.set(key, []);
      porDia.get(key)!.push(r);
    }

    const diasDetalhados = Array.from(porDia.entries()).map(([data, regs]) => {
      let minutos = 0;
      let entrada: Date | null = null;
      for (const r of regs) {
        if (r.tipo === "ENTRADA") entrada = r.dataHora;
        else if ((r.tipo === "INICIO_INTERVALO" || r.tipo === "SAIDA") && entrada) {
          minutos += Math.round((r.dataHora.getTime() - entrada.getTime()) / 60000);
          entrada = null;
        } else if (r.tipo === "FIM_INTERVALO") entrada = r.dataHora;
      }
      return {
        data,
        registros: regs,
        horasTrabalhadasMinutos: minutos,
        horasTrabalhadasFormatado: this.formatMinutes(minutos)
      };
    });

    const totalMinutos = diasDetalhados.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
    const diasTrabalhados = diasDetalhados.filter((d) => d.horasTrabalhadasMinutos > 0).length;
    const jornadaEsperadaMin = diasTrabalhados * func.jornadaHorasDia * 60;
    const saldo = totalMinutos - jornadaEsperadaMin;

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
      horasTrabalhadasMinutos: totalMinutos,
      horasTrabalhadasFormatado: this.formatMinutes(totalMinutos),
      jornadaEsperadaMinutos: jornadaEsperadaMin,
      jornadaEsperadaFormatado: this.formatMinutes(jornadaEsperadaMin),
      horasExtrasMinutos: Math.max(0, saldo),
      horasExtrasFormatado: this.formatMinutes(Math.max(0, saldo)),
      horasFaltaMinutos: Math.max(0, -saldo),
      horasFaltaFormatado: this.formatMinutes(Math.max(0, -saldo)),
      saldoMinutos: saldo,
      saldoFormatado: this.formatMinutes(saldo),
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
}
