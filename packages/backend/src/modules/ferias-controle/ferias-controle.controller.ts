import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { FeriasControleService } from "./ferias-controle.service";

const RH = ["RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN"] as const;

/** Aba global de férias da Auditoria (só leitura). */
@Controller("ponto")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class FeriasControleController {
  constructor(private readonly service: FeriasControleService) {}

  @RecursoRh("ferias.controle")
  @Get("ferias-controle/painel")
  @Roles(...RH)
  painel(
    @Query("busca") busca?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("categoria") categoria?: string,
    @Query("gravidade") gravidade?: string,
    @Query("status") status?: string
  ) {
    return this.service.painel({ busca, gerenciaId, categoria, gravidade, status });
  }
}
