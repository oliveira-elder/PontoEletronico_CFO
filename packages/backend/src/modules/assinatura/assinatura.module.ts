import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { AssinaturaService } from "./assinatura.service";
import { AssinaturaController, AssinaturaAuditoriaController } from "./assinatura.controller";

@Module({
  imports: [PrismaModule, AuditoriaModule],
  controllers: [AssinaturaController, AssinaturaAuditoriaController],
  providers: [AssinaturaService],
  exports: [AssinaturaService]
})
export class AssinaturaModule {}
