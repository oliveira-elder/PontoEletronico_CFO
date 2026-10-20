import {
  contentDispositionAnexo,
  nomeArquivoRelatorioCiclo,
  nomeArquivoRelatorioMes
} from "../../utils/nome-arquivo";
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { AssinaturaService, SignatureMeta } from "./assinatura.service";
import { metaRequisicao, type RequisicaoComIp } from "../../utils/ip-requisicao";

interface AuthRequest {
  user: {
    sub: string;
    name?: string;
    email?: string;
    roles: string[];
    isSuperAdmin?: boolean;
  };
  ip: string;
  headers: Record<string, string>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}

/** Metadados de autenticidade da requisição de assinatura (IP real, gateway e navegador). */
function getSignatureMeta(req: AuthRequest): SignatureMeta {
  return metaRequisicao(req as unknown as RequisicaoComIp);
}

/* ─── Rotas do Funcionário: /ponto/assinaturas ─── */

@Controller("ponto/assinaturas")
@UseGuards(AuthGuard("jwt"))
export class AssinaturaController {
  constructor(private readonly assinaturaService: AssinaturaService) {}

  @Get()
  getMinhasAssinaturas(
    @Req() req: AuthRequest,
    @Query("mes", new DefaultValuePipe(0), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(0), ParseIntPipe) ano: number
  ) {
    return this.assinaturaService.getAssinaturaFuncionario(
      req.user.sub,
      mes || undefined,
      ano || undefined
    );
  }

  /** Folhas de ponto totalmente assinadas (para baixar como documento) e as pendentes. */
  @Get("folhas")
  getMinhasFolhas(@Req() req: AuthRequest) {
    return this.assinaturaService.listarFolhasAssinadasPorSub(req.user.sub);
  }

  /** Ciclo encerrado do banco de horas: lista folhas mês a mês (cria sob demanda). */
  @Get("ciclo-banco-horas")
  getAssinaturasCicloBancoHoras(
    @Req() req: AuthRequest,
    @Query("inicio") inicio?: string,
    @Query("fim") fim?: string
  ) {
    if (!inicio || !fim) {
      throw new BadRequestException("Informe inicio e fim (YYYY-MM-DD) do ciclo.");
    }
    return this.assinaturaService.listarAssinaturasCicloBancoHoras(req.user.sub, inicio, fim);
  }

  /** Relatório PDF apenas do intervalo do ciclo (mesmo modelo da folha de ponto). */
  @Get("ciclo-banco-horas/pdf")
  async getPdfCicloBancoHoras(
    @Req() req: AuthRequest,
    @Query("inicio") inicio: string | undefined,
    @Query("fim") fim: string | undefined,
    @Res() res: Response
  ) {
    if (!inicio || !fim) {
      throw new BadRequestException("Informe inicio e fim (YYYY-MM-DD) do ciclo.");
    }
    const pdf = await this.assinaturaService.gerarPdfCicloBancoHoras(req.user.sub, inicio, fim);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      contentDispositionAnexo(nomeArquivoRelatorioCiclo(inicio, fim))
    );
    res.send(pdf);
  }

  /** Status da assinatura do relatório do ciclo (funcionário). */
  @Get("ciclo-banco-horas/assinatura")
  getAssinaturaCicloBancoHoras(
    @Req() req: AuthRequest,
    @Query("inicio") inicio?: string,
    @Query("fim") fim?: string
  ) {
    if (!inicio || !fim) {
      throw new BadRequestException("Informe inicio e fim (YYYY-MM-DD) do ciclo.");
    }
    return this.assinaturaService.obterAssinaturaCicloBancoHoras(req.user.sub, inicio, fim);
  }

  /**
   * Assina o relatório do ciclo (somente funcionário).
   * Exige todas as folhas mensais CONCLUIDAS (funcionário + chefe) e nenhum mês aberto.
   */
  @Post("ciclo-banco-horas/assinar")
  assinarCicloBancoHoras(@Req() req: AuthRequest, @Body() body: { inicio?: string; fim?: string }) {
    if (!body?.inicio || !body?.fim) {
      throw new BadRequestException("Informe inicio e fim (YYYY-MM-DD) do ciclo.");
    }
    return this.assinaturaService.assinarCicloBancoHoras(
      req.user.sub,
      body.inicio,
      body.fim,
      getSignatureMeta(req)
    );
  }

  @Post(":id/assinar")
  assinar(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.assinaturaService.assinarFuncionario(id, req.user.sub, getSignatureMeta(req));
  }

  @Get("rascunho-pdf")
  async getRascunhoPdf(
    @Req() req: AuthRequest,
    @Query("mes", new DefaultValuePipe(new Date().getMonth() + 1), ParseIntPipe) mes: number,
    @Query("ano", new DefaultValuePipe(new Date().getFullYear()), ParseIntPipe) ano: number,
    @Res() res: import("express").Response
  ) {
    const pdf = await this.assinaturaService.gerarRascunhoPdf(req.user.sub, mes, ano);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      contentDispositionAnexo(nomeArquivoRelatorioMes(mes, ano, { rascunho: true }))
    );
    res.send(pdf);
  }

  @Get(":id/pdf")
  async getMeuPdf(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Res() res: import("express").Response
  ) {
    const assinatura = await this.assinaturaService.getAssinaturaParaPdf(id);
    if (!assinatura) throw new ForbiddenException("Assinatura não encontrada");
    if (assinatura.status !== "CONCLUIDA")
      throw new ForbiddenException(
        "PDF do funcionário disponível apenas após todas as assinaturas"
      );

    const pertence = await this.assinaturaService.validarPropriedadeFuncionario(id, req.user.sub);
    if (!pertence) throw new ForbiddenException("Este PDF não pertence ao seu quadro");

    const pdf = await this.assinaturaService.gerarPdfQuadro(id);
    const filename = nomeArquivoRelatorioMes(assinatura.periodo.mes, assinatura.periodo.ano);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDispositionAnexo(filename));
    res.send(pdf);
  }
}

