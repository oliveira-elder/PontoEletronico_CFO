/**
 * Gerência de Recursos Humanos — identificação organizacional.
 * Não substitui o papel de autorização RH_AUDITORIA (Keycloak); complementa no app.
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
  id?: string;
  nome?: string | null;
  sigla?: string | null;
  isGerenciaRh?: boolean;
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

export function isGerenciaRh(gerencia: GerenciaRef | null | undefined): boolean {
  if (!gerencia) return false;
  if (gerencia.isGerenciaRh === true) return true;

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

export function gerenciaRhCanonica(): { nome: string; sigla: string } {
  return { nome: GERENCIA_RH_NOME, sigla: GERENCIA_RH_SIGLA_PADRAO };
}

export function findGerenciaRh<T extends GerenciaRef>(gerencias: T[]): T | undefined {
  return gerencias.find((g) => isGerenciaRh(g));
}

export function labelGerenciaRh(gerencia: GerenciaRef | null | undefined): string {
  if (!gerencia) return "—";
  if (isGerenciaRh(gerencia)) return GERENCIA_RH_NOME_CURTO;
  return gerencia.nome ?? "—";
}

export function formatGerenciaOption(gerencia: GerenciaRef): string {
  if (isGerenciaRh(gerencia)) {
    const sigla = gerencia.sigla ?? GERENCIA_RH_SIGLA_PADRAO;
    return `${GERENCIA_RH_NOME_CURTO} (${sigla})`;
  }
  const sigla = gerencia.sigla ? ` (${gerencia.sigla})` : "";
  return `${gerencia.nome ?? "—"}${sigla}`;
}
