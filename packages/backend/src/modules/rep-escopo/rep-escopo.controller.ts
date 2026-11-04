import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { RepEscopoService } from "./rep-escopo.service";

interface AuthRequest extends Request {
  user?: { isSuperAdmin?: boolean; username?: string; name?: string; sub?: string };
}

function superAdmin(req: AuthRequest): string {
  if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
  return req.user.name || req.user.username || req.user.sub || "super admin";
}

const ipDe = (req: Request) => (req.ips?.[0] ?? req.ip ?? "").replace(/^::ffff:/, "") || null;

/** Aba "Integridade do código (REP-P)": só Super Admin (JWT). */
@Controller("sistema/rep-escopo")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class RepEscopoController {
  constructor(private readonly service: RepEscopoService) {}

  @Get()
  @Roles("ponto-admin", "PONTO_ADMIN")
  status(@Req() req: AuthRequest) {
    superAdmin(req);
    return this.service.status();
  }

  @Put("senha")
  @Roles("ponto-admin", "PONTO_ADMIN")
  definirSenha(@Req() req: AuthRequest, @Body() body: { senha?: string; senhaAtual?: string }) {
    return this.service.definirSenha(superAdmin(req), body ?? {}, ipDe(req));
  }

  /** Preenche o campo "Senha atual" (registrado no histórico e no log). Nunca em cache. */
  @Post("senha/revelar")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Roles("ponto-admin", "PONTO_ADMIN")
  revelarSenha(@Req() req: AuthRequest) {
    return this.service.revelarSenha(superAdmin(req), ipDe(req));
  }

  /** Habilita ver a senha atual (informando-a uma vez). Registrado no histórico e no log. */
  @Post("senha/habilitar-visualizacao")
  @HttpCode(200)
  @Roles("ponto-admin", "PONTO_ADMIN")
  habilitarVisualizacao(@Req() req: AuthRequest, @Body() body: { senha?: string }) {
    return this.service.habilitarVisualizacao(superAdmin(req), body?.senha ?? "", ipDe(req));
  }

  /** Registra que a senha foi mostrada na tela (clique no olho). */
  @Post("senha/exibida")
  @HttpCode(200)
  @Roles("ponto-admin", "PONTO_ADMIN")
  senhaExibida(@Req() req: AuthRequest) {
    return this.service.registrarExibicao(superAdmin(req), ipDe(req));
  }

  @Post("liberar")
  @Roles("ponto-admin", "PONTO_ADMIN")
  liberar(@Req() req: AuthRequest, @Body() body: { senha?: string }) {
    return this.service.liberar(superAdmin(req), body?.senha ?? "", ipDe(req));
  }
}

/**
 * Usado só pelo CLI (npm run rep:liberar / rep:selar), sem JWT: a autorização é o TOKEN assinado,
 * emitido a um Super Admin que informou a senha root. O token vale 30 min e é de uso único no selo.
 */
@Controller("sistema/rep-escopo-cli")
export class RepEscopoCliController {
  constructor(private readonly service: RepEscopoService) {}

  @Post("verificar")
  async verificar(@Body() body: { token?: string }) {
    return { valido: await this.service.tokenValido(body?.token) };
  }

  @Post("selar")
  selar(@Req() req: Request, @Body() body: { token?: string; motivo?: string }) {
    return this.service.selar(body?.token, body?.motivo, ipDe(req));
  }
}
