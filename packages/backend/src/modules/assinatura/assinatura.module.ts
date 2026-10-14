import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditoriaModule } from "../auditoria/auditoria.module";
import { PontoModule } from "../ponto/ponto.module";
import { NotificacaoModule } from "../notificacao/notificacao.module";
import { SeloIcpModule } from "../selo-icp/selo-icp.module";
import { AssinaturaService } from "./assinatura.service";
import {
  AssinaturaController,
  AssinaturaAuditoriaController,
  VerificacaoPublicaController
} from "./assinatura.controller";

@Module({
  imports: [PrismaModule, AuditoriaModule, PontoModule, NotificacaoModule, SeloIcpModule],
  controllers: [AssinaturaController, AssinaturaAuditoriaController, VerificacaoPublicaController],
  providers: [AssinaturaService],
  exports: [AssinaturaService]
})
export class AssinaturaModule {}
