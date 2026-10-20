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

    const hs256Permitido =
      configService.get<string>("ALLOW_DEV_TOKENS") === "true" &&
      configService.get<string>("NODE_ENV") !== "production" &&
      jwtSecret !== "dev-secret";
    if (hs256Permitido) {
      Logger.warn(
        "Tokens HS256 de desenvolvimento habilitados (ALLOW_DEV_TOKENS).",
        KeycloakJwtStrategy.name
      );
    }

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
        /* HS256 só para desenvolvimento: exige liberação explícita, fora de produção e segredo próprio. */
        if (!hs256Permitido) {
          return done(new Error("Tokens HS256 não são aceitos neste ambiente."));
        }
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
      return done(new Error("Não há chave para validar o token."));
    };

    const validateAudience = configService.get<string>("KEYCLOAK_VALIDATE_AUDIENCE") === "true";

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        /* Token na URL só para o fluxo SSE (EventSource não envia cabeçalhos). */
        (req: { path?: string; query?: Record<string, unknown> }) =>
          req.path?.endsWith("/logs/stream") && typeof req.query?.access_token === "string"
            ? req.query.access_token
            : null
      ]),
      ignoreExpiration: false,
      issuer: validateIssuer && issuer ? issuer.replace(/\/$/, "") : undefined,
      audience: validateAudience ? audience : undefined,
      algorithms: ["RS256", "HS256"],
      secretOrKeyProvider,
      /* Tolerância de relógio (segundos): sem isso o `jsonwebtoken` usa 0s de
         tolerância, e um pequeno clock skew entre o container do backend e o
         Keycloak rejeita tokens ainda válidos bem na borda da expiração. */
      jsonWebTokenOptions: { clockTolerance: 30 }
    });
  }

  async validate(payload: Record<string, unknown>) {
    const ctx = this.authService.mapTokenPayload(payload);
    return this.authService.enrichRoles(ctx);
  }
}
