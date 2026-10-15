import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AssinaturaModule } from "../assinatura/assinatura.module";
import { SeloIcpModule } from "../selo-icp/selo-icp.module";
import { AcordosRepController } from "./acordos-rep.controller";
import { AcordosRepService } from "./acordos-rep.service";
import { ArquivosFiscaisController } from "./arquivos-fiscais.controller";
import { ArquivosFiscaisService } from "./arquivos-fiscais.service";

/** AFD e AEJ (Portaria MTP 671/2021). */
@Module({
  imports: [PrismaModule, AssinaturaModule, SeloIcpModule],
  controllers: [ArquivosFiscaisController, AcordosRepController],
  providers: [ArquivosFiscaisService, AcordosRepService]
})
export class ArquivosFiscaisModule {}