/* ─── Rotas do Gestor e RH: /auditoria/... ─── */

@Controller("auditoria")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class AssinaturaAuditoriaController {
  constructor(private readonly assinaturaService: AssinaturaService) {}

  /* Gestor — listar e assinar */

  @Get("gestao/assinaturas")
  @Roles("GESTOR_APROVACAO", "gestor", "ponto-admin", "PONTO_ADMIN")
  getAssinaturasGestor(@Req() req: AuthRequest, @Query("status") status?: string) {
    return this.assinaturaService.getAssinaturasGestor(
      req.user.sub,
      req.user.isSuperAdmin ?? false,
      req.user.roles.includes("gestor") || req.user.roles.includes("GESTOR_APROVACAO"),
      status
    );
  }

  @Post("gestao/assinaturas/:id/assinar")
  @Roles("GESTOR_APROVACAO", "gestor", "ponto-admin", "PONTO_ADMIN")
  assinarGestor(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.assinaturaService.assinarGestor(
      id,
      req.user.sub,
      req.user.name ?? "Chefe",
      getSignatureMeta(req),
      req.user.isSuperAdmin ?? false,
      req.user.roles.includes("gestor") || req.user.roles.includes("GESTOR_APROVACAO")
    );
  }

  /** Devolve o quadro ao funcionário para correção e nova assinatura. */
  @Post("gestao/assinaturas/:id/rejeitar")
  @Roles("GESTOR_APROVACAO", "gestor", "ponto-admin", "PONTO_ADMIN")
  rejeitarAssinaturaGestor(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { motivo?: string }
  ) {
    return this.assinaturaService.rejeitarAssinaturaGestor(
      id,
      req.user.sub,
      req.user.isSuperAdmin ?? false,
      req.user.roles.includes("gestor") || req.user.roles.includes("GESTOR_APROVACAO"),
      body?.motivo
    );
  }

  /* RH — listar todas as assinaturas */

  @RecursoRh("auditoria.validacoes")
  @Get("assinaturas")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getAssinaturasRH(
    @Query("gerenciaId") gerenciaId?: string,
    @Query("funcionarioId") funcionarioId?: string,
    @Query("mes") mes?: string,
    @Query("ano") ano?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.assinaturaService.getAssinaturasRH({
      gerenciaId,
      funcionarioId,
      mes: mes ? parseInt(mes) : undefined,
      ano: ano ? parseInt(ano) : undefined,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50
    });
  }

  /* RH — estado do selo ICP-Brasil (e-CNPJ A1) */
  @Get("selo-icp/status")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  statusSeloIcp() {
    return this.assinaturaService.statusSeloIcp();
  }

  /* RH — recalcula o resumo gravado das folhas ainda não concluídas (regra de cálculo vigente) */
  @Post("assinaturas/recalcular-resumos")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  @RecursoRh("auditoria.banco-horas.recalcular")
  recalcularResumosFolhas() {
    return this.assinaturaService.recalcularResumosFolhas();
  }

  /* RH — verificar / buscar por código de assinatura digital */

  @RecursoRh("auditoria.validacoes")
  @Get("assinaturas/verificar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  verificarCodigoAssinatura(@Query("codigo") codigo?: string) {
    if (!codigo?.trim()) {
      throw new BadRequestException("Parâmetro codigo é obrigatório.");
    }
    return this.assinaturaService.buscarPorCodigoAssinatura(codigo);
  }

  /* RH — disparo manual de geração de assinaturas */

  @RecursoRh("auditoria.validacoes")
  @Get("assinaturas/previa-mes")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  previaMes(@Query("mes") mes: string, @Query("ano") ano: string) {
    return this.assinaturaService.previaAssinaturasMes(Number(mes), Number(ano));
  }

  @RecursoRh("auditoria.validacoes.gerar")
  @Post("assinaturas/gerar-mes")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  gerarMes(@Body() body: { mes: number; ano: number; funcionarioIds?: string[] }) {
    return this.assinaturaService.criarAssinaturasMensais(
      body.mes,
      body.ano,
      Array.isArray(body.funcionarioIds) ? body.funcionarioIds : undefined
    );
  }

  /** Folhas assinadas de um funcionário (RH), com o PDF pronto para baixar. */
  @RecursoRh("auditoria.funcionarios", "auditoria.validacoes")
  @Get("funcionarios/:id/folhas-assinadas")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  getFolhasAssinadasFuncionario(@Param("id") id: string) {
    return this.assinaturaService.listarFolhasAssinadasDoFuncionario(id);
  }

  /* Download PDF */

  @RecursoRh("auditoria.validacoes")
  @Get("assinaturas/:id/pdf")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN", "GESTOR_APROVACAO", "gestor")
  async getPdf(@Param("id") id: string, @Res() res: Response) {
    const pdf = await this.assinaturaService.gerarPdfQuadro(id);

    const assinatura = await this.assinaturaService.getAssinaturaParaPdf(id);

    const mes = assinatura?.periodo?.mes ?? 1;
    const ano = assinatura?.periodo?.ano ?? new Date().getFullYear();
    const nomePessoa = (
      assinatura?.periodo?.funcionario as { user?: { name?: string } } | undefined
    )?.user?.name;
    /* Documento de outra pessoa: o nome vai no arquivo para não colidir. */
    const filename = nomeArquivoRelatorioMes(mes, ano, { nomePessoa });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDispositionAnexo(filename));
    res.send(pdf);
  }
}

