import { dataBrasiliaISO, hojeBrasiliaISO } from "./horario-brasilia";

export interface JornadaHistoricoContext {
  anteriorMin: number;
  atualMin: number;
  vigenciaDesde: string | null;
  horaEntrada?: string;
  horaSaida?: string;
  almocoMinMin?: number;
  almocoPodeIniciarA?: string;
  almocoPodeIniciarAte?: string;
  toleranciaEntradaMin?: number;
  toleranciaSaidaMin?: number;
  toleranciaCalculoMin?: number;
  horaExtraLimiteAuto?: number;
}

export interface FuncionarioJornadaInput {
  jornadaPeriodoId?: string | null;
  jornadaHorasDia?: number | null;
  jornadaPeriodoDesde?: Date | null;
  jornadaPeriodoAssociadoEm?: Date | null;
  jornadaPeriodo?: {
    jornadaDiariaMin: number;
    horaEntrada?: string;
    horaSaida?: string;
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
    almocoPodeIniciarAte?: string;
    toleranciaEntradaMin?: number;
    toleranciaSaidaMin?: number;
    toleranciaCalculoMin?: number;
    horaExtraLimiteAuto?: number;
  } | null;
  configuracaoHoraEntrada?: string | null;
  configuracaoHoraSaida?: string | null;
  configuracaoAlmocoMinMin?: number | null;
  configuracaoAlmocoPodeIniciarA?: string | null;
  configuracaoAlmocoPodeIniciarAte?: string | null;
  configuracaoToleranciaEntradaMin?: number | null;
  configuracaoToleranciaSaidaMin?: number | null;
  configuracaoToleranciaCalculoMin?: number | null;
  configuracaoHoraExtraLimiteAuto?: number | null;
}

/** Resolve jornada anterior (padrão) vs atual (período) e data de vigência. */
export function resolverJornadaHistoricoContexto(
  func: FuncionarioJornadaInput | null | undefined
): JornadaHistoricoContext {
  const anteriorMin = (func?.jornadaHorasDia ?? 8) * 60;
  const atualMin = func?.jornadaPeriodo?.jornadaDiariaMin ?? anteriorMin;

  let vigenciaDesde: string | null = null;
  if (func?.jornadaPeriodoDesde) {
    vigenciaDesde = dataBrasiliaISO(func.jornadaPeriodoDesde);
  } else if (func?.jornadaPeriodoAssociadoEm) {
    vigenciaDesde = dataBrasiliaISO(func.jornadaPeriodoAssociadoEm);
  } else if (func?.jornadaPeriodoId) {
    vigenciaDesde = hojeBrasiliaISO();
  }

  const horaEntrada = func?.jornadaPeriodo?.horaEntrada ?? func?.configuracaoHoraEntrada ?? "08:00";
  const horaSaida = func?.jornadaPeriodo?.horaSaida ?? func?.configuracaoHoraSaida ?? "17:00";
  const almocoMinMin = func?.jornadaPeriodo?.almocoMinMin ?? func?.configuracaoAlmocoMinMin ?? 60;
  const almocoPodeIniciarA =
    func?.jornadaPeriodo?.almocoPodeIniciarA ?? func?.configuracaoAlmocoPodeIniciarA ?? "11:30";
  const almocoPodeIniciarAte =
    func?.jornadaPeriodo?.almocoPodeIniciarAte ?? func?.configuracaoAlmocoPodeIniciarAte ?? "13:00";
  const toleranciaEntradaMin =
    func?.jornadaPeriodo?.toleranciaEntradaMin ?? func?.configuracaoToleranciaEntradaMin ?? 5;
  /* Saída sempre espelha a entrada (simetria única N). */
  const toleranciaSaidaMin = toleranciaEntradaMin;
  const toleranciaCalculoMin = 0;
  const horaExtraLimiteAuto =
    func?.jornadaPeriodo?.horaExtraLimiteAuto ?? func?.configuracaoHoraExtraLimiteAuto ?? 120;

  return {
    anteriorMin,
    atualMin,
    vigenciaDesde,
    horaEntrada,
    horaSaida,
    almocoMinMin,
    almocoPodeIniciarA,
    almocoPodeIniciarAte,
    toleranciaEntradaMin,
    toleranciaSaidaMin,
    toleranciaCalculoMin,
    horaExtraLimiteAuto
  };
}

function horaParaMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

/** Calcula a jornada obrigatória (min) para um feriado parcial com marco de horário.
 *  Retorna a proporção da jornadaDiariaMin correspondente ao período não-feriado. */
export function calcularJornadaParcialFeriado(
  marcoHorario: string,
  marcoLado: string | null | undefined,
  jornada: { horaEntrada: string; horaSaida: string; jornadaDiariaMin: number }
): number {
  const entradaMin = horaParaMin(jornada.horaEntrada);
  const saidaMin = horaParaMin(jornada.horaSaida);
  const marcoMin = horaParaMin(marcoHorario);
  const totalTurno = saidaMin - entradaMin;
  if (totalTurno <= 0) return 0;
  const propObrigatoria =
    marcoLado === "ANTES"
      ? (saidaMin - marcoMin) / totalTurno // parte depois do marco é obrigatória
      : (marcoMin - entradaMin) / totalTurno; // parte antes do marco é obrigatória
  return Math.round(jornada.jornadaDiariaMin * Math.max(0, Math.min(1, propObrigatoria)));
}

/** Afastamento parcial: possui início e fim de horário no dia. */
export function isAfastamentoParcial(a: {
  horarioInicio?: string | null;
  horarioFim?: string | null;
}): boolean {
  return !!(a.horarioInicio && a.horarioFim);
}

/**
 * Minutos líquidos de expediente cobertos pelo atestado parcial
 * (exclui a 1h de almoço canônica dentro do turno).
 */
export function minutosLiquidosCobertosAtestado(
  horarioInicio: string,
  horarioFim: string,
  jornada: {
    horaEntrada: string;
    horaSaida: string;
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
  }
): number {
  const entr = horaParaMin(jornada.horaEntrada);
  const sai = horaParaMin(jornada.horaSaida);
  const hi = horaParaMin(horarioInicio);
  const hf = horaParaMin(horarioFim);
  if (sai <= entr || hf <= hi) return 0;

  const almoco = Math.max(0, jornada.almocoMinMin ?? 60);
  const noon = 12 * 60;
  const pref = horaParaMin(jornada.almocoPodeIniciarA ?? "11:30");
  let lunchStart: number;
  if (noon >= entr && noon + almoco <= sai) lunchStart = noon;
  else if (pref >= entr && pref + almoco <= sai) lunchStart = pref;
  else lunchStart = Math.max(entr, Math.min(pref, sai - almoco));
  const lunchEnd = lunchStart + almoco;

  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  // Expediente líquido = manhã + tarde (almoço fora da carga)
  return overlap(hi, hf, entr, lunchStart) + overlap(hi, hf, lunchEnd, sai);
}

/**
 * Descarta batidas cujo horário cai na janela do atestado parcial
 * (não geram hora trabalhada nem HE).
 * Mantém fechamentos (SAÍDA / INTERROMPER / INÍCIO intervalo) exatamente no início
 * do atestado — fecham o trecho trabalhado antes do afastamento.
 */
export function filtrarRegistrosForaAtestadoParcial<T extends { tipo: string; minuto: number }>(
  registros: T[],
  horarioInicio: string,
  horarioFim: string
): T[] {
  const hi = horaParaMin(horarioInicio);
  const hf = horaParaMin(horarioFim);
  if (hf <= hi) return registros;
  const fechaNoLimite = (tipo: string) =>
    tipo === "SAIDA" || tipo === "INTERROMPER_EXPEDIENTE" || tipo === "INICIO_INTERVALO";
  return registros.filter(
    (r) => r.minuto < hi || r.minuto > hf || (r.minuto === hi && fechaNoLimite(r.tipo))
  );
}

