import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { DocumentacaoController } from "./documentacao.controller";
import { DocumentacaoBancoService } from "./documentacao-banco.service";
import { DocumentacaoConteudoService } from "./documentacao-conteudo.service";
import { DocumentacaoGeradaService } from "./documentacao-gerada.service";
import { DocumentacaoService } from "./documentacao.service";

/** Documentação Técnica do sistema (Logs → Documentação). */
@Module({
  imports: [PrismaModule],
  controllers: [DocumentacaoController],
  providers: [
    DocumentacaoService,
    DocumentacaoGeradaService,
    DocumentacaoBancoService,
    DocumentacaoConteudoService
  ]
})
export class DocumentacaoModule {}
