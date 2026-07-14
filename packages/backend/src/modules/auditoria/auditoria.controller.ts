import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  ForbiddenException
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuditoriaService, GestorCienciaMeta } from "./auditoria.service";

interface AuthRequest {
  user: { sub: string; name?: string; email?: string; roles: string[]; isSuperAdmin?: boolean };
  headers: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}

function normalizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return ip.trim().replace(/^::ffff:/i, "") || null;
}

/** Extrai IP real / gateway / UA — mesmo padrão da assinatura do quadro de ponto */
function getCienciaMeta(req: AuthRequest): GestorCienciaMeta {
  const xffRaw = req.headers["x-forwarded-for"];
  const xffStr = Array.isArray(xffRaw) ? xffRaw[0] : xffRaw;
  const xff =
    xffStr
      ?.split(",")
      .map((p) => normalizeIp(p))
      .filter((p): p is string => !!p) ?? [];
  const peer = normalizeIp(req.socket?.remoteAddress ?? req.connection?.remoteAddress);
  const ipReal = xff[0] ?? peer ?? "desconhecido";
  const ipGateway = xff.length > 1 ? xff[xff.length - 1] : peer;
  const uaRaw = req.headers["user-agent"];
  const ua = Array.isArray(uaRaw) ? uaRaw[0] : uaRaw;
  return {
    ipReal,
    ipGateway:
      ipGateway && ipGateway !== ipReal ? ipGateway : peer && peer !== ipReal ? peer : ipGateway,
    userAgent: ua?.slice(0, 256) ?? null
  };
}