/** Marco de expediente do atestado parcial (matutino = saída; vespertino = início/almoço). */
export function marcoExpedienteAtestadoParcial(opts: {
  horarioInicioAtestado: string;
  horarioFimAtestado: string;
  horaEntrada: string;
  horaSaida: string;
  almocoPodeIniciarA?: string;
  almocoMinMin?: number;
}): number {
  const matutino = atestadoParcialEhMatutino(opts.horarioInicioAtestado, opts.horarioFimAtestado, {
    almocoPodeIniciarA: opts.almocoPodeIniciarA,
    almocoMinMin: opts.almocoMinMin
  });
  const entr = horaParaMin(opts.horaEntrada);
  const sai = horaParaMin(opts.horaSaida);
  const almoco = Math.max(0, opts.almocoMinMin ?? 60);
  const noon = 12 * 60;
  const pref = horaParaMin(opts.almocoPodeIniciarA ?? "12:00");
  let lunchStart: number;
  if (noon >= entr && noon + almoco <= sai) lunchStart = noon;
  else if (pref >= entr && pref + almoco <= sai) lunchStart = pref;
  else lunchStart = Math.max(entr, Math.min(pref, sai - almoco));
  return matutino
    ? horaParaMin(opts.horaSaida)
    : Math.min(horaParaMin(opts.horarioInicioAtestado), lunchStart);
}

/**
 * Prepara registros para cálculo em dia de atestado parcial:
 * — ignora batidas na janela do atestado;
 * — aplica regra de almoço / órfão INICIO→SAIDA;
 * — no vespertino sem fechamento, fecha no marco (cumprimento neutro do período).
 */
export function prepararRegsCalculoAtestadoParcial(opts: {
  registros: Array<{ tipo: string; minuto: number }>;
  horarioInicio: string;
  horarioFim: string;
  horaEntrada: string;
  horaSaida: string;
  almocoPodeIniciarA?: string;
  almocoMinMin?: number;
  almocoPodeIniciarAte?: string;
  /** Dia já encerrado: se vespertino sem fechamento, assume saída no marco. */
  fecharVespertinoNoMarco?: boolean;
}): {
  registros: Array<{ tipo: string; minuto: number }>;
  marcoMin: number;
  fimTrabalhoMin: number | null;
  semAlmoco: boolean;
} {
  const fora = filtrarRegistrosForaAtestadoParcial(
    opts.registros,
    opts.horarioInicio,
    opts.horarioFim
  );
  const optsDisp = {
    horarioInicio: opts.horarioInicio,
    horarioFim: opts.horarioFim,
    almocoPodeIniciarA: opts.almocoPodeIniciarA,
    almocoMinMin: opts.almocoMinMin,
    almocoPodeIniciarAte: opts.almocoPodeIniciarAte
  };
  const semAlmoco = dispensarAlmocoPorAtestadoParcial(true, fora, optsDisp);
  let registros = semAlmoco ? normalizarRegsAtestadoSemAlmoco(fora) : fora;
  const marcoMin = marcoExpedienteAtestadoParcial({
    horarioInicioAtestado: opts.horarioInicio,
    horarioFimAtestado: opts.horarioFim,
    horaEntrada: opts.horaEntrada,
    horaSaida: opts.horaSaida,
    almocoPodeIniciarA: opts.almocoPodeIniciarA,
    almocoMinMin: opts.almocoMinMin
  });
  let fimTrabalhoMin = fimTrabalhoMinutosDoDia(registros);
  const matutino = atestadoParcialEhMatutino(opts.horarioInicio, opts.horarioFim, optsDisp);
  if (
    opts.fecharVespertinoNoMarco &&
    !matutino &&
    fimTrabalhoMin == null &&
    registros.some((r) => r.tipo === "ENTRADA")
  ) {
    registros = [...registros, { tipo: "SAIDA", minuto: marcoMin }];
    fimTrabalhoMin = marcoMin;
  }
  return { registros, marcoMin, fimTrabalhoMin, semAlmoco };
}

