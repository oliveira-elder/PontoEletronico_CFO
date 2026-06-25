import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotificacaoController } from "./notificacao.controller";
import { NotificacaoUserController } from "./notificacao-user.controller";
import { NotificacaoService } from "./notificacao.service";

@Module({
  imports: [PrismaModule],
  controllers: [NotificacaoController, NotificacaoUserController],
  providers: [NotificacaoService],
  exports: [NotificacaoService]
})
export class NotificacaoModule {}
