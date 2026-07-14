/**
 * Recalcula PeriodoPonto de todos os funcionários com almoço mínimo obrigatório.
 * Uso (no host ou no container backend):
 *   cd packages/backend && npx ts-node --transpile-only scripts/recalcular-almoco-historico.ts
 */
import { PrismaClient } from "@prisma/client";
import { montarRelatorioQuadro } from "../src/utils/historico-quadro";
import { resolverJornadaHistoricoContexto } from "../src/utils/jornada-historico";
import { categoriaSemIntervaloAlmoco } from "../src/utils/categoria-jornada";
import { dataBrasiliaISO, intervaloDiaBrasilia } from "../src/utils/horario-brasilia";

const prisma = new PrismaClient();

async function resumoMensal(
  funcionarioId: string,
  mes: number,
  ano: number,
  categoria: string | null,
  createdAt: Date | null
) {
  const primeiroDia = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const ultimoDiaIso = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const { inicio } = intervaloDiaBrasilia(primeiroDia);
  const { fim } = intervaloDiaBrasilia(ultimoDiaIso);
  const inicioBuffer = new Date(inicio.getTime() - 3 * 60 * 60 * 1000);
  const fimBuffer = new Date(fim.getTime() + 3 * 60 * 60 * 1000);

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
          almocoPodeIniciarA: true
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
    configuracaoAlmocoPodeIniciarA: cfg?.almocoPodeIniciarA ?? null
  });

  const [registros, afastamentos, feriados] = await Promise.all([
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
      select: { dataInicio: true, dataFim: true }
    }),
    prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
    })
  ]);

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
    horasTrabalhadasMinutos: quadro.horasTrabalhadasMinutos,
    horasExtrasMinutos,
    horasFaltaMinutos,
    diasTrabalhados: quadro.dias.filter((d) => d.statusInterno === "OK").length
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

  for (const func of funcs) {
    const meses = new Set<string>();
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
        const resumo = await resumoMensal(
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
        console.log(
          `OK ${func.user?.name ?? func.matricula} ${mes}/${ano}: ` +
            `${resumo.horasTrabalhadasMinutos}min trab, falta ${resumo.horasFaltaMinutos}min`
        );
      } catch (e) {
        erros++;
        console.error(`ERRO ${func.id} ${mes}/${ano}:`, e);
      }
    }
  }

  console.log(`\nConcluído: ${funcs.length} funcionários, ${periodos} períodos, ${erros} erros.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
