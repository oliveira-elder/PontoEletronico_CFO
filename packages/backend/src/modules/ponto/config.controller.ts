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
import { ApiServidoraService, FeriadoSyncAction } from "../api-servidora/api-servidora.service";

const ADMIN_CONFIG_ROLES = ["ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA"] as const;

@Controller("ponto/config")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    private readonly configSolicitacoesService: ConfigSolicitacoesService,
    private readonly feriadoConfigService: FeriadoConfigService,
    private readonly apiServidora: ApiServidoraService
  ) {}

  private publicarFeriadosApi(action: FeriadoSyncAction, meta?: Record<string, unknown>) {
    void this.apiServidora.notifyFeriadosChanged(action, meta).catch(() => null);
  }

  /* ─── ConfiguracaoSistema ─── */

  /* Config do sistema: leitura aberta para qualquer usuário SSO autenticado
     (necessária para a tela de registro de ponto). Escrita continua restrita. */
  @Get("sistema")
  @Roles()
  getSistema() {
    return this.configService.getSistema();
  }

  @Put("sistema")
  @Roles(...ADMIN_CONFIG_ROLES)
  updateSistema(@Body() body: Record<string, unknown>) {
    return this.configService.updateSistema(body);
  }

  /* ─── Provedores ─── */

  @Get("provedores")
  @Roles("gestor", "ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  listProvedores() {
    return this.configService.listProvedores();
  }

  @Post("provedores")
  @Roles(...ADMIN_CONFIG_ROLES)
  createProvedor(@Body() body: { nome: string; ip: string; isPrincipal: boolean }) {
    return this.configService.createProvedor(body);
  }

  @Patch("provedores/:id/toggle")
  @Roles(...ADMIN_CONFIG_ROLES)
  toggleProvedor(@Param("id") id: string) {
    return this.configService.toggleProvedor(id);
  }

  @Delete("provedores/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  deleteProvedor(@Param("id") id: string) {
    return this.configService.deleteProvedor(id);
  }

  /* ─── Subredes ─── */

  @Get("subredes")
  @Roles("gestor", "ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  listSubredes() {
    return this.configService.listSubredes();
  }

  @Post("subredes")
  @Roles(...ADMIN_CONFIG_ROLES)
  createSubrede(@Body() body: { cidr: string; descricao?: string }) {
    return this.configService.createSubrede(body);
  }

  @Delete("subredes/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  deleteSubrede(@Param("id") id: string) {
    return this.configService.deleteSubrede(id);
  }

  /* ─── Áreas de Viagem ─── */

  @Get("areas")
  @Roles() // leitura aberta: necessária para registro de ponto em viagem
  listAreas() {
    return this.configService.listAreas();
  }

  @Post("areas")
  @Roles(...ADMIN_CONFIG_ROLES)
  createArea(
    @Body() body: { nome: string; descricao?: string; lat: number; lng: number; raioMetros: number }
  ) {
    return this.configService.createArea(body);
  }

  @Patch("areas/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
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
  @Roles(...ADMIN_CONFIG_ROLES)
  toggleArea(@Param("id") id: string) {
    return this.configService.toggleArea(id);
  }

  @Delete("areas/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
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
  @Roles(...ADMIN_CONFIG_ROLES)
  createJornada(@Body() body: Record<string, unknown>) {
    return this.configService.createJornada(body as never);
  }

  @Put("jornadas/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  updateJornada(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.configService.updateJornada(id, body);
  }

  @Patch("jornadas/:id/padrao")
  @Roles(...ADMIN_CONFIG_ROLES)
  setJornadaPadrao(@Param("id") id: string) {
    return this.configService.setJornadaPadrao(id);
  }

  @Delete("jornadas/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
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
  @Roles(...ADMIN_CONFIG_ROLES)
  createMarcoBancoHoras(@Body() body: { dia: number; mes: number; descricao?: string }) {
    return this.configService.createMarcoBancoHoras(body);
  }

  @Delete("banco-horas/marcos/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
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
  @Roles(...ADMIN_CONFIG_ROLES)
  async updateConfigSolicitacoes(@Body() body: Partial<ConfigSolicitacoesData>) {
    return this.configSolicitacoesService.updateConfig(body);
  }

  /* ─── Feriados ─── */

  @Get("feriados")
  @Roles() // leitura aberta para usuários autenticados
  listarFeriados(@Query("ano") ano?: string) {
    if (ano === undefined || ano.trim() === "") {
      return this.feriadoConfigService.listarTodos();
    }
    const year = parseInt(ano, 10);
    if (!Number.isFinite(year)) {
      return this.feriadoConfigService.listarTodos();
    }
    return this.feriadoConfigService.listarPorAno(year);
  }

  @Post("feriados/importar")
  @Roles(...ADMIN_CONFIG_ROLES)
  async importarFeriados(@Body("ano") ano: number) {
    const year = ano || new Date().getFullYear();
    const result = await this.feriadoConfigService.importar(year);
    this.publicarFeriadosApi("import", { ano: year, ...result });
    return result;
  }

  @Post("feriados")
  @Roles(...ADMIN_CONFIG_ROLES)
  async criarFeriado(
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
    const created = await this.feriadoConfigService.criar(body);
    this.publicarFeriadosApi("create", { feriadoId: created.id, data: body.data });
    return created;
  }

  @Patch("feriados/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  async atualizarFeriado(
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
    const updated = await this.feriadoConfigService.atualizar(id, body);
    this.publicarFeriadosApi("update", { feriadoId: id });
    return updated;
  }

  @Patch("feriados/:id/bloqueio")
  @Roles(...ADMIN_CONFIG_ROLES)
  async toggleBloqueio(@Param("id") id: string) {
    const updated = await this.feriadoConfigService.toggleBloqueio(id);
    this.publicarFeriadosApi("toggle", { feriadoId: id });
    return updated;
  }

  @Delete("feriados/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  async deletarFeriado(@Param("id") id: string) {
    const result = await this.feriadoConfigService.deletar(id);
    this.publicarFeriadosApi("delete", { feriadoId: id });
    return result;
  }
}