/**
 * Saldo em dia de atestado parcial, ancorado no expediente configurado:
 * — dentro do período (com tolerância): saldo 0 (sem crédito/débito artificial);
 * — saiu antes do marco: negativo só na diferença;
 * — ficou após o fim do expediente: HE só até `horaExtraLimiteMin` (padrão 2h).
 *
 * Matutino: marco = horaSaida.
 * Vespertino: marco = início do atestado, limitado ao início do almoço canônico
 * (não exige permanecer no intervalo).
 *
 * Importante: `fimTrabalhoMin` deve considerar só batidas fora da janela do atestado
 * (ver `prepararRegsCalculoAtestadoParcial` / `filtrarRegistrosForaAtestadoParcial`).
 */
export function calcularSaldoAtestadoParcialPorExpediente(opts: {
  horarioInicioAtestado: string;
  horarioFimAtestado: string;
  horaEntrada: string;
  horaSaida: string;
  /** Minuto do dia (0–1439) em que encerrou o trabalho; null = sem fechamento. */
  fimTrabalhoMin: number | null;
  almocoPodeIniciarA?: string;
  almocoMinMin?: number;
  toleranciaCalculoMin?: number | null;
  /** Teto de hora extra após o marco (min). Padrão 120. */
  horaExtraLimiteMin?: number | null;
}): number {
  const marcoMin = marcoExpedienteAtestadoParcial({
    horarioInicioAtestado: opts.horarioInicioAtestado,
    horarioFimAtestado: opts.horarioFimAtestado,
    horaEntrada: opts.horaEntrada,
    horaSaida: opts.horaSaida,
    almocoPodeIniciarA: opts.almocoPodeIniciarA,
    almocoMinMin: opts.almocoMinMin
  });

  if (opts.fimTrabalhoMin == null) {
    /* Sem saída/fechamento: não gera HE; o dia vira falta/pendente pelo fluxo de horas. */
    return 0;
  }

  let delta = opts.fimTrabalhoMin - marcoMin;
  const limiteHe = Math.max(0, opts.horaExtraLimiteMin ?? 120);
  if (delta > 0) delta = Math.min(delta, limiteHe);

  return aplicarMargemCalculoDiario(delta, opts.toleranciaCalculoMin);
}

/**
 * Há INTERROMPER_EXPEDIENTE sem REINICIAR correspondente (pausa aberta).
 * Usado para creditar o trecho entrada→pausa em vez de zerar o dia como falta.
 */
export function temPausaAberta(registros: Array<{ tipo: string }>): boolean {
  let aberta = false;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") aberta = true;
    else if (r.tipo === "REINICIAR_EXPEDIENTE") aberta = false;
  }
  return aberta;
}

/**
 * INÍCIO_INTERVALO sem FIM/SAÍDA posterior (almoço/intervalo aberto sem retorno).
 */
export function temIntervaloAberto(registros: Array<{ tipo: string }>): boolean {
  let emIntervalo = false;
  for (const r of registros) {
    if (r.tipo === "INICIO_INTERVALO") emIntervalo = true;
    else if (
      r.tipo === "FIM_INTERVALO" ||
      r.tipo === "SAIDA" ||
      r.tipo === "ENTRADA" ||
      r.tipo === "REINICIAR_EXPEDIENTE"
    ) {
      emIntervalo = false;
    }
  }
  return emIntervalo;
}

/** Pausa (INTERROMPER) ou intervalo de almoço iniciado sem retorno. */
export function temSaidaParcialSemRetorno(registros: Array<{ tipo: string }>): boolean {
  return temPausaAberta(registros) || temIntervaloAberto(registros);
}

/** Minuto do INTERROMPER ainda aberto (sem REINICIAR depois); null se não houver. */
export function minutoPausaAberta(
  registros: Array<{ tipo: string; minuto: number }>
): number | null {
  let aberta: number | null = null;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") aberta = r.minuto;
    else if (r.tipo === "REINICIAR_EXPEDIENTE") aberta = null;
  }
  return aberta;
}

