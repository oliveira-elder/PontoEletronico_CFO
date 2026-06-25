import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const authHeader = req.headers["authorization"];

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Token de API ausente.");
    }

    const rawToken = authHeader.slice(7);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const record = await this.prisma.apiToken.findUnique({
      where: { tokenHash },
      select: { id: true, active: true, expiresAt: true }
    });

    if (!record || !record.active) throw new UnauthorizedException("Token inválido ou revogado.");
    if (record.expiresAt && new Date() > record.expiresAt) {
      throw new UnauthorizedException("Token expirado.");
    }

    // Atualiza lastUsedAt de forma assíncrona
    this.prisma.apiToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => null);

    return true;
  }
}
