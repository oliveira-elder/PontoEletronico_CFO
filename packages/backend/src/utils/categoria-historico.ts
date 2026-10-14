import { CategoriaFuncional, Prisma } from "@prisma/client";
import { dataBrasiliaISO, dataCivilISO, hojeBrasiliaISO } from "./horario-brasilia";
import {
  funcionarioSemRegistroPonto,
  diaAnteriorIso,
  diaSeguinteIso,
  type VigenciaCategoria,
  type SituacaoRegistroPonto
} from "./categoria-jornada";

type Tx = Prisma.TransactionClient;

function toVigencia(
  rows: Array<{
    categoria: CategoriaFuncional;
    isManager: boolean;
    isFiscal?: boolean;
    registroPontoObrigatorio?: boolean | null;
    vigenciaDesde: Date;
    vigenciaAte: Date | null;
  }>
): VigenciaCategoria[] {
  return rows.map((r) => ({
    categoria: r.categoria,
    isManager: r.isManager,
    isFiscal: r.isFiscal ?? false,
    registroPontoObrigatorio: r.registroPontoObrigatorio ?? null,
    vigenciaDesde: dataCivilISO(r.vigenciaDesde),
    vigenciaAte: r.vigenciaAte ? dataCivilISO(r.vigenciaAte) : null
  }));
}

/**
 * Garante histórico inicial para funcionários legados (sem linhas).
 * Usa pontoObrigatorioDesde / categoria atual para sintetizar vigências.
 */
export async function ensureCategoriaHistorico(
  db:
    | Tx
    | {
        funcionarioCategoriaHistorico: Tx["funcionarioCategoriaHistorico"];
        funcionario: Tx["funcionario"];
      },
  funcionarioId: string
): Promise<VigenciaCategoria[]> {
  const existentes = await db.funcionarioCategoriaHistorico.findMany({
    where: { funcionarioId },
    orderBy: { vigenciaDesde: "asc" }
  });
  if (existentes.length > 0) return toVigencia(existentes);

  const func = await db.funcionario.findUnique({
    where: { id: funcionarioId },
    select: {
      categoria: true,
      isManager: true,
      pontoObrigatorioDesde: true,
      createdAt: true,
      dataAdmissao: true
    }
  });
  if (!func) return [];

  const inicioIso = func.dataAdmissao
    ? dataCivilISO(func.dataAdmissao)
    : dataBrasiliaISO(func.createdAt);
  const hoje = hojeBrasiliaISO();
  const pontoDesde = func.pontoObrigatorioDesde ? dataCivilISO(func.pontoObrigatorioDesde) : null;

  const rows: Array<{
    funcionarioId: string;
    categoria: CategoriaFuncional;
    isManager: boolean;
    vigenciaDesde: Date;
    vigenciaAte: Date | null;
  }> = [];

  const situacaoAtual = { categoria: func.categoria, isManager: func.isManager };

  if (pontoDesde && pontoDesde > inicioIso && !funcionarioSemRegistroPonto(situacaoAtual)) {
    /* Foi sem obrigação até o dia anterior a pontoDesde; obrigação a partir de pontoDesde. */
    const ateSem = diaAnteriorIso(pontoDesde);
    rows.push({
      funcionarioId,
      categoria: "ASSESSOR",
      isManager: false,
      vigenciaDesde: new Date(`${inicioIso}T12:00:00-03:00`),
      vigenciaAte: new Date(`${ateSem}T12:00:00-03:00`)
    });
    rows.push({
      funcionarioId,
      categoria: func.categoria,
      isManager: func.isManager,
      vigenciaDesde: new Date(`${pontoDesde}T12:00:00-03:00`),
      vigenciaAte: null
    });
  } else {
    rows.push({
      funcionarioId,
      categoria: func.categoria,
      isManager: func.isManager,
      vigenciaDesde: new Date(`${inicioIso}T12:00:00-03:00`),
      vigenciaAte: null
    });
  }

  for (const r of rows) {
    const desde = dataCivilISO(r.vigenciaDesde);
    if (desde > hoje) {
      r.vigenciaDesde = new Date(`${hoje}T12:00:00-03:00`);
    }
  }

  await db.funcionarioCategoriaHistorico.createMany({ data: rows });
  return toVigencia(
    await db.funcionarioCategoriaHistorico.findMany({
      where: { funcionarioId },
      orderBy: { vigenciaDesde: "asc" }
    })
  );
}