/**
 * Atestado parcial cujo intervalo intersecta a janela de almoço configurada
 * (almocoPodeIniciarA … almocoPodeIniciarAte). Nessas situações o colaborador
 * mantém o direito à 1h de almoço no saldo.
 */
export function atestadoParcialIntersectaJanelaAlmoco(
  horarioInicio: string,
  horarioFim: string,
  opts: {
    almocoPodeIniciarA?: string;
    almocoPodeIniciarAte?: string;
  } = {}
): boolean {
  const hi = horaParaMin(horarioInicio);
  const hf = horaParaMin(horarioFim);
  if (hf <= hi) return false;
  const janelaIni = horaParaMin(opts.almocoPodeIniciarA ?? "11:30");
  const janelaFim = horaParaMin(opts.almocoPodeIniciarAte ?? "13:00");
  if (janelaFim <= janelaIni) return false;
  return Math.min(hf, janelaFim) > Math.max(hi, janelaIni);
}

/**
 * Crédito positivo de almoço (padrão 60 min) quando há pausa/intervalo sem retorno e
 * atestado parcial na janela de almoço — o funcionário tem direito à 1h nesse intervalo.
 */
export function creditoAlmocoPausaComAtestado(opts: {
  registros: Array<{ tipo: string }>;
  horarioInicioAtestado?: string | null;
  horarioFimAtestado?: string | null;
  almocoMinMin?: number;
  almocoPodeIniciarA?: string;
  almocoPodeIniciarAte?: string;
}): number {
  if (!opts.horarioInicioAtestado || !opts.horarioFimAtestado) return 0;
  if (!temSaidaParcialSemRetorno(opts.registros)) return 0;
  if (
    !atestadoParcialIntersectaJanelaAlmoco(opts.horarioInicioAtestado, opts.horarioFimAtestado, {
      almocoPodeIniciarA: opts.almocoPodeIniciarA,
      almocoPodeIniciarAte: opts.almocoPodeIniciarAte
    })
  ) {
    return 0;
  }
  return Math.max(0, opts.almocoMinMin ?? 60);
}

/** Houve INTERROMPER seguido de REINICIAR (retornou da pausa). */
export function temPausaReiniciada(registros: Array<{ tipo: string }>): boolean {
  let interrompeu = false;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") interrompeu = true;
    else if (r.tipo === "REINICIAR_EXPEDIENTE" && interrompeu) return true;
  }
  return false;
}

/**
 * Retornou da pausa, esqueceu de bater o almoço e a janela já passou:
 * credita 1h (almocoMinMin) no saldo — mesmo direito do caso com atestado.
 */
export function creditoAlmocoEsquecidoAposPausa(opts: {
  registros: Array<{ tipo: string }>;
  almocoMinMin?: number;
  almocoPodeIniciarAte?: string;
  /** Minuto atual (0–1439). Omitir em dia passado = janela considerada encerrada. */
  agoraMin?: number;
  exigirIntervalo?: boolean;
}): number {
  if (opts.exigirIntervalo === false) return 0;
  if (!opts.registros.some((r) => r.tipo === "ENTRADA")) return 0;
  if (opts.registros.some((r) => r.tipo === "INICIO_INTERVALO")) return 0;
  if (!temPausaReiniciada(opts.registros)) return 0;
  const fimJanela = horaParaMin(opts.almocoPodeIniciarAte ?? "13:00");
  const agora = opts.agoraMin ?? 24 * 60;
  if (agora <= fimJanela) return 0;
  return Math.max(0, opts.almocoMinMin ?? 60);
}

/**
 * Direito à 1h de almoço no saldo (não acumula atestado + esquecimento).
 */
