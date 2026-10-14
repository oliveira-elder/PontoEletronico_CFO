import type { PrismaClient } from "@prisma/client";
import { dataBrasiliaISO, horarioDeDataBrasilia } from "./horario-brasilia";

/**
 * Descanso de interjornada (CLT art. 66): intervalo mínimo entre o fim de uma jornada
 * (última SAÍDA) e o início da seguinte (ENTRADA). `minimoMin` = 0 desativa a regra.
 */
export interface ResultadoInterjornada {
  /** Descanso ainda não cumprido: a entrada deve ser barrada. */
  bloqueado: boolean;
  /** Minutos de descanso desde a última saída. */
  descansoMin: number;
  /** Instante em que o descanso mínimo se completa. */
  liberadoEm: Date;
}

export function calcularInterjornada(opts: {
  ultimaSaida: Date | null | undefined;
  agora: Date;
  minimoMin: number | null | undefined;
}): ResultadoInterjornada | null {
  const minimo = Math.max(0, Math.round(opts.minimoMin ?? 0));
  if (!minimo || !opts.ultimaSaida) return null;
  const descansoMin = Math.floor((opts.agora.getTime() - opts.ultimaSaida.getTime()) / 60000);
  /* Saída no futuro (relógio/ajuste estranho): não há como medir — não bloqueia. */
  if (descansoMin < 0) return null;
  return {
    bloqueado: descansoMin < minimo,
    descansoMin,
    liberadoEm: new Date(opts.ultimaSaida.getTime() + minimo * 60000)
  };
}

export const fmtHorasMin = (min: number) =>
  min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** "28/09 às 21:01" no fuso de Brasília. */
export function fmtDiaHoraBrasilia(d: Date): string {
  const [, m, dia] = dataBrasiliaISO(d).split("-");
  return `${dia}/${m} às ${horarioDeDataBrasilia(d).substring(0, 5)}`;
}

/**
 * Última SAÍDA que fecha a jornada anterior. Entre os registros (ordem crescente), devolve
 * a última SAÍDA só se nenhum registro posterior a ela existir (jornada em andamento →
 * null) — e se o último registro for uma saída (jornada aberta, ex.: esqueceu a saída →
 * null: não há como medir o descanso).
 */
export function ultimaSaidaFechada(
  registros: Array<{ tipo: string; dataHora: Date }>
): Date | null {
  const ultimo = registros[registros.length - 1];
  return ultimo && ultimo.tipo === "SAIDA" ? ultimo.dataHora : null;
}

export function mensagemInterjornada(
  r: ResultadoInterjornada,
  minimoMin: number,
  ultimaSaida: Date
) {
  return (
    `Descanso de interjornada: o intervalo mínimo entre jornadas é de ${fmtHorasMin(minimoMin)}. ` +
    `Sua última saída foi em ${fmtDiaHoraBrasilia(ultimaSaida)} (descanso de ${fmtHorasMin(r.descansoMin)}); ` +
    `você poderá registrar a entrada a partir de ${fmtDiaHoraBrasilia(r.liberadoEm)}. ` +
    `Se precisar registrar antes, solicite a Correção de ponto no dia seguinte: ela será ` +
    `analisada pelo seu chefe e pelo RH.`
  );
}

/** Aviso gravado no pedido de correção (`metadados.avisoInterjornada`). */
export interface AvisoInterjornada {
  /** ISO da última saída antes da entrada corrigida. */
  saidaAnterior: string;
  descansoMin: number;
  minimoMin: number;
}

/** Nota para a observação do registro quando o pedido de correção tinha o aviso. */
export function textoNotaInterjornada(aviso: unknown): string | undefined {
  const a = aviso as Partial<AvisoInterjornada> | null | undefined;
  if (!a || typeof a.descansoMin !== "number" || typeof a.minimoMin !== "number") return undefined;
  return (
    `Aprovado pelo chefe e pelo RH com descanso de interjornada de ${fmtHorasMin(a.descansoMin)} ` +
    `(mínimo ${fmtHorasMin(a.minimoMin)}).`
  );
}

/**
 * Dias (YYYY-MM-DD, Brasília) cuja Entrada ocorreu com descanso abaixo do mínimo desde a
 * saída anterior — para o ícone de informação dos históricos. Considera registros já
 * gravados (inclusive ajustados/criados por correção), então também mostra dias anteriores
 * à regra. A primeira Entrada do dia, logo após uma SAÍDA, é a que conta.
 */
export async function interjornadaCurtaPorDia(
  prisma: Pick<PrismaClient, "registroPonto" | "configuracaoSistema">,
  funcionarioId: string,
  inicio: Date,
  fim: Date
): Promise<Record<string, AvisoInterjornada>> {
  const cfg = await prisma.configuracaoSistema.findUnique({
    where: { id: "singleton" },
    select: { interjornadaMin: true }
  });
  const minimoMin = cfg?.interjornadaMin ?? 660;
  if (minimoMin <= 0) return {};

  /* Um dia antes do período, para a saída que antecede a 1ª entrada. */
  const registros = await prisma.registroPonto.findMany({
    where: {
      funcionarioId,
      apenasInformativo: false,
      dataHora: { gte: new Date(inicio.getTime() - 24 * 3600 * 1000), lte: fim }
    },
    orderBy: { dataHora: "asc" },
    select: { tipo: true, dataHora: true }
  });

  const out: Record<string, AvisoInterjornada> = {};
  for (let i = 1; i < registros.length; i++) {
    const r = registros[i];
    const anterior = registros[i - 1];
    if (r.tipo !== "ENTRADA" || anterior.tipo !== "SAIDA") continue;
    if (r.dataHora < inicio) continue;
    const res = calcularInterjornada({
      ultimaSaida: anterior.dataHora,
      agora: r.dataHora,
      minimoMin
    });
    if (!res?.bloqueado) continue;
    const dia = dataBrasiliaISO(r.dataHora);
    if (!out[dia]) {
      out[dia] = {
        saidaAnterior: anterior.dataHora.toISOString(),
        descansoMin: res.descansoMin,
        minimoMin
      };
    }
  }
  return out;
}
