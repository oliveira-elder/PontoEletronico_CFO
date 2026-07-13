import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Cron, CronExpression } from "@nestjs/schedule";
import https from "https";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";
import { ExtensionsConfigService } from "./extensions-config.service";
import {
  GERENCIA_RH_NOME_CURTO,
  GERENCIA_RH_SIGLA_PADRAO,
  GERENCIA_RH_SIGLAS,
  isGerenciaRhSlug
} from "../../common/gerencia-rh.util";
import { hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { categoriaSemRegistroPonto } from "../../utils/categoria-jornada";
import {
  ensureCategoriaHistorico,
  registrarMudancaCategoria
} from "../../utils/categoria-historico";

/* ─── Tipos da nova API ─── */
interface ApiUser {
  id: string;
  name: string;
  email: string;
  staffId: number | null;
  extension: string;
  room: string;
  floor: string;
}

interface ApiSubsection {
  id: string;
  name: string;
  users: ApiUser[];
}

interface ApiSection {
  id: string;
  name: string; // slug kebab-case, ex: "gerti", "ti-desenvolvimento"
  managers: ApiUser[];
  users: ApiUser[];
  subsections: ApiSubsection[];
}

/* Converte slug kebab-case → nome de exibição capitalizado.
   Siglas conhecidas ficam em maiúsculas; demais palavras são capitalizadas. */
const SIGLAS = new Set(["ti", "rh", "serhum", "cfo", "cpd", "gerti", "tj", "tcu"]);

function slugParaNome(slug: string): string {
  return slug
    .split("-")
    .map((w) => (SIGLAS.has(w.toLowerCase()) ? w.toUpperCase() : capitalize(w)))
    .join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slugParaSigla(slug: string): string {
  const palavras = slug.split("-");
  if (palavras.length === 1) return slug.toUpperCase().slice(0, 10);
  return palavras
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 10);
}

@Injectable()
export class ExtensionsService {
  private readonly logger = new Logger(ExtensionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly configService: ExtensionsConfigService
  ) {}

  getConfig() {
    return this.configService.getConfig();
  }

  saveConfig(input: { url: string; token?: string }) {
    return this.configService.saveConfig(input);
  }

  removePanelOverride() {
    return this.configService.removePanelOverride();
  }

  private resolveApiCredentials(override?: { url?: string; token?: string }) {
    const effective = this.configService.getEffectiveConfig();
    return {
      url: override?.url?.trim() || effective.url,
      token: override?.token !== undefined ? override.token.trim() : effective.token
    };
  }

  async fetchSections(override?: { url?: string; token?: string }): Promise<ApiSection[]> {
    const { url, token } = this.resolveApiCredentials(override);
    const response = await firstValueFrom(
      this.http.get<ApiSection[]>(url, {
        timeout: 15_000,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      })
    );
    return (response as { data: ApiSection[] }).data;
  }

  async testConnection(override?: { url?: string; token?: string }): Promise<{
    ok: boolean;
    url: string;
    sectionsCount?: number;
    usersCount?: number;
    status?: number;
    error?: string;
  }> {
    const { url } = this.resolveApiCredentials(override);
    if (!url?.trim()) {
      return { ok: false, url: "", error: "URL da API não configurada." };
    }

    try {
      const sections = await this.fetchSections(override);
      const usersCount = sections.reduce((acc, s) => {
        const vistos = new Set<string>();
        for (const u of [...s.users, ...s.subsections.flatMap((sub) => sub.users)]) {
          vistos.add(u.id);
        }
        return acc + vistos.size;
      }, 0);

      return {
        ok: true,
        url,
        sectionsCount: sections.length,
        usersCount,
        status: 200
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number }; message?: string };
      return {
        ok: false,
        url,
        status: axiosErr.response?.status,
        error: axiosErr.message ?? String(err)
      };
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncExtensionsScheduled() {
    this.logger.log("Sync automático da API Extensions iniciado.");
    await this.syncExtensions();
  }

  async syncExtensions(): Promise<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    let sections: ApiSection[] = [];
    const notMapped: string[] = [];

    try {
      sections = await this.fetchSections();
    } catch (err) {
      this.logger.error("Falha ao buscar API Extensions:", err);
      await this.prisma.syncLog.create({
        data: { source: "extensions", status: "error", details: { error: String(err) } }
      });
      return { total: 0, created: 0, updated: 0, skipped: 0, errors: 1 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let totalUsers = 0;

    for (const section of sections) {
      const todosUsuarios = this.coletarUsuariosSecao(section);
      if (todosUsuarios.length === 0 && section.managers.length === 0) continue;

      try {
        totalUsers += todosUsuarios.length;

        /* ── Upsert da Gerência ── */
        const gerencia = await this.resolveGerenciaForSection(section);

        /* ── Gestor da seção ── */
        const manager = section.managers[0] ?? null;
        if (manager) {
          const substituicaoAtiva = await this.prisma.gerenteSubstituicao.findFirst({
            where: { gerenciaId: gerencia.id, status: "ATIVA" },
            select: { id: true }
          });
          if (!substituicaoAtiva) {
            const responsavelMatricula =
              manager.staffId != null && Number.isFinite(manager.staffId)
                ? String(manager.staffId)
                : null;
            const userGerente = await this.resolveUser(manager.email);
            await this.prisma.gerencia.update({
              where: { id: gerencia.id },
              data: {
                responsavel: manager.name,
                responsavelMatricula,
                ...(userGerente ? { responsavelUserId: userGerente.id } : {})
              }
            });
          }
        }

        /* ── Usuários diretos da seção ── */
        for (const u of section.users) {
          const r = await this.syncUser(u, gerencia.id, section.name, null, section.managers);
          if (r === "created") created++;
          else if (r === "updated") updated++;
          else if (r === "skipped") {
            skipped++;
            notMapped.push(u.email);
          } else errors++;
        }

        /* ── Usuários das subseções (mantidos na Gerência pai) ── */
        for (const sub of section.subsections) {
          for (const u of sub.users) {
            const r = await this.syncUser(u, gerencia.id, section.name, sub.name, section.managers);
            if (r === "created") created++;
            else if (r === "updated") updated++;
            else if (r === "skipped") {
              skipped++;
              notMapped.push(u.email);
            } else errors++;
          }
        }

        /* ── Gestores que não aparecem em users/subsections ── */
        const emailsSincronizados = new Set(
          [
            ...section.users.map((u) => u.email),
            ...section.subsections.flatMap((s) => s.users.map((u) => u.email))
          ].filter(Boolean)
        );
        for (const m of section.managers) {
          if (emailsSincronizados.has(m.email)) continue;
          totalUsers++;
          const r = await this.syncUser(m, gerencia.id, section.name, null, section.managers);
          if (r === "created") created++;
          else if (r === "updated") updated++;
          else if (r === "skipped") {
            skipped++;
            notMapped.push(m.email);
          } else errors++;
        }
      } catch (err) {
        this.logger.error(`Erro ao processar seção "${section.name}":`, err);
        errors++;
      }
    }

    await this.prisma.syncLog.create({
      data: {
        source: "extensions",
        status: errors > 0 && updated === 0 && created === 0 ? "error" : "success",
        created,
        updated,
        skipped,
        errors,
        details: notMapped.length > 0 ? { naoMapeados: notMapped } : undefined
      }
    });

    this.logger.log(
      `Sync Extensions: ${totalUsers} usuários na API | ` +
        `${created} criados, ${updated} atualizados, ${skipped} ignorados, ${errors} erros.`
    );
    return { total: totalUsers, created, updated, skipped, errors };
  }

  /** Mapeia seções RH da API para a gerência canônica "Recursos Humanos". */
  private async resolveGerenciaForSection(section: ApiSection) {
    if (isGerenciaRhSlug(section.name)) {
      const existente = await this.prisma.gerencia.findFirst({
        where: {
          OR: [
            { nome: { equals: GERENCIA_RH_NOME_CURTO, mode: "insensitive" } },
            { nome: { contains: "recursos humanos", mode: "insensitive" } },
            { sigla: { in: [...GERENCIA_RH_SIGLAS] } }
          ]
        }
      });
      if (existente) return existente;

      return this.prisma.gerencia.create({
        data: {
          nome: GERENCIA_RH_NOME_CURTO,
          sigla: GERENCIA_RH_SIGLA_PADRAO,
          responsavel: "",
          ativa: true
        }
      });
    }

    const nomeDisplay = slugParaNome(section.name);
    const sigla = slugParaSigla(section.name);

    const gerencia = await this.prisma.gerencia.findFirst({
      where: { OR: [{ nome: nomeDisplay }, { sigla }] }
    });
    if (gerencia) return gerencia;

    return this.prisma.gerencia.create({
      data: { nome: nomeDisplay, sigla, responsavel: "", ativa: true }
    });
  }

  /** Sincroniza um único usuário da API com o banco. */
  private async syncUser(
    u: ApiUser,
    gerenciaId: string,
    sectionSlug: string,
    subsecaoSlug: string | null,
    managers: ApiUser[]
  ): Promise<"created" | "updated" | "skipped" | "error"> {
    try {
      const user = await this.resolveUser(u.email);
      if (!user) return "skipped";

      /* Atualiza emailReal se ainda não foi definido */
      if (!user.emailReal && u.email) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { emailReal: u.email }
        });
      }

      const isManagerApi = managers.some((m) => m.email === u.email);
      const existente = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });

      if (!existente) {
        /* Primeira inserção: preenche todos os campos disponíveis da API.
           Se a API indica que é gerente, já categoriza como GERENTE. */
        const matricula = u.staffId != null ? String(u.staffId) : user.id.slice(0, 12);
        try {
          const cat = isManagerApi ? ("GERENTE" as const) : ("CONCURSADO" as const);
          const hoje = hojeBrasiliaISO();
          const criado = await this.prisma.funcionario.create({
            data: {
              userId: user.id,
              matricula,
              cargo: "A definir",
              ativo: true,
              categoria: cat,
              gerenciaId,
              extensionsId: u.id,
              section: sectionSlug,
              subsecao: subsecaoSlug ?? null,
              isManager: isManagerApi,
              ramal: u.extension || null,
              sala: u.room || null,
              andar: u.floor || null,
              pontoObrigatorioDesde: categoriaSemRegistroPonto(cat)
                ? null
                : new Date(`${hoje}T12:00:00-03:00`)
            }
          });
          await this.prisma.funcionarioCategoriaHistorico.create({
            data: {
              funcionarioId: criado.id,
              categoria: cat,
              vigenciaDesde: new Date(`${hoje}T12:00:00-03:00`),
              vigenciaAte: null
            }
          });
          return "created";
        } catch {
          return "skipped";
        }
      }

      /* Em substituição ativa, não sobrescreve isManager/categoria/ativo. */
      const sobSubstituicao = await this.prisma.gerenteSubstituicao.findFirst({
        where: {
          status: "ATIVA",
          OR: [{ titularId: existente.id }, { substitutoId: existente.id }]
        },
        select: { id: true }
      });

      /* Atualização: apenas Gerência e Subseção têm prioridade da API.
         Se a API indica gerente, promove automaticamente para GERENTE.
         Nunca rebaixa categoria automaticamente (preserva edições manuais). */
      const matricula = u.staffId != null ? String(u.staffId) : existente.matricula;
      const promoverGerente = !sobSubstituicao && isManagerApi && existente.categoria !== "GERENTE";

      if (promoverGerente) {
        await this.prisma.$transaction(async (tx) => {
          await ensureCategoriaHistorico(tx, existente.id);
          await registrarMudancaCategoria(tx, existente.id, "GERENTE");
          await tx.funcionario.update({
            where: { id: existente.id },
            data: {
              matricula,
              gerenciaId,
              section: sectionSlug,
              subsecao: subsecaoSlug ?? null,
              extensionsId: u.id,
              ramal: u.extension || null,
              sala: u.room || null,
              andar: u.floor || null,
              isManager: true,
              categoria: "GERENTE"
            }
          });
        });
        return "updated";
      }

      await this.prisma.funcionario.update({
        where: { id: existente.id },
        data: {
          matricula,
          gerenciaId,
          section: sectionSlug,
          subsecao: subsecaoSlug ?? null,
          extensionsId: u.id,
          ramal: u.extension || null,
          sala: u.room || null,
          andar: u.floor || null,
          ...(sobSubstituicao
            ? {}
            : {
                isManager: isManagerApi,
                ...(isManagerApi ? { categoria: "GERENTE" as const } : {})
              })
        }
      });
      return "updated";
    } catch (err) {
      this.logger.warn(`Erro ao sincronizar usuário ${u.email}:`, err);
      return "error";
    }
  }

  /** Retorna todos os usuários únicos de uma seção (diretos + subseções). */
  private coletarUsuariosSecao(section: ApiSection): ApiUser[] {
    const vistos = new Set<string>();
    const todos: ApiUser[] = [];
    for (const u of [...section.users, ...section.subsections.flatMap((s) => s.users)]) {
      if (!vistos.has(u.id)) {
        vistos.add(u.id);
        todos.push(u);
      }
    }
    return todos;
  }

  async getLastSync() {
    return this.prisma.syncLog.findFirst({
      where: { source: "extensions" },
      orderBy: { createdAt: "desc" }
    });
  }

  /** Resolve User pelo e-mail da API (emailReal exato → prefixo SSO). */
  private async resolveUser(emailExterno: string) {
    const porEmailReal = await this.prisma.user.findFirst({
      where: { emailReal: emailExterno }
    });
    if (porEmailReal) return porEmailReal;

    const prefixo = emailExterno.split("@")[0];
    if (!prefixo) return null;

    return this.prisma.user.findFirst({
      where: { email: { startsWith: `${prefixo}@` } }
    });
  }
}
