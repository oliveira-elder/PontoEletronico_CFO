import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificacaoModule } from "../notificacao/notificacao.module";
import { SistemaController } from "./sistema.controller";
import { SistemaService } from "./sistema.service";

@Module({
  imports: [PrismaModule, NotificacaoModule],
  controllers: [SistemaController],
  providers: [SistemaService],
  exports: [SistemaService]
})
export class SistemaModule {}
