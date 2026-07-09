import { Module } from "@nestjs/common";
import { RequisicaoRhController } from "./requisicao-rh.controller";
import { RequisicaoRhService } from "./requisicao-rh.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificacaoModule } from "../notificacao/notificacao.module";

@Module({
  imports: [PrismaModule, NotificacaoModule],
  controllers: [RequisicaoRhController],
  providers: [RequisicaoRhService]
})
export class RequisicaoRhModule {}
