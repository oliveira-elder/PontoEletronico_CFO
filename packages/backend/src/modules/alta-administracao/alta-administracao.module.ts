import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { ExtensionsModule } from "../extensions/extensions.module";
import { AltaAdministracaoController } from "./alta-administracao.controller";
import { AltaAdministracaoService } from "./alta-administracao.service";

@Module({
  imports: [PrismaModule, AuthModule, AdminModule, ExtensionsModule],
  controllers: [AltaAdministracaoController],
  providers: [AltaAdministracaoService]
})
export class AltaAdministracaoModule {}
