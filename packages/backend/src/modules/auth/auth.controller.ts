import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

@Controller("auth")
export class AuthController {
  @Get("me")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  me(@Req() req: { user: unknown }) {
    return req.user;
  }

  @Get("admin")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("intranet_admin")
  admin() {
    return { ok: true };
  }
}
