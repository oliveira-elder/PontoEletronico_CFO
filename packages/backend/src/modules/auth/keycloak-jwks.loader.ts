import { createPublicKey } from "crypto";
import * as fs from "fs";

interface JwkKey {
  kid?: string;
  kty?: string;
  use?: string;
  [key: string]: unknown;
}

/** Carrega chaves RSA de assinatura (PEM) a partir do cache local JWKS. */
export function loadLocalJwksPem(jwksFile: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!jwksFile || !fs.existsSync(jwksFile)) return map;

  try {
    const raw = JSON.parse(fs.readFileSync(jwksFile, "utf8")) as { keys?: JwkKey[] };
    for (const key of raw.keys ?? []) {
      if (!key.kid || key.kty !== "RSA" || key.use !== "sig") continue;
      const pem = createPublicKey({ key, format: "jwk" }).export({
        type: "spki",
        format: "pem"
      }) as string;
      map.set(key.kid, pem);
    }
  } catch {
    /* cache inválido: ignora e usa JWKS remoto */
  }
  return map;
}
