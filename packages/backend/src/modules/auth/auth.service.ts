import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { isGerenciaRh, isGerenciaRhSlug } from "../../common/gerencia-rh.util";
import {
  isSuperAdminIdentity,
  mergeSuperAdminRoles,
  superAdminUsernamesFromEnv
} from "../../utils/super-admin";

export interface AuthContext {
  sub: string;
  email?: string;
  name?: string;
  username: string;
  roles: string[];
  groups: string[];
  isSuperAdmin: boolean;
}

export interface UserProfile {
  id: string;
  sub: string;
  username: string;
  name: string;
  email: string;
  emailReal: string | null;
  roles: string[];
  groups: string[];
  isSuperAdmin: boolean;
  funcionario: {
    id: string;
    matricula: string | null;
    cargo: string;
    departamento: string | null;
    fotoPerfilUrl: string | null;
    solicitarAtualizacaoFoto: boolean;
    isManager: boolean;
    section: string | null;
  } | null;
}

const SUPER_ADMINS = superAdminUsernamesFromEnv(process.env.SUPER_ADMIN_USERNAMES);

const REAL_EMAIL_DOMAIN = process.env.REAL_EMAIL_DOMAIN ?? "cfo.org.br";
const SSO_FAKE_DOMAINS = ["sso.local", "pending.local"];

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  mapTokenPayload(payload: Record<string, unknown>): AuthContext {
    const realmAccess = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
    const groups = Array.isArray(payload.groups) ? (payload.groups as string[]) : [];
    const username = payload.preferred_username ? String(payload.preferred_username) : "";
    const email = payload.email ? String(payload.email) : undefined;
    const isSuperAdmin = isSuperAdminIdentity(SUPER_ADMINS, username, email);
    /* Todo usuário SSO autenticado recebe automaticamente a role "funcionario".
       Super admin recebe todos os papéis (hierarquia máxima). */
    const roles = isSuperAdmin
      ? mergeSuperAdminRoles(["funcionario", ...realmAccess])
      : Array.from(new Set(["funcionario", ...realmAccess]));
    return {
      sub: String(payload.sub),
      email,
      name: payload.name
        ? String(payload.name)
        : [payload.given_name, payload.family_name].filter(Boolean).join(" ") || username,
      username,
      roles,
      groups,
      isSuperAdmin
    };
  }

  /** Concede papéis derivados do cadastro local (gerência RH, gestor via API de ramais). */
  async enrichRoles(ctx: AuthContext): Promise<AuthContext> {
    /* Super admin já tem tudo — não depende de gerência/RH no cadastro. */
    if (ctx.isSuperAdmin) {
      return { ...ctx, roles: mergeSuperAdminRoles(ctx.roles) };
    }

    const user = await this.prisma.user.findUnique({
      where: { externalId: ctx.sub },
      select: {
        email: true,
        emailReal: true,
        funcionario: {
          select: {
            id: true,
            isManager: true,
            section: true,
            gerencia: { select: { nome: true, sigla: true } },
            supervisionadosEstagio: {
              where: {
                ativo: true,
                categoria: { in: ["ESTAGIARIO", "MENOR_APRENDIZ"] }
              },
              select: { id: true },
              take: 1
            }
          }
        },
        gerenciasGeridas: { select: { id: true }, take: 1 }
      }
    });

    if (!user) return ctx;

    /* Reavalia super admin com e-mail real do cadastro (caso o token traga só e-mail mascarado). */
    if (isSuperAdminIdentity(SUPER_ADMINS, ctx.username, ctx.email, user.email, user.emailReal)) {
      return {
        ...ctx,
        isSuperAdmin: true,
        roles: mergeSuperAdminRoles(ctx.roles)
      };
    }

    const extraRoles = [...ctx.roles];

    const gerencia = user.funcionario?.gerencia;
    const section = user.funcionario?.section;
    const isRh =
      (gerencia && isGerenciaRh(gerencia)) || (section ? isGerenciaRhSlug(section) : false);
    if (isRh && !extraRoles.includes("RH_AUDITORIA")) {
      extraRoles.push("RH_AUDITORIA");
    }

    const isSupervisorEstagio = (user.funcionario?.supervisionadosEstagio?.length ?? 0) > 0;
    const isGestorRamais =
      user.funcionario?.isManager === true ||
      user.gerenciasGeridas.length > 0 ||
      isSupervisorEstagio;
    if (isGestorRamais) {
      if (!extraRoles.includes("GESTOR_APROVACAO")) extraRoles.push("GESTOR_APROVACAO");
      if (!extraRoles.includes("gestor")) extraRoles.push("gestor");
    }

    if (extraRoles.length === ctx.roles.length) return ctx;

    return { ...ctx, roles: Array.from(new Set(extraRoles)) };
  }

  /* Sincroniza o usuário SSO com a base local no login (seed individual).
     Cria User + Funcionario na primeira autenticação bem-sucedida. */
  async syncUser(ctx: AuthContext): Promise<UserProfile> {
    const email = ctx.email || `${ctx.username || ctx.sub.slice(0, 12)}@sso.local`;
    const name = ctx.name || ctx.username || ctx.sub.slice(0, 12);

    // Busca ou cria o User pelo sub do Keycloak (externalId)
    let user = await this.prisma.user.findUnique({ where: { externalId: ctx.sub } });

    if (!user) {
      // Calcula emailReal para novos usuários com email mascarado
      const newEmailDomain = email.split("@")[1] ?? "";
      const emailReal =
        SSO_FAKE_DOMAINS.includes(newEmailDomain) && ctx.username
          ? `${ctx.username}@${REAL_EMAIL_DOMAIN}`
          : undefined;
      // Tenta criar; se email já existir (de outro usuário), usa sub como email
      user = await this.prisma.user
        .create({ data: { externalId: ctx.sub, email, name, emailReal } })
        .catch(() =>
          this.prisma.user.create({
            data: { externalId: ctx.sub, email: `${ctx.sub}@sso.local`, name, emailReal }
          })
        );
    } else {
      // Atualiza apenas email temporário (nome é gerenciado manualmente pelo RH)
      const updates: Record<string, string | null> = {};
      if (
        ctx.email &&
        (user.email.endsWith("@pending.local") || user.email.endsWith("@sso.local"))
      ) {
        updates.email = ctx.email;
      }
      // Auto-preenche emailReal quando ainda é nulo e o email é mascarado
      if (!user.emailReal && ctx.username) {
        const emailDomain = user.email.split("@")[1] ?? "";
        if (SSO_FAKE_DOMAINS.includes(emailDomain)) {
          updates.emailReal = `${ctx.username}@${REAL_EMAIL_DOMAIN}`;
        }
      }
      if (Object.keys(updates).length > 0) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: updates });
      }
    }

    // 2. Auto-cria Funcionario na primeira vez (admin pode completar depois)
    let funcionario = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        matricula: true,
        cargo: true,
        departamento: true,
        fotoPerfilUrl: true,
        solicitarAtualizacaoFoto: true,
        ativo: true,
        isManager: true,
        section: true
      }
    });

    // Bloqueia acesso se o funcionário foi desativado pelo RH/admin.
    // Super admins não são bloqueados mesmo que o registro esteja inativo.
    if (funcionario && !funcionario.ativo && !ctx.isSuperAdmin) {
      throw new ForbiddenException("CONTA_DESATIVADA");
    }

    if (!funcionario) {
      const matriculaBase = ctx.username || ctx.sub.slice(0, 12);
      let matricula = matriculaBase;
      // Garante unicidade da matrícula
      let suffix = 0;
      while (await this.prisma.funcionario.findUnique({ where: { matricula } })) {
        suffix++;
        matricula = `${matriculaBase}-${suffix}`;
      }
      funcionario = await this.prisma.funcionario
        .create({
          data: {
            userId: user.id,
            matricula,
            cargo: "A definir",
            ativo: true
          },
          select: {
            id: true,
            matricula: true,
            cargo: true,
            departamento: true,
            ativo: true,
            isManager: true,
            section: true,
            fotoPerfilUrl: true,
            solicitarAtualizacaoFoto: true
          }
        })
        .catch(() => null);
    }

    const enriched = await this.enrichRoles(ctx);
    const isSuperAdmin = enriched.isSuperAdmin;
    const roles = isSuperAdmin ? mergeSuperAdminRoles(enriched.roles) : enriched.roles;

    return {
      id: user.id,
      sub: ctx.sub,
      username: ctx.username,
      name: user.name,
      email: user.email,
      emailReal: user.emailReal ?? null,
      roles,
      groups: enriched.groups,
      isSuperAdmin,
      funcionario: funcionario ?? null
    };
  }
}
