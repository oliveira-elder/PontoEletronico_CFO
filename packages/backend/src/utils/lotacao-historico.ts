import { Prisma } from "@prisma/client";
import { dataBrasiliaISO, dataCivilISO } from "./horario-brasilia";
import { diaAnteriorIso } from "./categoria-jornada";

type Tx = Prisma.TransactionClient;

export type MovimentacaoLotacao = {
  cargo: string;
  gerenciaId: string | null;
  subsecao: string | null;
  situacaoAtiva: boolean;
  data: string | null; // YYYY-MM-DD — data do ato/portaria
  vigenciaDesde: string; // YYYY-MM-DD
};

export type VigenciaLotacao = MovimentacaoLotacao & {
  id: string;
  vigenciaAte: string | null;
  gerencia?: { id: string; nome: string; sigla: string } | null;
};

function toVigencia(
  rows: Array<{
    id: string;
    cargo: string;
    gerenciaId: string | null;
    subsecao: string | null;
    situacaoAtiva: boolean;
    data: Date | null;
    vigenciaDesde: Date;
    vigenciaAte: Date | null;
    gerencia?: { id: string; nome: string; sigla: string } | null;
  }>
): VigenciaLotacao[] {
  return rows.map((r) => ({
    id: r.id,
    cargo: r.cargo,
    gerenciaId: r.gerenciaId,
    subsecao: r.subsecao,
    situacaoAtiva: r.situacaoAtiva,
    data: r.data ? dataCivilISO(r.data) : null,
    vigenciaDesde: dataCivilISO(r.vigenciaDesde),
    vigenciaAte: r.vigenciaAte ? dataCivilISO(r.vigenciaAte) : null,
    gerencia: r.gerencia ?? null
  }));
}

const gerenciaSelect = { id: true, nome: true, sigla: true } as const;

/**
 * Garante histórico inicial para funcionários legados (sem linhas): sintetiza uma
 * vigência aberta a partir dos campos "atuais" do Funcionario.
 */
export async function ensureLotacaoHistorico(
  db:
    | Tx
    | {
        funcionarioLotacaoHistorico: Tx["funcionarioLotacaoHistorico"];
        funcionario: Tx["funcionario"];
      },
  funcionarioId: string
): Promise<VigenciaLotacao[]> {
  const existentes = await db.funcionarioLotacaoHistorico.findMany({
    where: { funcionarioId },
    orderBy: { vigenciaDesde: "asc" },
    include: { gerencia: { select: gerenciaSelect } }
  });
  if (existentes.length > 0) return toVigencia(existentes);

  const func = await db.funcionario.findUnique({
    where: { id: funcionarioId },
    select: {
      cargo: true,
      gerenciaId: true,
      subsecao: true,
      ativo: true,
      cargoData: true,
      lotacaoInicio: true,
      dataAdmissao: true,
      createdAt: true
    }
  });
  if (!func) return [];

  const inicioIso = func.lotacaoInicio
    ? dataCivilISO(func.lotacaoInicio)
    : func.dataAdmissao
      ? dataCivilISO(func.dataAdmissao)
      : dataBrasiliaISO(func.createdAt);

  await db.funcionarioLotacaoHistorico.create({
    data: {
      funcionarioId,
      cargo: func.cargo || "",
      gerenciaId: func.gerenciaId,
      subsecao: func.subsecao,
      situacaoAtiva: func.ativo,
      data: func.cargoData ?? null,
      vigenciaDesde: new Date(`${inicioIso}T12:00:00-03:00`),
      vigenciaAte: null
    }
  });

  return toVigencia(
    await db.funcionarioLotacaoHistorico.findMany({
      where: { funcionarioId },
      orderBy: { vigenciaDesde: "asc" },
      include: { gerencia: { select: gerenciaSelect } }
    })
  );
}

/**
 * Registra uma movimentação de cargo/lotação: fecha a vigência aberta (dia anterior
 * ao início da nova) e abre uma nova. Diferente da vigência de categoria, não há
 * regra de "meio do dia" aqui — é só um registro administrativo de RH.
 */
export async function registrarMovimentacaoLotacao(
  db: Tx,
  funcionarioId: string,
  nova: MovimentacaoLotacao
): Promise<VigenciaLotacao> {
  await ensureLotacaoHistorico(db, funcionarioId);

  const aberta = await db.funcionarioLotacaoHistorico.findFirst({
    where: { funcionarioId, vigenciaAte: null },
    orderBy: { vigenciaDesde: "desc" }
  });

  if (aberta) {
    const desdeAberta = dataCivilISO(aberta.vigenciaDesde);
    if (desdeAberta >= nova.vigenciaDesde) {
      /* Nova vigência no mesmo dia (ou "antes") da aberta atual: substitui em vez de duplicar. */
      const atualizado = await db.funcionarioLotacaoHistorico.update({
        where: { id: aberta.id },
        data: {
          cargo: nova.cargo,
          gerenciaId: nova.gerenciaId,
          subsecao: nova.subsecao,
          situacaoAtiva: nova.situacaoAtiva,
          data: nova.data ? new Date(`${nova.data}T12:00:00-03:00`) : null
        },
        include: { gerencia: { select: gerenciaSelect } }
      });
      return toVigencia([atualizado])[0];
    }
    await db.funcionarioLotacaoHistorico.update({
      where: { id: aberta.id },
      data: {
        vigenciaAte: new Date(`${diaAnteriorIso(nova.vigenciaDesde)}T12:00:00-03:00`)
      }
    });
  }

  const criado = await db.funcionarioLotacaoHistorico.create({
    data: {
      funcionarioId,
      cargo: nova.cargo,
      gerenciaId: nova.gerenciaId,
      subsecao: nova.subsecao,
      situacaoAtiva: nova.situacaoAtiva,
      data: nova.data ? new Date(`${nova.data}T12:00:00-03:00`) : null,
      vigenciaDesde: new Date(`${nova.vigenciaDesde}T12:00:00-03:00`),
      vigenciaAte: null
    },
    include: { gerencia: { select: gerenciaSelect } }
  });

  return toVigencia([criado])[0];
}
