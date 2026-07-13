/**
 * Super administradores: instância máxima — veem e fazem tudo no sistema.
 */

function parseList(raw: string | undefined, fallback: string): string[] {
  return (raw ?? fallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const SUPER_ADMIN_USERNAMES = parseList(
  import.meta.env.VITE_SUPER_ADMIN_USERNAMES as string | undefined,
  "elder.oliveira"
);

export const SUPER_ADMIN_ALL_ROLES = [
  "funcionario",
  "gestor",
  "ponto-admin",
  "PONTO_ADMIN",
  "GESTOR_APROVACAO",
  "RH_AUDITORIA"
] as const;

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

export function isSuperAdminIdentity(...identities: Array<string | null | undefined>): boolean {
  const candidates = identityCandidates(...identities);
  return candidates.some((c) => SUPER_ADMIN_USERNAMES.includes(c));
}

export function mergeSuperAdminRoles(baseRoles: string[]): string[] {
  return Array.from(new Set([...baseRoles, ...SUPER_ADMIN_ALL_ROLES]));
}

/** Garante isSuperAdmin + papéis completos no perfil (após /auth/me ou token). */
export function elevateSuperAdminProfile<
  T extends {
    username?: string;
    email?: string | null;
    emailReal?: string | null;
    roles: string[];
    isSuperAdmin?: boolean;
  }
>(profile: T): T {
  const isSuper = isSuperAdminIdentity(profile.username, profile.email, profile.emailReal);
  if (!isSuper) return { ...profile, isSuperAdmin: !!profile.isSuperAdmin };
  return {
    ...profile,
    isSuperAdmin: true,
    roles: mergeSuperAdminRoles(profile.roles ?? [])
  };
}
