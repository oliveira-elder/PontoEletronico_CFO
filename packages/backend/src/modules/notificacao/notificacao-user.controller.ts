import { Controller, Get, Patch, Param, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { NotificacaoService } from "./notificacao.service";

interface JwtRequest {
  user: { sub: string; isSuperAdmin?: boolean };
}

@Controller("notificacao")
@UseGuards(AuthGuard("jwt"))
export class NotificacaoUserController {
  constructor(private readonly svc: NotificacaoService) {}

  @Get("minhas")
  getMinhas(@Request() req: JwtRequest, @Query("limit") limit?: string) {
    return this.svc.getMinhasNotificacoes(req.user.sub, limit ? Number(limit) : 50);
  }

  @Get("contagem")
  contagem(@Request() req: JwtRequest) {
    return this.svc.contarNaoLidas(req.user.sub);
  }

  @Patch("marcar-todas-lidas")
  marcarTodas(@Request() req: JwtRequest) {
    return this.svc.marcarTodasLidas(req.user.sub);
  }

  @Patch(":id/lida")
  marcarLida(@Param("id") id: string, @Request() req: JwtRequest) {
    return this.svc.marcarLida(id, req.user.sub);
  }
}
