/**
 * Gerência de Tecnologia da Informação (GERTI) — identificação organizacional.
 * Usuários desta gerência podem receber Super Admin via UI (apenas GERTI).
 */
export declare const GERENCIA_GERTI_NOME = "GERTI";
export declare const GERENCIA_GERTI_SIGLAS: readonly ["GERTI", "G"];
export declare const GERENCIA_GERTI_SLUGS: readonly ["gerti"];
export interface GerenciaGertiRef {
  id?: string;
  nome?: string | null;
  sigla?: string | null;
  isGerenciaGerti?: boolean;
}
export declare function isGerenciaGertiSlug(slug: string): boolean;
export declare function isGerenciaGerti(gerencia: GerenciaGertiRef | null | undefined): boolean;
export declare function findGerenciaGerti<T extends GerenciaGertiRef>(
  gerencias: T[]
): T | undefined;
