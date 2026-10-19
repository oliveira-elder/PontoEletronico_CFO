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
  BadRequestException,
  ForbiddenException,
  Request
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  PermissaoRhGuard,
  acessoDependeDoPerfilRh,
  exigirRecursoRh
} from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { CAMPOS_SISTEMA_POR_FUNCAO } from "../../utils/recursos-rh";
import { TIPO_ABONO } from "../../utils/feriado-rotulo";
import { inteiroConfig } from "../../utils/licenca-regras";
import {
  listarCidGrupos,
  listarTiposLicenca,
  normalizarTipoLicenca,
  validarCidGrupo
} from "../../utils/licenca-db";
import { ConfigService } from "./config.service";
import { ConfigSolicitacoesService, ConfigSolicitacoesData } from "./config-solicitacoes.service";
import { FeriadoConfigService } from "./feriado-config.service";
import { ApiServidoraService, FeriadoSyncAction } from "../api-servidora/api-servidora.service";

const ADMIN_CONFIG_ROLES = ["ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA"] as const;

type UsuarioAuth = { sub: string; roles?: string[]; isSuperAdmin?: boolean };

@Controller("ponto/config")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class ConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly configSolicitacoesService: ConfigSolicitacoesService,
    private readonly feriadoConfigService: FeriadoConfigService,
    private readonly apiServidora: ApiServidoraService
  ) {}

  /** Perfil do RH para feriados: abono do RH exige "Abonar dia"; os demais, "Gerenciar feriados". */
  private exigirFuncaoFeriado(user: UsuarioAuth, ehAbono: boolean) {
    return exigirRecursoRh(
      this.prisma,
      user,
      [...ADMIN_CONFIG_ROLES],
      ehAbono ? "configuracoes.feriados.abonar" : "configuracoes.feriados.gerenciar"
    );
  }

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
  async updateSistema(
    @Body() body: Record<string, unknown>,
    @Request() req: { user: UsuarioAuth }
  ) {
    /* Perfil do RH: a rota é compartilhada por Instituição, Registro e Períodos — exige a
       função de cada campo que MUDA de valor (campos repetidos sem mudança não bloqueiam). */
    if (acessoDependeDoPerfilRh(req.user, [...ADMIN_CONFIG_ROLES])) {
      const atual = (await this.configService.getSistema()) as unknown as Record<string, unknown>;
      const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v));
      const funcaoDoCampo = new Map(
        Object.entries(CAMPOS_SISTEMA_POR_FUNCAO).flatMap(([fn, campos]) =>
          campos.map((c) => [c, fn] as const)
        )
      );
      const funcoes = new Set<string>();
      for (const [campo, valor] of Object.entries(body)) {
        if (["id", "createdAt", "updatedAt", "dataInicioProducao"].includes(campo)) continue;
        if (norm(valor) === norm(atual?.[campo])) continue;
        const fn = funcaoDoCampo.get(campo);
        if (!fn) {
          throw new ForbiddenException(
            `O campo "${campo}" só pode ser alterado pelo Gerente de RH.`
          );
        }
        funcoes.add(fn);
      }
      for (const fn of funcoes) {
        await exigirRecursoRh(this.prisma, req.user, [...ADMIN_CONFIG_ROLES], fn);
      }
    }
    /* CPF de quem alterou os dados da instituição (AFD tipo 2, Anexo IX item 6.1). */
    const resp = await this.prisma.funcionario.findFirst({
      where: { user: { externalId: req.user.sub } },
      select: { cpf: true }
    });
    return this.configService.updateSistema(body, resp?.cpf ?? null);
  }

  /* ─── Provedores ─── */

  @Get("provedores")
  @Roles("gestor", "ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  listProvedores() {
    return this.configService.listProvedores();
  }

  @RecursoRh("configuracoes.rede.provedores")
  @Post("provedores")
  @Roles(...ADMIN_CONFIG_ROLES)
  createProvedor(@Body() body: { nome: string; ip: string; isPrincipal: boolean }) {
    return this.configService.createProvedor(body);
  }

  @RecursoRh("configuracoes.rede.provedores")
  @Patch("provedores/:id/toggle")
  @Roles(...ADMIN_CONFIG_ROLES)
  toggleProvedor(@Param("id") id: string) {
    return this.configService.toggleProvedor(id);
  }

  @RecursoRh("configuracoes.rede.provedores")
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

  @RecursoRh("configuracoes.rede.subredes")
  @Post("subredes")
  @Roles(...ADMIN_CONFIG_ROLES)
  createSubrede(@Body() body: { cidr: string; descricao?: string }) {
    return this.configService.createSubrede(body);
  }

  @RecursoRh("configuracoes.rede.subredes")
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

  @RecursoRh("configuracoes.areas.gerenciar")
  @Post("areas")
  @Roles(...ADMIN_CONFIG_ROLES)
  createArea(
    @Body() body: { nome: string; descricao?: string; lat: number; lng: number; raioMetros: number }
  ) {
    return this.configService.createArea(body);
  }

  @RecursoRh("configuracoes.areas.gerenciar")
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

  @RecursoRh("configuracoes.areas.gerenciar")
  @Patch("areas/:id/toggle")
  @Roles(...ADMIN_CONFIG_ROLES)
  toggleArea(@Param("id") id: string) {
    return this.configService.toggleArea(id);
  }

  @RecursoRh("configuracoes.areas.gerenciar")
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

  @RecursoRh("configuracoes.periodos.jornadas")
  @Post("jornadas")
  @Roles(...ADMIN_CONFIG_ROLES)
  createJornada(@Body() body: Record<string, unknown>) {
    return this.configService.createJornada(body as never);
  }

  @RecursoRh("configuracoes.periodos.jornadas")
  @Put("jornadas/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  updateJornada(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.configService.updateJornada(id, body);
  }

  @RecursoRh("configuracoes.periodos.jornadas")
  @Patch("jornadas/:id/padrao")
  @Roles(...ADMIN_CONFIG_ROLES)
  setJornadaPadrao(@Param("id") id: string) {
    return this.configService.setJornadaPadrao(id);
  }

  @RecursoRh("configuracoes.periodos.jornadas")
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

  @RecursoRh("configuracoes.periodos.marcos")
  @Post("banco-horas/marcos")
  @Roles(...ADMIN_CONFIG_ROLES)
  createMarcoBancoHoras(@Body() body: { dia: number; mes: number; descricao?: string }) {
    return this.configService.createMarcoBancoHoras(body);
  }

  /** Tolerância global do fechamento do banco (dias após a data-marco); individual sobrepõe. */
  @Get("banco-horas/tolerancia-fechamento")
  @Roles(...ADMIN_CONFIG_ROLES)
  async getToleranciaFechamento() {
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasToleranciaFechamentoDias: true }
    });
    return { dias: cfg?.bancoHorasToleranciaFechamentoDias ?? 0 };
  }

  @RecursoRh("configuracoes.periodos.marcos")
  @Put("banco-horas/tolerancia-fechamento")
  @Roles(...ADMIN_CONFIG_ROLES)
  async setToleranciaFechamento(@Body() body: { dias?: unknown }) {
    let dias: number | null;
    try {
      dias = inteiroConfig(body?.dias, "Tolerância do fechamento (dias)");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (dias === null) {
      throw new BadRequestException("Informe a tolerância em dias (0 = sem tolerância).");
    }
    await this.prisma.configuracaoSistema.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", bancoHorasToleranciaFechamentoDias: dias },
      update: { bancoHorasToleranciaFechamentoDias: dias }
    });
    return { dias };
  }

  @RecursoRh("configuracoes.periodos.marcos")
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

  @RecursoRh("configuracoes.solicitacoes.salvar")
  @Put("solicitacoes")
  @Roles(...ADMIN_CONFIG_ROLES)
  async updateConfigSolicitacoes(@Body() body: Partial<ConfigSolicitacoesData>) {
    return this.configSolicitacoesService.updateConfig(body);
  }

  /* ─── Grupos do CID (atestado) e tipos de licença: gerenciados pelo RH ─── */

  private exigirSuperAdmin(user: UsuarioAuth, acao: string) {
    if (!user?.isSuperAdmin) {
      throw new ForbiddenException(`Apenas o super usuário pode ${acao}. Use "Desativar".`);
    }
  }

  private async erroOuBadRequest<T>(fn: () => Promise<T> | T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof BadRequestException || e instanceof ForbiddenException) throw e;
      const msg =
        (e as { code?: string }).code === "P2002"
          ? "Já existe um registro com este valor."
          : (e as Error).message;
      throw new BadRequestException(msg);
    }
  }

  @Get("cid-grupos")
  @Roles() // dropdown do atestado: só os ativos
  listarCidGruposAtivos() {
    return listarCidGrupos(this.prisma, true);
  }

  @RecursoRh("configuracoes.solicitacoes.cid-grupos")
  @Get("cid-grupos/gestao")
  @Roles(...ADMIN_CONFIG_ROLES)
  listarCidGruposGestao() {
    return listarCidGrupos(this.prisma, false);
  }

  @RecursoRh("configuracoes.solicitacoes.cid-grupos")
  @Post("cid-grupos")
  @Roles(...ADMIN_CONFIG_ROLES)
  criarCidGrupo(@Body() body: { codigo?: string; descricao?: string }) {
    return this.erroOuBadRequest(async () => {
      const dados = validarCidGrupo(body);
      const ultimo = await this.prisma.cidGrupo.aggregate({ _max: { ordem: true } });
      return this.prisma.cidGrupo.create({
        data: { ...dados, ordem: (ultimo._max.ordem ?? 0) + 1 }
      });
    });
  }

  @RecursoRh("configuracoes.solicitacoes.cid-grupos")
  @Patch("cid-grupos/ordem")
  @Roles(...ADMIN_CONFIG_ROLES)
  async ordenarCidGrupos(@Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.cidGrupo.update({ where: { id }, data: { ordem: i + 1 } }))
    );
    return listarCidGrupos(this.prisma, false);
  }

  @RecursoRh("configuracoes.solicitacoes.cid-grupos")
  @Put("cid-grupos/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  editarCidGrupo(@Param("id") id: string, @Body() body: { codigo?: string; descricao?: string }) {
    return this.erroOuBadRequest(async () => {
      const dados = validarCidGrupo(body);
      return this.prisma.cidGrupo.update({ where: { id }, data: dados });
    });
  }

  @RecursoRh("configuracoes.solicitacoes.cid-grupos")
  @Patch("cid-grupos/:id/ativo")
  @Roles(...ADMIN_CONFIG_ROLES)
  ativarCidGrupo(@Param("id") id: string, @Body() body: { ativo: boolean }) {
    return this.prisma.cidGrupo.update({ where: { id }, data: { ativo: !!body.ativo } });
  }

  @Delete("cid-grupos/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  async excluirCidGrupo(@Param("id") id: string, @Request() req: { user: UsuarioAuth }) {
    this.exigirSuperAdmin(req.user, "excluir grupos do CID");
    await this.prisma.cidGrupo.delete({ where: { id } });
    return { ok: true };
  }

  @Get("tipos-licenca")
  @Roles() // lista de tipos ativos (regras); o saldo vem de /ponto/licenca/tipos
  listarTiposLicencaAtivos() {
    return listarTiposLicenca(this.prisma, true);
  }

  @RecursoRh("configuracoes.solicitacoes.tipos-licenca")
  @Get("tipos-licenca/gestao")
  @Roles(...ADMIN_CONFIG_ROLES)
  listarTiposLicencaGestao() {
    return listarTiposLicenca(this.prisma, false);
  }

  @RecursoRh("configuracoes.solicitacoes.tipos-licenca")
  @Post("tipos-licenca")
  @Roles(...ADMIN_CONFIG_ROLES)
  criarTipoLicenca(@Body() body: Record<string, unknown>) {
    return this.erroOuBadRequest(async () => {
      await listarTiposLicenca(this.prisma, false);
      const dados = normalizarTipoLicenca(body);
      const ultimo = await this.prisma.tipoLicenca.aggregate({ _max: { ordem: true } });
      return this.prisma.tipoLicenca.create({
        data: { ...dados, ordem: (ultimo._max.ordem ?? 0) + 1 }
      });
    });
  }

  @RecursoRh("configuracoes.solicitacoes.tipos-licenca")
  @Patch("tipos-licenca/ordem")
  @Roles(...ADMIN_CONFIG_ROLES)
  async ordenarTiposLicenca(@Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.tipoLicenca.update({ where: { id }, data: { ordem: i + 1 } }))
    );
    return listarTiposLicenca(this.prisma, false);
  }

  @RecursoRh("configuracoes.solicitacoes.tipos-licenca")
  @Put("tipos-licenca/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  editarTipoLicenca(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.erroOuBadRequest(async () => {
      const dados = normalizarTipoLicenca(body);
      return this.prisma.tipoLicenca.update({ where: { id }, data: dados });
    });
  }

  @RecursoRh("configuracoes.solicitacoes.tipos-licenca")
  @Patch("tipos-licenca/:id/ativo")
  @Roles(...ADMIN_CONFIG_ROLES)
  ativarTipoLicenca(@Param("id") id: string, @Body() body: { ativo: boolean }) {
    return this.prisma.tipoLicenca.update({ where: { id }, data: { ativo: !!body.ativo } });
  }

  @Delete("tipos-licenca/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  async excluirTipoLicenca(@Param("id") id: string, @Request() req: { user: UsuarioAuth }) {
    this.exigirSuperAdmin(req.user, "excluir tipos de licença");
    await this.prisma.tipoLicenca.delete({ where: { id } });
    return { ok: true };
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

  @RecursoRh("configuracoes.feriados.gerenciar")
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
    },
    @Request() req: { user: UsuarioAuth }
  ) {
    await this.exigirFuncaoFeriado(req.user, body?.tipo === TIPO_ABONO);
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
    },
    @Request() req: { user: UsuarioAuth }
  ) {
    /* Transformar em abono, ou editar um abono existente, exige "Abonar dia". */
    const existente = await this.prisma.feriadoConfig.findUnique({
      where: { id },
      select: { tipo: true }
    });
    await this.exigirFuncaoFeriado(
      req.user,
      body?.tipo === TIPO_ABONO || existente?.tipo === TIPO_ABONO
    );
    const updated = await this.feriadoConfigService.atualizar(id, body);
    this.publicarFeriadosApi("update", { feriadoId: id });
    return updated;
  }

  @RecursoRh("configuracoes.feriados.gerenciar")
  @Patch("feriados/:id/bloqueio")
  @Roles(...ADMIN_CONFIG_ROLES)
  async toggleBloqueio(@Param("id") id: string) {
    const updated = await this.feriadoConfigService.toggleBloqueio(id);
    this.publicarFeriadosApi("toggle", { feriadoId: id });
    return updated;
  }

  @Delete("feriados/:id")
  @Roles(...ADMIN_CONFIG_ROLES)
  async deletarFeriado(@Param("id") id: string, @Request() req: { user: UsuarioAuth }) {
    const existente = await this.prisma.feriadoConfig.findUnique({
      where: { id },
      select: { tipo: true }
    });
    await this.exigirFuncaoFeriado(req.user, existente?.tipo === TIPO_ABONO);
    const result = await this.feriadoConfigService.deletar(id);
    this.publicarFeriadosApi("delete", { feriadoId: id });
    return result;
  }
}
