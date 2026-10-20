import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../../prisma/prisma.service";
import { DocumentacaoConteudoService, type Gerada } from "./documentacao-conteudo.service";
import { DocumentacaoService, type AutoriaDto, type RevisaoDto } from "./documentacao.service";

interface AuthRequest {
  user?: { sub: string; name?: string; isSuperAdmin?: boolean };
}

function assertSuperAdmin(req: AuthRequest) {
  if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
}

/** Documentação Técnica (Logs → Documentação): autoria e revisões. Só o Super Admin. */
@Controller("logs/documentacao")
@UseGuards(AuthGuard("jwt"))
export class DocumentacaoController {
  constructor(
    private readonly service: DocumentacaoService,
    private readonly conteudo: DocumentacaoConteudoService,
    private readonly prisma: PrismaService
  ) {}

  private async autor(req: AuthRequest) {
    const u = await this.prisma.user.findFirst({
      where: { externalId: req.user?.sub },
      select: { name: true }
    });
    return { nome: u?.name ?? req.user?.name ?? null };
  }

  @Get("indice")
  async indice(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    await this.conteudo.verificarAtualizacoes().catch(() => undefined);
    const secoes = this.conteudo.indice().map((s) => ({
      ...s,
      hash: this.conteudo.secao(s.id)?.hash ?? null
    }));
    return { secoes };
  }

  @Get("secao/:id")
  secao(@Param("id") id: string, @Req() req: AuthRequest) {
    assertSuperAdmin(req);
    const s = this.conteudo.secao(id);
    if (!s) throw new NotFoundException("Seção não encontrada.");
    return s;
  }

  @Get("gerado/:tipo")
  gerado(@Param("tipo") tipo: string, @Req() req: AuthRequest) {
    assertSuperAdmin(req);
    if (!["api", "banco", "stack", "jobs", "ambiente", "cobertura"].includes(tipo))
      throw new NotFoundException("Tipo inexistente.");
    return this.conteudo.dadosGerados(tipo as Gerada);
  }

  @Get("busca")
  busca(@Query("q") q: string, @Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return { resultados: this.conteudo.busca(String(q ?? "")) };
  }

  @Get("cobertura")
  cobertura(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.conteudo.cobertura();
  }

  @Get("exportar.md")
  async exportarMd(@Req() req: AuthRequest, @Res() res: Response) {
    assertSuperAdmin(req);
    const { nome, md } = await this.conteudo.exportarMarkdown();
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.send(md);
  }

  @Get("exportar.zip")
  async exportarZip(@Req() req: AuthRequest, @Res() res: Response) {
    assertSuperAdmin(req);
    const { nome, buffer } = await this.conteudo.exportarZip();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.send(buffer);
  }

  @Get("autoria")
  autoria(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.service.autoria();
  }

  @Put("autoria")
  async salvarAutoria(@Body() body: AutoriaDto, @Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.service.salvarAutoria(body ?? {}, await this.autor(req));
  }

  @Get("revisoes")
  revisoes(@Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.service.revisoes();
  }

  @Post("revisoes")
  async criarRevisao(@Body() body: RevisaoDto, @Req() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.service.criarRevisao(body ?? {}, await this.autor(req));
  }

  @Post("revisoes/:id/anular")
  async anular(
    @Param("id") id: string,
    @Body() body: { motivo?: string },
    @Req() req: AuthRequest
  ) {
    assertSuperAdmin(req);
    return this.service.anular(id, String(body?.motivo ?? ""), await this.autor(req));
  }
}
