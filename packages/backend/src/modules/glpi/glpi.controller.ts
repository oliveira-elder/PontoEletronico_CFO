import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { GlpiService } from "./glpi.service";

@Controller("glpi")
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
