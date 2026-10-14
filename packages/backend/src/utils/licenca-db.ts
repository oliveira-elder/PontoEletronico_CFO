import type { Prisma, PrismaClient } from "@prisma/client";
import { CID_GRUPOS_PADRAO } from "./cid-grupos-padrao";
import {
  TIPOS_LICENCA_PADRAO,
  normalizarTipoLicenca,
  type TipoLicencaRegra
} from "./licenca-regras";

type Db = Pick<PrismaClient, "cidGrupo" | "tipoLicenca">;

/** Carrega os padrões na 1ª consulta (tabela vazia) — nunca recria o que o RH removeu depois. */
export async function garantirCidGruposPadrao(db: Db) {
  const total = await db.cidGrupo.count();
  if (total > 0) return;
  await db.cidGrupo.createMany({
    data: CID_GRUPOS_PADRAO.map((g, i) => ({ ...g, ordem: i + 1 })),
    skipDuplicates: true
  });
}

export async function garantirTiposLicencaPadrao(db: Db) {
  const total = await db.tipoLicenca.count();
  if (total > 0) return;
  for (const [i, t] of TIPOS_LICENCA_PADRAO.entries()) {
    await db.tipoLicenca.create({
      data: { ...t, ordem: i + 1 } as Prisma.TipoLicencaCreateInput
    });
  }
}

export async function listarCidGrupos(db: Db, somenteAtivos: boolean) {
  await garantirCidGruposPadrao(db);
  return db.cidGrupo.findMany({
    where: somenteAtivos ? { ativo: true } : undefined,
    orderBy: [{ ordem: "asc" }, { codigo: "asc" }]
  });
}

export async function listarTiposLicenca(
  db: Db,
  somenteAtivos: boolean
): Promise<TipoLicencaRegra[]> {
  await garantirTiposLicencaPadrao(db);
  const rows = await db.tipoLicenca.findMany({
    where: somenteAtivos ? { ativo: true } : undefined,
    orderBy: [{ ordem: "asc" }, { nome: "asc" }]
  });
  return rows as unknown as TipoLicencaRegra[];
}

export { normalizarTipoLicenca };

const CODIGO_CID = /^[A-Z]\d{2}-[A-Z]\d{2}$/;

/** Valida `codigo` e `descricao` de um grupo do CID (lança Error). */
export function validarCidGrupo(body: { codigo?: unknown; descricao?: unknown }) {
  const codigo = String(body.codigo ?? "")
    .trim()
    .toUpperCase();
  const descricao = String(body.descricao ?? "").trim();
  if (!CODIGO_CID.test(codigo)) {
    throw new Error(
      "Código inválido. Use o formato A00-B99 (letra e 2 dígitos, hífen, letra e 2 dígitos)."
    );
  }
  if (descricao.length < 3)
    throw new Error("Informe a descrição do grupo (mínimo de 3 caracteres).");
  if (descricao.length > 200) throw new Error("Descrição muito longa (máximo de 200 caracteres).");
  return { codigo, descricao };
}
