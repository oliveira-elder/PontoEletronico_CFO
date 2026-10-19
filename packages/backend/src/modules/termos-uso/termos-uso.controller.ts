import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { metaRequisicao, type RequisicaoComIp } from "../../utils/ip-requisicao";
import { TermosUsoService } from "./termos-uso.service";

interface AuthRequest extends RequisicaoComIp {
  user: { sub: string; name?: string };
}

/** Termos de Uso — usuário logado: versão vigente, aceite e histórico dos próprios aceites. */
@Controller("termos-uso")
@UseGuards(AuthGuard("jwt"))
export class TermosUsoController {
  constructor(private readonly service: TermosUsoService) {}

  @Get("vigente")
  vigente(@Req() req: AuthRequest) {
    return this.service.vigente(req.user.sub);
  }

  @Post(":id/aceitar")
  aceitar(
    @Param("id") id: string,
    @Body() body: { confirmacao?: boolean },
    @Req() req: AuthRequest
  ) {
    return this.service.aceitar(req.user.sub, id, body?.confirmacao === true, metaRequisicao(req));
  }

  @Get("meus-aceites")
  meusAceites(@Req() req: AuthRequest) {
    return this.service.meusAceites(req.user.sub);
  }
}

/** Termos de Uso — RH: versões, publicação e relatório de aceites (Configurações → Termos de uso). */
@Controller("ponto/config/termos-uso")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class TermosUsoAdminController {
  constructor(
    private readonly service: TermosUsoService,
    private readonly prisma: PrismaService
  ) {}

  private async autor(req: AuthRequest) {
    const u = await this.prisma.user.findFirst({
      where: { externalId: req.user.sub },
      select: { id: true, name: true }
    });
    return { id: u?.id ?? null, nome: u?.name ?? req.user.name ?? null };
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Get()
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  listar() {
    return this.service.listar();
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Get(":id")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  obter(@Param("id") id: string) {
    return this.service.obter(id);
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Post()
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async criar(
    @Body() body: { titulo?: string; conteudo?: string; usarModelo?: boolean },
    @Req() req: AuthRequest
  ) {
    return this.service.criar(body ?? {}, await this.autor(req));
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Post(":id/editar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async editar(@Param("id") id: string, @Req() req: AuthRequest) {
    return this.service.editar(id, await this.autor(req));
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Patch(":id")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  atualizar(
    @Param("id") id: string,
    @Body() body: { titulo?: string; conteudo?: string; resumoAlteracoes?: string }
  ) {
    return this.service.atualizarRascunho(id, body ?? {});
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Post(":id/publicar")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  async publicar(
    @Param("id") id: string,
    @Body() body: { resumoAlteracoes?: string },
    @Req() req: AuthRequest
  ) {
    return this.service.publicar(id, body?.resumoAlteracoes, await this.autor(req));
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Delete(":id")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  excluir(@Param("id") id: string) {
    return this.service.excluirRascunho(id);
  }

  @RecursoRh("configuracoes.termos.gerenciar")
  @Get(":id/aceites")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  aceites(@Param("id") id: string) {
    return this.service.aceites(id);
  }
}
