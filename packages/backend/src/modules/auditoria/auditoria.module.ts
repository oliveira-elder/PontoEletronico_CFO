import { Module } from "@nestjs/common";
import { AuditoriaController } from "./auditoria.controller";
import { AuditoriaService } from "./auditoria.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { DocumentoService } from "../ponto/documento.service";
import { PontoModule } from "../ponto/ponto.module";
import { NotificacaoModule } from "../notificacao/notificacao.module";

@Module({
  imports: [PrismaModule, AuthModule, PontoModule, NotificacaoModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService, DocumentoService],
  exports: [AuditoriaService]
})
export class AuditoriaModule {}
