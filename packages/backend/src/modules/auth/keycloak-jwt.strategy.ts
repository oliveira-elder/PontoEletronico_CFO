import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import * as https from "https";
import * as jwksRsa from "jwks-rsa";
import { loadLocalJwksPem } from "./keycloak-jwks.loader";
import { AuthService } from "./auth.service";

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
  private readonly logger = new Logger(KeycloakJwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly authService: AuthService
  ) {
    const issuer = configService.get<string>("KEYCLOAK_ISSUER", "");
    const audience = configService.get<string>("KEYCLOAK_AUDIENCE");
    const jwtSecret = configService.get<string>("JWT_SECRET", "dev-secret");
    const validateIssuer = configService.get<string>("KEYCLOAK_VALIDATE_ISSUER") !== "false";
    const jwksFile = configService.get<string>(
      "KEYCLOAK_JWKS_FILE",
      "/app/deploy/keycloak/jwks.json"
    );

    const jwksUri = configService.get<string>(
      "KEYCLOAK_JWKS_URI",
      issuer ? `${issuer.replace(/\/$/, "")}/protocol/openid-connect/certs` : ""
    );

    const localKeys = loadLocalJwksPem(jwksFile);
    if (localKeys.size > 0) {
      Logger.log(`JWKS local: ${localKeys.size} chave(s) em ${jwksFile}`, KeycloakJwtStrategy.name);
    } else {
      Logger.warn(`JWKS local ausente em ${jwksFile} — usando remoto`, KeycloakJwtStrategy.name);
    }

    const useJwks = jwksUri.length > 0;
    const jwksTlsInsecure = configService.get<string>("KEYCLOAK_JWKS_TLS_INSECURE") === "true";
    const jwksProvider = useJwks
      ? jwksRsa.passportJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 5,
          jwksUri,
          timeout: 15000,
          ...(jwksTlsInsecure
            ? { requestAgent: new https.Agent({ rejectUnauthorized: false }) }
            : {})
        })
      : null;

    const secretOrKeyProvider = (
      request: unknown,
      rawJwtToken: string,
      done: (err: Error | null, secret?: string | Buffer) => void
    ) => {
      const header = decodeJwtHeader(rawJwtToken);
      if (header.alg === "HS256") {
        return done(null, jwtSecret);
      }
      if (header.kid && localKeys.has(header.kid)) {
        return done(null, localKeys.get(header.kid));
      }
      if (jwksProvider) {
        return jwksProvider(request, rawJwtToken, (err, key) => {
          if (err) {
            Logger.warn(`JWKS remoto falhou (kid=${header.kid}): ${err.message}`);
          }
          done(err, key);
        });
      }
      return done(null, jwtSecret);
    };

    const validateAudience = configService.get<string>("KEYCLOAK_VALIDATE_AUDIENCE") === "true";

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter("access_token")
      ]),
      ignoreExpiration: false,
      issuer: validateIssuer && issuer ? issuer.replace(/\/$/, "") : undefined,
      audience: validateAudience ? audience : undefined,
      algorithms: ["RS256", "HS256"],
      secretOrKeyProvider
    });
  }

  async validate(payload: Record<string, unknown>) {
    const ctx = this.authService.mapTokenPayload(payload);
    return this.authService.enrichRoles(ctx);
  }
}
