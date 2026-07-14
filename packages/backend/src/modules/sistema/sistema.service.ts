import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificacaoService } from "../notificacao/notificacao.service";
import {
  findGerenciaGerti,
  isGerenciaGerti,
  isGerenciaGertiSlug
} from "../../common/gerencia-gerti.util";
import { findGerenciaRh } from "../../common/gerencia-rh.util";
import { isSuperAdminIdentity, superAdminUsernamesFromEnv } from "../../utils/super-admin";
import { dataBrasiliaISO } from "../../utils/horario-brasilia";

const SUPER_ADMINS_ENV = superAdminUsernamesFromEnv(process.env.SUPER_ADMIN_USERNAMES);

type Destinatario = {
  externalId: string | null;
  email: string | null;
  emailReal?: string | null;
};

@Injectable()
export class SistemaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacao: NotificacaoService
  ) {}

  /* ─── Helpers ─── */

  private async getDataInicioProducao(): Promise<string | null> {
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { dataInicioProducao: true }
    });
    return cfg?.dataInicioProducao ? dataBrasiliaISO(cfg.dataInicioProducao) : null;
  }

  private async findGerenciaByKind(kind: "gerti" | "rh") {
    const gerencias = await this.prisma.gerencia.findMany({
      where: { ativa: true },
      select: {
        id: true,
        nome: true,
        sigla: true,
        responsavelUserId: true
      }
    });
    return kind === "gerti" ? findGerenciaGerti(gerencias) : findGerenciaRh(gerencias);
  }

  /** Responsável titular ou substituto ativo da gerência. */
  private async resolveAprovadoresUserIds(gerenciaId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const g = await this.prisma.gerencia.findUnique({
      where: { id: gerenciaId },
      select: { responsavelUserId: true }
    });
    if (g?.responsavelUserId) ids.add(g.responsavelUserId);

    const hoje = new Date();
    const substitutos = await this.prisma.gerenteSubstituicao.findMany({
      where: {
        gerenciaId,
        status: "ATIVA",
        dataInicio: { lte: hoje },
        dataFim: { gte: hoje }
      },
      select: {
        substituto: { select: { userId: true } }
      }
    });
    for (const s of substitutos) {
      if (s.substituto?.userId) ids.add(s.substituto.userId);
    }
    return ids;
  }

  private async userToDest(userId: string): Promise<Destinatario | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        externalId: true,
        email: true,
        emailReal: true,
        funcionario: { select: { matricula: true } }
      }
    });
    if (!u) return null;
    return this.enriquecerEmailDest(u);
  }

  /** Prefere emailReal; se só houver e-mail SSO mascarado, deriva matricula@domínio. */
  private enriquecerEmailDest(u: {
    externalId: string | null;
    email: string | null;
    emailReal?: string | null;
    funcionario?: { matricula?: string | null } | null;
  }): Destinatario {
    const fake = new Set(["sso.local", "pending.local"]);
    let emailReal = u.emailReal ?? null;
    if (!emailReal) {
      const domain = (u.email ?? "").split("@")[1]?.toLowerCase() ?? "";
      const local =
        u.funcionario?.matricula?.trim() || (u.email?.includes("@") ? u.email.split("@")[0] : null);
      if (local && fake.has(domain)) {
        emailReal = `${local}@${process.env.REAL_EMAIL_DOMAIN ?? "cfo.org.br"}`;
      }
    }
    return {
      externalId: u.externalId,
      email: u.email,
      emailReal
    };
  }

  private async destResponsavelGerencia(kind: "gerti" | "rh"): Promise<Destinatario[]> {
    const g = await this.findGerenciaByKind(kind);
    const dests: Destinatario[] = [];
    const seen = new Set<string>();

    const push = (d: Destinatario | null | undefined) => {
      if (!d) return;
      const key = d.externalId ?? d.emailReal ?? d.email ?? "";
      if (!key || seen.has(key)) return;
      seen.add(key);
      dests.push(d);
    };

    if (g) {
      const ids = await this.resolveAprovadoresUserIds(g.id);
      for (const id of ids) {
        push(await this.userToDest(id));
      }
    }

    /* Fallback: gestores isManager da gerência / seção. */
    if (dests.length === 0) {
      const whereOr: Array<Record<string, unknown>> = [];
      if (g) whereOr.push({ gerenciaId: g.id });
      if (kind === "gerti") {
        whereOr.push({ section: { equals: "gerti", mode: "insensitive" } });
      }
      if (whereOr.length > 0) {
        const funcs = await this.prisma.funcionario.findMany({
          where: { ativo: true, isManager: true, OR: whereOr },
          select: {
            matricula: true,
            user: { select: { externalId: true, email: true, emailReal: true } }
          }
        });
        for (const f of funcs) {
          if (f.user) {
            push(
              this.enriquecerEmailDest({
                ...f.user,
                funcionario: { matricula: f.matricula }
              })
            );
          }
        }
      }
    }

    /* RH: se ainda vazio, notifica usuários da gerência RH (mesmo padrão de outras notifs). */
    if (kind === "rh" && dests.length === 0) {
      const rh = await this.notificacao.getUsuariosRh();
      for (const d of rh) push(d);
    }

    if (dests.length === 0) {
      // log via silent — dispararEvento já loga lista vazia; reforço no caller
    }

    return dests;
  }

  private isEnvSuperAdmin(
    user: {
      email: string;
      emailReal?: string | null;
      funcionario?: { matricula?: string | null } | null;
    },
    usernameHint?: string
  ): boolean {
    return isSuperAdminIdentity(
      SUPER_ADMINS_ENV,
      usernameHint,
      user.email,
      user.emailReal,
      user.funcionario?.matricula
    );
  }

  private assertMesReferencia(mes: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      throw new BadRequestException("Mês de referência inválido. Use o formato YYYY-MM.");
    }
  }

  private diaAnteriorAoMes(mesReferencia: string): string {
    const [y, m] = mesReferencia.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    d.setUTCDate(d.getUTCDate() - 1);
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  private primeiroDiaMes(mesReferencia: string): Date {
    return new Date(`${mesReferencia}-01T00:00:00.000Z`);
  }

  /* ─── Super Admin ─── */

  async listarSuperAdmins() {
    const concessoes = await this.prisma.superAdminConcessao.findMany({
      where: { ativo: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailReal: true,
            externalId: true,
            funcionario: {
              select: {
                matricula: true,
                section: true,
                gerencia: { select: { nome: true, sigla: true } }
              }
            }
          }
        },
        concedidoPor: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const nativos: Array<{
      fonte: "env";
      username: string;
      userId: string | null;
      name: string | null;
      email: string | null;
    }> = [];

    for (const username of SUPER_ADMINS_ENV) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: { startsWith: `${username}@`, mode: "insensitive" } },
            { emailReal: { startsWith: `${username}@`, mode: "insensitive" } },
            { funcionario: { matricula: { equals: username, mode: "insensitive" } } }
          ]
        },
        select: { id: true, name: true, email: true, emailReal: true }
      });
      nativos.push({
        fonte: "env",
        username,
        userId: user?.id ?? null,
        name: user?.name ?? null,
        email: user?.emailReal ?? user?.email ?? null
      });
    }

    return {
      nativos,
      concedidos: concessoes.map((c) => ({
        fonte: "db" as const,
        id: c.id,
        userId: c.userId,
        name: c.user.name,
        email: c.user.emailReal ?? c.user.email,
        gerencia: c.user.funcionario?.gerencia?.nome ?? c.user.funcionario?.section ?? null,
        concedidoPor: c.concedidoPor.name,
        createdAt: c.createdAt
      }))
    };
  }

  async listarCandidatosGerti() {
    const funcs = await this.prisma.funcionario.findMany({
      where: { ativo: true },
      select: {
        id: true,
        matricula: true,
        cargo: true,
        section: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            emailReal: true,
            superAdminConcessao: { select: { id: true, ativo: true } }
          }
        },
        gerencia: { select: { nome: true, sigla: true } }
      },
      orderBy: { user: { name: "asc" } }
    });

    return funcs
      .filter((f) => {
        const gerti =
          (f.gerencia && isGerenciaGerti(f.gerencia)) ||
          (f.section ? isGerenciaGertiSlug(f.section) : false);
        if (!gerti || !f.user) return false;
        if (f.user.superAdminConcessao?.ativo) return false;
        if (this.isEnvSuperAdmin(f.user, f.matricula ?? undefined)) return false;
        return true;
      })
      .map((f) => ({
        userId: f.user!.id,
        funcionarioId: f.id,
        name: f.user!.name,
        email: f.user!.emailReal ?? f.user!.email,
        matricula: f.matricula,
        cargo: f.cargo,
        gerencia: f.gerencia?.nome ?? f.section
      }));
  }

  async concederSuperAdmin(atorUserId: string, targetUserId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        emailReal: true,
        externalId: true,
        funcionario: {
          select: {
            matricula: true,
            section: true,
            ativo: true,
            gerencia: { select: { nome: true, sigla: true } }
          }
        },
        superAdminConcessao: true
      }
    });
    if (!target) throw new NotFoundException("Usuário não encontrado.");
    if (!target.funcionario?.ativo) {
      throw new BadRequestException("Funcionário inativo não pode receber Super Admin.");
    }

    const gerti =
      (target.funcionario.gerencia && isGerenciaGerti(target.funcionario.gerencia)) ||
      (target.funcionario.section ? isGerenciaGertiSlug(target.funcionario.section) : false);
    if (!gerti) {
      throw new BadRequestException(
        "Somente usuários da GERTI podem receber permissão de Super Administrador."
      );
    }

    if (this.isEnvSuperAdmin(target, target.funcionario.matricula ?? undefined)) {
      throw new BadRequestException("Este usuário já é Super Admin nativo (env).");
    }

    if (target.superAdminConcessao?.ativo) {
      throw new BadRequestException("Este usuário já possui concessão ativa de Super Admin.");
    }

    const concessao = target.superAdminConcessao
      ? await this.prisma.superAdminConcessao.update({
          where: { id: target.superAdminConcessao.id },
          data: {
            ativo: true,
            concedidoPorUserId: atorUserId,
            revogadoAt: null,
            revogadoPorUserId: null
          }
        })
      : await this.prisma.superAdminConcessao.create({
          data: {
            userId: targetUserId,
            concedidoPorUserId: atorUserId,
            ativo: true
          }
        });

    const dests = [
      ...(await this.destResponsavelGerencia("gerti")),
      ...(await this.destResponsavelGerencia("rh")),
      this.enriquecerEmailDest({
        externalId: target.externalId,
        email: target.email,
        emailReal: target.emailReal,
        funcionario: target.funcionario
      })
    ];

    await this.notificacao.garantirEventosCriticos();

    await this.notificacao.dispararEvento(
      "SUPER_ADMIN_CONCEDIDO",
      "Super Administrador concedido",
      `${target.name} (${target.emailReal ?? target.email}) recebeu permissão de Super Administrador do sistema de ponto.`,
      dests
    );

    return concessao;
  }

  async revogarSuperAdmin(atorUserId: string, targetUserId: string) {
    const concessao = await this.prisma.superAdminConcessao.findUnique({
      where: { userId: targetUserId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            emailReal: true,
            externalId: true,
            funcionario: { select: { matricula: true } }
          }
        }
      }
    });
    if (!concessao || !concessao.ativo) {
      throw new NotFoundException("Concessão ativa não encontrada.");
    }
    if (this.isEnvSuperAdmin(concessao.user, concessao.user.funcionario?.matricula ?? undefined)) {
      throw new BadRequestException("Não é possível revogar Super Admin nativo (env).");
    }

    const updated = await this.prisma.superAdminConcessao.update({
      where: { id: concessao.id },
      data: {
        ativo: false,
        revogadoAt: new Date(),
        revogadoPorUserId: atorUserId
      }
    });

    const dests = [
      ...(await this.destResponsavelGerencia("gerti")),
      ...(await this.destResponsavelGerencia("rh")),
      this.enriquecerEmailDest(concessao.user)
    ];

    await this.notificacao.garantirEventosCriticos();

    await this.notificacao.dispararEvento(
      "SUPER_ADMIN_REVOGADO",
      "Super Administrador revogado",
      `A permissão de Super Administrador de ${concessao.user.name} foi revogada.`,
      dests
    );

    return updated;
  }

  /* ─── Start do sistema ─── */

  async getStartStatus() {
    const dataInicioProducao = await this.getDataInicioProducao();
    const pendente = await this.prisma.sistemaStartSolicitacao.findFirst({
      where: { status: { in: ["AGUARDANDO_GERTI", "AGUARDANDO_RH"] } },
      orderBy: { createdAt: "desc" },
      include: {
        solicitadoPor: { select: { id: true, name: true, email: true } }
      }
    });
    const historico = await this.prisma.sistemaStartSolicitacao.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        solicitadoPor: { select: { id: true, name: true, email: true } }
      }
    });
    return { dataInicioProducao, pendente, historico };
  }

  async getPendenciasAprovacao(userId: string) {
    const gerti = await this.findGerenciaByKind("gerti");
    const rh = await this.findGerenciaByKind("rh");
    const podeGerti = gerti ? (await this.resolveAprovadoresUserIds(gerti.id)).has(userId) : false;
    const podeRh = rh ? (await this.resolveAprovadoresUserIds(rh.id)).has(userId) : false;

    const itens = [];
    if (podeGerti) {
      const s = await this.prisma.sistemaStartSolicitacao.findFirst({
        where: { status: "AGUARDANDO_GERTI" },
        include: { solicitadoPor: { select: { id: true, name: true, email: true } } }
      });
      if (s) itens.push({ ...s, etapa: "GERTI" as const });
    }
    if (podeRh) {
      const s = await this.prisma.sistemaStartSolicitacao.findFirst({
        where: { status: "AGUARDANDO_RH" },
        include: { solicitadoPor: { select: { id: true, name: true, email: true } } }
      });
      if (s) itens.push({ ...s, etapa: "RH" as const });
    }
    return itens;
  }

  async solicitarStart(atorUserId: string, mesReferencia: string, observacao?: string) {
    this.assertMesReferencia(mesReferencia);

    const pendente = await this.prisma.sistemaStartSolicitacao.findFirst({
      where: { status: { in: ["AGUARDANDO_GERTI", "AGUARDANDO_RH"] } }
    });
    if (pendente) {
      throw new BadRequestException(
        "Já existe uma solicitação de Start em andamento. Aguarde a conclusão ou rejeição."
      );
    }

    const gerti = await this.findGerenciaByKind("gerti");
    if (!gerti?.responsavelUserId) {
      throw new BadRequestException(
        "Não há responsável cadastrado na gerência GERTI para aprovar o Start."
      );
    }

    const sol = await this.prisma.sistemaStartSolicitacao.create({
      data: {
        mesReferencia,
        status: "AGUARDANDO_GERTI",
        solicitadoPorUserId: atorUserId,
        observacaoSolicitante: observacao?.trim() || null
      },
      include: { solicitadoPor: { select: { name: true, email: true } } }
    });

    await this.notificacao.garantirEventosCriticos();

    await this.notificacao.dispararEvento(
      "SISTEMA_START_SOLICITADO",
      "Start do sistema — aguardando aprovação GERTI",
      `Foi solicitada a inicialização de produção do ponto eletrônico a partir de ${mesReferencia}. ` +
        `Solicitante: ${sol.solicitadoPor.name}. Acesse Aprovações para decidir.`,
      await this.destResponsavelGerencia("gerti")
    );

    return sol;
  }

  async aprovarGerti(atorUserId: string, id: string, observacao?: string) {
    const gerti = await this.findGerenciaByKind("gerti");
    if (!gerti || !(await this.resolveAprovadoresUserIds(gerti.id)).has(atorUserId)) {
      throw new ForbiddenException("Apenas o responsável da GERTI pode aprovar esta etapa.");
    }

    const sol = await this.prisma.sistemaStartSolicitacao.findUnique({ where: { id } });
    if (!sol) throw new NotFoundException("Solicitação não encontrada.");
    if (sol.status !== "AGUARDANDO_GERTI") {
      throw new BadRequestException("Solicitação não está aguardando aprovação da GERTI.");
    }

    const rh = await this.findGerenciaByKind("rh");
    if (!rh?.responsavelUserId) {
      throw new BadRequestException(
        "Não há responsável cadastrado na gerência de RH para a segunda aprovação."
      );
    }

    const updated = await this.prisma.sistemaStartSolicitacao.update({
      where: { id },
      data: {
        status: "AGUARDANDO_RH",
        aprovadoGertiPorUserId: atorUserId,
        aprovadoGertiEm: new Date(),
        observacaoGerti: observacao?.trim() || null
      },
      include: {
        solicitadoPor: { select: { name: true, email: true, externalId: true, emailReal: true } }
      }
    });

    await this.notificacao.garantirEventosCriticos();

    await this.notificacao.dispararEvento(
      "SISTEMA_START_AGUARDANDO_RH",
      "Start do sistema — aguardando aprovação do RH",
      `A GERTI aprovou o Start para ${updated.mesReferencia}. Aguardando aprovação do responsável de RH.`,
      await this.destResponsavelGerencia("rh")
    );

    return updated;
  }

  async aprovarRh(atorUserId: string, id: string, observacao?: string) {
    const rh = await this.findGerenciaByKind("rh");
    if (!rh || !(await this.resolveAprovadoresUserIds(rh.id)).has(atorUserId)) {
      throw new ForbiddenException("Apenas o responsável de RH pode aprovar esta etapa.");
    }

    const sol = await this.prisma.sistemaStartSolicitacao.findUnique({
      where: { id },
      include: {
        solicitadoPor: {
          select: { name: true, email: true, emailReal: true, externalId: true }
        }
      }
    });
    if (!sol) throw new NotFoundException("Solicitação não encontrada.");
    if (sol.status !== "AGUARDANDO_RH") {
      throw new BadRequestException("Solicitação não está aguardando aprovação do RH.");
    }

    return this.executarStart(sol, atorUserId, observacao);
  }

  private async executarStart(
    sol: {
      id: string;
      mesReferencia: string;
      solicitadoPor: Destinatario & { name?: string };
    },
    aprovadorRhUserId: string,
    observacao?: string
  ) {
    const diaMarco = this.diaAnteriorAoMes(sol.mesReferencia);
    const dataInicio = this.primeiroDiaMes(sol.mesReferencia);
    const descricao = `Start do sistema — go-live ${sol.mesReferencia}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const existente = await tx.bancoHorasMarco.findUnique({
        where: { data: new Date(diaMarco) }
      });
      const marco =
        existente ??
        (await tx.bancoHorasMarco.create({
          data: { data: new Date(diaMarco), descricao }
        }));

      await tx.configuracaoSistema.upsert({
        where: { id: "singleton" },
        create: {
          id: "singleton",
          dataInicioProducao: dataInicio
        },
        update: { dataInicioProducao: dataInicio }
      });

      return tx.sistemaStartSolicitacao.update({
        where: { id: sol.id },
        data: {
          status: "EXECUTADO",
          aprovadoRhPorUserId: aprovadorRhUserId,
          aprovadoRhEm: new Date(),
          observacaoRh: observacao?.trim() || null,
          executadoEm: new Date(),
          marcoId: marco.id
        }
      });
    });

    const dests = [
      ...(await this.destResponsavelGerencia("gerti")),
      ...(await this.destResponsavelGerencia("rh")),
      {
        externalId: sol.solicitadoPor.externalId,
        email: sol.solicitadoPor.email,
        emailReal: sol.solicitadoPor.emailReal
      }
    ];

    await this.notificacao.garantirEventosCriticos();

    await this.notificacao.dispararEvento(
      "SISTEMA_START_APROVADO",
      "Start do sistema executado",
      `O sistema de ponto entrou em produção a partir de ${sol.mesReferencia}. ` +
        `Banco de horas reiniciado (marco ${diaMarco}). Histórico de teste permanece acessível apenas a Super Administradores.`,
      dests
    );

    return result;
  }

  async rejeitar(atorUserId: string, id: string, observacao?: string) {
    const sol = await this.prisma.sistemaStartSolicitacao.findUnique({
      where: { id },
      include: {
        solicitadoPor: {
          select: { name: true, email: true, emailReal: true, externalId: true }
        }
      }
    });
    if (!sol) throw new NotFoundException("Solicitação não encontrada.");
    if (sol.status !== "AGUARDANDO_GERTI" && sol.status !== "AGUARDANDO_RH") {
      throw new BadRequestException("Solicitação não está pendente de aprovação.");
    }

    if (sol.status === "AGUARDANDO_GERTI") {
      const gerti = await this.findGerenciaByKind("gerti");
      if (!gerti || !(await this.resolveAprovadoresUserIds(gerti.id)).has(atorUserId)) {
        throw new ForbiddenException("Apenas o responsável da GERTI pode rejeitar nesta etapa.");
      }
    } else {
      const rh = await this.findGerenciaByKind("rh");
      if (!rh || !(await this.resolveAprovadoresUserIds(rh.id)).has(atorUserId)) {
        throw new ForbiddenException("Apenas o responsável de RH pode rejeitar nesta etapa.");
      }
    }

    const status = sol.status === "AGUARDANDO_GERTI" ? "REJEITADA_GERTI" : "REJEITADA_RH";
    const updated = await this.prisma.sistemaStartSolicitacao.update({
      where: { id },
      data: {
        status,
        rejeitadoPorUserId: atorUserId,
        rejeitadoEm: new Date(),
        observacaoRejeicao: observacao?.trim() || null
      }
    });

    await this.notificacao.garantirEventosCriticos();

    await this.notificacao.dispararEvento(
      "SISTEMA_START_REJEITADO",
      "Start do sistema rejeitado",
      `A solicitação de Start para ${sol.mesReferencia} foi rejeitada` +
        (observacao?.trim() ? `: ${observacao.trim()}` : "."),
      [
        {
          externalId: sol.solicitadoPor.externalId,
          email: sol.solicitadoPor.email,
          emailReal: sol.solicitadoPor.emailReal
        },
        ...(await this.destResponsavelGerencia("gerti")),
        ...(await this.destResponsavelGerencia("rh"))
      ]
    );

    return updated;
  }
}
