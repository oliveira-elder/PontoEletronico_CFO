import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ExtensionsService } from "./extensions.service";
import { ExtensionsController } from "./extensions.controller";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule, HttpModule],
  controllers: [ExtensionsController],
  providers: [ExtensionsService],
  exports: [ExtensionsService]
})
export class ExtensionsModule {}
