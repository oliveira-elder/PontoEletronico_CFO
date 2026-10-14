/**
 * Hora extra e banco de horas — espelho de backend/src/utils/hora-extra-decisao.ts
 * (mantenha os dois iguais). Sem aprovação: em casa nada é creditado; presencial só até
 * o limite diário. Aprovada: credita tudo e o informativo traz quem aprovou.
 */

export type SituacaoHoraExtra = "APROVADA" | "REJEITADA" | "PENDENTE" | "SEM_SOLICITACAO";

/**
 * Onde foram as batidas do dia (só para home office/híbrido):
 * CFO = todas no CFO; CASA = todas em casa; MISTO = em casa e no CFO; FORA = alguma fora
 * dos dois endereços.
 */
export type LocalDiaHoraExtra = "CFO" | "CASA" | "MISTO" | "FORA";

export interface ContextoHoraExtraDia {
  situacao: SituacaoHoraExtra;
  /** Sem direito ao limite diário automático: home office/híbrido fora do CFO. */
  remoto: boolean;
  /** Local apurado das batidas (home office/híbrido). */
  local?: LocalDiaHoraExtra;
  /** Quem aprovou ou rejeitou. */
  decididaPor?: "CHEFE" | "RH";
  /** Nome de quem aprovou ou rejeitou. */
  decididaPorNome?: string | null;
  /** Chefe imediato do funcionário (quem deve aprovar). */
  chefeNome?: string | null;
  observacao?: string | null;
  /** Estagiário/jovem aprendiz (rótulo): não fazem hora extra, o excedente é só informativo. */
  semHoraExtra?: string;
}

export interface AjusteHoraExtraDia extends ContextoHoraExtraDia {
  /** Saldo positivo apurado no dia. */
  apuradoMin: number;
  creditadoMin: number;
  naoCreditadoMin: number;
  limiteMin: number;
  mensagem: string;
}

const fmt = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** Contexto de HE do período: por dia (solicitação/dia em casa) e o padrão dos demais dias. */
export interface ContextoHoraExtraPeriodo {
  dias: Record<string, ContextoHoraExtraDia>;
  padrao: ContextoHoraExtraDia;
}

/** Contexto do dia; sem entrada própria vale o padrão do período. */
export function contextoDoDia(ctx: ContextoHoraExtraPeriodo, dia: string): ContextoHoraExtraDia {
  return ctx.dias[dia] ?? ctx.padrao;
}

/**
 * Aplica a regra ao saldo do dia. Saldo ≤ 0, ou HE presencial dentro do limite sem
 * decisão do chefe: nada muda e não há informativo.
 */
