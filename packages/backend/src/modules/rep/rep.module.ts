import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RepLivroService } from "./rep-livro.service";
import { RepPService } from "./rep-p.service";

/** Livro do REP (NSR, marcações originais, eventos, instância) — global: usado no ponto e no cadastro. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [RepPService, RepLivroService],
  exports: [RepPService, RepLivroService]
})
export class RepModule {}
