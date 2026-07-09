import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PontoController } from "./ponto.controller";
import { PontoService } from "./ponto.service";
import { ConfigController } from "./config.controller";
import { ConfigService } from "./config.service";
import { GestaoController } from "./gestao.controller";
import { GestaoService } from "./gestao.service";
import { FotoService } from "./foto.service";
import { DocumentoService } from "./documento.service";
import { FeriadosService } from "./feriados.service";
import { FeriadoConfigService } from "./feriado-config.service";
import { ConfigSolicitacoesService } from "./config-solicitacoes.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { ApiServidoraModule } from "../api-servidora/api-servidora.module";
import { NotificacaoModule } from "../notificacao/notificacao.module";

@Module({
  imports: [PrismaModule, HttpModule, ApiServidoraModule, NotificacaoModule],
  controllers: [PontoController, ConfigController, GestaoController],
  providers: [
    PontoService,
    ConfigService,
    GestaoService,
    FotoService,
    DocumentoService,
    FeriadosService,
    FeriadoConfigService,
    ConfigSolicitacoesService
  ],
  exports: [PontoService, ConfigSolicitacoesService, FeriadosService, FeriadoConfigService]
})
export class PontoModule {}
