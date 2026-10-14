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

const dataCivil = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

async function listarOrdenado(db: Tx, funcionarioId: string) {
  return db.funcionarioLotacaoHistorico.findMany({
    where: { funcionarioId },
    orderBy: { vigenciaDesde: "asc" }
  });
}

/**
 * Edita uma vigência mantendo o encadeamento: a anterior termina no dia anterior ao
 * novo início, e só a última vigência aceita data de fim informada manualmente.
 */
export async function atualizarVigenciaLotacao(
  db: Tx,
  funcionarioId: string,
  vigenciaId: string,
  dados: {
    cargo?: string;
    gerenciaId: string | null;
    subsecao: string | null;
    vigenciaDesde: string;
    vigenciaAte?: string | null;
  }
): Promise<void> {
  const linhas = await listarOrdenado(db, funcionarioId);
  const idx = linhas.findIndex((l) => l.id === vigenciaId);
  if (idx < 0) throw new Error("VIGENCIA_NAO_ENCONTRADA");
  const anterior = idx > 0 ? linhas[idx - 1] : null;
  const seguinte = idx < linhas.length - 1 ? linhas[idx + 1] : null;

  if (anterior && dados.vigenciaDesde <= dataCivilISO(anterior.vigenciaDesde)) {
    throw new Error("INICIO_ANTES_DA_ANTERIOR");
  }
  if (seguinte && dados.vigenciaDesde >= dataCivilISO(seguinte.vigenciaDesde)) {
    throw new Error("INICIO_DEPOIS_DA_SEGUINTE");
  }
  const ultima = !seguinte;
  if (ultima && dados.vigenciaAte && dados.vigenciaAte < dados.vigenciaDesde) {
    throw new Error("FIM_ANTES_DO_INICIO");
  }

  await db.funcionarioLotacaoHistorico.update({
    where: { id: vigenciaId },
    data: {
      ...(dados.cargo !== undefined ? { cargo: dados.cargo } : {}),
      gerenciaId: dados.gerenciaId,
      subsecao: dados.subsecao,
      vigenciaDesde: dataCivil(dados.vigenciaDesde),
      ...(ultima && dados.vigenciaAte !== undefined
        ? { vigenciaAte: dados.vigenciaAte ? dataCivil(dados.vigenciaAte) : null }
        : {})
    }
  });
  if (anterior) {
    await db.funcionarioLotacaoHistorico.update({
      where: { id: anterior.id },
      data: { vigenciaAte: dataCivil(diaAnteriorIso(dados.vigenciaDesde)) }
    });
  }
}

/** Remove uma vigência; a anterior herda o fim da removida (ou volta a ser a atual). */
export async function removerVigenciaLotacao(
  db: Tx,
  funcionarioId: string,
  vigenciaId: string
): Promise<void> {
  const linhas = await listarOrdenado(db, funcionarioId);
  const idx = linhas.findIndex((l) => l.id === vigenciaId);
  if (idx < 0) throw new Error("VIGENCIA_NAO_ENCONTRADA");
  if (linhas.length === 1) throw new Error("UNICA_VIGENCIA");

  const removida = linhas[idx];
  const anterior = idx > 0 ? linhas[idx - 1] : null;
  await db.funcionarioLotacaoHistorico.delete({ where: { id: vigenciaId } });
  if (anterior) {
    await db.funcionarioLotacaoHistorico.update({
      where: { id: anterior.id },
      data: { vigenciaAte: removida.vigenciaAte }
    });
  }
}

/**
 * Copia para o Funcionario (cache denormalizado) a vigência que cobre hoje — ou, se
 * nenhuma cobre, a mais recente já iniciada. Vigências futuras não alteram o cadastro.
 * O cargo só vem da vigência para Comissionado (ASSESSOR), que o edita na própria
 * linha; nas demais categorias o cargo é mantido pelo campo do cadastro.
 */
export async function sincronizarFuncionarioComLotacao(
  db: Tx,
  funcionarioId: string
): Promise<void> {
  const hoje = dataBrasiliaISO(new Date());
  const linhas = (await listarOrdenado(db, funcionarioId)).filter(
    (l) => dataCivilISO(l.vigenciaDesde) <= hoje
  );
  const vigente = linhas[linhas.length - 1];
  if (!vigente) return;
  const func = await db.funcionario.findUnique({
    where: { id: funcionarioId },
    select: { categoria: true }
  });
  const sincronizaCargo = func?.categoria === "ASSESSOR" && !!vigente.cargo;
  await db.funcionario.update({
    where: { id: funcionarioId },
    data: {
      ...(sincronizaCargo ? { cargo: vigente.cargo } : {}),
      gerenciaId: vigente.gerenciaId,
      subsecao: vigente.subsecao,
      lotacaoInicio: vigente.vigenciaDesde,
      lotacaoTermino: vigente.vigenciaAte
    }
  });
}

/**
 * Acrescenta uma vigência ao fim da lista: exige início posterior ao da última e
 * encerra a última no dia anterior (se ela estava aberta ou terminava depois disso).
 */
export async function adicionarVigenciaLotacao(
  db: Tx,
  funcionarioId: string,
  nova: {
    cargo: string;
    gerenciaId: string | null;
    subsecao: string | null;
    vigenciaDesde: string;
    vigenciaAte?: string | null;
  }
): Promise<void> {
  await ensureLotacaoHistorico(db, funcionarioId);
  const linhas = await listarOrdenado(db, funcionarioId);
  const ultima = linhas[linhas.length - 1];
  if (ultima) {
    if (nova.vigenciaDesde <= dataCivilISO(ultima.vigenciaDesde)) {
      throw new Error("INICIO_ANTES_DA_ANTERIOR");
    }
    const fimNecessario = diaAnteriorIso(nova.vigenciaDesde);
    if (!ultima.vigenciaAte || dataCivilISO(ultima.vigenciaAte) > fimNecessario) {
      await db.funcionarioLotacaoHistorico.update({
        where: { id: ultima.id },
        data: { vigenciaAte: dataCivil(fimNecessario) }
      });
    }
  }
  if (nova.vigenciaAte && nova.vigenciaAte < nova.vigenciaDesde) {
    throw new Error("FIM_ANTES_DO_INICIO");
  }
  await db.funcionarioLotacaoHistorico.create({
    data: {
      funcionarioId,
      cargo: nova.cargo,
      gerenciaId: nova.gerenciaId,
      subsecao: nova.subsecao,
      situacaoAtiva: ultima?.situacaoAtiva ?? true,
      data: null,
      vigenciaDesde: dataCivil(nova.vigenciaDesde),
      vigenciaAte: nova.vigenciaAte ? dataCivil(nova.vigenciaAte) : null
    }
  });
}
