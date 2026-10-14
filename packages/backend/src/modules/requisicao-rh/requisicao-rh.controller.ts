import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PermissaoRhGuard } from "../auth/permissao-rh.guard";
import { RecursoRh } from "../auth/recurso-rh.decorator";
import { RequisicaoRhService } from "./requisicao-rh.service";

interface AuthRequest {
  user: { sub: string; name?: string; email?: string; roles: string[]; isSuperAdmin?: boolean };
}

@Controller("requisicoes-rh")
@UseGuards(AuthGuard("jwt"), RolesGuard, PermissaoRhGuard)
export class RequisicaoRhController {
  constructor(private readonly service: RequisicaoRhService) {}

  @RecursoRh("requisicoes.requisicoes.criar")
  @Post()
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  criar(@Body() body: never, @Request() req: AuthRequest) {
    return this.service.criar(req.user.sub, body);
  }

  @RecursoRh("requisicoes.requisicoes")
  @Get()
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  listar(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("tipo") tipo?: string,
    @Query("ativa") ativa?: string
  ) {
    return this.service.listarRh({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      tipo,
      ativa
    });
  }

  @Get("minhas")
  minhas(@Request() req: AuthRequest) {
    return this.service.minhas(req.user.sub);
  }

  @RecursoRh("requisicoes.requisicoes")
  @Get(":id")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  detalhe(@Param("id") id: string) {
    return this.service.detalheRh(id);
  }

  @RecursoRh("requisicoes.requisicoes.excluir")
  @Delete(":id")
  @Roles("RH_AUDITORIA", "ponto-admin", "PONTO_ADMIN")
  desativar(@Param("id") id: string) {
    return this.service.desativar(id);
  }

  @Patch(":id/visualizar")
  visualizar(@Param("id") id: string, @Request() req: AuthRequest) {
    return this.service.visualizar(id, req.user.sub);
  }

  @Patch(":id/responder")
  responder(
    @Param("id") id: string,
    @Body() body: { texto?: string; arquivoBase64?: string },
    @Request() req: AuthRequest
  ) {
    return this.service.responder(id, req.user.sub, body);
  }
}
