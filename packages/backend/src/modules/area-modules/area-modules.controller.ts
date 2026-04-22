import { Body, Controller, Get, Post } from "@nestjs/common";

interface ModuleConfigInput {
  moduleCode: string;
  areaCode: string;
  allowPublicIndex: boolean;
}

@Controller("modules")
export class AreaModulesController {
  private configs: ModuleConfigInput[] = [];

  @Get("configs")
  listConfigs() {
    return this.configs;
  }

  @Post("configs")
  upsertConfig(@Body() payload: ModuleConfigInput) {
    const index = this.configs.findIndex(
      (item) => item.moduleCode === payload.moduleCode && item.areaCode === payload.areaCode
    );
    if (index >= 0) this.configs[index] = payload;
    else this.configs.push(payload);
    return payload;
  }
}
