import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { FeriasControleController } from "./ferias-controle.controller";
import { FeriasControleService } from "./ferias-controle.service";

@Module({
  imports: [PrismaModule],
  controllers: [FeriasControleController],
  providers: [FeriasControleService]
})
export class FeriasControleModule {}
