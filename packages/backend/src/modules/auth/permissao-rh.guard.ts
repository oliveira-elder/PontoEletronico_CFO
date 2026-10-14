import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service";
import { ROLES_KEY } from "./roles.decorator";
import { RECURSO_RH_KEY } from "./recurso-rh.decorator";
import { temRecursoRh } from "../../utils/recursos-rh";

export const PAPEIS_GERENTE_RH = ["ponto-admin", "PONTO_ADMIN"];

type UsuarioReq = { sub?: string; roles?: string[]; isSuperAdmin?: boolean };

/**
 * Perfis do RH: quando o usuário chega à rota APENAS pelo papel RH_AUDITORIA, exige a
 * permissão declarada em @RecursoRh (aba = Ver; função = ação + Ver da aba-mãe).
 * Super admin e Gerente de RH (PONTO_ADMIN) têm acesso total; quem acessa por outro papel
 * aceito pela rota (ex.: gestor vendo a própria equipe) não é afetado.
 */
@Injectable()
export class PermissaoRhGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const recursos = this.reflector.getAllAndOverride<string[]>(RECURSO_RH_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!recursos?.length) return true;

    const req = context.switchToHttp().getRequest<{
      user?: UsuarioReq;
      permissoesRh?: Set<string>;
    }>();
    const user = req.user;
    const papeisRota =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];
    /* Super admin, Gerente de RH ou acesso por outro papel (ex.: gestor): não é acesso de RH. */
    if (!acessoDependeDoPerfilRh(user, papeisRota)) return true;

    const concedidos = req.permissoesRh ?? (await carregarPermissoesRh(this.prisma, user?.sub));
    req.permissoesRh = concedidos;
    if (recursos.some((r) => temRecursoRh(concedidos, r))) return true;
    throw new ForbiddenException(
      "Seu perfil do RH não dá acesso a este recurso. Fale com o Gerente de RH."
    );
  }
}

/**
 * O acesso deste usuário à rota depende do Perfil do RH? Só quando ele chega apenas pelo
 * papel RH_AUDITORIA (não é super admin, não é Gerente de RH, nem tem outro papel aceito).
 */
export function acessoDependeDoPerfilRh(user: UsuarioReq | undefined, papeisRota: string[]) {
  if (!user || user.isSuperAdmin) return false;
  const roles = user.roles ?? [];
  if (roles.some((r) => PAPEIS_GERENTE_RH.includes(r))) return false;
  if (!roles.includes("RH_AUDITORIA")) return false;
  return !papeisRota.some((r) => r !== "RH_AUDITORIA" && roles.includes(r));
}

/**
 * Verificação dinâmica (dentro do controller/serviço), para rotas cuja permissão depende
 * do conteúdo (ex.: tipo enviado, campos alterados). Lança 403 se faltar o recurso.
 */
export async function exigirRecursoRh(
  prisma: PrismaService,
  user: UsuarioReq | undefined,
  papeisRota: string[],
  recurso: string
): Promise<void> {
  if (!acessoDependeDoPerfilRh(user, papeisRota)) return;
  const concedidos = await carregarPermissoesRh(prisma, user?.sub);
  if (!temRecursoRh(concedidos, recurso)) {
    throw new ForbiddenException(
      "Seu perfil do RH não dá acesso a este recurso. Fale com o Gerente de RH."
    );
  }
}

/** Permissões do Perfil do RH do usuário (por Keycloak sub). */
export async function carregarPermissoesRh(
  prisma: PrismaService,
  keycloakSub?: string
): Promise<Set<string>> {
  if (!keycloakSub) return new Set();
  const rows = await prisma.permissaoRh.findMany({
    where: { funcionario: { user: { externalId: keycloakSub } } },
    select: { recurso: true }
  });
  return new Set(rows.map((r) => r.recurso));
}
