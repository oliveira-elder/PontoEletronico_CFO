import { Controller, Get, Put, Post, Delete, Patch, Body, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ConfigService } from "./config.service";

@Controller("ponto/config")
@UseGuards(AuthGuard("jwt"))
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  /* ─── ConfiguracaoSistema ─── */

  @Get("sistema")
  getSistema() {
    return this.configService.getSistema();
  }

  @Put("sistema")
  updateSistema(@Body() body: Record<string, unknown>) {
    return this.configService.updateSistema(body);
  }

  /* ─── Provedores ─── */

  @Get("provedores")
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
