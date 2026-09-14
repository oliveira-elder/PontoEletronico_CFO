/**
 * Gerência de Recursos Humanos — identificação organizacional.
 * Usuários desta gerência recebem o perfil RH_AUDITORIA automaticamente.
 */
export const GERENCIA_RH_NOME = "Gerência de Recursos Humanos";
export const GERENCIA_RH_NOME_CURTO = "Recursos Humanos";
export const GERENCIA_RH_SIGLA_PADRAO = "GERH";
export const GERENCIA_RH_SIGLAS = ["RH", "GERH", "GRH", "SERHUM", "DDGDP", "DGP"] as const;

export const GERENCIA_RH_SLUGS = [
  "rh",
  "serhum",
  "recursos-humanos",
  "gerencia-recursos-humanos",
  "gerencia-de-recursos-humanos",
  "gestao-de-pessoas",
  "departamento-de-gestao-de-pessoas",
  "departamento-gestao-de-pessoas"
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
  const s = norm(slug).replace(/\s+/g, "-");
  if (GERENCIA_RH_SLUGS.some((x) => s === x || s.startsWith(`${x}-`))) return true;
  return s.includes("gestao-de-pessoas") || s.includes("recursos-humanos");
}

function nomeIndicaGerenciaRh(nome: string): boolean {
  const n = norm(nome);
  return (
    n === "rh" ||
    n.includes("recursos humanos") ||
    n.includes("gerencia de recursos humanos") ||
    n.includes("gestao de pessoas")
  );
}

/** Verdadeiro para gerências "Recursos Humanos", "Gestão de Pessoas" e equivalentes. */
export function isGerenciaRh(gerencia: GerenciaRef | null | undefined): boolean {
  if (!gerencia) return false;

  const sigla = gerencia.sigla ? norm(gerencia.sigla) : "";
  if (GERENCIA_RH_SIGLAS.some((s) => norm(s) === sigla)) return true;

  return gerencia.nome ? nomeIndicaGerenciaRh(gerencia.nome) : false;
}

export function findGerenciaRh<T extends GerenciaRef>(gerencias: T[]): T | undefined {
  return gerencias.find((g) => isGerenciaRh(g));
}
