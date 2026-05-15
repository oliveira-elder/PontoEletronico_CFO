import { Module } from "@nestjs/common";
import { PontoController } from "./ponto.controller";
import { PontoService } from "./ponto.service";
import { ConfigController } from "./config.controller";
import { ConfigService } from "./config.service";
import { GestaoController } from "./gestao.controller";
import { GestaoService } from "./gestao.service";
import { FotoService } from "./foto.service";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [PontoController, ConfigController, GestaoController],
  providers: [PontoService, ConfigService, GestaoService, FotoService],
  exports: [PontoService]
})
export class PontoModule {}
