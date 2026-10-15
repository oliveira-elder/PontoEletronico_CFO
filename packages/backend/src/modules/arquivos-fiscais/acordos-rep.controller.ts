import { Body, Controller, Get, Param, Patch, Post, Request, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Response } from "express";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { AcordosRepService, type AcordoRepDto } from "./acordos-rep.service";

interface AuthRequest {
  user: { sub: string; name?: string };
}

/** Cadastro dos acordos coletivos (ACT/CCT) que autorizam o REP-A — com histórico de renovações. */
@Controller("ponto/config/acordos-rep")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class AcordosRepController {
  constructor(
    private readonly service: AcordosRepService,
    private readonly prisma: PrismaService
  ) {}

  private async autor(req: AuthRequest) {
    const u = await this.prisma.user.findFirst({
      where: { externalId: req.user.sub },
      select: { id: true, name: true }
    });
    return { id: u?.id ?? null, nome: u?.name ?? req.user.name ?? null };
  }

  @RecursoRh("configuracoes.institucional.salvar")
  @Get()
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async listar() {
    await this.service.migrarLegado();
    return this.service.listar();
  }

  @RecursoRh("configuracoes.institucional.salvar")
  @Post()
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async criar(@Body() body: AcordoRepDto, @Request() req: AuthRequest) {
    return this.service.criar(body, await this.autor(req));
  }

  @RecursoRh("configuracoes.institucional.salvar")
  @Post(":id/renovar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async renovar(@Param("id") id: string, @Body() body: AcordoRepDto, @Request() req: AuthRequest) {
    return this.service.renovar(id, body, await this.autor(req));
  }

  @RecursoRh("configuracoes.institucional.salvar")
  @Patch(":id")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  atualizar(@Param("id") id: string, @Body() body: AcordoRepDto) {
    return this.service.atualizar(id, body);
  }

  @RecursoRh("configuracoes.institucional.salvar")
  @Post(":id/cancelar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  cancelar(@Param("id") id: string, @Body() body: { motivo?: string }) {
    return this.service.cancelar(id, String(body?.motivo ?? ""));
  }

  @RecursoRh("configuracoes.institucional.salvar")
  @Post(":id/pdf")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  salvarPdf(@Param("id") id: string, @Body() body: { arquivoBase64?: string; nome?: string }) {
    return this.service.salvarPdf(id, String(body?.arquivoBase64 ?? ""), body?.nome);
  }

  @RecursoRh("configuracoes.institucional.salvar")
  @Get(":id/pdf")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async baixarPdf(@Param("id") id: string, @Res() res: Response) {
    const { buffer, nome } = await this.service.baixarPdf(id);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`
    });
    res.send(buffer);
  }
}