export function aplicarRegraHoraExtra(
  saldoDiaMin: number,
  ctx: ContextoHoraExtraDia,
  limiteMin: number | null | undefined
): { saldoDiaMin: number; ajuste?: AjusteHoraExtraDia } {
  if (saldoDiaMin <= 0) return { saldoDiaMin };
  if (ctx.semHoraExtra) {
    /* Estagiário e jovem aprendiz não fazem hora extra: nada entra no banco, só informativo. */
    return {
      saldoDiaMin: 0,
      ajuste: {
        ...ctx,
        apuradoMin: saldoDiaMin,
        creditadoMin: 0,
        naoCreditadoMin: saldoDiaMin,
        limiteMin: 0,
        mensagem:
          `${ctx.semHoraExtra} não faz hora extra: as ${fmt(saldoDiaMin)} além da jornada ` +
          "são apenas informativas e não são creditadas no banco de horas."
      }
    };
  }
  const limite = Math.max(0, limiteMin ?? 120);
  const aprovada = ctx.situacao === "APROVADA";
  const creditadoMin = aprovada ? saldoDiaMin : ctx.remoto ? 0 : Math.min(saldoDiaMin, limite);
  const naoCreditadoMin = saldoDiaMin - creditadoMin;

  /* Presencial dentro do limite, sem decisão: crédito normal, sem informativo. */
  if (!aprovada && ctx.situacao !== "REJEITADA" && naoCreditadoMin === 0) {
    return { saldoDiaMin };
  }

  const chefe = ctx.chefeNome ? `do chefe ${ctx.chefeNome}` : "do chefe imediato";
  const nomeDecisor = ctx.decididaPorNome ?? (ctx.decididaPor === "RH" ? null : ctx.chefeNome);
  const quem =
    ctx.decididaPor === "RH"
      ? `pelo RH${nomeDecisor ? ` (${nomeDecisor})` : ""}`
      : `pelo chefe ${nomeDecisor ?? "imediato"}`;
  const local =
    ctx.local === "MISTO"
      ? "com batidas em casa e no CFO"
      : ctx.local === "FORA"
        ? "com batida fora do CFO"
        : ctx.remoto
          ? "em casa (home office/híbrido)"
          : ctx.local === "CFO"
            ? "no CFO"
            : "presencial";
  /* Explica por que o dia não teve o limite diário automático. */
  const motivoLocal =
    ctx.local === "MISTO" || ctx.local === "FORA"
      ? " O limite diário só vale quando todas as batidas do dia são no CFO."
      : "";
  const parcialAct = `Conforme ACT, foram creditadas ${fmt(creditadoMin)} no banco de horas (limite diário)`;

  let mensagem: string;
  switch (ctx.situacao) {
    case "APROVADA":
      mensagem = `Hora extra de ${fmt(saldoDiaMin)} (${local}) aprovada ${quem} e creditada integralmente no banco de horas.`;
      break;
    case "REJEITADA":
      if (ctx.remoto) {
        mensagem = `Hora extra de ${fmt(naoCreditadoMin)} ${local} rejeitada ${quem}. Conforme ACT, fora do CFO a hora extra só entra no banco de horas com aprovação ${chefe}.${motivoLocal}`;
      } else if (naoCreditadoMin > 0) {
        mensagem = `${parcialAct} e ${fmt(naoCreditadoMin)} que ultrapassaram o limite foram rejeitadas ${quem}.`;
      } else {
        mensagem = `Hora extra rejeitada ${quem}, mas, conforme ACT, as ${fmt(creditadoMin)} ficaram dentro do limite diário de ${fmt(limite)} e foram creditadas no banco de horas.`;
      }
      break;
    case "PENDENTE":
      mensagem = ctx.remoto
        ? `Hora extra de ${fmt(naoCreditadoMin)} ${local} ainda não creditada no banco de horas: aguardando aprovação ${chefe}. Se aprovada, será creditada.${motivoLocal}`
        : `${parcialAct}; as ${fmt(naoCreditadoMin)} excedentes aguardam aprovação ${chefe} e, se aprovadas, serão creditadas.`;
      break;
    default:
      mensagem = ctx.remoto
        ? `Hora extra de ${fmt(naoCreditadoMin)} ${local} não creditada no banco de horas: conforme ACT, fora do CFO só entra com aprovação ${chefe}, e não há solicitação de hora extra para este dia.${motivoLocal}`
        : `${parcialAct}; as ${fmt(naoCreditadoMin)} excedentes não foram creditadas, pois não há solicitação de hora extra aprovada ${chefe} para este dia.`;
  }
  if (ctx.observacao) mensagem += ` Observação: ${ctx.observacao}`;

  return {
    saldoDiaMin: creditadoMin,
    ajuste: {
      ...ctx,
      apuradoMin: saldoDiaMin,
      creditadoMin,
      naoCreditadoMin,
      limiteMin: limite,
      mensagem
    }
  };
}

/** Tipo da observação sintética exibida no ícone informativo do dia. */
export const TIPO_OBS_HORA_EXTRA = "HORA_EXTRA_BANCO";

/** Observação sintética para o modal de observações do dia. */
export function observacaoHoraExtra(ajuste: AjusteHoraExtraDia) {
  return { data: "", texto: ajuste.mensagem, tipo: TIPO_OBS_HORA_EXTRA };
}

/** Entrada com descanso de interjornada abaixo do mínimo (backend: interjornadaPorDia). */
export interface InterjornadaDia {
  saidaAnterior: string;
  descansoMin: number;
  minimoMin: number;
}

const fmtHm = (min: number) =>
  min % 60 === 0 ? `${min / 60}h` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** Observação sintética do ícone de informação: descanso de interjornada não cumprido. */
export function observacaoInterjornada(i: InterjornadaDia) {
  const saida = new Date(i.saidaAnterior).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  return {
    data: "",
    texto:
      `Descanso de interjornada de ${fmtHm(i.descansoMin)} (mínimo ${fmtHm(i.minimoMin)}) ` +
      `desde a última saída, em ${saida.replace(",", " às")}. A entrada ocorreu antes de completar ` +
      `o descanso previsto em lei.`,
    tipo: TIPO_OBS_INTERJORNADA
  };
}

/** Tipo da observação sintética de interjornada (não confundir com a do banco de horas). */
export const TIPO_OBS_INTERJORNADA = "INTERJORNADA";