/**
 * Verificação PÚBLICA (sem login) da autenticidade de uma folha assinada — destino do QR Code da
 * declaração. Só devolve dados mínimos; limitada por IP para evitar varredura de códigos.
 */
@Controller("ponto/verificar")
export class VerificacaoPublicaController {
  private readonly tentativas = new Map<string, number[]>();

  constructor(private readonly assinaturaService: AssinaturaService) {}

  private limitar(ip: string) {
    const agora = Date.now();
    const janela = (this.tentativas.get(ip) ?? []).filter((t) => agora - t < 60_000);
    if (janela.length >= 20) {
      throw new HttpException("Muitas consultas. Aguarde um minuto.", HttpStatus.TOO_MANY_REQUESTS);
    }
    janela.push(agora);
    this.tentativas.set(ip, janela);
  }

  /** Conferência automática do CONTEÚDO (texto do PDF ou OCR da foto) com o original. */
  @Post("conteudo")
  compararConteudo(
    @Body()
    body: { codigo?: string; registro?: string; linhas?: string[]; origem?: "pdf" | "ocr" },
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    const xff = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ?? req.ip ?? "?";
    this.limitar(ip);
    return this.assinaturaService.compararConteudoPublico(body ?? {});
  }

  /** Qualquer documento assinado pelo sistema, pela impressão digital do arquivo enviado. */
  @Get("documento/:sha256")
  verificarQualquer(
    @Param("sha256") sha256: string,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    const xff = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ?? req.ip ?? "?";
    this.limitar(ip);
    return this.assinaturaService.verificarQualquerArquivo(sha256);
  }

  /** Conferência pelo arquivo: o navegador calcula o SHA-256 do PDF e envia só o hash. */
  @Get("arquivo/:sha256")
  verificarArquivo(
    @Param("sha256") sha256: string,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    const xff = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ?? req.ip ?? "?";
    this.limitar(ip);
    return this.assinaturaService.verificarArquivoPublico(sha256);
  }

  @Get(":codigo")
  verificar(
    @Param("codigo") codigo: string,
    @Query("sha256") sha256: string | undefined,
    @Query("r") r: string | undefined,
    @Query("p") p: string | undefined,
    @Query("t") t: string | undefined,
    @Query("s") selo: string | undefined,
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    const xff = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ?? req.ip ?? "?";
    this.limitar(ip);
    return this.assinaturaService.verificarDocumentoPublico(codigo, sha256, { r, p, t, s: selo });
  }
}
