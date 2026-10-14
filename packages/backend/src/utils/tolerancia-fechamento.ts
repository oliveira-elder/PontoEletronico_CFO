import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "funcionario" | "configuracaoSistema">;

/**
 * Tolerância do fechamento do banco de horas (dias após a data-marco em que o saldo zera).
 * Individual (cadastro do funcionário, definida pelo RH) sobrepõe a global (Configurações).
 */
export async function toleranciaFechamentoDias(db: Db, funcionarioId: string): Promise<number> {
  const [f, cfg] = await Promise.all([
    db.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { bancoHorasToleranciaFechamentoDias: true }
    }),
    db.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasToleranciaFechamentoDias: true }
    })
  ]);
  return f?.bancoHorasToleranciaFechamentoDias ?? cfg?.bancoHorasToleranciaFechamentoDias ?? 0;
}
