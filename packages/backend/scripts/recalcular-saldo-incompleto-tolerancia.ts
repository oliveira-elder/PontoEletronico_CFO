/**
 * Recalcula PeriodoPonto + snapshots de BH (assinaturas pendentes)
 * com a tolerância de saída também em ponto incompleto calculável.
 *
 * Uso:
 *   cd packages/backend && DATABASE_URL='postgresql://...' \
 *     npx ts-node --transpile-only scripts/recalcular-saldo-incompleto-tolerancia.ts
 */
import { webcrypto } from "crypto";
if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto: unknown }).crypto = webcrypto;
}

import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PontoService } from "../src/modules/ponto/ponto.service";

async function main() {
  const prisma = new PrismaClient();
  try {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ["error", "warn", "log"]
    });
    try {
      const ponto = app.get(PontoService);
      const result = await ponto.recalcularHistoricoAlmocoTodos();

      const funcs = await prisma.funcionario.findMany({
        where: { ativo: true },
        select: { id: true, user: { select: { name: true } } },
        take: 8
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
