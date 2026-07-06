import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthContext } from "./auth.service";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /* Seed no banco interno no login: cria/atualiza User + Funcionario e retorna o perfil. */
  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  me(@Req() req: { user: AuthContext }) {
    return this.authService.syncUser(req.user);
  }
}
