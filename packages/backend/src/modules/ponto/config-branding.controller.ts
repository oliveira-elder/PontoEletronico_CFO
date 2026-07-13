import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "./config.service";

/** Endpoint público (sem JWT) para identidade institucional exibida no login/rodapé. */
@Controller("ponto/config")
export class ConfigBrandingController {
  constructor(private readonly configService: ConfigService) {}

  @Get("branding")
  getBranding() {
    return this.configService.getBranding();
  }
}
