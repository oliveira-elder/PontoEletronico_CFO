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
  BadRequestException
} from "@nestjs/common";
import { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AssinaturaService, SignatureMeta } from "./assinatura.service";

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

/** Normaliza um IP, removendo prefixo IPv4-mapeado (::ffff:) e espaços */
function normalizeIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return ip.trim().replace(/^::ffff:/i, "") || null;
}

/**
 * Extrai metadados de autenticidade da requisição de assinatura.
 * O X-Forwarded-For é uma cadeia `clientePC, proxy1, ..., gatewayBorda`.
 * O primeiro item é o PC real; o último (ou o peer do socket) é a gateway de borda.
 */
function getSignatureMeta(req: AuthRequest): SignatureMeta {
  const xff =
    (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")
      .map((p) => normalizeIp(p))
      .filter((p): p is string => !!p) ?? [];

  const peer = normalizeIp(req.socket?.remoteAddress ?? req.connection?.remoteAddress);

  const ipReal = xff[0] ?? peer ?? "desconhecido";
  // Gateway de borda: último elemento do XFF se houver cadeia; senão o peer do socket.
  const ipGateway = xff.length > 1 ? xff[xff.length - 1] : peer;

  return {
    ipReal,
    ipGateway:
      ipGateway && ipGateway !== ipReal ? ipGateway : peer && peer !== ipReal ? peer : ipGateway,
    userAgent: (req.headers["user-agent"] as string | undefined)?.slice(0, 256) ?? null
  };
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
      `attachment; filename="ciclo-banco-horas-${inicio}_${fim}.pdf"`
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
    const nomeMes = String(mes).padStart(2, "0");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rascunho-${nomeMes}-${ano}.pdf"`);
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
    const matricula = assinatura.periodo.funcionario.matricula ?? id;
    const filename = `quadro-${matricula}-${String(assinatura.periodo.mes).padStart(2, "0")}-${assinatura.periodo.ano}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  }
}

/* ─── Rotas do Gestor e RH: /auditoria/... ─── */

@Controller("auditoria")
@UseGuards(AuthGuard("jwt"), RolesGuard)
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

  /* RH — verificar / buscar por código de assinatura digital */

  @Get("assinaturas/verificar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  verificarCodigoAssinatura(@Query("codigo") codigo?: string) {
    if (!codigo?.trim()) {
      throw new BadRequestException("Parâmetro codigo é obrigatório.");
    }
    return this.assinaturaService.buscarPorCodigoAssinatura(codigo);
  }

  /* RH — disparo manual de geração de assinaturas */

  @Post("assinaturas/gerar-mes")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  gerarMes(@Body() body: { mes: number; ano: number }) {
    return this.assinaturaService.criarAssinaturasMensais(body.mes, body.ano);
  }

  /* Download PDF */

  @Get("assinaturas/:id/pdf")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN", "GESTOR_APROVACAO", "gestor")
  async getPdf(@Param("id") id: string, @Res() res: Response) {
    const pdf = await this.assinaturaService.gerarPdfQuadro(id);

    const assinatura = await this.assinaturaService.getAssinaturaParaPdf(id);

    const matricula = assinatura?.periodo?.funcionario?.matricula ?? id;
    const mes = assinatura?.periodo?.mes ?? 0;
    const ano = assinatura?.periodo?.ano ?? 0;
    const filename = `quadro-${matricula}-${String(mes).padStart(2, "0")}-${ano}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  }
}
