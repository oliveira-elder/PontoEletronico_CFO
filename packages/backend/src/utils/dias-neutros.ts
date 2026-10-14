import { Prisma } from "@prisma/client";
import { ensureCategoriaHistorico } from "./categoria-historico";
import { diaSemObrigacaoPonto } from "./categoria-jornada";
import { diaEmCessao, periodosCessao } from "./cessao-historico";
import { dataCivilISO } from "./horario-brasilia";

type Db = Pick<
  Prisma.TransactionClient,
  "funcionario" | "funcionarioCategoriaHistorico" | "funcionarioCessaoHistorico"
>;

/**
 * Dias sem obrigação de ponto para a folha/quadro — mesma regra do banco de horas:
 * cessão a outro órgão e períodos isentos (Comissionado/Chefe/Assessor, pré-obrigação).
 * Devolve o rótulo do dia neutro, ou null se o dia tem obrigação normal.
 */
export async function montarDiaNeutro(
  db: Db,
  funcionarioId: string
): Promise<(iso: string) => string | null> {
  const func = await db.funcionario.findUnique({
    where: { id: funcionarioId },
    select: {
      categoria: true,
      isManager: true,
      isFiscal: true,
      registroPontoObrigatorio: true,
      pontoObrigatorioDesde: true
    }
  });
  if (!func) return () => null;
  const historico = await ensureCategoriaHistorico(db, funcionarioId);
  const cessoes = await periodosCessao(db, funcionarioId);
  const opts = {
    historico,
    pontoObrigatorioDesde: func.pontoObrigatorioDesde
      ? dataCivilISO(func.pontoObrigatorioDesde)
      : null,
    categoriaAtual: func.categoria,
    isManagerAtual: func.isManager,
    isFiscalAtual: func.isFiscal,
    registroPontoObrigatorioAtual: func.registroPontoObrigatorio
  };
  return (iso: string) => {
    if (diaEmCessao(iso, cessoes)) return "Isento — Cedido";
    if (diaSemObrigacaoPonto(iso, opts)) return "Isento — Comissionado/Chefe";
    return null;
  };
}
