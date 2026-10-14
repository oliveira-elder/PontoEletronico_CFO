/**
 * Gerência de Recursos Humanos — identificação organizacional.
 * Não substitui o papel de autorização RH_AUDITORIA (Keycloak).
 */
export declare const GERENCIA_RH_NOME = "Ger\u00EAncia de Recursos Humanos";
export declare const GERENCIA_RH_NOME_CURTO = "Recursos Humanos";
export declare const GERENCIA_RH_SIGLA_PADRAO = "GERH";
export declare const GERENCIA_RH_SIGLAS: readonly ["RH", "GERH", "GRH", "SERHUM", "DDGDP", "DGP"];
/** Slugs da API Extensions / seções que mapeiam para a gerência RH. */
export declare const GERENCIA_RH_SLUGS: readonly [
  "rh",
  "serhum",
  "recursos-humanos",
  "gerencia-recursos-humanos",
  "gerencia-de-recursos-humanos",
  "gestao-de-pessoas",
  "departamento-de-gestao-de-pessoas",
  "departamento-gestao-de-pessoas"
];
export interface GerenciaRef {
  id?: string;
  nome?: string | null;
  sigla?: string | null;
  isGerenciaRh?: boolean;
}
export declare function isGerenciaRhSlug(slug: string): boolean;
export declare function isGerenciaRh(gerencia: GerenciaRef | null | undefined): boolean;
export declare function gerenciaRhCanonica(): {
  nome: string;
  sigla: string;
};
export declare function findGerenciaRh<T extends GerenciaRef>(gerencias: T[]): T | undefined;
export declare function findGerenciaRhId(gerencias: GerenciaRef[]): string | undefined;
export declare function labelGerenciaRh(gerencia: GerenciaRef | null | undefined): string;
export declare function formatGerenciaOption(gerencia: GerenciaRef): string;
