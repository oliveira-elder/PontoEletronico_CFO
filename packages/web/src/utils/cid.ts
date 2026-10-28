/**
 * CID-10 do atestado: só a CATEGORIA vale (1 letra + 2 números, ex.: Z13).
 * "Z136" e "Z13.6" pertencem a Z13 e são registrados como Z13. Espelha backend/src/utils/cid.ts.
 */
export const CID_ORIENTACAO =
  "Informe 1 letra seguida de 2 números (ex.: Z13). Se o documento trouxer 3 números (Z136 ou Z13.6), " +
  "informe só Z13: é a mesma categoria e será registrada como Z13.";

export function normalizarCid(bruto: string): string | null {
  const limpo = bruto.toUpperCase().replace(/[\s.-]/g, "");
  return /^([A-Z]\d{2})\d{0,2}$/.exec(limpo)?.[1] ?? null;
}
