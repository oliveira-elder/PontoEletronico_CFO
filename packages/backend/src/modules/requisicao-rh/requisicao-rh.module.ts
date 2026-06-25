import { Module } from "@nestjs/common";
import { RequisicaoRhController } from "./requisicao-rh.controller";
import { RequisicaoRhService } from "./requisicao-rh.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [RequisicaoRhController],
  providers: [RequisicaoRhService]
})
export class RequisicaoRhModule {}
