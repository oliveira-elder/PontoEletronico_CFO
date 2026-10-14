import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Req,
  ForbiddenException,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { Roles } from "../auth/roles.decorator";
import { ExtensionsService } from "./extensions.service";

interface AuthRequest extends Request {
  user?: { isSuperAdmin?: boolean };
}

function assertSuperAdmin(req: AuthRequest) {
  if (!req.user?.isSuperAdmin) {
    throw new ForbiddenException("Acesso restrito a Super Admin.");
  }
}

@Controller("admin/extensions")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class ExtensionsController {
  constructor(private readonly extensionsService: ExtensionsService) {}

  @Get("config")
  @Roles("ponto-admin", "PONTO_ADMIN")
  getConfig() {
    return this.extensionsService.getConfig();
  }

  @Put("config")
  @Roles("ponto-admin", "PONTO_ADMIN")
  saveConfig(@Req() req: AuthRequest, @Body() body: { url: string; token?: string }) {
    assertSuperAdmin(req);
    return this.extensionsService.saveConfig(body);
  }

  @Delete("config")
  @Roles("ponto-admin", "PONTO_ADMIN")
  removeConfig(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.extensionsService.removePanelOverride();
  }

  @Post("test")
  @Roles("ponto-admin", "PONTO_ADMIN")
  testConnection(@Req() req: AuthRequest, @Body() body: { url?: string; token?: string }) {
    const hasOverride = body?.url !== undefined || body?.token !== undefined;
    if (hasOverride) assertSuperAdmin(req);
    return this.extensionsService.testConnection(body);
  }

  @Get("lookup")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  lookup(@Query("email") email?: string) {
    if (!email?.trim()) return { found: false as const };
    return this.extensionsService.lookupUser(email.trim());
  }

  @RecursoRh("gestao.ramais.sincronizar")
  @Post("sync")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  async sync() {
    return this.extensionsService.syncExtensions();
  }

  @RecursoRh("gestao.ramais")
  @Get("sync/status")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  async status() {
    return this.extensionsService.getLastSync();
  }
}
