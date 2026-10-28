import { Prisma } from "@prisma/client";
import { dataBrasiliaISO, dataCivilISO } from "./horario-brasilia";

type Tx = Prisma.TransactionClient;
type DbLeitura = { funcionarioCessaoHistorico: Tx["funcionarioCessaoHistorico"] };

export type PeriodoCessao = {
  inicio: string; // YYYY-MM-DD
  fim: string | null; // YYYY-MM-DD; null/vazio = em aberto
  orgaoOrigem: string;
  orgaoDestino: string;
};

export type VigenciaCessao = PeriodoCessao & { id: string };

const dataCivil = (iso: string) => new Date(`${iso}T12:00:00-03:00`);

async function listarOrdenado(db: DbLeitura, funcionarioId: string) {
  return db.funcionarioCessaoHistorico.findMany({
    where: { funcionarioId },
    orderBy: { inicio: "asc" }
  });
}

export async function listarCessoes(
  db: DbLeitura,
  funcionarioId: string
): Promise<VigenciaCessao[]> {
  return (await listarOrdenado(db, funcionarioId)).map((r) => ({
    id: r.id,
    inicio: dataCivilISO(r.inicio),
    fim: r.fim ? dataCivilISO(r.fim) : null,
    orgaoOrigem: r.orgaoOrigem,
    orgaoDestino: r.orgaoDestino
  }));
}

const FIM_ABERTO = "9999-12-31";

/** Campos obrigatórios (fim é opcional), fim ≥ início e sem sobreposição. */
async function validarPeriodo(db: Tx, funcionarioId: string, p: PeriodoCessao, ignorarId?: string) {
  if (!p.inicio || !p.orgaoOrigem.trim() || !p.orgaoDestino.trim()) {
    throw new Error("CESSAO_INCOMPLETA");
  }
  if (p.fim && p.fim < p.inicio) throw new Error("CESSAO_FIM_ANTES_DO_INICIO");
  const fim = p.fim || FIM_ABERTO;
  const outros = (await listarCessoes(db, funcionarioId)).filter((c) => c.id !== ignorarId);
  if (outros.some((c) => p.inicio <= (c.fim ?? FIM_ABERTO) && c.inicio <= fim)) {
    throw new Error("CESSAO_SOBREPOSTA");
  }
}

const dadosPeriodo = (p: PeriodoCessao) => ({
  inicio: dataCivil(p.inicio),
  fim: p.fim ? dataCivil(p.fim) : null,
  orgaoOrigem: p.orgaoOrigem.trim(),
  orgaoDestino: p.orgaoDestino.trim()
});

export async function adicionarCessao(db: Tx, funcionarioId: string, p: PeriodoCessao) {
  await validarPeriodo(db, funcionarioId, p);
  await db.funcionarioCessaoHistorico.create({ data: { funcionarioId, ...dadosPeriodo(p) } });
}

export async function atualizarCessao(
  db: Tx,
  funcionarioId: string,
  cessaoId: string,
  p: PeriodoCessao
) {
  const existe = await db.funcionarioCessaoHistorico.findFirst({
    where: { id: cessaoId, funcionarioId }
  });
  if (!existe) throw new Error("CESSAO_NAO_ENCONTRADA");
  await validarPeriodo(db, funcionarioId, p, cessaoId);
  await db.funcionarioCessaoHistorico.update({ where: { id: cessaoId }, data: dadosPeriodo(p) });
}

export async function removerCessao(db: Tx, funcionarioId: string, cessaoId: string) {
  const { count } = await db.funcionarioCessaoHistorico.deleteMany({
    where: { id: cessaoId, funcionarioId }
  });
  if (!count) throw new Error("CESSAO_NAO_ENCONTRADA");
}

/**
 * Copia para o Funcionario (cache denormalizado) o período que cobre hoje — ou, se
 * nenhum cobre, o mais recente já iniciado (ou o primeiro futuro). Sem períodos, limpa.
 * Não mexe em `cedido`: a marcação é do usuário (pode ser desmarcada com o histórico
 * preservado quando todas as cessões têm data de fim).
 */
export async function sincronizarFuncionarioComCessao(db: Tx, funcionarioId: string) {
  const hoje = dataBrasiliaISO(new Date());
  const lista = await listarCessoes(db, funcionarioId);
  const vigente =
    lista.find((c) => c.inicio <= hoje && hoje <= (c.fim ?? FIM_ABERTO)) ??
    [...lista].reverse().find((c) => c.inicio <= hoje) ??
    lista[0];
  await db.funcionario.update({
    where: { id: funcionarioId },
    data: vigente
      ? {
          cessaoInicio: dataCivil(vigente.inicio),
          cessaoFim: vigente.fim ? dataCivil(vigente.fim) : null,
          cessaoOrgaoOrigem: vigente.orgaoOrigem,
          cessaoOrgaoDestino: vigente.orgaoDestino
        }
      : {
          cessaoInicio: null,
          cessaoFim: null,
          cessaoOrgaoOrigem: null,
          cessaoOrgaoDestino: null
        }
  });
}

/** Quantidade de períodos sem data de fim (cessão em aberto). */
export async function contarCessoesEmAberto(db: DbLeitura, funcionarioId: string) {
  return (await listarCessoes(db, funcionarioId)).filter((c) => !c.fim).length;
}

export type IntervaloCessao = { inicio: string; fim: string | null };

/** Períodos de cessão do funcionário (datas civis) — base para neutralizar dias. */
export async function periodosCessao(
  db: DbLeitura,
  funcionarioId: string
): Promise<IntervaloCessao[]> {
  return (await listarCessoes(db, funcionarioId)).map((c) => ({ inicio: c.inicio, fim: c.fim }));
}

/**
 * Dia coberto por cessão: o efetivo está cedido a outro órgão, então o sistema fica
 * inoperante para ele — sem acesso, sem registro de ponto e sem saldo (nem falta nem
 * crédito) no banco de horas.
 */
export function diaEmCessao(diaIso: string, periodos: IntervaloCessao[]): boolean {
  return periodos.some((p) => p.inicio <= diaIso && diaIso <= (p.fim ?? FIM_ABERTO));
}

/** O funcionário está cedido hoje (dia civil de Brasília)? */
export async function cedidoHoje(db: DbLeitura, funcionarioId: string): Promise<boolean> {
  return diaEmCessao(dataBrasiliaISO(new Date()), await periodosCessao(db, funcionarioId));
}
