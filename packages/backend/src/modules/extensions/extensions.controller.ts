import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ExtensionsService } from "./extensions.service";

@Controller("admin/extensions")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ponto-admin", "PONTO_ADMIN")
export class ExtensionsController {
  constructor(private readonly extensionsService: ExtensionsService) {}

  @Post("sync")
  async sync() {
    return this.extensionsService.syncExtensions();
  }

  @Get("sync/status")
  async status() {
    return this.extensionsService.getLastSync();
  }
}
