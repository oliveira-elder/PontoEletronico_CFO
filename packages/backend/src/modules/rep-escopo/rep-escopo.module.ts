import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { RepEscopoCliController, RepEscopoController } from "./rep-escopo.controller";
import { RepEscopoService } from "./rep-escopo.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RepEscopoController, RepEscopoCliController],
  providers: [RepEscopoService]
})
export class RepEscopoModule {}
