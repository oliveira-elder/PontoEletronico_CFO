import type { Prisma } from "@prisma/client";
import { dataCivilISO, hojeBrasiliaISO } from "./horario-brasilia";

/**
 * Modalidade de trabalho com vigência. A modalidade vale do dia `desde` em diante: mudar de
 * home office para presencial (ou o contrário) NÃO recalcula os dias anteriores.
 * Primeira linha de cada funcionário = "desde sempre" (2000-01-01) com a modalidade que ele
 * tinha quando o histórico foi criado; as mudanças seguintes entram na data da configuração.
 */
export type Modalidade = "PRESENCIAL" | "HOME_OFFICE" | "HIBRIDO";

export interface VigenciaModalidade {
  /** YYYY-MM-DD */
  desde: string;
  modalidade: Modalidade;
}

type Db = Pick<Prisma.TransactionClient, "funcionarioModalidadeHistorico" | "funcionario">;

const DESDE_SEMPRE = "2000-01-01";

export function modalidadeDeFlags(homeOffice: boolean, hibrido: boolean): Modalidade {
  return homeOffice ? "HOME_OFFICE" : hibrido ? "HIBRIDO" : "PRESENCIAL";
}

export function flagsDaModalidade(m: Modalidade) {
  return { homeOffice: m === "HOME_OFFICE", hibrido: m === "HIBRIDO" };
}

const civil = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

function paraVigencias(
  rows: Array<{ desde: Date; homeOffice: boolean; hibrido: boolean }>
): VigenciaModalidade[] {
  return rows
    .map((r) => ({
      desde: dataCivilISO(r.desde),
      modalidade: modalidadeDeFlags(r.homeOffice, r.hibrido)
    }))
    .sort((a, b) => (a.desde < b.desde ? -1 : 1));
}

/**
 * Histórico do funcionário. Se ainda não existe (cadastro novo), cria a linha inicial a
 * partir das indicações ATUAIS do cadastro — por isso quem altera a modalidade deve chamar
 * `registrarMudancaModalidade` ANTES de gravar as novas indicações.
 */
export async function ensureModalidadeHistorico(
  db: Db,
  funcionarioId: string
): Promise<VigenciaModalidade[]> {
  const rows = await db.funcionarioModalidadeHistorico.findMany({ where: { funcionarioId } });
  if (rows.length > 0) return paraVigencias(rows);
  const f = await db.funcionario.findUnique({
    where: { id: funcionarioId },
    select: { modoHomeOffice: true, modoHibridoLocal: true }
  });
  if (!f) return [];
  await db.funcionarioModalidadeHistorico.createMany({
    data: [
      {
        funcionarioId,
        desde: civil(DESDE_SEMPRE),
        homeOffice: f.modoHomeOffice,
        hibrido: f.modoHibridoLocal && !f.modoHomeOffice
      }
    ],
    skipDuplicates: true
  });
  return paraVigencias(
    await db.funcionarioModalidadeHistorico.findMany({ where: { funcionarioId } })
  );
}

/** Modalidade em um dia civil: a última vigência com `desde` ≤ dia (antes da 1ª, vale a 1ª). */
export function modalidadeNoDia(vigencias: VigenciaModalidade[], dia: string): Modalidade {
  if (!vigencias.length) return "PRESENCIAL";
  let atual = vigencias[0].modalidade;
  for (const v of vigencias) {
    if (v.desde <= dia) atual = v.modalidade;
    else break;
  }
  return atual;
}

/**
 * Registra a mudança de modalidade a partir de `desde` (padrão: hoje), sem mexer nos dias
 * anteriores. Garante o histórico ANTES (com a modalidade antiga). Sem efeito se a
 * modalidade nova é igual à que já vale nesse dia.
 */
export async function registrarMudancaModalidade(
  db: Db,
  funcionarioId: string,
  novo: { homeOffice: boolean; hibrido: boolean },
  desde: string = hojeBrasiliaISO()
): Promise<void> {
  const vigencias = await ensureModalidadeHistorico(db, funcionarioId);
  const alvo = modalidadeDeFlags(novo.homeOffice, novo.hibrido && !novo.homeOffice);
  if (modalidadeNoDia(vigencias, desde) === alvo && !vigencias.some((v) => v.desde === desde)) {
    return;
  }
  const flags = flagsDaModalidade(alvo);
  await db.funcionarioModalidadeHistorico.upsert({
    where: { funcionarioId_desde: { funcionarioId, desde: civil(desde) } },
    create: { funcionarioId, desde: civil(desde), ...flags },
    update: flags
  });
}
