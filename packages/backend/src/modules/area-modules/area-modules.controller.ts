import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

interface ModuleConfigInput {
  moduleCode: string;
  areaCode: string;
  allowPublicIndex: boolean;
}

@Controller("modules")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class AreaModulesController {
  private configs: ModuleConfigInput[] = [];

  @Get("configs")
  listConfigs() {
    return this.configs;
  }

  @Post("configs")
  @Roles("ponto-admin", "PONTO_ADMIN")
  upsertConfig(@Body() payload: ModuleConfigInput) {
    const index = this.configs.findIndex(
      (item) => item.moduleCode === payload.moduleCode && item.areaCode === payload.areaCode
    );
    if (index >= 0) this.configs[index] = payload;
    else this.configs.push(payload);
    return payload;
  }
}
