/** O grupo do CID é dado de saúde sensível: só o RH (e o próprio funcionário) o enxergam. */

const CHAVES_CID = new Set(["cidCodigo", "cidGrupo", "cidAlteradoPor"]);

export function removerCid<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((v) => removerCid(v)) as unknown as T;
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVES_CID.has(k)) continue;
      out[k] = removerCid(v);
    }
    return out as T;
  }
  return valor;
}

/** Perfis que podem ver o CID (RH/Gerente de RH/super usuário). */
export function podeVerCid(
  user: { roles?: string[]; isSuperAdmin?: boolean } | undefined
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const r = user.roles ?? [];
  return r.includes("RH_AUDITORIA") || r.includes("ponto-admin") || r.includes("PONTO_ADMIN");
}
