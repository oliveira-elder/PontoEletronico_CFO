import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GroupsGuard } from "./groups.guard";
import { KeycloakJwtStrategy } from "./keycloak-jwt.strategy";
import { RolesGuard } from "./roles.guard";
import { PrismaModule } from "../../prisma/prisma.module";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" }), PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, KeycloakJwtStrategy, RolesGuard, GroupsGuard],
  exports: [AuthService, RolesGuard, GroupsGuard]
})
export class AuthModule {}
