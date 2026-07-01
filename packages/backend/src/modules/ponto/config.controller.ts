import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ConfigService } from "./config.service";
import { ConfigSolicitacoesService, ConfigSolicitacoesData } from "./config-solicitacoes.service";
import { FeriadoConfigService } from "./feriado-config.service";

@Controller("ponto/config")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ponto-admin")
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly configSolicitacoesService: ConfigSolicitacoesService,
    private readonly feriadoConfigService: FeriadoConfigService
  ) {}

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

  /* ─── JornadaPeriodo ─── */

  @Get("jornadas")
  @Roles()
  listJornadas() {
    return this.configService.listJornadas();
  }

  @Post("jornadas")
  createJornada(@Body() body: Record<string, unknown>) {
    return this.configService.createJornada(body as never);
  }

  @Put("jornadas/:id")
  updateJornada(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.configService.updateJornada(id, body);
  }

  @Patch("jornadas/:id/padrao")
  setJornadaPadrao(@Param("id") id: string) {
    return this.configService.setJornadaPadrao(id);
  }

  @Delete("jornadas/:id")
  async deleteJornada(@Param("id") id: string) {
    try {
      return await this.configService.deleteJornada(id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /* ─── Banco de Horas: datas marco ─── */

  @Get("banco-horas/marcos")
  @Roles() // leitura aberta: necessária para a página Banco de Horas exibir a próxima zeragem
  listMarcosBancoHoras() {
    return this.configService.listMarcosBancoHoras();
  }

  @Post("banco-horas/marcos")
  createMarcoBancoHoras(@Body() body: { data: string; descricao?: string }) {
    return this.configService.createMarcoBancoHoras(body);
  }

  @Delete("banco-horas/marcos/:id")
  deleteMarcoBancoHoras(@Param("id") id: string) {
    return this.configService.deleteMarcoBancoHoras(id);
  }

  /* ─── Configuração de Solicitações (regras de atestado e férias) ─── */

  @Get("solicitacoes")
  @Roles() // qualquer usuário autenticado pode ler as regras
  getConfigSolicitacoes() {
    return this.configSolicitacoesService.getConfig();
  }

  @Put("solicitacoes")
  async updateConfigSolicitacoes(@Body() body: Partial<ConfigSolicitacoesData>) {
    return this.configSolicitacoesService.updateConfig(body);
  }

  /* ─── Feriados ─── */

  @Get("feriados")
  @Roles() // leitura aberta para usuários autenticados
  listarFeriados(@Query("ano") ano: string) {
    const year = parseInt(ano) || new Date().getFullYear();
    return this.feriadoConfigService.listarPorAno(year);
  }

  @Post("feriados/importar")
  importarFeriados(@Body("ano") ano: number) {
    const year = ano || new Date().getFullYear();
    return this.feriadoConfigService.importar(year);
  }

  @Post("feriados")
  criarFeriado(
    @Body()
    body: {
      data: string;
      nome: string;
      tipo?: string;
      bloqueiaRegistro?: boolean;
      observacao?: string;
      marcoHorario?: string | null;
      marcoLado?: string | null;
    }
  ) {
    return this.feriadoConfigService.criar(body);
  }

  @Patch("feriados/:id")
  atualizarFeriado(
    @Param("id") id: string,
    @Body()
    body: {
      nome?: string;
      tipo?: string;
      bloqueiaRegistro?: boolean;
      observacao?: string;
      marcoHorario?: string | null;
      marcoLado?: string | null;
    }
  ) {
    return this.feriadoConfigService.atualizar(id, body);
  }

  @Patch("feriados/:id/bloqueio")
  toggleBloqueio(@Param("id") id: string) {
    return this.feriadoConfigService.toggleBloqueio(id);
  }

  @Delete("feriados/:id")
  deletarFeriado(@Param("id") id: string) {
    return this.feriadoConfigService.deletar(id);
  }
}
