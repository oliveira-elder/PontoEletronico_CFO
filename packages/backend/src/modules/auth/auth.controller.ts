import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthContext } from "./auth.service";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /* Sincroniza o usuário SSO na base local e retorna o perfil completo.
     Chamado pelo frontend logo após cada login bem-sucedido. */
  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  me(@Req() req: { user: AuthContext }) {
    return this.authService.syncUser(req.user);
  }
}
