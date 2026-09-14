import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import https from "https";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";
import { ExtensionsConfigService } from "./extensions-config.service";
import {
  GERENCIA_RH_SIGLA_PADRAO,
  isGerenciaRh,
  isGerenciaRhSlug
} from "../../common/gerencia-rh.util";
import {
  GERENCIA_GERTI_NOME,
  isGerenciaGerti,
  isGerenciaGertiSlug
} from "../../common/gerencia-gerti.util";
import { hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { funcionarioSemRegistroPonto } from "../../utils/categoria-jornada";

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

/* Converte slug kebab-case → nome de exibição.
   Siglas conhecidas ficam em maiúsculas; preposições ficam minúsculas. */
const SIGLAS = new Set(["ti", "rh", "serhum", "cfo", "cpd", "gerti", "tj", "tcu"]);
const PREPOSICOES = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "a",
  "as",
  "o",
  "os",
  "ao",
  "aos",
  "por",
  "para",
  "com",
  "sem",
  "sob",
  "sobre"
]);

function slugParaNome(slug: string): string {
  return slug
    .split("-")
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (SIGLAS.has(lower)) return lower.toUpperCase();
      if (i > 0 && PREPOSICOES.has(lower)) return lower;
      return capitalize(lower);
    })
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

function normTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function protocolFallback(url: string): string | null {
  if (url.startsWith("https://")) return `http://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `https://${url.slice("http://".length)}`;
  return null;
}

function emailEhMascaraSso(email: string | null | undefined): boolean {
  const dominio = (email ?? "").split("@")[1]?.toLowerCase() ?? "";
  return dominio === "sso.local" || dominio === "pending.local";
}

function matriculaPareceLogin(matricula: string | null | undefined): boolean {
  const m = (matricula ?? "").trim();
  if (!m) return true;
  return /[a-zA-Z._-]/.test(m) && !/^\d+$/.test(m);
}

/** Matrícula fantasma gerada por uma versão antiga do sync (derivada do id/UUID da API,
 *  não do staffId real). Usada para detectar e corrigir registros antigos afetados. */
function matriculaFantasmaDoId(apiId: string): string {
  return apiId.replace(/-/g, "").slice(0, 12);
}

function matchApiUser(u: ApiUser, query: string, prefixo: string): boolean {
  const email = u.email?.trim().toLowerCase() ?? "";
  if (!email) return false;
  if (email === query) return true;
  return email.split("@")[0] === prefixo;
}

