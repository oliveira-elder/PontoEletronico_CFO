import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GROUPS_KEY } from "./groups.decorator";

@Injectable()
export class GroupsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(GROUPS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: { groups?: string[] } }>();
    const userGroups = request.user?.groups ?? [];

    /* Suporta tanto path completo (/ponto-admin) quanto nome simples (ponto-admin) */
    return required.some((g) =>
      userGroups.some((ug) => ug === g || ug === `/${g}` || ug.endsWith(`/${g}`))
    );
  }
}
