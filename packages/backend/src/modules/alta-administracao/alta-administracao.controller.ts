import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AltaAdministracaoService, type Ator } from "./alta-administracao.service";

interface AuthRequest extends Request {
  user?: { isSuperAdmin?: boolean; username?: string; name?: string; sub?: string };
}

function ator(req: AuthRequest): Ator {
  if (!req.user?.isSuperAdmin) throw new ForbiddenException("Acesso restrito a Super Admin.");
  return {
    nome: req.user.name || req.user.username || req.user.sub || "super admin",
    sub: req.user.sub ?? null,
    token: (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "")
  };
}

const ipDe = (req: Request) => (req.ips?.[0] ?? req.ip ?? "").replace(/^::ffff:/, "") || null;

/** Aba "Alta Administração (sem matrícula)" em /ponto/sistema: só Super Admin. */
@Controller("admin/extensions/sem-matricula")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AltaAdministracaoController {
  constructor(private readonly service: AltaAdministracaoService) {}

  @Get()
  @Roles("ponto-admin", "PONTO_ADMIN")
  pessoas(@Req() req: AuthRequest) {
    ator(req);
    return this.service.listarPessoas();
  }

  @Get("status-sso")
  @Roles("ponto-admin", "PONTO_ADMIN")
  statusSso(@Req() req: AuthRequest) {
    return this.service.statusSso(ator(req).token);
  }

  @Get("solicitacoes")
  @Roles("ponto-admin", "PONTO_ADMIN")
  entradas(@Req() req: AuthRequest) {
    return this.service.listarEntradas(ator(req).sub);
  }

  @Post("solicitacoes")
  @Roles("ponto-admin", "PONTO_ADMIN")
  solicitar(
    @Req() req: AuthRequest,
    @Body()
    body: {
      apiId?: string;
      usuarioSso?: string;
      cpf?: string;
      subcategoria?: string;
      numeroChamado?: string;
      arquivoBase64?: string;
      nomeArquivo?: string;
    }
  ) {
    return this.service.solicitar(ator(req), body ?? {}, ipDe(req));
  }

  @Post("solicitacoes/:id/autorizar")
  @HttpCode(200)
  @Roles("ponto-admin", "PONTO_ADMIN")
  autorizar(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { confirmo?: boolean }
  ) {
    return this.service.autorizar(ator(req), id, body?.confirmo === true, ipDe(req));
  }

  @Post("solicitacoes/:id/negar")
  @HttpCode(200)
  @Roles("ponto-admin", "PONTO_ADMIN")
  negar(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { categoriaMotivo?: string; motivo?: string }
  ) {
    return this.service.negar(ator(req), id, body ?? {}, ipDe(req));
  }

  @Post("solicitacoes/:id/revogar")
  @HttpCode(200)
  @Roles("ponto-admin", "PONTO_ADMIN")
  revogar(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { categoriaMotivo?: string; motivo?: string; chamado?: string }
  ) {
    return this.service.revogar(ator(req), id, body ?? {}, ipDe(req));
  }

  /** Anexo do chamado (print/PDF): só Super Admin; cada abertura é registrada. */
  @Get("solicitacoes/:id/anexo")
  @Header("Cache-Control", "no-store")
  @Roles("ponto-admin", "PONTO_ADMIN")
  async anexo(@Req() req: AuthRequest, @Param("id") id: string, @Res() res: Response) {
    const a = await this.service.anexo(id, ator(req));
    res.setHeader("Content-Type", a.mime);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
    res.send(a.buffer);
  }
}