export type ExtensionsUserLookup = {
  found: boolean;
  name?: string;
  email?: string;
  staffId?: number | null;
  extension?: string;
  room?: string;
  floor?: string;
  section?: string;
  subsection?: string | null;
  isManager?: boolean;
  gerenciaId?: string | null;
  gerenciaNome?: string | null;
};

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

  private async requestSections(url: string, token: string): Promise<ApiSection[]> {
    const isHttps = url.toLowerCase().startsWith("https:");
    const response = await firstValueFrom(
      this.http.get<ApiSection[]>(url, {
        timeout: 15_000,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(isHttps ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {})
      })
    );
    const data = (response as { data: ApiSection[] }).data;
    if (!Array.isArray(data)) {
      throw new Error("Resposta da API de seções não é uma lista.");
    }
    return data;
  }

  async fetchSections(override?: { url?: string; token?: string }): Promise<ApiSection[]> {
    const { url, token } = this.resolveApiCredentials(override);
    try {
      return await this.requestSections(url, token);
    } catch (err) {
      const alt = protocolFallback(url);
      if (!alt) throw err;
      this.logger.warn(`Falha ao buscar ${url}. Tentando protocolo alternativo: ${alt}`);
      return await this.requestSections(alt, token);
    }
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
    semMatricula: number;
    errors: number;
  }> {
    let sections: ApiSection[] = [];

    try {
      sections = await this.fetchSections();
    } catch (err) {
      this.logger.error("Falha ao buscar API Extensions:", err);
      await this.prisma.syncLog.create({
        data: { source: "extensions", status: "error", details: { error: String(err) } }
      });
      return { total: 0, created: 0, updated: 0, skipped: 0, semMatricula: 0, errors: 1 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let semMatricula = 0;
    let errors = 0;
    let totalUsers = 0;

    for (const section of sections) {
      const todosUsuarios = this.coletarUsuariosSecao(section);
      if (todosUsuarios.length === 0 && section.managers.length === 0) continue;

      try {
        totalUsers += todosUsuarios.length;

        /* ── Upsert da Gerência ── */
        const gerencia = await this.resolveGerenciaForSection(section);

        /* ── Gestor da seção: só preenche se a gestão ainda não definiu responsável ── */
        const manager = section.managers[0] ?? null;
        const gerenciaJaTemGestor = Boolean(
          gerencia.responsavelUserId || gerencia.responsavel?.trim()
        );
        if (manager && !gerenciaJaTemGestor) {
          const substituicaoAtiva = await this.prisma.gerenteSubstituicao.findFirst({
            where: { gerenciaId: gerencia.id, status: "ATIVA" },
            select: { id: true }
          });
          if (!substituicaoAtiva) {
            const responsavelMatricula =
              manager.staffId != null && Number.isFinite(manager.staffId)
                ? String(manager.staffId)
                : null;
            const userGerente = await this.ensureUser(manager);
            await this.prisma.gerencia.update({
              where: { id: gerencia.id },
              data: {
                ...(gerencia.responsavel ? {} : { responsavel: manager.name }),
                ...(gerencia.responsavelMatricula ? {} : { responsavelMatricula }),
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
          else if (r === "sem_matricula") semMatricula++;
          else if (r === "skipped") skipped++;
          else errors++;
        }

        /* ── Usuários das subseções (mantidos na Gerência pai) ── */
        for (const sub of section.subsections) {
          for (const u of sub.users) {
            const r = await this.syncUser(u, gerencia.id, section.name, sub.name, section.managers);
            if (r === "created") created++;
            else if (r === "updated") updated++;
            else if (r === "sem_matricula") semMatricula++;
            else if (r === "skipped") skipped++;
            else errors++;
          }
        }

        /* ── Gestores que não aparecem em users/subsections ── */
        const emailsSincronizados = new Set(
          [
            ...section.users.map((u) => u.email?.toLowerCase()),
            ...section.subsections.flatMap((s) => s.users.map((u) => u.email?.toLowerCase()))
          ].filter((e): e is string => Boolean(e))
        );
        for (const m of section.managers) {
          const email = m.email?.toLowerCase();
          if (email && emailsSincronizados.has(email)) continue;
          totalUsers++;
          const r = await this.syncUser(m, gerencia.id, section.name, null, section.managers);
          if (r === "created") created++;
          else if (r === "updated") updated++;
          else if (r === "sem_matricula") semMatricula++;
          else if (r === "skipped") skipped++;
          else errors++;
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
        skipped: skipped + semMatricula,
        errors,
        details: { semMatricula }
      }
    });

    this.logger.log(
      `Sync Extensions: ${totalUsers} usuários na API | ` +
        `${created} criados, ${updated} complementados, ${skipped} preservados, ` +
        `${semMatricula} sem matrícula (não sincronizados), ${errors} erros.`
    );
    return { total: totalUsers, created, updated, skipped, semMatricula, errors };
  }

  /** Mapeia seções RH da API para a gerência de Gestão de Pessoas / Recursos Humanos. */
  private async resolveGerenciaForSection(section: ApiSection) {
    if (isGerenciaRhSlug(section.name)) {
      const existente = await this.findGerenciaRhCadastrada(section);
      if (existente) return existente;

      return this.prisma.gerencia.create({
        data: {
          nome: slugParaNome(section.name),
          sigla: slugParaSigla(section.name) || GERENCIA_RH_SIGLA_PADRAO,
          responsavel: "",
          ativa: true
        }
      });
    }

    if (isGerenciaGertiSlug(section.name)) {
      const todas = await this.prisma.gerencia.findMany();
      const gerti = todas.find((g) => isGerenciaGerti(g));
      if (gerti) return gerti;

      return this.prisma.gerencia.create({
        data: {
          nome: GERENCIA_GERTI_NOME,
          sigla: "GERTI",
          responsavel: "",
          ativa: true
        }
      });
    }

    const nomeDisplay = slugParaNome(section.name);
    const sigla = slugParaSigla(section.name);
    const nomeNorm = normTexto(nomeDisplay);

    const porSigla = await this.prisma.gerencia.findFirst({
      where: { sigla: { equals: sigla, mode: "insensitive" } }
    });
    if (porSigla) return porSigla;

    const todas = await this.prisma.gerencia.findMany();
    const porNome = todas.find((g) => normTexto(g.nome) === nomeNorm);
    if (porNome) return porNome;

    const porSection = await this.prisma.funcionario.findFirst({
      where: { section: section.name, gerenciaId: { not: null } },
      select: { gerenciaId: true }
    });
    if (porSection?.gerenciaId) {
      const ligada = await this.prisma.gerencia.findUnique({
        where: { id: porSection.gerenciaId }
      });
      if (ligada) return ligada;
    }

    try {
      return await this.prisma.gerencia.create({
        data: { nome: nomeDisplay, sigla, responsavel: "", ativa: true }
      });
    } catch (err) {
      const conflito = await this.prisma.gerencia.findFirst({
        where: { sigla: { equals: sigla, mode: "insensitive" } }
      });
      if (conflito) return conflito;
      this.logger.error(`Falha ao criar gerência "${nomeDisplay}" (${sigla}):`, err);
      throw err;
    }
  }

  /**
   * Sincroniza um usuário da API.
   * - Sem cadastro local: cria User + Funcionario a partir da API.
   * - Já salvo pela gestão: não sobrescreve gerência, categoria, cargo, etc.
   *   só completa campos vazios vindos da API (ramal, sala, andar, extensionsId).
   */
  private async syncUser(
    u: ApiUser,
    gerenciaId: string,
    sectionSlug: string,
    subsecaoSlug: string | null,
    managers: ApiUser[]
  ): Promise<"created" | "updated" | "skipped" | "sem_matricula" | "error"> {
    try {
      if (!u.email?.trim()) {
        this.logger.warn(`Usuário da API sem e-mail (id=${u.id}, name=${u.name}) ignorado.`);
        return "skipped";
      }

      const user = await this.ensureUser(u);
      const isManagerApi = managers.some((m) => m.email?.toLowerCase() === u.email.toLowerCase());
      const existente = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });

      if (!existente) {
        return await this.criarFuncionarioDaApi(
          user.id,
          u,
          gerenciaId,
          sectionSlug,
          subsecaoSlug,
          isManagerApi
        );
      }

      /* Cadastro já existe: persistência da gestão prevalece.
         Completa apenas metadados da API que ainda estão vazios. */
      const data: Prisma.FuncionarioUncheckedUpdateInput = {};
      if (!existente.extensionsId && u.id) data.extensionsId = u.id;
      if (!existente.ramal && u.extension) data.ramal = u.extension;
      if (!existente.sala && u.room) data.sala = u.room;
      if (!existente.andar && u.floor) data.andar = u.floor;
      if (!existente.section && sectionSlug) data.section = sectionSlug;
      if (!existente.subsecao && subsecaoSlug) data.subsecao = subsecaoSlug;
      if (!existente.gerenciaId) data.gerenciaId = gerenciaId;
      if (u.staffId != null && matriculaPareceLogin(existente.matricula)) {
        data.matricula = await this.matriculaDisponivel(String(u.staffId), existente.id);
      } else if (
        u.staffId == null &&
        existente.matricula &&
        existente.matricula === matriculaFantasmaDoId(u.id)
      ) {
        /* Matrícula fantasma herdada de uma versão antiga do sync (derivada do id da API,
           não do staffId real do RH). Sem matrícula real, o acesso deve ficar bloqueado
           (ver AuthService.syncUser). */
        this.logger.warn(
          `Removendo matrícula fantasma de usuário sem staffId no AD: ${u.email} (id=${u.id}).`
        );
        data.matricula = null;
      }

      if (Object.keys(data).length === 0) return "skipped";

      await this.prisma.funcionario.update({
        where: { id: existente.id },
        data
      });
      return "updated";
    } catch (err) {
      this.logger.warn(`Erro ao sincronizar usuário ${u.email}:`, err);
      return "error";
    }
  }

  private async criarFuncionarioDaApi(
    userId: string,
    u: ApiUser,
    gerenciaId: string,
    sectionSlug: string,
    subsecaoSlug: string | null,
    isManagerApi: boolean
  ): Promise<"created" | "sem_matricula" | "skipped" | "error"> {
    // Sem matrícula (staffId) no AD: não sincroniza. Sem Funcionario, o acesso ao
    // sistema fica bloqueado no login (ver AuthService.syncUser).
    if (u.staffId == null) {
      this.logger.warn(
        `Usuário da API sem matrícula (staffId nulo) ignorado na sincronização: ${u.email} (id=${u.id}).`
      );
      return "sem_matricula";
    }
    const matricula = await this.matriculaDisponivel(String(u.staffId));
    /* Categoria real não vem da API de ramais (RH ajusta depois); "é chefe" (isManager)
       é a única informação que a API traz, e é independente da categoria. */
    const cat = "CONCURSADO" as const;
    const hoje = hojeBrasiliaISO();

    try {
      const criado = await this.prisma.funcionario.create({
        data: {
          userId,
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
          pontoObrigatorioDesde: funcionarioSemRegistroPonto({
            categoria: cat,
            isManager: isManagerApi
          })
            ? null
            : new Date(`${hoje}T12:00:00-03:00`)
        }
      });
      await this.prisma.funcionarioCategoriaHistorico.create({
        data: {
          funcionarioId: criado.id,
          categoria: cat,
          isManager: isManagerApi,
          vigenciaDesde: new Date(`${hoje}T12:00:00-03:00`),
          vigenciaAte: null
        }
      });
      return "created";
    } catch (err) {
      const jaExiste = await this.prisma.funcionario.findUnique({ where: { userId } });
      if (jaExiste) return "skipped";
      this.logger.warn(`Falha ao criar funcionário ${u.email}:`, err);
      return "error";
    }
  }

  /** Cria o User local a partir da API quando ainda não existe (funcionário novo). */
  private async ensureUser(u: ApiUser) {
    const existente = await this.resolveUser(u.email);
    if (existente) {
      const apiEmail = u.email.trim();
      const precisaEmailReal =
        Boolean(apiEmail) && (!existente.emailReal || emailEhMascaraSso(existente.emailReal));
      if (precisaEmailReal) {
        return this.prisma.user.update({
          where: { id: existente.id },
          data: { emailReal: apiEmail }
        });
      }
      return existente;
    }

    try {
      return await this.prisma.user.create({
        data: {
          name: u.name,
          email: u.email.trim(),
          emailReal: u.email.trim()
        }
      });
    } catch (err) {
      const novamente = await this.resolveUser(u.email);
      if (novamente) return novamente;
      this.logger.warn(`Falha ao criar usuário ${u.email}:`, err);
      throw err;
    }
  }

  private async matriculaDisponivel(preferida: string, exceptId?: string): Promise<string> {
    const base = preferida.trim() || `ext-${Date.now().toString(36)}`;
    let matricula = base;
    let suffix = 0;
    for (;;) {
      const taken = await this.prisma.funcionario.findUnique({ where: { matricula } });
      if (!taken || taken.id === exceptId) return matricula;
      suffix++;
      matricula = `${base}-${suffix}`;
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

  /**
   * Localiza um colaborador na API de ramais pelo e-mail (ou prefixo SSO)
   * sem criar gerência. Usado para pré-preencher o formulário de gestão.
   */
  async lookupUser(emailOuUsername: string): Promise<ExtensionsUserLookup> {
    const q = emailOuUsername.trim().toLowerCase();
    const prefixo = q.split("@")[0];
    if (!prefixo) return { found: false };

    let sections: ApiSection[] = [];
    try {
      sections = await this.fetchSections();
    } catch (err) {
      this.logger.warn("Lookup na API de ramais falhou:", err);
      return { found: false };
    }

    let hit: { u: ApiUser; section: ApiSection; sub: string | null } | null = null;
    outer: for (const section of sections) {
      for (const u of section.users) {
        if (matchApiUser(u, q, prefixo)) {
          hit = { u, section, sub: null };
          break outer;
        }
      }
      for (const sub of section.subsections) {
        for (const u of sub.users) {
          if (matchApiUser(u, q, prefixo)) {
            hit = { u, section, sub: sub.name };
            break outer;
          }
        }
      }
      for (const m of section.managers) {
        if (matchApiUser(m, q, prefixo)) {
          hit = { u: m, section, sub: null };
          break outer;
        }
      }
    }

    if (!hit) return { found: false };

    const encontrado = hit;
    const gerencia = await this.findGerenciaForSection(encontrado.section);
    const isManager = encontrado.section.managers.some(
      (m) => m.email?.toLowerCase() === encontrado.u.email.toLowerCase()
    );

    return {
      found: true,
      name: encontrado.u.name,
      email: encontrado.u.email,
      staffId: encontrado.u.staffId,
      extension: encontrado.u.extension,
      room: encontrado.u.room,
      floor: encontrado.u.floor,
      section: encontrado.section.name,
      subsection: encontrado.sub,
      isManager,
      gerenciaId: gerencia?.id ?? null,
      gerenciaNome: gerencia?.nome ?? slugParaNome(encontrado.section.name)
    };
  }

  /** Encontra gerência já cadastrada para a seção, sem criar registro novo. */
  private async findGerenciaForSection(section: ApiSection) {
    if (isGerenciaRhSlug(section.name)) {
      return this.findGerenciaRhCadastrada(section);
    }

    if (isGerenciaGertiSlug(section.name)) {
      const todas = await this.prisma.gerencia.findMany();
      return todas.find((g) => isGerenciaGerti(g)) ?? null;
    }

    const nomeDisplay = slugParaNome(section.name);
    const sigla = slugParaSigla(section.name);
    const nomeNorm = normTexto(nomeDisplay);

    const porSigla = await this.prisma.gerencia.findFirst({
      where: { sigla: { equals: sigla, mode: "insensitive" } }
    });
    if (porSigla) return porSigla;

    const todas = await this.prisma.gerencia.findMany();
    const porNome = todas.find((g) => normTexto(g.nome) === nomeNorm);
    if (porNome) return porNome;

    const porSection = await this.prisma.funcionario.findFirst({
      where: { section: section.name, gerenciaId: { not: null } },
      select: { gerenciaId: true }
    });
    if (porSection?.gerenciaId) {
      return this.prisma.gerencia.findUnique({ where: { id: porSection.gerenciaId } });
    }
    return null;
  }

  /** Encontra gerência RH já cadastrada (Gestão de Pessoas, Recursos Humanos, etc.). */
  private async findGerenciaRhCadastrada(section?: ApiSection) {
    const todas = await this.prisma.gerencia.findMany();
    if (section) {
      const nomeNorm = normTexto(slugParaNome(section.name));
      const porNomeSecao = todas.find((g) => normTexto(g.nome) === nomeNorm);
      if (porNomeSecao) return porNomeSecao;
      const porSlug = todas.find((g) => normTexto(g.nome).includes("gestao de pessoas"));
      if (porSlug && section.name.includes("gestao-de-pessoas")) return porSlug;
    }
    return todas.find((g) => isGerenciaRh(g)) ?? null;
  }

  /** Resolve User pelo e-mail da API (emailReal / email exato → prefixo SSO). */
  private async resolveUser(emailExterno: string) {
    const email = emailExterno?.trim();
    if (!email) return null;

    const porEmailReal = await this.prisma.user.findFirst({
      where: { emailReal: { equals: email, mode: "insensitive" } }
    });
    if (porEmailReal) return porEmailReal;

    const porEmail = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } }
    });
    if (porEmail) return porEmail;

    const prefixo = email.split("@")[0];
    if (!prefixo) return null;

    return this.prisma.user.findFirst({
      where: { email: { startsWith: `${prefixo}@`, mode: "insensitive" } }
    });
  }
}
