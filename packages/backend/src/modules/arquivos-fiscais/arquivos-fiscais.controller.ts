import { Body, Controller, Get, Post, Query, Request, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Response } from "express";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { RepLivroService } from "../rep/rep-livro.service";
import { ArquivosFiscaisService, type FiltroExtracao } from "./arquivos-fiscais.service";

interface AuthRequest {
  user: { sub: string; name?: string };
}

@Controller("auditoria/arquivos-fiscais")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class ArquivosFiscaisController {
  constructor(
    private readonly service: ArquivosFiscaisService,
    private readonly repLivro: RepLivroService,
    private readonly prisma: PrismaService
  ) {}

  private async autor(req: AuthRequest) {
    const u = await this.prisma.user.findFirst({
      where: { externalId: req.user.sub },
      select: { id: true, name: true }
    });
    return { id: u?.id ?? null, nome: u?.name ?? req.user.name ?? null };
  }

  private filtro(q: Record<string, unknown>): FiltroExtracao {
    const ids = q.funcionarioIds;
    return {
      inicio: String(q.inicio ?? ""),
      fim: String(q.fim ?? ""),
      escopo: q.escopo === "gerencia" || q.escopo === "funcionarios" ? q.escopo : "todos",
      gerenciaId: q.gerenciaId ? String(q.gerenciaId) : undefined,
      funcionarioIds: Array.isArray(ids)
        ? ids.map(String)
        : typeof ids === "string" && ids
          ? ids.split(",")
          : undefined,
      assinar: q.assinar === undefined ? true : q.assinar !== false && q.assinar !== "false"
    };
  }

  @RecursoRh("auditoria.funcionarios.arquivos-fiscais")
  @Get("pre-validacao")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  preValidacao(@Query() q: Record<string, unknown>) {
    return this.service.preValidacao(this.filtro(q));
  }

  @RecursoRh("auditoria.funcionarios.arquivos-fiscais")
  @Get("situacao")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  situacao() {
    return this.repLivro.situacao();
  }

  @RecursoRh("auditoria.funcionarios.arquivos-fiscais")
  @Get("atestado-tecnico")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async atestado(@Res() res: Response) {
    const pdf = await this.service.atestadoTecnico();
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Atestado-Tecnico-Termo-Responsabilidade.pdf"'
    });
    res.send(pdf);
  }

  @RecursoRh("auditoria.funcionarios.arquivos-fiscais")
  @Post("afd")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async afd(
    @Body() body: Record<string, unknown>,
    @Request() req: AuthRequest,
    @Res() res: Response
  ) {
    const r = await this.service.gerarAfd(this.filtro(body), await this.autor(req));
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${r.nomeZip}"`,
      "X-Assinado": r.assinado ? "1" : "0"
    });
    res.send(r.buffer);
  }

  @RecursoRh("auditoria.funcionarios.arquivos-fiscais")
  @Post("aej")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async aej(
    @Body() body: Record<string, unknown>,
    @Request() req: AuthRequest,
    @Res() res: Response
  ) {
    const r = await this.service.gerarAej(this.filtro(body), await this.autor(req));
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${r.nomeZip}"`,
      "X-Assinado": r.assinado ? "1" : "0"
    });
    res.send(r.buffer);
  }
}
