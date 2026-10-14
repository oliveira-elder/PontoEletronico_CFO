import { Module } from "@nestjs/common";
import { PerfisRhController } from "./perfis-rh.controller";
import { PerfisRhService } from "./perfis-rh.service";

@Module({
  controllers: [PerfisRhController],
  providers: [PerfisRhService]
})
export class PerfisRhModule {}
