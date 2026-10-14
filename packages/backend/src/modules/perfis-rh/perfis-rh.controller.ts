import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PerfisRhService } from "./perfis-rh.service";

interface AuthRequest {
  user: { sub: string; roles: string[]; isSuperAdmin?: boolean };
}

/** Perfis do RH — gestão exclusiva do Gerente de RH (PONTO_ADMIN) e do super admin. */
@Controller("ponto/perfis-rh")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class PerfisRhController {
  constructor(private readonly service: PerfisRhService) {}

  @Get("minhas")
  minhas(@Request() req: AuthRequest) {
    return this.service.minhas(req.user);
  }

  @Get("funcionarios")
  @Roles("ponto-admin", "PONTO_ADMIN")
  listar() {
    return this.service.listar();
  }

  @Put("funcionarios/:id")
  @Roles("ponto-admin", "PONTO_ADMIN")
  salvar(
    @Param("id") id: string,
    @Body() body: { recursos: string[] },
    @Request() req: AuthRequest
  ) {
    return this.service.salvar(id, body?.recursos, req.user);
  }

  @Post("copiar")
  @Roles("ponto-admin", "PONTO_ADMIN")
  copiar(@Body() body: { origemId: string; destinoIds: string[] }, @Request() req: AuthRequest) {
    return this.service.copiar(body?.origemId, body?.destinoIds, req.user);
  }
}
