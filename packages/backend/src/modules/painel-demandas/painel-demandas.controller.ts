import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PainelDemandasService } from "./painel-demandas.service";

/** Painel de acompanhamento das demandas do RH (Dashboard → Painel de Demandas). */
@Controller("ponto/gestao/dashboard")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class PainelDemandasController {
  constructor(private readonly service: PainelDemandasService) {}

  @RecursoRh("dashboard.painel")
  @Get("painel")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  painel() {
    return this.service.painel();
  }
}