export function creditoAlmocoDireitoDoDia(opts: {
  registros: Array<{ tipo: string }>;
  horarioInicioAtestado?: string | null;
  horarioFimAtestado?: string | null;
  almocoMinMin?: number;
  almocoPodeIniciarA?: string;
  almocoPodeIniciarAte?: string;
  agoraMin?: number;
  exigirIntervalo?: boolean;
}): number {
  const viaAtestado = creditoAlmocoPausaComAtestado({
    registros: opts.registros,
    horarioInicioAtestado: opts.horarioInicioAtestado,
    horarioFimAtestado: opts.horarioFimAtestado,
    almocoMinMin: opts.almocoMinMin,
    almocoPodeIniciarA: opts.almocoPodeIniciarA,
    almocoPodeIniciarAte: opts.almocoPodeIniciarAte
  });
  if (viaAtestado > 0) return viaAtestado;
  return creditoAlmocoEsquecidoAposPausa({
    registros: opts.registros,
    almocoMinMin: opts.almocoMinMin,
    almocoPodeIniciarAte: opts.almocoPodeIniciarAte,
    agoraMin: opts.agoraMin,
    exigirIntervalo: opts.exigirIntervalo
  });
}

/** Último minuto de trabalho no dia (SAÍDA, pausa aberta, ou INÍCIO de intervalo órfão). */
export function fimTrabalhoMinutosDoDia(
  registros: Array<{ tipo: string; minuto: number }>
): number | null {
  const saida = [...registros].reverse().find((r) => r.tipo === "SAIDA");
  if (saida) return saida.minuto;
  const pausa = minutoPausaAberta(registros);
  if (pausa != null) return pausa;
  const temFim = registros.some((r) => r.tipo === "FIM_INTERVALO");
  if (!temFim) {
    const ini = [...registros].reverse().find((r) => r.tipo === "INICIO_INTERVALO");
    if (ini) return ini.minuto;
  }
  const fimAlm = [...registros].reverse().find((r) => r.tipo === "FIM_INTERVALO");
  if (fimAlm) return fimAlm.minuto;
  return null;
}

/**
 * Jornada obrigatória restante com atestado parcial:
 * carga horária configurada − minutos líquidos do período de atestado.
 */
export function calcularJornadaComAtestadoParcial(
  horarioInicio: string,
  horarioFim: string,
  jornada: {
    horaEntrada: string;
    horaSaida: string;
    jornadaDiariaMin: number;
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
    almocoPodeIniciarAte?: string;
  }
): number {
  const cobertos = minutosLiquidosCobertosAtestado(horarioInicio, horarioFim, {
    horaEntrada: jornada.horaEntrada,
    horaSaida: jornada.horaSaida,
    almocoMinMin: jornada.almocoMinMin,
    almocoPodeIniciarA: jornada.almocoPodeIniciarA
  });
  return Math.max(0, jornada.jornadaDiariaMin - cobertos);
}

/**
 * Atestado cobre sobretudo a manhã: termina até o fim do almoço canônico
 * (início da janela + duração mínima), não até o limite máximo da janela
 * (que em alguns períodos vai até 15:00).
 */
export function atestadoParcialEhMatutino(
  horarioInicio: string,
  horarioFim: string,
  almocoPodeIniciarAteOrOpts:
    | string
    | {
        almocoPodeIniciarA?: string;
        almocoMinMin?: number;
        almocoPodeIniciarAte?: string;
      } = "13:00"
): boolean {
  void horarioInicio;
  if (typeof almocoPodeIniciarAteOrOpts === "string") {
    // Compat: se só passa o fim da janela, usa meio-dia + 1h como teto do matutino
    const ate = horaParaMin(almocoPodeIniciarAteOrOpts);
    const tetoMatutino = Math.min(ate, 13 * 60);
    return horaParaMin(horarioFim) <= tetoMatutino;
  }
  const inicioAlmoco = horaParaMin(almocoPodeIniciarAteOrOpts.almocoPodeIniciarA ?? "12:00");
  const duracao = Math.max(0, almocoPodeIniciarAteOrOpts.almocoMinMin ?? 60);
  const teto = inicioAlmoco + duracao;
  return horaParaMin(horarioFim) <= teto;
}

