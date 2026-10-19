import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "funcionario" | "configuracaoSistema">;

/** Categorias sem tolerância individual de fechamento (vale só a geral). */
export const CATEGORIAS_SEM_TOLERANCIA_INDIVIDUAL = ["ESTAGIARIO", "MENOR_APRENDIZ", "ASSESSOR"];

export function categoriaSemToleranciaIndividual(categoria: string | null | undefined): boolean {
  return !!categoria && CATEGORIAS_SEM_TOLERANCIA_INDIVIDUAL.includes(categoria);
}

/**
 * Tolerância do fechamento do banco de horas (dias após a data-marco em que o saldo zera).
 * Individual (cadastro do funcionário, definida pelo RH) sobrepõe a global (Configurações).
 * Estagiário, Jovem Aprendiz e Comissionado não têm tolerância individual: vale a geral.
 */
export async function toleranciaFechamentoDias(db: Db, funcionarioId: string): Promise<number> {
  const [f, cfg] = await Promise.all([
    db.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { bancoHorasToleranciaFechamentoDias: true, categoria: true }
    }),
    db.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasToleranciaFechamentoDias: true }
    })
  ]);
  const individual = categoriaSemToleranciaIndividual(f?.categoria)
    ? null
    : f?.bancoHorasToleranciaFechamentoDias;
  return individual ?? cfg?.bancoHorasToleranciaFechamentoDias ?? 0;
}
