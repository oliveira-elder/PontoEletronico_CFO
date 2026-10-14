import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { Roles } from "../auth/roles.decorator";
import {
  NotificacaoService,
  EmailConfigDto,
  NotificacaoConfigDto,
  EnviarManualDto
} from "./notificacao.service";

interface AuthRequest {
  user: { isSuperAdmin?: boolean };
}

function assertSuperAdmin(req: AuthRequest) {
  if (!req.user?.isSuperAdmin) {
    throw new ForbiddenException("Acesso restrito a Super Admin.");
  }
}

@Controller("notificacao")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
@Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
export class NotificacaoController {
  constructor(private readonly svc: NotificacaoService) {}

  /* ── Configuração de e-mail (super admin) ── */

  @RecursoRh("configuracoes.notificacoes")
  @Get("email-config")
  async getEmailConfig(@Request() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.svc.getEmailConfig();
  }

  @RecursoRh("configuracoes.notificacoes.email")
  @Put("email-config")
  async salvarEmailConfig(@Request() req: AuthRequest, @Body() dto: EmailConfigDto) {
    assertSuperAdmin(req);
    return this.svc.salvarEmailConfig(dto);
  }

  @RecursoRh("configuracoes.notificacoes.email")
  @Post("email-config/testar")
  async testarEmailConfig(
    @Request() req: AuthRequest,
    @Body() dto: EmailConfigDto & { emailTeste: string }
  ) {
    assertSuperAdmin(req);
    return this.svc.testarEmailConfig(dto);
  }

  /* ── Configuração de notificações por evento ── */

  @RecursoRh("configuracoes.notificacoes")
  @Get("config")
  getNotificacaoConfigs() {
    return this.svc.getNotificacaoConfigs();
  }

  @RecursoRh("configuracoes.notificacoes.eventos")
  @Put("config/:id")
  upsertNotificacaoConfig(@Param("id") id: string, @Body() dto: NotificacaoConfigDto) {
    return this.svc.upsertNotificacaoConfig(id, dto);
  }

  /* ── Envio manual ── */

  @RecursoRh("configuracoes.notificacoes.manual")
  @Post("manual")
  enviarManual(@Body() dto: EnviarManualDto) {
    return this.svc.enviarManual(dto);
  }

  /* ── Busca e-mails de funcionários para seleção ── */

  @RecursoRh("configuracoes.notificacoes")
  @Get("emails-funcionarios/:grupo")
  getEmails(@Param("grupo") grupo: "todos" | "gestores" | "funcionarios") {
    return this.svc.getEmailsFuncionarios(grupo);
  }
}
