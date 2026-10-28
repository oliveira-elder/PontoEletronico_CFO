/**
 * CID-10 do atestado: o sistema guarda só a CATEGORIA (1 letra + 2 números, ex.: Z13).
 * "Z136" e "Z13.6" (subcategoria) pertencem à categoria Z13 e são registrados como Z13.
 */
const CID_REGEX = /^([A-Z]\d{2})\d{0,2}$/;

/** Retorna a categoria (ex.: "Z13") ou null se o texto não for um CID válido. */
export function normalizarCid(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.toUpperCase().replace(/[\s.-]/g, "");
  return CID_REGEX.exec(limpo)?.[1] ?? null;
}

/** Grupo do CID-10 (capítulo, ex.: "J00-J99") a que a categoria pertence, se houver. */
export function grupoDoCid<T extends { codigo: string }>(categoria: string, grupos: T[]): T | null {
  return (
    grupos.find((g) => {
      const [ini, fim = ini] = g.codigo.toUpperCase().replace(/\s/g, "").split("-");
      return categoria >= ini && categoria <= fim;
    }) ?? null
  );
}
