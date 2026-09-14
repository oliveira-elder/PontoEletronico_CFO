/**
 * Recalcula PeriodoPonto de todos os funcionários com a lógica atual
 * (pausa/intervalo sem retorno + crédito de almoço com atestado).
 *
 * Uso:
 *   cd packages/backend && DATABASE_URL='postgresql://...' node scripts/recalcular-pausa-atestado-todos.js
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const { montarRelatorioQuadro } = require("../dist/utils/historico-quadro");
const { resolverJornadaHistoricoContexto } = require("../dist/utils/jornada-historico");
const { categoriaSemIntervaloAlmoco } = require("../dist/utils/categoria-jornada");
const {
  dataBrasiliaISO,
  intervaloColunaDate,
  intervaloDiaBrasilia
} = require("../dist/utils/horario-brasilia");
const { enriquecerAfastamentosComSolicitacoes } = require("../dist/utils/atestado-parcial-enrich");

const prisma = new PrismaClient();

async function resumoMensal(funcionarioId, mes, ano, categoria, createdAt) {
  const primeiroDia = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const ultimoDiaIso = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const { inicio } = intervaloDiaBrasilia(primeiroDia);
  const { fim } = intervaloDiaBrasilia(ultimoDiaIso);
  const inicioBuffer = new Date(inicio.getTime() - 3 * 60 * 60 * 1000);
  const fimBuffer = new Date(fim.getTime() + 3 * 60 * 60 * 1000);
  const { inicio: feriadoIni, fim: feriadoFim } = intervaloColunaDate(primeiroDia, ultimoDiaIso);

  const func = await prisma.funcionario.findUnique({
    where: { id: funcionarioId },
    select: {
      jornadaPeriodoId: true,
      jornadaHorasDia: true,
      jornadaPeriodoDesde: true,
      jornadaPeriodoAssociadoEm: true,
      jornadaPeriodo: {
        select: {
          jornadaDiariaMin: true,
          horaEntrada: true,
          horaSaida: true,
          almocoMinMin: true,
          almocoPodeIniciarA: true,
          almocoPodeIniciarAte: true,
          toleranciaEntradaMin: true,
          toleranciaSaidaMin: true
        }
      }
    }
  });
  const cfg = await prisma.configuracaoSistema.findUnique({
    where: { id: "singleton" },
    select: {
      horaEntrada: true,
      horaSaida: true,
      almocoMinMin: true,
      almocoPodeIniciarA: true,
      almocoPodeIniciarAte: true,
      toleranciaEntradaMin: true,
      bancoHorasSabadoPct: true,
      bancoHorasDomingoPct: true,
      bancoHorasFeriadoPct: true
    }
  });
  const jornadaCtx = resolverJornadaHistoricoContexto({
    ...func,
    configuracaoHoraEntrada: cfg?.horaEntrada ?? null,
    configuracaoHoraSaida: cfg?.horaSaida ?? null,
    configuracaoAlmocoMinMin: cfg?.almocoMinMin ?? null,
    configuracaoAlmocoPodeIniciarA: cfg?.almocoPodeIniciarA ?? null,
    configuracaoAlmocoPodeIniciarAte: cfg?.almocoPodeIniciarAte ?? null,
    configuracaoToleranciaEntradaMin: cfg?.toleranciaEntradaMin ?? null
  });

  const [registros, afastamentosRaw, solsAtestado, feriados] = await Promise.all([
    prisma.registroPonto.findMany({
      where: {
        funcionarioId,
        apenasInformativo: false,
        dataHora: { gte: inicio, lte: fim }
      },
      orderBy: { dataHora: "asc" },
      select: { tipo: true, dataHora: true, observacoes: true }
    }),
    prisma.afastamento.findMany({
      where: {
        funcionarioId,
        apenasInformativo: false,
        dataInicio: { lte: fimBuffer },
        dataFim: { gte: inicioBuffer }
      },
      select: {
        id: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        horarioInicio: true,
        horarioFim: true
      }
    }),
    prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: { in: ["ATESTADO", "ABONO"] },
        status: "APROVADA",
        OR: [
          { dataInicio: { lte: fimBuffer }, dataFim: { gte: inicioBuffer } },
          { dataReferencia: { gte: inicio, lte: fim } }
        ]
      },
      select: { dataInicio: true, dataFim: true, dataReferencia: true, metadados: true }
    }),
    prisma.feriadoConfig.findMany({
      where: { data: { gte: feriadoIni, lte: feriadoFim } },
      select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
    })
  ]);

  const afastamentos = enriquecerAfastamentosComSolicitacoes(afastamentosRaw, solsAtestado);

  const quadro = montarRelatorioQuadro(
    registros,
    afastamentos,
    mes,
    ano,
    jornadaCtx,
    feriados,
    cfg?.bancoHorasSabadoPct ?? 100,
    cfg?.bancoHorasDomingoPct ?? 200,
    cfg?.bancoHorasFeriadoPct ?? 200,
    createdAt ? dataBrasiliaISO(createdAt) : null,
    { forcarSemIntervalo: categoriaSemIntervaloAlmoco(categoria) }
  );

  const horasExtrasMinutos = quadro.dias
    .filter((d) => (d.saldoMin ?? 0) > 0)
    .reduce((s, d) => s + (d.saldoMin ?? 0), 0);
  const horasFaltaMinutos = quadro.dias
    .filter((d) => (d.saldoMin ?? 0) < 0)
    .reduce((s, d) => s + Math.abs(d.saldoMin ?? 0), 0);

  return {
    quadro,
    resumo: {
      horasTrabalhadasMinutos: quadro.horasTrabalhadasMinutos,
      horasExtrasMinutos,
      horasFaltaMinutos,
      diasTrabalhados: quadro.dias.filter((d) => d.statusInterno === "OK").length
    }
  };
}

async function main() {
  const funcs = await prisma.funcionario.findMany({
    select: {
      id: true,
      categoria: true,
      matricula: true,
      user: { select: { name: true, createdAt: true } }
    }
  });

  let periodos = 0;
  let erros = 0;
  let elderDia = null;

  for (const func of funcs) {
    const meses = new Set();
    const regs = await prisma.registroPonto.findMany({
      where: { funcionarioId: func.id, apenasInformativo: false },
      select: { dataHora: true }
    });
    for (const r of regs) meses.add(dataBrasiliaISO(r.dataHora).slice(0, 7));

    const existentes = await prisma.periodoPonto.findMany({
      where: { funcionarioId: func.id },
      select: { mes: true, ano: true }
    });
    for (const p of existentes) meses.add(`${p.ano}-${String(p.mes).padStart(2, "0")}`);

    for (const ym of [...meses].sort()) {
      const [anoS, mesS] = ym.split("-");
      const ano = Number(anoS);
      const mes = Number(mesS);
      try {
        const { quadro, resumo } = await resumoMensal(
          func.id,
          mes,
          ano,
          func.categoria,
          func.user?.createdAt ?? null
        );
        await prisma.periodoPonto.upsert({
          where: { funcionarioId_mes_ano: { funcionarioId: func.id, mes, ano } },
          create: { funcionarioId: func.id, mes, ano, ...resumo },
          update: { ...resumo }
        });
        periodos++;

        if (func.user?.name === "Elder Oliveira" && mes === 8 && ano === 2026) {
          elderDia = quadro.dias.find((d) => d.iso === "2026-08-10");
        }

        console.log(
          `OK ${func.user?.name ?? func.matricula} ${mes}/${ano}: ` +
            `${resumo.horasTrabalhadasMinutos}min trab, falta ${resumo.horasFaltaMinutos}min`
        );
      } catch (e) {
        erros++;
        console.error(`ERRO ${func.id} ${mes}/${ano}:`, e?.message || e);
      }
    }
  }

  console.log(`\nConcluído: ${funcs.length} funcionários, ${periodos} períodos, ${erros} erros.`);
  if (elderDia) {
    console.log("\nElder 2026-08-10:", JSON.stringify(elderDia, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
