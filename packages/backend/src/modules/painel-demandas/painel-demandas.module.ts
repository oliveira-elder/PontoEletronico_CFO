import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SaudeOcupacionalModule } from "../saude-ocupacional/saude-ocupacional.module";
import { PainelDemandasController } from "./painel-demandas.controller";
import { PainelDemandasService } from "./painel-demandas.service";

@Module({
  imports: [PrismaModule, SaudeOcupacionalModule],
  controllers: [PainelDemandasController],
  providers: [PainelDemandasService]
})
export class PainelDemandasModule {}
