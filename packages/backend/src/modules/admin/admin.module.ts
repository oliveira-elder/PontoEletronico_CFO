import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { KeycloakAdminService } from "./keycloak-admin.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminController],
  providers: [KeycloakAdminService],
  exports: [KeycloakAdminService]
})
export class AdminModule {}
