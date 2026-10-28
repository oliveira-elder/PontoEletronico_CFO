import { podeVerCid, removerCid } from "../../utils/privacidade-cid";
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
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import {
  AuditoriaService,
  DocumentoFeriasEntrada,
  FeriasRhEntrada,
  GestorCienciaMeta
} from "./auditoria.service";

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
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
@Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN", "gestor", "GESTOR_APROVACAO")
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /* ─── Dashboard ─── */

  @RecursoRh("dashboard.ponto-frequencia", "dashboard.afastamentos", "dashboard.solicitacoes")
  @Get("dashboard")
  getDashboard(@Query("dataInicio") dataInicio?: string, @Query("dataFim") dataFim?: string) {
    return this.auditoriaService.getDashboard({ dataInicio, dataFim });
  }

  @RecursoRh("dashboard.ponto-frequencia")
  @Get("dashboard/registros-hora")
  getRegistrosPorHora(@Query("data") data?: string) {
    return this.auditoriaService.getRegistrosPorHora(data);
  }

  /* ─── Funcionários ─── */

  @RecursoRh(
    "auditoria.funcionarios",
    "auditoria.registros",
    "auditoria.solicitacoes",
    "auditoria.afastamentos",
    "auditoria.banco-horas",
    "auditoria.logs",
    "auditoria.validacoes",
    "configuracoes.notificacoes",
    "dashboard.ponto-frequencia"
  )
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

  @RecursoRh("auditoria.funcionarios", "auditoria.registros", "auditoria.banco-horas")
  @Get("funcionarios/:id")
  getFuncionarioDetalhe(@Param("id") id: string) {
    return this.auditoriaService.getFuncionarioDetalhe(id);
  }

  @RecursoRh("auditoria.funcionarios", "auditoria.registros", "dashboard.ponto-frequencia")
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

  @Get("funcionarios/:id/atestado-do-dia")
  getAtestadoDoDia(@Param("id") id: string, @Query("data") data: string) {
    return this.auditoriaService.getAtestadoDoDia(id, data);
  }

  @RecursoRh("auditoria.funcionarios", "auditoria.banco-horas")
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

  /** Banco de horas de um mês (mesma conta da página do funcionário), para o histórico do RH. */
  @RecursoRh("auditoria.funcionarios", "auditoria.banco-horas")
  @Get("funcionarios/:id/banco-horas/mes")
  getBancoHorasMesFuncionario(
    @Param("id") id: string,
    @Query("mes") mes: string,
    @Query("ano") ano: string
  ) {
    const m = Math.min(12, Math.max(1, parseInt(mes) || 1));
    const y = parseInt(ano) || new Date().getFullYear();
    const mm = String(m).padStart(2, "0");
    const ultimo = String(new Date(y, m, 0).getDate()).padStart(2, "0");
    return this.auditoriaService.bancoHorasDoIntervalo(id, `${y}-${mm}-01`, `${y}-${mm}-${ultimo}`);
  }

  @RecursoRh("auditoria.funcionarios", "auditoria.banco-horas")
  @Get("funcionarios/:id/banco-horas")
  getBancoHorasFuncionario(@Param("id") id: string) {
    return this.auditoriaService.getBancoHorasFuncionario(id);
  }

  /* ─── RH abre solicitação em nome do funcionário ─── */

  @RecursoRh("auditoria.funcionarios.solicitar")
  @Post("rh/funcionarios/:id/solicitacoes")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  criarSolicitacaoPeloRh(
    @Param("id") id: string,
    @Body()
    body: Parameters<AuditoriaService["criarSolicitacaoPeloRh"]>[1],
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.criarSolicitacaoPeloRh(id, body, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.solicitar")
  @Get("rh/funcionarios/:id/solicitar/perfil")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getPerfilSolicitacaoRh(@Param("id") id: string, @Request() req: AuthRequest) {
    return this.auditoriaService.getPerfilSolicitacaoRh(id, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.solicitar")
  @Get("rh/funcionarios/:id/solicitar/credito-banco")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getCreditoBancoRh(@Param("id") id: string, @Request() req: AuthRequest) {
    return this.auditoriaService.getCreditoBancoRh(id, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.solicitar")
  @Post("rh/funcionarios/:id/solicitar/credito-banco/simular")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  simularCreditoBancoRh(
    @Param("id") id: string,
    @Body() body: Parameters<AuditoriaService["simularCreditoBancoRh"]>[1],
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.simularCreditoBancoRh(id, body, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.solicitar")
  @Get("rh/funcionarios/:id/solicitar/abono-cota")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getCotaAbonoRh(@Param("id") id: string, @Request() req: AuthRequest) {
    return this.auditoriaService.getCotaAbonoRh(id, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.solicitar")
  @Get("rh/funcionarios/:id/solicitar/licenca-tipos")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getTiposLicencaRh(@Param("id") id: string, @Request() req: AuthRequest) {
    return this.auditoriaService.getTiposLicencaRh(id, req.user.sub);
  }

  @RecursoRh("auditoria.solicitacoes.alterar-cid")
  @Patch("rh/solicitacoes/:id/cid")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  alterarCidAtestado(
    @Param("id") id: string,
    @Body() body: { cidCodigo?: string; cidGrupoId?: string; justificativa?: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.alterarCidAtestado(id, body, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios", "auditoria.banco-horas")
  @Get("funcionarios/:id/fechamentos-situacao")
  getFechamentosSituacao(@Param("id") id: string) {
    return this.auditoriaService.listarFechamentosSituacao(id);
  }

  @RecursoRh("auditoria.funcionarios")
  @Get("funcionarios/:id/abono/cota")
  getCotaAbonoFuncionario(@Param("id") id: string) {
    return this.auditoriaService.getCotaAbonoFuncionario(id);
  }

  @RecursoRh("auditoria.funcionarios")
  @Get("funcionarios/:id/documentos-rh")
  getDocumentosRhFuncionario(@Param("id") id: string) {
    return this.auditoriaService.getDocumentosRhFuncionario(id);
  }

  @RecursoRh("auditoria.funcionarios.excluir-documento")
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

  @RecursoRh("auditoria.registros", "dashboard.ponto-frequencia")
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
  async getSolicitacoes(
    @Request() req: AuthRequest,
    @Query("status") status?: string,
    @Query("tipo") tipo?: string,
    @Query("funcionarioId") funcionarioId?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    const r = await this.auditoriaService.getSolicitacoes({
      status,
      tipo,
      funcionarioId,
      gerenciaId,
      dataInicio,
      dataFim,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
    return podeVerCid(req.user) ? r : removerCid(r);
  }

  @RecursoRh("auditoria.solicitacoes.alterar-status")
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

  @RecursoRh("auditoria.afastamentos", "dashboard.afastamentos")
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

  @RecursoRh("auditoria.banco-horas")
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

  @RecursoRh("auditoria.banco-horas.periodos")
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

  @RecursoRh("auditoria.banco-horas")
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
  async getSolicitacoesGestor(
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
    const r = await this.auditoriaService.getSolicitacoesGestor(
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
    /* O chefe não vê o CID do atestado (dado de saúde); só o RH. */
    return removerCid(r);
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

  @Get("rh/ferias/rodadas")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  rodadasFeriasPendentes() {
    return this.auditoriaService.listarRodadasFeriasPendentes();
  }

  @Patch("rh/solicitacoes/:id/ferias/rodadas/:ordem/documentos")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  enviarRodadaFerias(
    @Param("id") id: string,
    @Param("ordem") ordem: string,
    @Body() body: { documentos?: DocumentoFeriasEntrada[]; observacao?: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.rhEnviarRodadaFerias(
      id,
      Number(ordem),
      { documentos: body.documentos },
      body.observacao ?? "",
      req.user.sub
    );
  }

  @Patch("rh/solicitacoes/:id/enviar-folha-ferias")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  enviarFolhaFerias(
    @Param("id") id: string,
    @Body()
    body: { documentos?: DocumentoFeriasEntrada[]; folhaBase64?: string; observacao?: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.rhEnviarFolhaFerias(
      id,
      { documentos: body.documentos, folhaBase64: body.folhaBase64 },
      body.observacao ?? "",
      req.user.sub
    );
  }

  /* ─── Tempo do banco de horas liberado pelo RH para abono ─── */

  @RecursoRh("auditoria.funcionarios.liberar-banco-horas")
  @Get("rh/funcionarios/:id/banco-horas/liberacoes")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getLiberacoesBancoRh(@Param("id") id: string) {
    return this.auditoriaService.getLiberacoesBancoRh(id);
  }

  @RecursoRh("auditoria.funcionarios.liberar-banco-horas")
  @Post("rh/funcionarios/:id/banco-horas/liberacoes")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  liberarBancoHorasRh(
    @Param("id") id: string,
    @Body() body: { minutos: number; validaAte: string; justificativa: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.liberarBancoHorasRh(id, body, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.liberar-banco-horas")
  @Post("rh/funcionarios/:id/banco-horas/liberacoes/:liberacaoId/revogar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  revogarLiberacaoBancoRh(
    @Param("id") id: string,
    @Param("liberacaoId") liberacaoId: string,
    @Body() body: { justificativa: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.revogarLiberacaoBancoRh(
      id,
      liberacaoId,
      body?.justificativa ?? "",
      req.user.sub
    );
  }

  @Get("rh/funcionarios/:id/ferias/saldo")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getSaldoFerias(@Param("id") id: string) {
    return this.auditoriaService.getSaldoFeriasFuncionario(id);
  }

  /* ─── Férias agendadas pelo RH ─── */

  @RecursoRh("auditoria.funcionarios.ferias")
  @Get("rh/funcionarios/:id/ferias/calendario")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getCalendarioFeriasRh(
    @Param("id") id: string,
    @Query("de") de: string,
    @Query("ate") ate: string
  ) {
    return this.auditoriaService.getCalendarioFeriasRh(id, de, ate);
  }

  @RecursoRh("auditoria.funcionarios.ferias")
  @Post("rh/funcionarios/:id/ferias")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  agendarFeriasRh(
    @Param("id") id: string,
    @Body() body: FeriasRhEntrada,
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.agendarFeriasRh(id, body, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.ferias")
  @Put("rh/funcionarios/:id/ferias/:solicitacaoId")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  alterarFeriasRh(
    @Param("id") id: string,
    @Param("solicitacaoId") solicitacaoId: string,
    @Body() body: FeriasRhEntrada,
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.alterarFeriasRh(id, solicitacaoId, body, req.user.sub);
  }

  @RecursoRh("auditoria.funcionarios.ferias")
  @Post("rh/funcionarios/:id/ferias/:solicitacaoId/cancelar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  cancelarFeriasRh(
    @Param("id") id: string,
    @Param("solicitacaoId") solicitacaoId: string,
    @Body() body: { justificativa: string },
    @Request() req: AuthRequest
  ) {
    return this.auditoriaService.cancelarFeriasRh(
      id,
      solicitacaoId,
      body?.justificativa ?? "",
      req.user.sub
    );
  }

  /* ─── Recálculo histórico (almoço mínimo) ─── */

  @RecursoRh("auditoria.banco-horas.recalcular")
  @Post("recalcular-historico-almoco")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  recalcularHistoricoAlmoco() {
    return this.auditoriaService.recalcularHistoricoAlmocoTodos();
  }

  /* ─── Correção de ponto pelo RH ─── */

  @RecursoRh("auditoria.funcionarios.corrigir-ponto")
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

  @RecursoRh("auditoria.logs")
  @Get("logs")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getLogs(
    @Query("action") action?: string,
    @Query("actorUserId") actorUserId?: string,
    @Query("method") method?: string,
    @Query("usuario") usuario?: string,
    @Query("q") q?: string,
    @Query("dataInicio") dataInicio?: string,
    @Query("dataFim") dataFim?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditoriaService.getLogs({
      action,
      actorUserId,
      method,
      usuario,
      q,
      dataInicio,
      dataFim,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });
  }
}
