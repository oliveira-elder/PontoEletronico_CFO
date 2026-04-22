import { Module } from "@nestjs/common";
import { AreaModulesController } from "./area-modules.controller";

@Module({
  controllers: [AreaModulesController]
})
export class AreaModulesModule {}
