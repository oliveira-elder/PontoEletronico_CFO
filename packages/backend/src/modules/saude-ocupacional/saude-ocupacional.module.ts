import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificacaoModule } from "../notificacao/notificacao.module";
import { SaudeOcupacionalController } from "./saude-ocupacional.controller";
import { SaudeOcupacionalService } from "./saude-ocupacional.service";

@Module({
  imports: [PrismaModule, NotificacaoModule],
  controllers: [SaudeOcupacionalController],
  providers: [SaudeOcupacionalService]
})
export class SaudeOcupacionalModule {}
