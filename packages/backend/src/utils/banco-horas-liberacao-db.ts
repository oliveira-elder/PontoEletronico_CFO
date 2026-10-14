import type { PrismaService } from "../prisma/prisma.service";
import { dataBrasiliaISO, dataCivilISO } from "./horario-brasilia";
import {
  STATUS_SOLICITACAO_CREDITO_EM_USO,
  situacaoDasLiberacoes,
  totalDisponivel,
  usoPorLiberacao,
  type LiberacaoBase
} from "./banco-horas-liberacao";

type Db = Pick<PrismaService, "bancoHorasLiberacao" | "solicitacao">;

/** Liberações do funcionário no formato usado pelos cálculos (datas em Brasília). */
export async function carregarLiberacoes(db: Db, funcionarioId: string): Promise<LiberacaoBase[]> {
  const rows = await db.bancoHorasLiberacao.findMany({
    where: { funcionarioId },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((r) => ({
    id: r.id,
    minutos: r.minutos,
    validaAte: dataCivilISO(r.validaAte),
    minutosRevogados: r.minutosRevogados,
    devolvidoAoBancoMin: r.devolvidoAoBancoMin,
    dataLiberacao: dataBrasiliaISO(r.createdAt),
    dataRevogacao: r.revogadaEm ? dataBrasiliaISO(r.revogadaEm) : null,
    cicloInicio: r.cicloInicio
  }));
}

/** Abonos que usam crédito e ainda ocupam o tempo (em andamento ou aprovados). */
export async function carregarUsoCredito(db: Db, funcionarioId: string) {
  const sols = await db.solicitacao.findMany({
    where: {
      funcionarioId,
      tipo: "ABONO",
      status: { in: [...STATUS_SOLICITACAO_CREDITO_EM_USO] }
    },
    select: { id: true, status: true, metadados: true, dataInicio: true, dataFim: true }
  });
  const comCredito = sols.filter(
    (s) => (s.metadados as Record<string, unknown> | null)?.creditoBanco
  );
  return { solicitacoes: comCredito, uso: usoPorLiberacao(comCredito) };
}

/** Situação atual do crédito (disponível, usado, vencido) de um funcionário. */
export async function resumoCredito(db: Db, funcionarioId: string, hojeIso: string) {
  const [liberacoes, { uso }] = await Promise.all([
    carregarLiberacoes(db, funcionarioId),
    carregarUsoCredito(db, funcionarioId)
  ]);
  const situacoes = situacaoDasLiberacoes(liberacoes, uso, hojeIso);
  return { liberacoes, situacoes, disponivelMinutos: totalDisponivel(situacoes) };
}
