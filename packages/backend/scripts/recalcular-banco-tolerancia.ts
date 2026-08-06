/**
 * Recalcula PeriodoPonto + snapshots BH com a lógica oficial (PontoService),
 * após garantir tolerâncias ±5 / HE 5 / margem 0.
 */
import { webcrypto } from "crypto";
if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto: unknown }).crypto = webcrypto;
}

import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PontoService } from "../src/modules/ponto/ponto.service";

const TOL = 5;
const HE = 5;

async function main() {
  const prisma = new PrismaClient();
  try {
    const sistema = await prisma.configuracaoSistema.update({
      where: { id: "singleton" },
      data: {
        toleranciaEntradaMin: TOL,
        toleranciaSaidaMin: TOL,
        toleranciaHoraExtraMin: HE,
        toleranciaCalculoMin: 0
      }
    });
    const jornadas = await prisma.jornadaPeriodo.updateMany({
      data: {
        toleranciaEntradaMin: TOL,
        toleranciaSaidaMin: TOL,
        toleranciaHoraExtraMin: HE,
        toleranciaCalculoMin: 0
      }
    });
    console.log(
      `Config OK: entrada=${sistema.toleranciaEntradaMin} saída=${sistema.toleranciaSaidaMin} HE=${sistema.toleranciaHoraExtraMin} margem=${sistema.toleranciaCalculoMin} | jornadas=${jornadas.count}`
    );

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ["error", "warn", "log"]
    });
    try {
      const ponto = app.get(PontoService);
      const result = await ponto.recalcularHistoricoAlmocoTodos();

      /* Amostra de saldos oficiais */
      const funcs = await prisma.funcionario.findMany({
        where: { ativo: true },
        select: { id: true, user: { select: { name: true } } },
        take: 5
      });
      const amostra = [];
      for (const f of funcs) {
        const bh = await ponto.calcularBancoHorasAdmin(f.id);
        amostra.push({
          nome: f.user?.name,
          saldoMin: bh.saldoAtualMinutos,
          dias: bh.dias?.length
        });
      }

      console.log(
        JSON.stringify(
          {
            funcionarios: result.funcionarios,
            periodosAtualizados: result.periodosAtualizados,
            assinaturasAtualizadas: result.assinaturasAtualizadas,
            erros: result.erros.length,
            amostraErros: result.erros.slice(0, 10),
            amostraSaldos: amostra
          },
          null,
          2
        )
      );
      if (result.erros.length > 0) process.exitCode = 1;
    } finally {
      await app.close();
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