/**
 * Em atestado de um período apenas, se o funcionário não registrou almoço,
 * não se aplica a dedução mínima de 1h.
 * Atestado matutino: retorno à tarde segue regra do turno vespertino (sem intervalo).
 */
export function dispensarAlmocoPorAtestadoParcial(
  afastamentoParcial: boolean,
  registros: Array<{ tipo: string }>,
  opts?: {
    horarioInicio?: string | null;
    horarioFim?: string | null;
    almocoPodeIniciarA?: string;
    almocoMinMin?: number;
    almocoPodeIniciarAte?: string;
  }
): boolean {
  if (!afastamentoParcial) return false;
  if (
    opts?.horarioInicio &&
    opts?.horarioFim &&
    atestadoParcialEhMatutino(opts.horarioInicio, opts.horarioFim, {
      almocoPodeIniciarA: opts.almocoPodeIniciarA,
      almocoMinMin: opts.almocoMinMin,
      almocoPodeIniciarAte: opts.almocoPodeIniciarAte
    })
  ) {
    // Retorno após atestado matutino = fluxo vespertino (intervalo não aplicável)
    return true;
  }
  return !registros.some((r) => r.tipo === "INICIO_INTERVALO");
}

/**
 * Com atestado parcial sem exigência de almoço, um INICIO_INTERVALO órfão
 * (sem FIM) costuma ser saída registrada pelo tipo errado — trata como SAIDA.
 */
export function normalizarRegsAtestadoSemAlmoco<T extends { tipo: string }>(registros: T[]): T[] {
  const temSaida = registros.some((r) => r.tipo === "SAIDA");
  if (temSaida) {
    return registros.filter((r) => r.tipo !== "INICIO_INTERVALO" && r.tipo !== "FIM_INTERVALO");
  }
  const temInicio = registros.some((r) => r.tipo === "INICIO_INTERVALO");
  const temFim = registros.some((r) => r.tipo === "FIM_INTERVALO");
  if (temInicio && !temFim) {
    return registros
      .map((r) => (r.tipo === "INICIO_INTERVALO" ? { ...r, tipo: "SAIDA" } : r))
      .filter((r) => r.tipo !== "FIM_INTERVALO");
  }
  return registros.filter((r) => r.tipo !== "INICIO_INTERVALO" && r.tipo !== "FIM_INTERVALO");
}

/**
 * Atestado vespertino (ou que cobre a tarde): saída do expediente não se aplica.
 * Atestado só matutino: funcionário volta à tarde — saída permanece obrigatória.
 */
export function atestadoParcialDispensaSaida(
  horarioInicio: string,
  horarioFim: string,
  almocoPodeIniciarAte = "13:00"
): boolean {
  if (atestadoParcialEhMatutino(horarioInicio, horarioFim, almocoPodeIniciarAte)) {
    return false;
  }
  return true;
}

/** Horário atual está dentro do período do afastamento parcial? */
export function horarioNoPeriodoAfastamento(
  horarioHHMM: string,
  horarioInicio: string,
  horarioFim: string
): boolean {
  const agora = horaParaMin(horarioHHMM);
  return agora >= horaParaMin(horarioInicio) && agora <= horaParaMin(horarioFim);
}

/** Jornada diária esperada (min) para um dia civil YYYY-MM-DD. */
export function jornadaEsperadaMin(isoDate: string, ctx: JornadaHistoricoContext): number {
  if (ctx.vigenciaDesde && isoDate >= ctx.vigenciaDesde) return ctx.atualMin;
  return ctx.anteriorMin;
}

/**
 * Margem do cálculo diário — descontinuada.
 * Mantida como no-op para compatibilidade de call sites.
 * A flexibilidade passa pela tolerância simétrica de entrada/saída/almoço.
 */
export function aplicarMargemCalculoDiario(
  saldoMinutos: number,
  _toleranciaCalculoMin?: number | null | undefined
): number {
  void _toleranciaCalculoMin;
  return saldoMinutos;
}
