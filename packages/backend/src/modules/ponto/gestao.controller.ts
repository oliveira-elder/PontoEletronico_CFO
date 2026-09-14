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
import {
  GestaoService,
  CamposSimplesFuncionario as CamposSimplesFuncionarioBody
} from "./gestao.service";

interface AuthRequest {
  user: { sub: string; name?: string; email?: string; roles: string[]; isSuperAdmin?: boolean };
}

@Controller("ponto/gestao")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class GestaoController {
  constructor(private readonly gestaoService: GestaoService) {}

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
    >
  ) {
    return this.gestaoService.updateFuncionario(id, body);
  }

  @Get("funcionarios/:id/lotacao-historico")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  getLotacaoHistorico(@Param("id") id: string) {
    return this.gestaoService.getLotacaoHistorico(id);
  }

  @Post("funcionarios/:id/lotacao-historico")
  @Roles("gestor", "ponto-admin", "RH_AUDITORIA", "PONTO_ADMIN")
  registrarMovimentacaoLotacao(
    @Param("id") id: string,
    @Body()
    body: {
      cargo: string;
      gerenciaId: string | null;
      subsecao: string | null;
      situacaoAtiva: boolean;
      data: string | null;
      vigenciaDesde: string;
    }
  ) {
    return this.gestaoService.registrarMovimentacaoLotacao(id, body);
  }

  @Post("funcionarios/:id/requerimento-endereco")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  criarRequerimentoEndereco(@Param("id") id: string) {
    return this.gestaoService.criarRequerimentoEndereco(id);
  }

  @Post("requerimento-endereco/todos")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  criarRequerimentoEnderecoTodos() {
    return this.gestaoService.criarRequerimentoEnderecoTodos();
  }

  @Get("funcionarios/:id/endereco")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  getEndereco(@Param("id") id: string) {
    return this.gestaoService.getEndereco(id);
  }

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

  @Patch("funcionarios/:id/modalidade")
  @Roles("ponto-admin", "PONTO_ADMIN", "RH_AUDITORIA")
  setModalidade(
    @Param("id") id: string,
    @Body() body: { modoHomeOffice: boolean; modoHibridoLocal: boolean }
  ) {
    return this.gestaoService.setModalidade(id, body.modoHomeOffice, body.modoHibridoLocal);
  }

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
