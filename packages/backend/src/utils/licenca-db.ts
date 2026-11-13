import type { Prisma, PrismaClient } from "@prisma/client";
import { CID_GRUPOS_PADRAO } from "./cid-grupos-padrao";
import {
  TIPOS_LICENCA_PADRAO,
  TIPOS_SOMENTE_RH,
  nomeDeTipoSomenteRh,
  semAcentoMin,
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

let garantindoSomenteRh: Promise<void> | null = null;

/**
 * Os tipos que só o RH registra (INSS, Serviço Militar, Não Remunerada, Outros) precisam existir para o RH
 * escolher em Auditoria. Cadastros antigos não os têm: cria os que faltarem (idempotente, sem duplicar).
 */
export async function garantirTiposSomenteRh(db: Db) {
  if (garantindoSomenteRh) return garantindoSomenteRh;
  garantindoSomenteRh = (async () => {
    const existentes = await db.tipoLicenca.findMany({
      select: { id: true, nome: true, ativo: true, categorias: true, somenteRh: true }
    });
    /* Migração de uma vez por tipo: o cadastro antigo pode ter o tipo desativado ou restrito a categorias,
       o que o escondia do RH. Ao marcá-lo "somente RH" ele volta ativo e para todas as categorias; depois
       disso o RH pode desativá-lo normalmente (a marcação impede que a migração repita). */
    for (const e of existentes) {
      if (e.somenteRh || !nomeDeTipoSomenteRh(e.nome)) continue;
      await db.tipoLicenca.update({
        where: { id: e.id },
        data: { somenteRh: true, ativo: true, categorias: [] }
      });
      e.somenteRh = true;
    }
    /* O cadastro antigo chama de "Serviço Militar": passa a "Serviço Militar Obrigatório". */
    for (const e of existentes) {
      if (semAcentoMin(e.nome) === "servico militar") {
        await db.tipoLicenca.update({
          where: { id: e.id },
          data: { nome: "Serviço Militar Obrigatório" }
        });
        e.nome = "Serviço Militar Obrigatório";
      }
    }
    const nomes = existentes.map((e) => semAcentoMin(e.nome));
    const ultimo = await db.tipoLicenca.aggregate({ _max: { ordem: true } });
    let ordem = ultimo._max.ordem ?? 0;
    for (const t of TIPOS_SOMENTE_RH) {
      if (nomes.some((n) => t.reconhece(n))) continue;
      const modelo = TIPOS_LICENCA_PADRAO.find((p) => p.nome === t.padrao);
      if (!modelo) continue;
      await db.tipoLicenca.create({
        data: { ...modelo, somenteRh: true, ordem: ++ordem } as Prisma.TipoLicencaCreateInput
      });
    }
  })().finally(() => {
    garantindoSomenteRh = null;
  });
  return garantindoSomenteRh;
}

export async function listarTiposLicenca(
  db: Db,
  somenteAtivos: boolean
): Promise<TipoLicencaRegra[]> {
  await garantirTiposLicencaPadrao(db);
  await garantirTiposSomenteRh(db);
  const rows = await db.tipoLicenca.findMany({
    where: somenteAtivos ? { ativo: true } : undefined,
    orderBy: [{ ordem: "asc" }, { nome: "asc" }]
  });
  /* "Somente RH" vale pela marcação do cadastro OU pelo nome do tipo (INSS, Serviço Militar, Não Remunerada, Outros). */
  return (rows as unknown as TipoLicencaRegra[]).map((t) => ({
    ...t,
    somenteRh: !!t.somenteRh || nomeDeTipoSomenteRh(t.nome)
  }));
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
