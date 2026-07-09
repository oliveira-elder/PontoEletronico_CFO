/**
 * Gerência de Recursos Humanos — identificação organizacional.
 * Usuários desta gerência recebem o perfil RH_AUDITORIA automaticamente.
 */
export const GERENCIA_RH_NOME = "Gerência de Recursos Humanos";
export const GERENCIA_RH_NOME_CURTO = "Recursos Humanos";
export const GERENCIA_RH_SIGLA_PADRAO = "GERH";
export const GERENCIA_RH_SIGLAS = ["RH", "GERH", "GRH", "SERHUM"] as const;

export const GERENCIA_RH_SLUGS = [
  "rh",
  "serhum",
  "recursos-humanos",
  "gerencia-recursos-humanos",
  "gerencia-de-recursos-humanos"
] as const;

export interface GerenciaRef {
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

export function isGerenciaRhSlug(slug: string): boolean {
  const s = norm(slug);
  return GERENCIA_RH_SLUGS.some((x) => s === x || s.startsWith(`${x}-`));
}

/** Verdadeiro para gerências "Recursos Humanos", "RH" e equivalentes. */
export function isGerenciaRh(gerencia: GerenciaRef | null | undefined): boolean {
  if (!gerencia) return false;

  const sigla = gerencia.sigla ? norm(gerencia.sigla) : "";
  if (GERENCIA_RH_SIGLAS.some((s) => norm(s) === sigla)) return true;

  const nome = gerencia.nome ? norm(gerencia.nome) : "";
  return (
    nome === "recursos humanos" ||
    nome === "rh" ||
    nome.includes("recursos humanos") ||
    nome.includes("gerencia de recursos humanos")
  );
}