export type SituacaoCategoria = {
  categoria: CategoriaFuncional;
  isManager: boolean;
  /** Fiscal e override de registro de ponto (RH): quando informados, entram na vigência. */
  isFiscal?: boolean;
  registroPontoObrigatorio?: boolean | null;
};

/**
 * Datas de corte da mudança de situação (categoria e/ou isManager) no meio do dia:
 * - Passa a isento (ex.: Concursado → Assessor, ou vira Chefe): o dia inteiro da mudança
 *   conta como isento (nova vigência desde D).
 * - Deixa de ser isento (ex.: Assessor → Concursado, ou deixa de ser Chefe): o dia da
 *   mudança permanece isento; obrigação só no dia seguinte (D+1).
 */
export function datasCorteMudancaSituacao(
  situacaoAnterior: SituacaoRegistroPonto | null | undefined,
  situacaoNova: SituacaoRegistroPonto,
  dataRefIso: string
): { ateAnterior: string; desdeNova: string } {
  const anteriorSem = funcionarioSemRegistroPonto(situacaoAnterior ?? {});
  const novaSem = funcionarioSemRegistroPonto(situacaoNova);

  if (!anteriorSem && novaSem) {
    /* Obrigação → isento: dia D inteiro já isento */
    return { ateAnterior: diaAnteriorIso(dataRefIso), desdeNova: dataRefIso };
  }
  if (anteriorSem && !novaSem) {
    /* Isento → obrigação: dia D ainda isento; ponto só a partir de D+1 */
    return { ateAnterior: dataRefIso, desdeNova: diaSeguinteIso(dataRefIso) };
  }
  /* Isento→isento ou obrigação→obrigação */
  return { ateAnterior: diaAnteriorIso(dataRefIso), desdeNova: dataRefIso };
}

/**
 * Registra mudança de categoria e/ou de característica "é chefe" (isManager): fecha
 * vigência aberta e abre nova. Respeita a regra de meio do dia (dia inteiro isento /
 * obrigação só no dia seguinte). Substitui o antigo registrarMudancaCategoria — agora
 * "virar chefe" não é mais mudar a categoria para GERENTE, é marcar isManager=true
 * mantendo a categoria real, então a vigência precisa reagir aos dois campos juntos.
 */
