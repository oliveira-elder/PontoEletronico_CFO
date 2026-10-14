import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard, exigirRecursoRh } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { contentDispositionAnexo } from "../../utils/nome-arquivo";
import { SaudeOcupacionalService } from "./saude-ocupacional.service";

interface AuthRequest {
  user: { sub: string; roles?: string[]; isSuperAdmin?: boolean };
}

const RH = ["RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN"] as const;

/** Exame médico ocupacional periódico: painel do RH e envio pelo funcionário. */
@Controller("ponto")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class SaudeOcupacionalController {
  constructor(
    private readonly service: SaudeOcupacionalService,
    private readonly prisma: PrismaService
  ) {}

  /* ─── RH ─── */

  @RecursoRh("saude.exames")
  @Get("saude-ocupacional/painel")
  @Roles(...RH)
  painel(
    @Query("busca") busca?: string,
    @Query("gerenciaId") gerenciaId?: string,
    @Query("situacao") situacao?: string
  ) {
    return this.service.painel({ busca, gerenciaId, situacao });
  }

  @RecursoRh("saude.exames")
  @Get("saude-ocupacional/funcionarios/:id/exames")
  @Roles(...RH)
  exames(@Param("id") id: string) {
    return this.service.examesDoFuncionario(id);
  }

  @RecursoRh("saude.exames.registrar")
  @Post("saude-ocupacional/funcionarios/:id/exames")
  @Roles(...RH)
  registrar(@Param("id") id: string, @Body() body: never, @Request() req: AuthRequest) {
    return this.service.registrarPeloRh(id, body, req.user.sub);
  }

  @RecursoRh("saude.exames.registrar")
  @Put("saude-ocupacional/exames/:id")
  @Roles(...RH)
  editar(@Param("id") id: string, @Body() body: never) {
    return this.service.editar(id, body);
  }

  @RecursoRh("saude.exames.registrar")
  @Post("saude-ocupacional/exames/:id/confirmar")
  @Roles(...RH)
  confirmar(@Param("id") id: string, @Body() body: never, @Request() req: AuthRequest) {
    return this.service.confirmar(id, body, req.user.sub);
  }

  @RecursoRh("saude.exames.registrar")
  @Post("saude-ocupacional/exames/:id/devolver")
  @Roles(...RH)
  devolver(
    @Param("id") id: string,
    @Body() body: { motivo?: string },
    @Request() req: AuthRequest
  ) {
    return this.service.devolver(id, body?.motivo, req.user.sub);
  }

  @RecursoRh("saude.exames.registrar")
  @Post("saude-ocupacional/solicitar")
  @Roles(...RH)
  solicitar(@Body() body: never, @Request() req: AuthRequest) {
    return this.service.solicitar(body, req.user.sub);
  }

  @RecursoRh("saude.exames")
  @Get("saude-ocupacional/config")
  @Roles(...RH)
  getConfig() {
    return this.service.getConfig();
  }

  @RecursoRh("saude.exames.configurar")
  @Put("saude-ocupacional/config")
  @Roles(...RH)
  setConfig(@Body() body: { periodicidadeMeses?: unknown; avisoDias?: unknown }) {
    return this.service.setConfig(body);
  }

  /** Só o super usuário exclui definitivamente um lançamento. */
  @Delete("saude-ocupacional/exames/:id")
  @Roles(...RH)
  excluir(@Param("id") id: string, @Request() req: AuthRequest) {
    if (!req.user.isSuperAdmin) {
      throw new ForbiddenException("Apenas o super usuário pode excluir um exame lançado.");
    }
    return this.service.excluir(id);
  }

  /** Arquivo do ASO: RH autorizado ou o próprio funcionário (nunca pasta pública). */
  @Get("saude-ocupacional/exames/:id/arquivo")
  async arquivo(@Param("id") id: string, @Request() req: AuthRequest, @Res() res: Response) {
    const roles = req.user.roles ?? [];
    const ehRh = !!req.user.isSuperAdmin || RH.some((r) => roles.includes(r));
    let funcionarioId: string | undefined;
    if (ehRh) {
      await exigirRecursoRh(this.prisma, req.user, [...RH], "saude.exames").catch(async (e) => {
        /* RH sem a área liberada ainda pode baixar o PRÓPRIO exame. */
        funcionarioId = (await this.service.funcionarioDoUsuario(req.user.sub)).id;
        const ex = await this.prisma.exameOcupacional.findUnique({
          where: { id },
          select: { funcionarioId: true }
        });
        if (ex?.funcionarioId !== funcionarioId) throw e;
      });
    } else {
      funcionarioId = (await this.service.funcionarioDoUsuario(req.user.sub)).id;
    }
    const arq = await this.service.lerArquivo(id, { funcionarioId, rh: ehRh && !funcionarioId });
    res.setHeader("Content-Type", arq.mime);
    res.setHeader("Content-Disposition", contentDispositionAnexo(arq.nome));
    res.send(arq.buffer);
  }

  /* ─── Funcionário ─── */

  @Get("meus-exames")
  meusExames(@Request() req: AuthRequest) {
    return this.service.meusExames(req.user.sub);
  }

  @Post("meus-exames")
  enviar(@Body() body: never, @Request() req: AuthRequest) {
    return this.service.enviarMeuExame(req.user.sub, body);
  }
}
