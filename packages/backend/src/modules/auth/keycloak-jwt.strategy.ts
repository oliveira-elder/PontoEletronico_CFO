import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import * as jwksRsa from "jwks-rsa";
import { AuthService } from "./auth.service";

/* Decodifica o header de um JWT sem verificar assinatura.
   Necessário para escolher a chave correta antes da validação. */
function decodeJwtHeader(rawToken: string): { alg?: string; kid?: string } {
  try {
    const [h] = rawToken.split(".");
    const json = Buffer.from(h, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService
  ) {
    const issuer = configService.get<string>("KEYCLOAK_ISSUER", "");
    const audience = configService.get<string>("KEYCLOAK_AUDIENCE");
    const clientSecret = configService.get<string>("KEYCLOAK_CLIENT_SECRET", "");
    const jwtSecret = configService.get<string>("JWT_SECRET", "dev-secret");

    /* KEYCLOAK_JWKS_URI usa a URL interna do Docker quando definida.
       Caso contrário, deriva do KEYCLOAK_ISSUER (compatibilidade). */
    const jwksUri = configService.get<string>(
      "KEYCLOAK_JWKS_URI",
      `${issuer}/protocol/openid-connect/certs`
    );

    /* Provider RS256 via JWKS — só ativo se houver Keycloak configurado. */
    const jwksProvider =
      clientSecret.length > 0
        ? jwksRsa.passportJwtSecret({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 5,
            jwksUri
          })
        : null;

    /* Provider híbrido:
       - Tokens HS256 → assinados com JWT_SECRET (devLogin local).
       - Tokens RS256 (kid) → validados via JWKS do Keycloak.
       Permite que o badge "Login Dev" funcione mesmo com Keycloak ativo. */
    const secretOrKeyProvider = (
      request: unknown,
      rawJwtToken: string,
      done: (err: Error | null, secret?: string | Buffer) => void
    ) => {
      const header = decodeJwtHeader(rawJwtToken);
      if (header.alg === "HS256") {
        return done(null, jwtSecret);
      }
      if (jwksProvider) {
        return jwksProvider(request, rawJwtToken, done);
      }
      return done(null, jwtSecret);
    };

    /* Audience: Keycloak por padrão não inclui o clientId em `aud` do access token.
       Validamos apenas se KEYCLOAK_VALIDATE_AUDIENCE=true estiver explícito. */
    const validateAudience = configService.get<string>("KEYCLOAK_VALIDATE_AUDIENCE") === "true";

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: issuer || undefined,
      audience: validateAudience ? audience : undefined,
      algorithms: ["RS256", "HS256"],
      secretOrKeyProvider
    });
  }

  validate(payload: Record<string, unknown>) {
    return this.authService.mapTokenPayload(payload);
  }
}
