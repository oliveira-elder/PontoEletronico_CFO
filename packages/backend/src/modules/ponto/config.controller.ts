import { Controller, Get, Put, Post, Delete, Patch, Body, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ConfigService } from "./config.service";

@Controller("ponto/config")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ponto-admin")
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  /* ─── ConfiguracaoSistema ─── */

  /* Config do sistema: leitura aberta para qualquer usuário SSO autenticado
     (necessária para a tela de registro de ponto). Escrita continua restrita. */
  @Get("sistema")
  @Roles()
  getSistema() {
    return this.configService.getSistema();
  }

  @Put("sistema")
  updateSistema(@Body() body: Record<string, unknown>) {
    return this.configService.updateSistema(body);
  }

  /* ─── Provedores ─── */

  @Get("provedores")
  @Roles("gestor", "ponto-admin")
  listProvedores() {
    return this.configService.listProvedores();
  }

  @Post("provedores")
  createProvedor(@Body() body: { nome: string; ip: string; isPrincipal: boolean }) {
    return this.configService.createProvedor(body);
  }

  @Patch("provedores/:id/toggle")
  toggleProvedor(@Param("id") id: string) {
    return this.configService.toggleProvedor(id);
  }

  @Delete("provedores/:id")
  deleteProvedor(@Param("id") id: string) {
    return this.configService.deleteProvedor(id);
  }

  /* ─── Subredes ─── */

  @Get("subredes")
  @Roles("gestor", "ponto-admin")
  listSubredes() {
    return this.configService.listSubredes();
  }

  @Post("subredes")
  createSubrede(@Body() body: { cidr: string; descricao?: string }) {
    return this.configService.createSubrede(body);
  }

  @Delete("subredes/:id")
  deleteSubrede(@Param("id") id: string) {
    return this.configService.deleteSubrede(id);
  }

  /* ─── Áreas de Viagem ─── */

  @Get("areas")
  @Roles("gestor", "ponto-admin")
  listAreas() {
    return this.configService.listAreas();
  }

  @Post("areas")
  createArea(
    @Body() body: { nome: string; descricao?: string; lat: number; lng: number; raioMetros: number }
  ) {
    return this.configService.createArea(body);
  }

  @Patch("areas/:id")
  updateArea(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      nome: string;
      descricao: string;
      lat: number;
      lng: number;
      raioMetros: number;
      ativa: boolean;
    }>
  ) {
    return this.configService.updateArea(id, body);
  }

  @Patch("areas/:id/toggle")
  toggleArea(@Param("id") id: string) {
    return this.configService.toggleArea(id);
  }

  @Delete("areas/:id")
  deleteArea(@Param("id") id: string) {
    return this.configService.deleteArea(id);
  }
}
