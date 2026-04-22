import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { KeycloakJwtStrategy } from "./keycloak-jwt.strategy";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" })],
  controllers: [AuthController],
  providers: [AuthService, KeycloakJwtStrategy, RolesGuard],
  exports: [AuthService, RolesGuard]
})
export class AuthModule {}
