import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService } from "./auth.service";

@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService, private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET", "dev-secret"),
      issuer: configService.get<string>("KEYCLOAK_ISSUER"),
      audience: configService.get<string>("KEYCLOAK_AUDIENCE")
    });
  }

  validate(payload: Record<string, unknown>) {
    return this.authService.mapTokenPayload(payload);
  }
}
