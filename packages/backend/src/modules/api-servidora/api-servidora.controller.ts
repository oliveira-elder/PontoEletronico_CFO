import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Req,
  ForbiddenException,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { ApiServidoraService } from "./api-servidora.service";
import { ApiTokenGuard } from "./guards/api-token.guard";

interface AuthRequest extends Request {
  user?: { sub?: string; isSuperAdmin?: boolean };
}

function assertSuperAdmin(req: AuthRequest) {
  if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
}

/* ─── Endpoints admin (requerem login + super admin) ─── */
@Controller("logs/api-tokens")
@UseGuards(AuthGuard("jwt"))
export class ApiTokensController {
  constructor(private readonly svc: ApiServidoraService) {}

  @Post()
  async create(
    @Req() req: AuthRequest,
    @Body() body: { name: string; description?: string; expiresAt?: string }
  ) {
    assertSuperAdmin(req);
    return this.svc.createToken(
      body.name,
      body.description,
      req.user!.sub!,
      body.expiresAt ? new Date(body.expiresAt) : undefined
    );
  }

  @Get()
  async list(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.svc.listTokens();
  }

  @Patch(":id/revoke")
  async revoke(@Req() req: AuthRequest, @Param("id") id: string) {
    assertSuperAdmin(req);
    return this.svc.revokeToken(id);
  }

  @Delete(":id")
  async remove(@Req() req: AuthRequest, @Param("id") id: string) {
    assertSuperAdmin(req);
    return this.svc.deleteToken(id);
  }
}

@Controller("logs/api-servidora")
@UseGuards(AuthGuard("jwt"))
export class ApiServidoraAdminController {
  constructor(private readonly svc: ApiServidoraService) {}

  @Get("config")
  getConfig(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.svc.getPublicApiConfig();
  }

  @Get("feriados-preview")
  getFeriadosPreview(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.svc.getFeriados();
  }
}

/* ─── Endpoints públicos (requerem ApiToken Bearer) ─── */
@Controller("api-publica/v1")
@UseGuards(ApiTokenGuard)
export class PublicApiController {
  constructor(private readonly svc: ApiServidoraService) {}

  @Get("feriados")
  getFeriados() {
    return this.svc.getFeriados();
  }

  @Get("configuracoes")
  getConfiguracoes() {
    return this.svc.getConfiguracoes();
  }
}
