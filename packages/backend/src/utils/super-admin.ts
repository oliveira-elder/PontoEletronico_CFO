/**
 * Super administradores: instância máxima — veem e fazem tudo no sistema.
 * Matching tolerante: username, parte local do e-mail (elder.oliveira@cfo.org.br → elder.oliveira).
 */

function parseList(raw: string | undefined, fallback: string): string[] {
  return (raw ?? fallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function superAdminUsernamesFromEnv(
  envValue: string | undefined,
  fallback = "elder.oliveira"
): string[] {
  return parseList(envValue, fallback);
}

/** Normaliza identidade para comparação com a lista de super admins. */
export function identityCandidates(...values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const lower = v.toLowerCase().trim();
    if (!lower) continue;
    out.add(lower);
    if (lower.includes("@")) {
      out.add(lower.split("@")[0] ?? lower);
    }
  }
  return Array.from(out);
}

export function isSuperAdminIdentity(
  usernames: string[],
  ...identities: Array<string | null | undefined>
): boolean {
  if (!usernames.length) return false;
  const candidates = identityCandidates(...identities);
  return candidates.some((c) => usernames.includes(c));
}

/** Papéis concedidos automaticamente ao super admin (hierarquia máxima). */
export const SUPER_ADMIN_ALL_ROLES = [
  "funcionario",
  "gestor",
  "ponto-admin",
  "PONTO_ADMIN",
  "GESTOR_APROVACAO",
  "RH_AUDITORIA"
] as const;

export function mergeSuperAdminRoles(baseRoles: string[]): string[] {
  return Array.from(new Set([...baseRoles, ...SUPER_ADMIN_ALL_ROLES]));
}