@Controller("auditoria")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN", "gestor", "GESTOR_APROVACAO")
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /* ─── Dashboard ─── */

  @Get("dashboard")
  getDashboard(@Query("dataInicio") dataInicio?: string, @Query("dataFim") dataFim?: string) {
    return this.auditoriaService.getDashboard({ dataInicio, dataFim });
  }

  @Get("dashboard/registros-hora")
  getRegistrosPorHora(@Query("data") data?: string) {
    return this.auditoriaService.getRegistrosPorHora(data);
  }

  /* ─── Funcionários ─── */

  @Get("funcionarios")
  getFuncionarios(
    @Query("busca") busca?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("ativo") ativo?: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("statusPonto") statusPonto?: string
  ) {
    return this.auditoriaService.getFuncionarios({
      busca,
      gerenciaId,
      ativo: ativo !== undefined ? ativo === "true" : undefined,
      mes: mes ? parseInt(mes) : undefined,
      ano: ano ? parseInt(ano) : undefined,
      dataInicio,
      dataFim,
      statusPonto: statusPonto === "presente" || statusPonto === "ausente" ? statusPonto : undefined
    });
  }

  @Get("funcionarios/:id")
  getFuncionarioDetalhe(@Param("id") id: string) {
    return this.auditoriaService.getFuncionarioDetalhe(id);
  }

  @Get("funcionarios/:id/registros")
  getRegistrosFuncionario(
    @Request() req: AuthRequest,
    @Param("id") id: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string,
    @Query("tipo") tipo?: string
  ) {
    return this.auditoriaService.getRegistrosFuncionario(
      id,
      {
        mes: mes ? parseInt(mes) : undefined,
        ano: ano ? parseInt(ano) : undefined,
        tipo
      },
      !!req.user?.isSuperAdmin
    );
  }

  @Get("funcionarios/:id/relatorio")
  getRelatorioMensal(
    @Request() req: AuthRequest,
    @Param("id") id: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string
  ) {
    const agora = new Date();
    return this.auditoriaService.getRelatorioMensal(
      id,
      mes ? parseInt(mes) : agora.getMonth() + 1,
      ano ? parseInt(ano) : agora.getFullYear(),
      !!req.user?.isSuperAdmin
    );
  }

  @Get("funcionarios/:id/banco-horas")
  getBancoHorasFuncionario(@Param("id") id: string) {
    return this.auditoriaService.getBancoHorasFuncionario(id);
  }

  @Get("funcionarios/:id/documentos-rh")
  getDocumentosRhFuncionario(@Param("id") id: string) {
    return this.auditoriaService.getDocumentosRhFuncionario(id);
  }

  @Delete("funcionarios/:funcionarioId/documentos-rh/:documentoId")
  excluirDocumentoRhFuncionario(
    @Param("funcionarioId") funcionarioId: string,
    @Param("documentoId") documentoId: string,
    @Request() req: AuthRequest
  ) {
    if (!req.user?.isSuperAdmin) {
      throw new ForbiddenException("Acesso restrito a Super Admin.");
    }
    return this.auditoriaService.excluirDocumentoRhFuncionario(funcionarioId, documentoId);
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

  /* ─── Banco de Horas ─── */

  @Get("banco-horas")
  getBancoHorasGeral(
    @Query("busca") busca?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("status") status?: "POSITIVO" | "NEGATIVO" | "EXCEDIDO",
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getBancoHorasGeral({
      busca,
      gerenciaId,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }

  /* ─── Gestão (Gestor de Área) ─── */

  @Get("gestao/equipe")
  @Roles("GESTOR_APROVACAO", "gestor", "ponto-admin", "PONTO_ADMIN")
  getEquipeDoGestor(@Request() req: AuthRequest) {
    const temRoleGestor =
      req.user.roles.includes("GESTOR_APROVACAO") || req.user.roles.includes("gestor");
    return this.auditoriaService.getEquipeDoGestor(
      req.user.sub,
      !!req.user.isSuperAdmin,
      temRoleGestor
    );
  }

  @Get("gestao/solicitacoes")
  @Roles("GESTOR_APROVACAO", "gestor", "ponto-admin", "PONTO_ADMIN")
  getSolicitacoesGestor(
    @Request() req: AuthRequest,
    @Query("status") status?: string,
    @Query("tipo") tipo?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const temRoleGestor =
      req.user.roles.includes("GESTOR_APROVACAO") || req.user.roles.includes("gestor");
    return this.auditoriaService.getSolicitacoesGestor(
      req.user.sub,
      {
        status,
        tipo,
        dataInicio,
        dataFim,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined
      },
      !!req.user.isSuperAdmin,
      temRoleGestor
    );
  }

  @Patch("gestao/solicitacoes/:id")
  @Roles("GESTOR_APROVACAO", "gestor", "ponto-admin", "PONTO_ADMIN")
  gestorResolverSolicitacao(
    @Param("id") id: string,
    @Body() body: { decisao: "APROVAR" | "REJEITAR"; observacao: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.gestorResolverSolicitacao(
      id,
      body.decisao,
      body.observacao,
      req.user.sub,
      !!req.user.isSuperAdmin,
      getCienciaMeta(req)
    );
  }

  /* ─── RH (Aprovação Final) ─── */

  @Get("rh/solicitacoes")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getSolicitacoesParaRH(
    @Query("tipo") tipo?: string,
    @Query("funcionarioId") funcionarioId?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getSolicitacoesParaRH({
      tipo,
      funcionarioId,
      gerenciaId,
      dataInicio,
      dataFim,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }

  @Patch("rh/solicitacoes/:id")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  rhResolverSolicitacao(
    @Param("id") id: string,
    @Body() body: { decisao: "APROVAR" | "REJEITAR"; observacao: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.rhResolverSolicitacao(
      id,
      body.decisao,
      body.observacao,
      req.user.sub
    );
  }

  @Patch("rh/solicitacoes/:id/enviar-guia")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  enviarGuiaMedica(
    @Param("id") id: string,
    @Body() body: { guiaMedicoBase64: string; observacao?: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.rhEnviarGuiaMedica(
      id,
      body.guiaMedicoBase64,
      body.observacao ?? "",
      req.user.sub
    );
  }

  @Patch("rh/solicitacoes/:id/enviar-folha-ferias")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  enviarFolhaFerias(
    @Param("id") id: string,
    @Body() body: { folhaBase64: string; observacao?: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.rhEnviarFolhaFerias(
      id,
      body.folhaBase64,
      body.observacao ?? "",
      req.user.sub
    );
  }

  @Get("rh/funcionarios/:id/ferias/saldo")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getSaldoFerias(@Param("id") id: string) {
    return this.auditoriaService.getSaldoFeriasFuncionario(id);
  }

  /* ─── Recálculo histórico (almoço mínimo) ─── */

  @Post("recalcular-historico-almoco")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  recalcularHistoricoAlmoco() {
    return this.auditoriaService.recalcularHistoricoAlmocoTodos();
  }

  /* ─── Correção de ponto pelo RH ─── */

  @Post("rh/funcionarios/:id/correcao-ponto")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  criarCorrecaoRH(
    @Param("id") id: string,
    @Body()
    body: {
      dataReferencia: string;
      justificativa: string;
      correcoes: Array<{
        acao: "CORRIGIR" | "INCLUIR" | "EXCLUIR";
        tipoRegistro: string;
        horario: string;
        registroId?: string;
        horarioOriginal?: string;
      }>;
    },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.criarCorrecaoRH(req.user.sub, id, body);
  }

  @Patch("admin/correcoes-rh/:id")
  @Roles("ponto-admin", "PONTO_ADMIN")
  adminAprovarCorrecaoRH(
    @Param("id") id: string,
    @Body() body: { decisao: "APROVAR" | "REJEITAR"; observacao?: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.adminAprovarCorrecaoRH(
      id,
      body.decisao,
      body.observacao ?? "",
      req.user.sub
    );
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
