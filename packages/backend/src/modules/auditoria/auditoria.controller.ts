import { Controller, Get, Put, Param, Query, Body, UseGuards, Request } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuditoriaService } from "./auditoria.service";

interface AuthRequest {
  user: { sub: string; name?: string; email?: string; roles: string[] };
}

@Controller("auditoria")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN", "gestor", "GESTOR_APROVACAO")
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /* ─── Dashboard ─── */

  @Get("dashboard")
  getDashboard() {
    return this.auditoriaService.getDashboard();
  }

  /* ─── Funcionários ─── */

  @Get("funcionarios")
  getFuncionarios(
    @Query("busca") busca?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("ativo") ativo?: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string
  ) {
    return this.auditoriaService.getFuncionarios({
      busca,
      gerenciaId,
      ativo: ativo !== undefined ? ativo === "true" : undefined,
      mes: mes ? parseInt(mes) : undefined,
      ano: ano ? parseInt(ano) : undefined
    });
  }

  @Get("funcionarios/:id")
  getFuncionarioDetalhe(@Param("id") id: string) {
    return this.auditoriaService.getFuncionarioDetalhe(id);
  }

  @Get("funcionarios/:id/registros")
  getRegistrosFuncionario(
    @Param("id") id: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string,
    @Query("tipo") tipo?: string
  ) {
    return this.auditoriaService.getRegistrosFuncionario(id, {
      mes: mes ? parseInt(mes) : undefined,
      ano: ano ? parseInt(ano) : undefined,
      tipo
    });
  }

  @Get("funcionarios/:id/relatorio")
  getRelatorioMensal(
    @Param("id") id: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string
  ) {
    const agora = new Date();
    return this.auditoriaService.getRelatorioMensal(
      id,
      mes ? parseInt(mes) : agora.getMonth() + 1,
      ano ? parseInt(ano) : agora.getFullYear()
    );
  }

  /* ─── Registros ─── */

  @Get("registros")
  getRegistros(
    @Query("funcionarioId") funcionarioId?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("tipo") tipo?: string,
    @Query("origem") origem?: string,
    @Query("ajustado") ajustado?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getRegistros({
      funcionarioId,
      gerenciaId,
      dataInicio,
      dataFim,
      tipo,
      origem,
      ajustado: ajustado !== undefined ? ajustado === "true" : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }

  /* ─── Solicitações ─── */

  @Get("solicitacoes")
  getSolicitacoes(
    @Query("status") status?: string,
    @Query("tipo") tipo?: string,
    @Query("funcionarioId") funcionarioId?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getSolicitacoes({
      status,
      tipo,
      funcionarioId,
      gerenciaId,
      dataInicio,
      dataFim,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }

  @Put("solicitacoes/:id/status")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN", "gestor", "GESTOR_APROVACAO")
  atualizarStatusSolicitacao(
    @Param("id") id: string,
    @Body() body: { status: "APROVADA" | "REJEITADA"; observacaoGestor: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.atualizarStatusSolicitacao(
      id,
      body.status,
      body.observacaoGestor,
      req.user.sub
    );
  }

  /* ─── Afastamentos ─── */

  @Get("afastamentos")
  getAfastamentos(
    @Query("funcionarioId") funcionarioId?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("tipo") tipo?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("ativo") ativo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getAfastamentos({
      funcionarioId,
      gerenciaId,
      tipo,
      dataInicio,
      dataFim,
      ativo: ativo === "true" ? true : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }

  /* ─── Períodos ─── */

  @Get("periodos")
  getPeriodos(
    @Query("mes") mes?: string,
    @Query("ano") ano?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getPeriodos({
      mes: mes ? parseInt(mes) : undefined,
      ano: ano ? parseInt(ano) : undefined,
      gerenciaId,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }

  @Put("periodos/:id/status")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  atualizarStatusPeriodo(
    @Param("id") id: string,
    @Body() body: { status: "FECHADO" | "APROVADO" },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.atualizarStatusPeriodo(id, body.status, req.user.sub);
  }

  /* ─── Logs ─── */

  @Get("logs")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getLogs(
    @Query("action") action?: string,
    @Query("actorUserId") actorUserId?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getLogs({
      action,
      actorUserId,
      dataInicio,
      dataFim,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }
}