export async function registrarMudancaSituacao(
  db: Tx,
  funcionarioId: string,
  novaSituacao: SituacaoCategoria,
  dataRefIso: string = hojeBrasiliaISO(),
  /**
   * Fiscal/override ANTES da mudança: a vigência aberta passa a registrá-los, preservando o
   * que já valia para o passado (antes eles não tinham histórico e valiam para todo o período).
   */
  flagsAnteriores?: { isFiscal: boolean; registroPontoObrigatorio: boolean | null }
): Promise<{ desdeNova: string }> {
  let aberta = await db.funcionarioCategoriaHistorico.findFirst({
    where: { funcionarioId, vigenciaAte: null },
    orderBy: { vigenciaDesde: "desc" }
  });

  const novoFiscal = novaSituacao.isFiscal;
  const novoOverride = novaSituacao.registroPontoObrigatorio;
  const compararFlags = novoFiscal !== undefined || novoOverride !== undefined;

  /* Congela na vigência aberta os indicadores que valiam até agora. */
  if (aberta && flagsAnteriores && compararFlags) {
    if (
      aberta.isFiscal !== flagsAnteriores.isFiscal ||
      (aberta.registroPontoObrigatorio ?? null) !== flagsAnteriores.registroPontoObrigatorio
    ) {
      aberta = await db.funcionarioCategoriaHistorico.update({
        where: { id: aberta.id },
        data: {
          isFiscal: flagsAnteriores.isFiscal,
          registroPontoObrigatorio: flagsAnteriores.registroPontoObrigatorio
        }
      });
    }
  }

  const mesmaSituacao = (a: {
    categoria: CategoriaFuncional;
    isManager: boolean;
    isFiscal?: boolean;
    registroPontoObrigatorio?: boolean | null;
  }) =>
    a.categoria === novaSituacao.categoria &&
    a.isManager === novaSituacao.isManager &&
    (novoFiscal === undefined || (a.isFiscal ?? false) === novoFiscal) &&
    (novoOverride === undefined || (a.registroPontoObrigatorio ?? null) === novoOverride);

  const dadosSituacao = {
    categoria: novaSituacao.categoria,
    isManager: novaSituacao.isManager,
    ...(novoFiscal !== undefined ? { isFiscal: novoFiscal } : {}),
    ...(novoOverride !== undefined ? { registroPontoObrigatorio: novoOverride } : {})
  };

  if (aberta && mesmaSituacao(aberta)) {
    return { desdeNova: dataCivilISO(aberta.vigenciaDesde) };
  }

  if (!aberta) {
    await ensureCategoriaHistorico(db, funcionarioId);
    aberta = await db.funcionarioCategoriaHistorico.findFirst({
      where: { funcionarioId, vigenciaAte: null },
      orderBy: { vigenciaDesde: "desc" }
    });
    if (aberta && mesmaSituacao(aberta)) {
      return { desdeNova: dataCivilISO(aberta.vigenciaDesde) };
    }
  }

  const situacaoAnterior = aberta
    ? {
        categoria: aberta.categoria,
        isManager: aberta.isManager,
        isFiscal: aberta.isFiscal,
        registroPontoObrigatorio: aberta.registroPontoObrigatorio
      }
    : null;
  const { ateAnterior, desdeNova } = datasCorteMudancaSituacao(
    situacaoAnterior,
    novaSituacao,
    dataRefIso
  );

  if (aberta) {
    const desdeAberta = dataCivilISO(aberta.vigenciaDesde);

    /* Vigência aberta no mesmo dia da mudança */
    if (desdeAberta >= dataRefIso) {
      const anteriorSem = funcionarioSemRegistroPonto(situacaoAnterior ?? {});
      const novaSem = funcionarioSemRegistroPonto(novaSituacao);

      if (anteriorSem && !novaSem) {
        /* Isento hoje → obrigação: mantém isento até D e abre obrigação em D+1 */
        await db.funcionarioCategoriaHistorico.update({
          where: { id: aberta.id },
          data: { vigenciaAte: new Date(`${dataRefIso}T12:00:00-03:00`) }
        });
        await db.funcionarioCategoriaHistorico.create({
          data: {
            funcionarioId,
            ...dadosSituacao,
            vigenciaDesde: new Date(`${diaSeguinteIso(dataRefIso)}T12:00:00-03:00`),
            vigenciaAte: null
          }
        });
        return { desdeNova: diaSeguinteIso(dataRefIso) };
      }

      /* Demais casos no mesmo dia: só troca a situação da vigência aberta
         (ex.: concursado → assessor, ou vira chefe, no mesmo dia → dia inteiro isento). */
      await db.funcionarioCategoriaHistorico.update({
        where: { id: aberta.id },
        data: dadosSituacao
      });
      return { desdeNova: desdeAberta };
    }

    await db.funcionarioCategoriaHistorico.update({
      where: { id: aberta.id },
      data: { vigenciaAte: new Date(`${ateAnterior}T12:00:00-03:00`) }
    });
  }

  await db.funcionarioCategoriaHistorico.create({
    data: {
      funcionarioId,
      ...dadosSituacao,
      vigenciaDesde: new Date(`${desdeNova}T12:00:00-03:00`),
      vigenciaAte: null
    }
  });

  return { desdeNova };
}
