import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

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

const SUPER_ADMINS = (process.env.SUPER_ADMIN_USERNAMES ?? "elder.oliveira")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const REAL_EMAIL_DOMAIN = process.env.REAL_EMAIL_DOMAIN ?? "cfo.org.br";
const SSO_FAKE_DOMAINS = ["sso.local", "pending.local"];

const ALL_ROLES = [
  "funcionario",
  "gestor",
  "ponto-admin",
  "PONTO_ADMIN",
  "GESTOR_APROVACAO",
  "RH_AUDITORIA"
];

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  mapTokenPayload(payload: Record<string, unknown>): AuthContext {
    const realmAccess = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
    const groups = Array.isArray(payload.groups) ? (payload.groups as string[]) : [];
    const username = payload.preferred_username ? String(payload.preferred_username) : "";
    const isSuperAdmin = SUPER_ADMINS.includes(username.toLowerCase());
    /* Todo usuário SSO autenticado recebe automaticamente a role "funcionario".
       Roles extras vêm do realm_access (Keycloak) + grupos mapeados em GrupoSistema. */
    const roles = isSuperAdmin ? ALL_ROLES : Array.from(new Set(["funcionario", ...realmAccess]));
    return {
      sub: String(payload.sub),
      email: payload.email ? String(payload.email) : undefined,
      name: payload.name
        ? String(payload.name)
        : [payload.given_name, payload.family_name].filter(Boolean).join(" ") || username,
      username,
      roles,
      groups,
      isSuperAdmin
    };
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

    return {
      id: user.id,
      sub: ctx.sub,
      username: ctx.username,
      name: user.name,
      email: user.email,
      emailReal: user.emailReal ?? null,
      roles: ctx.roles,
      groups: ctx.groups,
      isSuperAdmin: ctx.isSuperAdmin,
      funcionario: funcionario ?? null
    };
  }
}
