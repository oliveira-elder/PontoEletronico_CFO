import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SeloIcpModule } from "../selo-icp/selo-icp.module";
import { AssinaturaModule } from "../assinatura/assinatura.module";
import { ComprovanteController, VerificacaoMarcacaoController } from "./comprovante.controller";
import { ComprovanteService } from "./comprovante.service";

/** Comprovante de Registro de Ponto do Trabalhador (REP-P, arts. 79 e 80). */
@Module({
  imports: [PrismaModule, SeloIcpModule, AssinaturaModule],
  controllers: [ComprovanteController, VerificacaoMarcacaoController],
  providers: [ComprovanteService],
  exports: [ComprovanteService]
})
export class ComprovanteModule {}
