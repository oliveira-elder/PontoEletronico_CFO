import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
  ForbiddenException,
  BadRequestException
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { SistemaService } from "./sistema.service";

interface AuthRequest {
  user: {
    sub: string;
    isSuperAdmin?: boolean;
  };
}

function assertSuperAdmin(req: AuthRequest) {
  if (!req.user?.isSuperAdmin) {
    throw new ForbiddenException("Acesso restrito a Super Admin.");
  }
}

@Controller("sistema")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("funcionario")
export class SistemaController {
  constructor(
    private readonly sistema: SistemaService,
    private readonly prisma: PrismaService
  ) {}

  private async resolveLocalUserId(req: AuthRequest): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { externalId: req.user.sub },
      select: { id: true }
    });
    if (!user) throw new BadRequestException("Usuário local não encontrado. Faça login novamente.");
    return user.id;
  }

  /* ── Super Admin ── */

  @Get("super-admins")
  async listarSuperAdmins(@Request() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.sistema.listarSuperAdmins();
  }

  @Get("candidatos-gerti")
  async candidatosGerti(@Request() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.sistema.listarCandidatosGerti();
  }

  @Post("super-admins")
  async conceder(@Request() req: AuthRequest, @Body() body: { userId?: string }) {
    assertSuperAdmin(req);
    if (!body?.userId) throw new BadRequestException("userId é obrigatório.");
    const atorId = await this.resolveLocalUserId(req);
    return this.sistema.concederSuperAdmin(atorId, body.userId);
  }

  @Delete("super-admins/:userId")
  async revogar(@Request() req: AuthRequest, @Param("userId") userId: string) {
    assertSuperAdmin(req);
    const atorId = await this.resolveLocalUserId(req);
    return this.sistema.revogarSuperAdmin(atorId, userId);
  }

  /* ── Start ── */

  @Get("start")
  async getStart(@Request() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.sistema.getStartStatus();
  }

  @Get("start/pendencias")
  async pendencias(@Request() req: AuthRequest) {
    const userId = await this.resolveLocalUserId(req);
    return this.sistema.getPendenciasAprovacao(userId);
  }

  @Post("start")
  async solicitar(
    @Request() req: AuthRequest,
    @Body() body: { mesReferencia?: string; observacao?: string }
  ) {
    assertSuperAdmin(req);
    if (!body?.mesReferencia) throw new BadRequestException("mesReferencia é obrigatório.");
    const atorId = await this.resolveLocalUserId(req);
    return this.sistema.solicitarStart(atorId, body.mesReferencia, body.observacao);
  }

  @Post("start/:id/aprovar-gerti")
  async aprovarGerti(
    @Request() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { observacao?: string }
  ) {
    const atorId = await this.resolveLocalUserId(req);
    return this.sistema.aprovarGerti(atorId, id, body?.observacao);
  }

  @Post("start/:id/aprovar-rh")
  async aprovarRh(
    @Request() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { observacao?: string }
  ) {
    const atorId = await this.resolveLocalUserId(req);
    return this.sistema.aprovarRh(atorId, id, body?.observacao);
  }

  @Post("start/:id/rejeitar")
  async rejeitar(
    @Request() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { observacao?: string }
  ) {
    const atorId = await this.resolveLocalUserId(req);
    return this.sistema.rejeitar(atorId, id, body?.observacao);
  }
}
