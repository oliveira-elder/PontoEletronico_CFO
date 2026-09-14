/**
 * Recalcula o PeriodoPonto (total mensal cacheado) de um funcionário/mês específico
 * usando o código-fonte ATUAL (já corrigido para o bug de fuso em dataFim de
 * Afastamento/Solicitação), sem depender de rebuild/restart do backend.
 *
 * Reaproveita exatamente `PontoService.calcularResumoMensalPorFuncionarioId`
 * (instanciando o service com dependências reais só onde necessário) para garantir
 * que o cálculo é idêntico ao que a API vai produzir depois do próximo restart.
 *
 * Uso:
 *   cd packages/backend
 *   DATABASE_URL='postgresql://...' npx ts-node --project tsconfig.seed.json scripts/recalcular-periodo-edna.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { PontoService } from "../src/modules/ponto/ponto.service";

const FUNCIONARIO_ID = "cmr99d9da0004wb0oqhvykm9n"; // Edna Modrach (matrícula 592)
const MESES_PARA_RECALCULAR: Array<{ mes: number; ano: number }> = [
  { mes: 8, ano: 2026 },
  { mes: 9, ano: 2026 }
];

async function main() {
  const prisma = new PrismaClient() as unknown as PrismaService;
  // Dependências não usadas por calcularResumoMensalPorFuncionarioId — não precisam ser reais.
  const noop = {} as never;
  const ponto = new PontoService(prisma, noop, noop, noop, noop);

  for (const { mes, ano } of MESES_PARA_RECALCULAR) {
    const antes = await (prisma as unknown as PrismaClient).periodoPonto.findUnique({
      where: { funcionarioId_mes_ano: { funcionarioId: FUNCIONARIO_ID, mes, ano } }
    });

    const resumo = await ponto.calcularResumoMensalPorFuncionarioId(FUNCIONARIO_ID, mes, ano);

    const depois = await (prisma as unknown as PrismaClient).periodoPonto.upsert({
      where: { funcionarioId_mes_ano: { funcionarioId: FUNCIONARIO_ID, mes, ano } },
      create: {
        funcionarioId: FUNCIONARIO_ID,
        mes,
        ano,
        horasTrabalhadasMinutos: resumo.horasTrabalhadasMinutos,
        horasExtrasMinutos: resumo.horasExtrasMinutos,
        horasFaltaMinutos: resumo.horasFaltaMinutos,
        diasTrabalhados: resumo.diasTrabalhados
      },
      update: {
        horasTrabalhadasMinutos: resumo.horasTrabalhadasMinutos,
        horasExtrasMinutos: resumo.horasExtrasMinutos,
        horasFaltaMinutos: resumo.horasFaltaMinutos,
        diasTrabalhados: resumo.diasTrabalhados
      }
    });

    console.log(`\n=== ${String(mes).padStart(2, "0")}/${ano} ===`);
    console.log("Antes:", antes);
    console.log("Depois:", {
      horasTrabalhadasMinutos: depois.horasTrabalhadasMinutos,
      horasExtrasMinutos: depois.horasExtrasMinutos,
      horasFaltaMinutos: depois.horasFaltaMinutos,
      diasTrabalhados: depois.diasTrabalhados
    });
  }

  await (prisma as unknown as PrismaClient).$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
