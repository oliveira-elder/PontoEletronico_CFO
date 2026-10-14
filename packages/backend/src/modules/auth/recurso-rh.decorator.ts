import { SetMetadata } from "@nestjs/common";

export const RECURSO_RH_KEY = "recursoRh";

/**
 * Permissão do Perfil do RH exigida pela rota (aba ou função do catálogo recursos-rh).
 * Com mais de um recurso, basta ter qualquer um (rotas de leitura compartilhadas por abas).
 * Só é verificada quando o acesso à rota vem exclusivamente do papel RH_AUDITORIA —
 * ver PermissaoRhGuard.
 */
export const RecursoRh = (...recursos: string[]) => SetMetadata(RECURSO_RH_KEY, recursos);
