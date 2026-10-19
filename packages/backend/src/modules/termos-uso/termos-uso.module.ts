import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "../../prisma/prisma.module";
import { TermosUsoAdminController, TermosUsoController } from "./termos-uso.controller";
import { TermosPendentesInterceptor } from "./termos-pendentes.interceptor";
import { TermosUsoService } from "./termos-uso.service";

/** Termos de Uso: versões, aceite obrigatório (sem bloquear o registro de ponto) e histórico. */
@Module({
  imports: [PrismaModule],
  controllers: [TermosUsoController, TermosUsoAdminController],
  providers: [TermosUsoService, { provide: APP_INTERCEPTOR, useClass: TermosPendentesInterceptor }],
  exports: [TermosUsoService]
})
export class TermosUsoModule {}
