import { CategoriaFuncional, Prisma } from "@prisma/client";
import { dataBrasiliaISO, hojeBrasiliaISO } from "./horario-brasilia";
import {
  categoriaSemRegistroPonto,
  diaAnteriorIso,
  diaSeguinteIso,
  type VigenciaCategoria
} from "./categoria-jornada";

type Tx = Prisma.TransactionClient;

function toVigencia(
  rows: Array<{
    categoria: CategoriaFuncional;
    vigenciaDesde: Date;
    vigenciaAte: Date | null;
  }>
): VigenciaCategoria[] {
  return rows.map((r) => ({
    categoria: r.categoria,
    vigenciaDesde: dataBrasiliaISO(r.vigenciaDesde),
    vigenciaAte: r.vigenciaAte ? dataBrasiliaISO(r.vigenciaAte) : null
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
      pontoObrigatorioDesde: true,
      createdAt: true,
      dataAdmissao: true
    }
  });
  if (!func) return [];

  const inicioIso = dataBrasiliaISO(func.dataAdmissao ?? func.createdAt);
  const hoje = hojeBrasiliaISO();
  const pontoDesde = func.pontoObrigatorioDesde
    ? dataBrasiliaISO(func.pontoObrigatorioDesde)
    : null;

  const rows: Array<{
    funcionarioId: string;
    categoria: CategoriaFuncional;
    vigenciaDesde: Date;
    vigenciaAte: Date | null;
  }> = [];

  if (pontoDesde && pontoDesde > inicioIso && !categoriaSemRegistroPonto(func.categoria)) {
    /* Foi sem obrigação até o dia anterior a pontoDesde; obrigação a partir de pontoDesde. */
    const ateSem = diaAnteriorIso(pontoDesde);
    rows.push({
      funcionarioId,
      categoria: "ASSESSOR",
      vigenciaDesde: new Date(`${inicioIso}T12:00:00-03:00`),
      vigenciaAte: new Date(`${ateSem}T12:00:00-03:00`)
    });
    rows.push({
      funcionarioId,
      categoria: func.categoria,
      vigenciaDesde: new Date(`${pontoDesde}T12:00:00-03:00`),
      vigenciaAte: null
    });
  } else {
    rows.push({
      funcionarioId,
      categoria: func.categoria,
      vigenciaDesde: new Date(`${inicioIso}T12:00:00-03:00`),
      vigenciaAte: null
    });
  }

  for (const r of rows) {
    const desde = dataBrasiliaISO(r.vigenciaDesde);
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

/**
 * Datas de corte da mudança de categoria no meio do dia:
 * - Promoção Concursado → Assessor/Gerente: o dia inteiro da mudança conta como isento (nova vigência desde D).
 * - Retorno Assessor/Gerente → Concursado: o dia da mudança permanece isento; obrigação só no dia seguinte (D+1).
 */
export function datasCorteMudancaCategoria(
  categoriaAnterior: string | null | undefined,
  novaCategoria: string,
  dataRefIso: string
): { ateAnterior: string; desdeNova: string } {
  const anteriorSem = categoriaSemRegistroPonto(categoriaAnterior);
  const novaSem = categoriaSemRegistroPonto(novaCategoria);

  if (!anteriorSem && novaSem) {
    /* Obrigação → isento: dia D inteiro como assessor/gerente */
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
 * Registra mudança de categoria: fecha vigência aberta e abre nova.
 * Respeita a regra de meio do dia (dia inteiro isento / obrigação só no dia seguinte).
 */
export async function registrarMudancaCategoria(
  db: Tx,
  funcionarioId: string,
  novaCategoria: CategoriaFuncional,
  dataRefIso: string = hojeBrasiliaISO()
): Promise<{ desdeNova: string }> {
  let aberta = await db.funcionarioCategoriaHistorico.findFirst({
    where: { funcionarioId, vigenciaAte: null },
    orderBy: { vigenciaDesde: "desc" }
  });

  if (aberta && aberta.categoria === novaCategoria) {
    return { desdeNova: dataBrasiliaISO(aberta.vigenciaDesde) };
  }

  if (!aberta) {
    await ensureCategoriaHistorico(db, funcionarioId);
    aberta = await db.funcionarioCategoriaHistorico.findFirst({
      where: { funcionarioId, vigenciaAte: null },
      orderBy: { vigenciaDesde: "desc" }
    });
    if (aberta && aberta.categoria === novaCategoria) {
      return { desdeNova: dataBrasiliaISO(aberta.vigenciaDesde) };
    }
  }

  const catAnterior = aberta?.categoria ?? null;
  const { ateAnterior, desdeNova } = datasCorteMudancaCategoria(
    catAnterior,
    novaCategoria,
    dataRefIso
  );

  if (aberta) {
    const desdeAberta = dataBrasiliaISO(aberta.vigenciaDesde);

    /* Vigência aberta no mesmo dia da mudança */
    if (desdeAberta >= dataRefIso) {
      const anteriorSem = categoriaSemRegistroPonto(aberta.categoria);
      const novaSem = categoriaSemRegistroPonto(novaCategoria);

      if (anteriorSem && !novaSem) {
        /* Assessor hoje → concursado: mantém isento até D e abre obrigação em D+1 */
        await db.funcionarioCategoriaHistorico.update({
          where: { id: aberta.id },
          data: { vigenciaAte: new Date(`${dataRefIso}T12:00:00-03:00`) }
        });
        await db.funcionarioCategoriaHistorico.create({
          data: {
            funcionarioId,
            categoria: novaCategoria,
            vigenciaDesde: new Date(`${diaSeguinteIso(dataRefIso)}T12:00:00-03:00`),
            vigenciaAte: null
          }
        });
        return { desdeNova: diaSeguinteIso(dataRefIso) };
      }

      /* Demais casos no mesmo dia: só troca a categoria da vigência aberta
         (ex.: concursado → assessor no mesmo dia → dia inteiro isento). */
      await db.funcionarioCategoriaHistorico.update({
        where: { id: aberta.id },
        data: { categoria: novaCategoria }
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
      categoria: novaCategoria,
      vigenciaDesde: new Date(`${desdeNova}T12:00:00-03:00`),
      vigenciaAte: null
    }
  });

  return { desdeNova };
}
