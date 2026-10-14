import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  ForbiddenException,
  BadRequestException
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard, exigirRecursoRh } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import {
  GestaoService,
  CamposSimplesFuncionario as CamposSimplesFuncionarioBody,
  LinhaLotacaoBody
} from "./gestao.service";
import type { PeriodoCessao } from "../../utils/cessao-historico";

interface AuthRequest {
  user: { sub: string; name?: string; email?: string; roles: string[]; isSuperAdmin?: boolean };
}

@Controller("ponto/gestao")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class GestaoController {
  constructor(
    private readonly gestaoService: GestaoService,
    private readonly prisma: PrismaService
  ) {}

  /* ─── Gerências ─── */

  @Get("gerencias")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  listGerencias() {
    return this.gestaoService.listGerencias();
  }

  @Post("gerencias")
  @Roles("ponto-admin")
  createGerencia(
    @Body() body: { nome: string; sigla: string; responsavel?: string; descricao?: string }
  ) {
    return this.gestaoService.createGerencia(body);
  }

  @Put("gerencias/:id")
  @Roles("ponto-admin")
  updateGerencia(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      nome: string;
      sigla: string;
      responsavel: string;
      descricao: string;
      ativa: boolean;
    }>
  ) {
    return this.gestaoService.updateGerencia(id, body);
  }

  @Patch("gerencias/:id/responsavel")
  @Roles("ponto-admin", "PONTO_ADMIN")
  setResponsavelGerencia(
    @Param("id") id: string,
    @Body() body: { responsavelUserId: string | null }
  ) {
    return this.gestaoService.setResponsavelGerencia(id, body.responsavelUserId);
  }

  @Delete("gerencias/:id")
  @Roles("ponto-admin")
  deleteGerencia(@Param("id") id: string) {
    return this.gestaoService.deleteGerencia(id);
  }

  /* ─── Funcionários ─── */

  @Get("funcionarios")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  listFuncionarios() {
    return this.gestaoService.listFuncionarios();
  }

  @RecursoRh("dashboard.visao-geral", "dashboard.perfil-diversidade", "dashboard.alertas-eventos")
  @Get("dashboard")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  getDashboardStats() {
    return this.gestaoService.getDashboardStats();
  }

  @Post("funcionarios")
  @Roles("gestor", "ponto-admin")
  createFuncionario(
    @Body()
    body: {
      nome: string;
      email: string;
      matricula: string;
      cargo?: string;
      cpf?: string;
      categoria: string;
      gerenciaId?: string;
      subsecao?: string | null;
      isManager?: boolean;
      dataNascimento?: string | null;
      dataAdmissao?: string | null;
      modoHomeOffice?: boolean;
      modoHibridoLocal?: boolean;
      dependentes?: { nome: string; cpf?: string | null; dataNascimento?: string | null }[];
      formacoesAcademicas?: {
        grauEscolaridade?: string | null;
        curso: string;
        instituicao?: string | null;
        conclusao?: string | null;
      }[];
      capacitacoes?: { nome: string; instituicao?: string | null; conclusao?: string | null }[];
    } & CamposSimplesFuncionarioBody
  ) {
    return this.gestaoService.createFuncionario({ ...body, cargo: body.cargo ?? "" });
  }

  @RecursoRh("gestao.funcionarios.editar")
  @Put("funcionarios/:id")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  updateFuncionario(
    @Param("id") id: string,
    @Body()
    body: Partial<
      {
        nome: string;
        email: string;
        matricula: string;
        cpf: string;
        cargo: string;
        categoria: string;
        gerenciaId: string;
        subsecao: string | null;
        ativo: boolean;
        camposManuaisConfigurados: boolean;
        dataNascimento: string | null;
        dataAdmissao: string | null;
        dataDesligamento: string | null;
        modoHomeOffice: boolean;
        modoHibridoLocal: boolean;
        supervisorEstagioId: string | null;
        substitutoId: string | null;
        substitutoDataInicio: string | null;
        substitutoDataFim: string | null;
        isManager: boolean;
        dependentes: { nome: string; cpf?: string | null; dataNascimento?: string | null }[];
        formacoesAcademicas: {
          grauEscolaridade?: string | null;
          curso: string;
          instituicao?: string | null;
          conclusao?: string | null;
        }[];
        capacitacoes: { nome: string; instituicao?: string | null; conclusao?: string | null }[];
      } & CamposSimplesFuncionarioBody
    >,
    @Request() req: { user: { sub: string } }
  ) {
    return this.gestaoService.updateFuncionario(id, body, req.user.sub);
  }

  @RecursoRh("gestao.funcionarios")
  @Get("funcionarios/:id/lotacao-historico")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  getLotacaoHistorico(@Param("id") id: string) {
    return this.gestaoService.getLotacaoHistorico(id);
  }

  @RecursoRh("gestao.funcionarios.lotacao")
  @Post("funcionarios/:id/lotacao-historico")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  adicionarLotacao(@Param("id") id: string, @Body() body: LinhaLotacaoBody) {
    return this.gestaoService.adicionarLotacao(id, body);
  }

  @RecursoRh("gestao.funcionarios.lotacao")
  @Patch("funcionarios/:id/lotacao-historico/:vigenciaId")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  atualizarLotacao(
    @Param("id") id: string,
    @Param("vigenciaId") vigenciaId: string,
    @Body() body: LinhaLotacaoBody
  ) {
    return this.gestaoService.atualizarLotacao(id, vigenciaId, body);
  }

  @RecursoRh("gestao.funcionarios")
  @Get("funcionarios/:id/banco-horas/tolerancia-fechamento")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  getToleranciaFechamento(@Param("id") id: string) {
    return this.gestaoService.getToleranciaFechamento(id);
  }

  @RecursoRh("gestao.funcionarios.banco-horas")
  @Put("funcionarios/:id/banco-horas/tolerancia-fechamento")
  @Roles("ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  setToleranciaFechamento(@Param("id") id: string, @Body() body: { dias?: unknown }) {
    return this.gestaoService.setToleranciaFechamento(id, body?.dias);
  }

  @RecursoRh("gestao.funcionarios")
  @Get("funcionarios/:id/cessoes")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  getCessoes(@Param("id") id: string) {
    return this.gestaoService.getCessoes(id);
  }

  @RecursoRh("gestao.funcionarios.cessao")
  @Post("funcionarios/:id/cessoes")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  adicionarCessao(@Param("id") id: string, @Body() body: PeriodoCessao) {
    return this.gestaoService.adicionarCessao(id, body);
  }

  @RecursoRh("gestao.funcionarios.cessao")
  @Patch("funcionarios/:id/cessoes/:cessaoId")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  atualizarCessao(
    @Param("id") id: string,
    @Param("cessaoId") cessaoId: string,
    @Body() body: PeriodoCessao
  ) {
    return this.gestaoService.atualizarCessao(id, cessaoId, body);
  }

  @RecursoRh("gestao.funcionarios.cessao")
  @Delete("funcionarios/:id/cessoes/:cessaoId")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  removerCessao(@Param("id") id: string, @Param("cessaoId") cessaoId: string) {
    return this.gestaoService.removerCessao(id, cessaoId);
  }

  @RecursoRh("gestao.funcionarios.lotacao")
  @Delete("funcionarios/:id/lotacao-historico/:vigenciaId")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  removerLotacao(@Param("id") id: string, @Param("vigenciaId") vigenciaId: string) {
    return this.gestaoService.removerLotacao(id, vigenciaId);
  }

  @RecursoRh("gestao.funcionarios.requerimento")
  @Post("funcionarios/:id/requerimento-endereco")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  criarRequerimentoEndereco(@Param("id") id: string) {
    return this.gestaoService.criarRequerimentoEndereco(id);
  }

  @RecursoRh("gestao.solicitar-todos.endereco")
  @Post("requerimento-endereco/todos")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  criarRequerimentoEnderecoTodos() {
    return this.gestaoService.criarRequerimentoEnderecoTodos();
  }

  @RecursoRh("gestao.solicitar-todos")
  @Get("requerimento-endereco/alvos")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  contarAlvosRequerimentoEndereco() {
    return this.gestaoService.contarAlvosRequerimentoEndereco();
  }

  @RecursoRh("gestao.funcionarios.requerimento")
  @Post("funcionarios/:id/requerimento-cadastro/:tipo")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  criarRequerimentoCadastro(@Param("id") id: string, @Param("tipo") tipo: string) {
    return this.gestaoService.criarRequerimentoCadastro(id, tipo);
  }

  @RecursoRh("gestao.solicitar-todos")
  @Get("requerimento-cadastro/:tipo/alvos")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  contarAlvosRequerimentoCadastro(@Param("tipo") tipo: string) {
    return this.gestaoService.contarAlvosRequerimentoCadastro(tipo);
  }

  @RecursoRh(
    "gestao.solicitar-todos.dependentes",
    "gestao.solicitar-todos.formacao",
    "gestao.solicitar-todos.cursos"
  )
  @Post("requerimento-cadastro/:tipo/todos")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  async criarRequerimentoCadastroTodos(
    @Param("tipo") tipo: string,
    @Request() req: { user: { sub: string; roles: string[]; isSuperAdmin?: boolean } }
  ) {
    /* A rota serve aos três tipos: exige a função do tipo enviado. */
    const funcaoPorTipo: Record<string, string> = {
      DEPENDENTES: "gestao.solicitar-todos.dependentes",
      FORMACAO_ACADEMICA: "gestao.solicitar-todos.formacao",
      CAPACITACOES: "gestao.solicitar-todos.cursos"
    };
    if (funcaoPorTipo[tipo]) {
      await exigirRecursoRh(
        this.prisma,
        req.user,
        ["ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA"],
        funcaoPorTipo[tipo]
      );
    }
    return this.gestaoService.criarRequerimentoCadastroTodos(tipo);
  }

  @RecursoRh("gestao.funcionarios")
  @Get("funcionarios/:id/endereco")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  getEndereco(@Param("id") id: string) {
    return this.gestaoService.getEndereco(id);
  }

  @RecursoRh("gestao.funcionarios.editar")
  @Put("funcionarios/:id/endereco")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  upsertEndereco(
    @Param("id") id: string,
    @Body()
    body: {
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      lat?: number | null;
      lng?: number | null;
      raioMetros?: number;
    }
  ) {
    return this.gestaoService.upsertEndereco(id, body);
  }

  @RecursoRh("gestao.funcionarios.editar")
  @Patch("funcionarios/:id/modalidade")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  setModalidade(
    @Param("id") id: string,
    @Body() body: { modoHomeOffice: boolean; modoHibridoLocal: boolean }
  ) {
    return this.gestaoService.setModalidade(id, body.modoHomeOffice, body.modoHibridoLocal);
  }

  @RecursoRh("gestao.funcionarios.editar")
  @Patch("funcionarios/:id/jornada-periodo")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  setJornadaPeriodo(@Param("id") id: string, @Body() body: { jornadaPeriodoId: string | null }) {
    return this.gestaoService.setJornadaPeriodo(id, body.jornadaPeriodoId);
  }

  @Delete("funcionarios/:id")
  @Roles("ponto-admin")
  deleteFuncionario(
    @Param("id") id: string,
    @Body() body: { numeroChamado?: string },
    @Request() req: AuthRequest
  ) {
    if (!req.user?.isSuperAdmin) {
      throw new ForbiddenException("Apenas o Super Administrador pode excluir funcionários.");
    }
    const numeroChamado = body?.numeroChamado?.trim();
    if (!numeroChamado) {
      throw new BadRequestException(
        "Informe o número do chamado interno que autoriza esta exclusão."
      );
    }
    return this.gestaoService.deleteFuncionario(id, req.user.sub, numeroChamado);
  }
}
