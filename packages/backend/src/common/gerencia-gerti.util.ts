/**
 * Gerência GERTI — identificação organizacional.
 * Candidatos a Super Admin concedido pela UI devem pertencer a esta gerência.
 */
export const GERENCIA_GERTI_NOME = "GERTI";
export const GERENCIA_GERTI_SIGLAS = ["GERTI"] as const;

export const GERENCIA_GERTI_SLUGS = ["gerti"] as const;

export interface GerenciaGertiRef {
  nome?: string | null;
  sigla?: string | null;
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isGerenciaGertiSlug(slug: string): boolean {
  const s = norm(slug);
  return GERENCIA_GERTI_SLUGS.some((x) => s === x || s.startsWith(`${x}-`));
}

/** Verdadeiro para gerência/seção GERTI. */
export function isGerenciaGerti(gerencia: GerenciaGertiRef | null | undefined): boolean {
  if (!gerencia) return false;

  const sigla = gerencia.sigla ? norm(gerencia.sigla) : "";
  if (sigla === "gerti") return true;

  const nome = gerencia.nome ? norm(gerencia.nome) : "";
  return nome === "gerti" || nome.includes("gerti");
}

export function findGerenciaGerti<T extends GerenciaGertiRef>(gerencias: T[]): T | undefined {
  return gerencias.find((g) => isGerenciaGerti(g));
}
