import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import { GlpiService } from "./glpi.service";

@Controller("glpi")
@UseGuards(AuthGuard("jwt"))
export class GlpiController {
  constructor(private readonly glpiService: GlpiService) {}

  @Get("sso-redirect")
  ssoRedirect(@Query("externalId") externalId: string) {
    return this.glpiService.buildSsoRedirect(externalId);
  }

  @Post("tickets")
  createTicket(@Body() payload: { title: string; content: string; requester: string }) {
    return this.glpiService.createTicket(payload);
  }
}
