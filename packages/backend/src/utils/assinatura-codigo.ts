import { createHash } from "crypto";

/** Remove espaços/hífens e normaliza para maiúsculas (aceita código agrupado do PDF). */
export function normalizeCodigoAssinatura(raw: string): string {
  return raw.replace(/[\s\-_.]/g, "").toUpperCase();
}

/**
 * Hash SHA-256 do quadro mensal (mesmo algoritmo impresso no PDF).
 * Canonical: matricula|mes/ano|ISO8601|ip
 */
export function computeQuadroSignatoryHash(
  matricula: string,
  periodo: string,
  assinadoEm: Date | null,
  ip: string | null
): string {
  const canonical = [matricula, periodo, assinadoEm?.toISOString() ?? "", ip ?? ""].join("|");
  return createHash("sha256").update(canonical).digest("hex").toUpperCase();
}

/** Primeiros N hex do hash, agrupados em blocos de 4 (exibição no PDF do quadro). */
export function groupCodigoAssinatura(hex: string, chars = 32): string {
  return hex
    .slice(0, chars)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

export function codigoQuadroExibido(
  matricula: string,
  periodo: string,
  assinadoEm: Date | null,
  ip: string | null
): string {
  return groupCodigoAssinatura(computeQuadroSignatoryHash(matricula, periodo, assinadoEm, ip), 32);
}

/**
 * Hash da ciência do gestor no atestado (mesmo algoritmo do selo no PDF).
 * Canonical: gestorNome|ISO8601|ipReal|userAgent — exibe os 16 primeiros hex.
 */
export function computeCienciaGestorHash(
  gestorNome: string,
  assinadoEm: Date,
  ipReal: string,
  userAgent: string | null | undefined
): string {
  return createHash("sha256")
    .update([gestorNome, assinadoEm.toISOString(), ipReal, userAgent ?? ""].join("|"))
    .digest("hex")
    .toUpperCase();
}

export function codigoCienciaGestorExibido(
  gestorNome: string,
  assinadoEm: Date,
  ipReal: string,
  userAgent: string | null | undefined
): string {
  return computeCienciaGestorHash(gestorNome, assinadoEm, ipReal, userAgent).slice(0, 16);
}

/**
 * Compara busca do usuário com o código impresso/completo.
 * Aceita prefixo (usuário cola só os primeiros blocos).
 */
export function codigoAssinaturaCoincide(
  codigoComputado: string,
  buscaNormalizada: string
): boolean {
  if (!buscaNormalizada || buscaNormalizada.length < 4) return false;
  const comp = normalizeCodigoAssinatura(codigoComputado);
  return comp.startsWith(buscaNormalizada) || buscaNormalizada.startsWith(comp.slice(0, 16));
}
