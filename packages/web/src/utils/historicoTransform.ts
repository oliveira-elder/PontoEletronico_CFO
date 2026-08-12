/* Transformação e resumo do histórico — mesma lógica da página /ponto/historico */

import { calcHorasTrabalhadasMinutos, analisarAlmocoCurto } from "./calcHorasTrabalhadas";

export type StatusDia =
  | "OK"
  | "FALTA"
  | "PENDENTE"
  | "AFASTAMENTO"
  | "FERIADO"
  | "FUTURO"
  | "FOLGA"
  | "ISENTO";

export interface ObservacaoRegistro {
  data: string;
  texto: string;
  tipo?: string;
  tipoRegistro?: string;
  horarioAnterior?: string | null;
  horarioNovo?: string;
  turno?: string;
  motivo?: string;
  janelaAlmoco?: string;
}

/** TURNO_SEM_INTERVALO só dispensa almoço após a janela ou por categoria — não em DURANTE_JANELA. */
function obsForcaSemIntervalo(
  observacoes?: ObservacaoRegistro[] | null
): ObservacaoRegistro | undefined {
  const obs = observacoes?.find((o) => o.tipo === "TURNO_SEM_INTERVALO");
  if (!obs || obs.motivo === "DURANTE_JANELA") return undefined;
  return obs;
}

export interface Pausa {
  inicio: string;
  fim: string | null;
}

export interface DiaRegistro {
  data: string;
  diaSemana: string;
  entrada: string | null;
  inicioIntervalo: string | null;
  fimIntervalo: string | null;
  saida: string | null;
  pausas?: Pausa[];
  horasMin: number;
  jornadaMin: number;
  status: StatusDia;
  obs?: string;
  observacoes?: ObservacaoRegistro[];
  entradaEditada?: boolean;
  inicioIntervaloEditado?: boolean;
  fimIntervaloEditado?: boolean;
  saidaEditada?: boolean;
  /** Entrada em turno vespertino/noturno — intervalo não aplicável */
  semIntervalo?: boolean;
  turno?: string;
  motivoSemIntervalo?: string;
  janelaAlmoco?: string;
  /** Atestado com horário parcial (matutino/vespertino) */
  atestadoParcial?: boolean;
  atestadoParcialHorario?: string;
  /** Saída dispensada (atestado vespertino) */
  saidaNaoAplicavel?: boolean;
  /**
   * Almoço registrado com duração &lt; almocoMinMin da jornada:
   * horário exibido permanece; o cálculo usa início + mínimo configurado.
   */
  almocoCurto?: {
    inicio: string;
    fimRegistrado: string;
    fimReferencia: string;
    minimoMin: number;
  };
  /** Origem de solicitação de assessor/gerente — só consulta, sem cálculo. */
  apenasInformativo?: boolean;
}

export interface ApiRegistro {
  tipo: string;
  dataHora: string;
  ajustado?: boolean;
  observacoes?: ObservacaoRegistro[];
  apenasInformativo?: boolean;
}

export interface ApiAfastamento {
  tipo: string;
  dataInicio: string;
  dataFim: string;
  justificativa?: string | null;
  apenasInformativo?: boolean;
  horarioInicio?: string | null;
  horarioFim?: string | null;
}

export interface ApiFeriado {
  data: string;
  nome: string;
  marcoHorario?: string | null;
  marcoLado?: string | null;
}

export interface Multiplicadores {
  sabadoPct: number;
  domingoPct: number;
  feriadoPct: number;
}

export interface JornadaHistorico {
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

export interface HistoricoApiResponse {
  mes: number;
  ano: number;
  /** Primeiro login no sistema (YYYY-MM-DD, Brasília). */
  inicioAtividades?: string | null;
  /** Go-live do sistema (YYYY-MM-DD). Null = fase de teste. */
  dataInicioProducao?: string | null;
  /** True quando Super Admin consulta mês anterior ao go-live. */
  periodoTeste?: boolean;
  /** Data a partir da qual o ponto passa a ser obrigatório (assessor → concursado). */
  pontoObrigatorioDesde?: string | null;
  semRegistroPonto?: boolean;
  categoria?: string;
  /** Períodos (vigências) sem obrigação de ponto — assessor/gerente intercalados. */
  periodosSemObrigacao?: Array<{ inicio: string; fim: string | null }>;
  /** Saldo diário do banco de horas (chave YYYY-MM-DD) — mesma fonte de /ponto/banco-horas. */
  bancoPorDia?: Record<
    string,
    {
      horasTrabalhadasMinutos: number;
      saldoDiaMinutos: number;
      saldoAcumuladoMinutos: number;
      jornadaEsperadaMinutos: number;
      observacao?: string;
      neutro: boolean;
    }
  >;
  saldoMesBanco?: number;
  saldoAcumuladoMes?: number;
  /** Acumulado do ciclo ao fim do mês anterior ao consultado. */
  saldoAcumuladoMesAnterior?: number;
  /** True quando a categoria do funcionário não deve ver banco de horas. */
  ocultarBancoHoras?: boolean;
  registros: ApiRegistro[];
  afastamentos: ApiAfastamento[];
  feriados?: ApiFeriado[];
  multiplicadores?: Multiplicadores;
  jornada?: JornadaHistorico;
}

export interface ResumoHistorico {
  mes: number;
  ano: number;
  diasTrabalhados: number;
  horasTrabalhadasMinutos: number;
  horasEsperadasMinutos: number;
  horasExtrasMinutos: number;
  horasFaltaMinutos: number;
  saldoMinutos: number;
}

export const JORNADA_PADRAO: JornadaHistorico = {
  anteriorMin: 480,
  atualMin: 480,
  vigenciaDesde: null,
  horaEntrada: "08:00",
  horaSaida: "17:00",
  almocoMinMin: 60,
  almocoPodeIniciarA: "11:30",
  almocoPodeIniciarAte: "13:00",
  toleranciaEntradaMin: 5,
  toleranciaSaidaMin: 5,
  toleranciaCalculoMin: 0,
  horaExtraLimiteAuto: 120
};

const TIPO_AFASTAMENTO_LABEL: Record<string, string> = {
  FERIAS: "Férias",
  ATESTADO: "Atestado médico",
  LICENCA_MEDICA: "Licença",
  LICENCA_MATERNIDADE: "Licença maternidade",
  LICENCA_PATERNIDADE: "Licença paternidade",
  FALTA_JUSTIFICADA: "Falta justificada",
  ABONO: "Abono"
};

function jornadaEsperadaMin(isoKey: string, jornada: JornadaHistorico): number {
  if (jornada.vigenciaDesde && isoKey >= jornada.vigenciaDesde) return jornada.atualMin;
  return jornada.anteriorMin;
}

function calcularJornadaParcialFeriado(
  marcoHorario: string,
  marcoLado: string | null | undefined,
  jornadaDiariaMin: number,
  horaEntrada: string,
  horaSaida: string
): number {
  const entradaMin = toMin(horaEntrada);
  const saidaMin = toMin(horaSaida);
  const marcoMin = toMin(marcoHorario);
  const totalTurno = saidaMin - entradaMin;
  if (totalTurno <= 0) return 0;
  const propObrigatoria =
    marcoLado === "ANTES"
      ? (saidaMin - marcoMin) / totalTurno
      : (marcoMin - entradaMin) / totalTurno;
  return Math.round(jornadaDiariaMin * Math.max(0, Math.min(1, propObrigatoria)));
}

function isAfastamentoParcial(a: {
  horarioInicio?: string | null;
  horarioFim?: string | null;
}): boolean {
  return !!(a.horarioInicio && a.horarioFim);
}

function calcularJornadaComAtestadoParcial(
  horarioInicio: string,
  horarioFim: string,
  jornadaDiariaMin: number,
  horaEntrada: string,
  horaSaida: string,
  opts?: {
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
    almocoPodeIniciarAte?: string;
  }
): number {
  const cobertos = minutosLiquidosCobertosAtestado(horarioInicio, horarioFim, {
    horaEntrada,
    horaSaida,
    almocoMinMin: opts?.almocoMinMin,
    almocoPodeIniciarA: opts?.almocoPodeIniciarA
  });
  return Math.max(0, jornadaDiariaMin - cobertos);
}

function aplicarMargemCalculo(
  saldoMinutos: number,
  _toleranciaCalculoMin?: number | null | undefined
): number {
  void _toleranciaCalculoMin;
  return saldoMinutos;
}

function calcularSaldoAtestadoParcialPorExpediente(opts: {
  horarioInicioAtestado: string;
  horarioFimAtestado: string;
  horaEntrada: string;
  horaSaida: string;
  fimTrabalhoMin: number | null;
  almocoPodeIniciarA?: string;
  almocoMinMin?: number;
  toleranciaCalculoMin?: number | null;
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
  if (opts.fimTrabalhoMin == null) return 0;
  let delta = opts.fimTrabalhoMin - marcoMin;
  const limiteHe = Math.max(0, opts.horaExtraLimiteMin ?? 120);
  if (delta > 0) delta = Math.min(delta, limiteHe);
  return aplicarMargemCalculo(delta, opts.toleranciaCalculoMin);
}

function marcoExpedienteAtestadoParcial(opts: {
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
  const entr = toMin(opts.horaEntrada);
  const sai = toMin(opts.horaSaida);
  const almoco = Math.max(0, opts.almocoMinMin ?? 60);
  const noon = 12 * 60;
  const pref = toMin(opts.almocoPodeIniciarA ?? "12:00");
  let lunchStart: number;
  if (noon >= entr && noon + almoco <= sai) lunchStart = noon;
  else if (pref >= entr && pref + almoco <= sai) lunchStart = pref;
  else lunchStart = Math.max(entr, Math.min(pref, sai - almoco));
  return matutino ? toMin(opts.horaSaida) : Math.min(toMin(opts.horarioInicioAtestado), lunchStart);
}

function filtrarRegsForaAtestadoParcial(
  registros: Array<{ tipo: string; minuto: number }>,
  horarioInicio: string,
  horarioFim: string
): Array<{ tipo: string; minuto: number }> {
  const hi = toMin(horarioInicio);
  const hf = toMin(horarioFim);
  if (hf <= hi) return registros;
  const fechaNoLimite = (tipo: string) =>
    tipo === "SAIDA" || tipo === "INTERROMPER_EXPEDIENTE" || tipo === "INICIO_INTERVALO";
  return registros.filter(
    (r) => r.minuto < hi || r.minuto > hf || (r.minuto === hi && fechaNoLimite(r.tipo))
  );
}

function prepararRegsCalculoAtestadoParcial(opts: {
  registros: Array<{ tipo: string; minuto: number }>;
  horarioInicio: string;
  horarioFim: string;
  horaEntrada: string;
  horaSaida: string;
  almocoPodeIniciarA?: string;
  almocoMinMin?: number;
  almocoPodeIniciarAte?: string;
  fecharVespertinoNoMarco?: boolean;
}): {
  registros: Array<{ tipo: string; minuto: number }>;
  marcoMin: number;
  fimTrabalhoMin: number | null;
  semAlmoco: boolean;
} {
  const fora = filtrarRegsForaAtestadoParcial(opts.registros, opts.horarioInicio, opts.horarioFim);
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

function temPausaAberta(registros: Array<{ tipo: string }>): boolean {
  let aberta = false;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") aberta = true;
    else if (r.tipo === "REINICIAR_EXPEDIENTE") aberta = false;
  }
  return aberta;
}

function temIntervaloAberto(registros: Array<{ tipo: string }>): boolean {
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

function temSaidaParcialSemRetorno(registros: Array<{ tipo: string }>): boolean {
  return temPausaAberta(registros) || temIntervaloAberto(registros);
}

function minutoPausaAberta(registros: Array<{ tipo: string; minuto: number }>): number | null {
  let aberta: number | null = null;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") aberta = r.minuto;
    else if (r.tipo === "REINICIAR_EXPEDIENTE") aberta = null;
  }
  return aberta;
}

function atestadoParcialIntersectaJanelaAlmoco(
  horarioInicio: string,
  horarioFim: string,
  opts: { almocoPodeIniciarA?: string; almocoPodeIniciarAte?: string } = {}
): boolean {
  const hi = toMin(horarioInicio);
  const hf = toMin(horarioFim);
  if (hf <= hi) return false;
  const janelaIni = toMin(opts.almocoPodeIniciarA ?? "11:30");
  const janelaFim = toMin(opts.almocoPodeIniciarAte ?? "13:00");
  if (janelaFim <= janelaIni) return false;
  return Math.min(hf, janelaFim) > Math.max(hi, janelaIni);
}

function creditoAlmocoPausaComAtestado(opts: {
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

function temPausaReiniciada(registros: Array<{ tipo: string }>): boolean {
  let interrompeu = false;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") interrompeu = true;
    else if (r.tipo === "REINICIAR_EXPEDIENTE" && interrompeu) return true;
  }
  return false;
}

function creditoAlmocoEsquecidoAposPausa(opts: {
  registros: Array<{ tipo: string }>;
  almocoMinMin?: number;
  almocoPodeIniciarAte?: string;
  agoraMin?: number;
  exigirIntervalo?: boolean;
}): number {
  if (opts.exigirIntervalo === false) return 0;
  if (!opts.registros.some((r) => r.tipo === "ENTRADA")) return 0;
  if (opts.registros.some((r) => r.tipo === "INICIO_INTERVALO")) return 0;
  if (!temPausaReiniciada(opts.registros)) return 0;
  const fimJanela = toMin(opts.almocoPodeIniciarAte ?? "13:00");
  const agora = opts.agoraMin ?? 24 * 60;
  if (agora <= fimJanela) return 0;
  return Math.max(0, opts.almocoMinMin ?? 60);
}

function creditoAlmocoDireitoDoDia(opts: {
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

function fimTrabalhoMinutosDoDia(
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

/** Minutos líquidos de expediente cobertos pelo atestado (exclui 1h de almoço). */
function minutosLiquidosCobertosAtestado(
  horarioInicio: string,
  horarioFim: string,
  jornada: {
    horaEntrada: string;
    horaSaida: string;
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
  }
): number {
  const entr = toMin(jornada.horaEntrada);
  const sai = toMin(jornada.horaSaida);
  const hi = toMin(horarioInicio);
  const hf = toMin(horarioFim);
  if (sai <= entr || hf <= hi) return 0;

  const almoco = Math.max(0, jornada.almocoMinMin ?? 60);
  const noon = 12 * 60;
  const pref = toMin(jornada.almocoPodeIniciarA ?? "11:30");
  let lunchStart: number;
  if (noon >= entr && noon + almoco <= sai) lunchStart = noon;
  else if (pref >= entr && pref + almoco <= sai) lunchStart = pref;
  else lunchStart = Math.max(entr, Math.min(pref, sai - almoco));
  const lunchEnd = lunchStart + almoco;

  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  return overlap(hi, hf, entr, lunchStart) + overlap(hi, hf, lunchEnd, sai);
}

function atestadoParcialEhMatutino(
  horarioInicio: string,
  horarioFim: string,
  opts?: {
    almocoPodeIniciarA?: string;
    almocoMinMin?: number;
    almocoPodeIniciarAte?: string;
  }
): boolean {
  void horarioInicio;
  void opts?.almocoPodeIniciarAte;
  const inicioAlmoco = toMin(opts?.almocoPodeIniciarA ?? "12:00");
  const duracao = Math.max(0, opts?.almocoMinMin ?? 60);
  return toMin(horarioFim) <= inicioAlmoco + duracao;
}

function dispensarAlmocoPorAtestadoParcial(
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
    atestadoParcialEhMatutino(opts.horarioInicio, opts.horarioFim, opts)
  ) {
    return true;
  }
  return !registros.some((r) => r.tipo === "INICIO_INTERVALO");
}

function normalizarRegsAtestadoSemAlmoco<T extends { tipo: string }>(registros: T[]): T[] {
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

function atestadoParcialDispensaSaida(
  horarioInicio: string,
  horarioFim: string,
  opts?: {
    almocoPodeIniciarA?: string;
    almocoMinMin?: number;
    almocoPodeIniciarAte?: string;
  }
): boolean {
  if (atestadoParcialEhMatutino(horarioInicio, horarioFim, opts)) {
    return false;
  }
  return true;
}

function labelAtestadoParcial(hi: string, hf: string, tipo?: string): string {
  const nome =
    tipo === "ABONO"
      ? "Abono parcial"
      : tipo === "ATESTADO"
        ? "Atestado médico parcial"
        : "Afastamento parcial";
  return `${nome} (${hi}–${hf})`;
}

export function badgeLabelParcial(obs?: string): string {
  if (obs?.startsWith("Abono parcial")) return "Abono parcial";
  if (obs?.startsWith("Afastamento parcial")) return "Afastamento parcial";
  return "Atestado médico parcial";
}

function toMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

function fmtMinDia(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtHora(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

function dataBrasiliaKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

function calcHorasMinutosDia(
  dayRegs: ApiRegistro[],
  agoraMin?: number,
  opts?: {
    exigirIntervalo?: boolean;
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
    almocoPodeIniciarAte?: string;
    horaEntrada?: string;
    horaSaida?: string;
    toleranciaEntradaMin?: number;
    toleranciaSaidaMin?: number;
  }
): number {
  return calcHorasTrabalhadasMinutos(
    dayRegs.map((r) => ({ tipo: r.tipo, minuto: toMin(fmtHora(r.dataHora)) })),
    {
      agoraMin,
      exigirIntervalo: opts?.exigirIntervalo,
      almocoMinMin: opts?.almocoMinMin,
      almocoPodeIniciarA: opts?.almocoPodeIniciarA,
      almocoPodeIniciarAte: opts?.almocoPodeIniciarAte,
      horaEntrada: opts?.horaEntrada,
      horaSaida: opts?.horaSaida,
      toleranciaEntradaMin: opts?.toleranciaEntradaMin,
      toleranciaSaidaMin: opts?.toleranciaSaidaMin
    }
  );
}

function afastamentoDoDia(
  isoKey: string,
  afastamentos: ApiAfastamento[]
): ApiAfastamento | undefined {
  return afastamentos.find((a) => {
    const inicio = dataBrasiliaKey(a.dataInicio);
    const fim = dataBrasiliaKey(a.dataFim);
    return isoKey >= inicio && isoKey <= fim;
  });
}

export function transformarHistorico(
  registros: ApiRegistro[],
  afastamentos: ApiAfastamento[],
  mes: number,
  ano: number,
  feriados: ApiFeriado[] = [],
  mult: Multiplicadores = { sabadoPct: 100, domingoPct: 200, feriadoPct: 200 },
  jornada: JornadaHistorico = JORNADA_PADRAO,
  inicioAtividades?: string | null,
  opts?: {
    pontoObrigatorioDesde?: string | null;
    semRegistroPonto?: boolean;
    periodosSemObrigacao?: Array<{ inicio: string; fim: string | null }>;
    /** false para estagiário / menor aprendiz */
    exigirIntervalo?: boolean;
  }
): DiaRegistro[] {
  const hoje = new Date();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const result: DiaRegistro[] = [];
  const pontoObrigatorioDesde = opts?.pontoObrigatorioDesde ?? null;
  const semRegistroPonto = !!opts?.semRegistroPonto;
  const periodosSemObrigacao = opts?.periodosSemObrigacao ?? [];
  const exigirIntervaloGlobal = opts?.exigirIntervalo !== false;

  const diaEmPeriodoSemObrigacao = (isoKey: string): boolean => {
    if (periodosSemObrigacao.length > 0) {
      return periodosSemObrigacao.some(
        (p) => isoKey >= p.inicio && (p.fim == null || isoKey <= p.fim)
      );
    }
    /* Fallback legado */
    if (semRegistroPonto) return true;
    if (pontoObrigatorioDesde && isoKey < pontoObrigatorioDesde) return true;
    return false;
  };

  const byDay: Record<string, ApiRegistro[]> = {};
  for (const r of registros) {
    const key = dataBrasiliaKey(r.dataHora);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(r);
  }

  const feriadoMap: Record<string, ApiFeriado> = {};
  for (const f of feriados) {
    const key = dataBrasiliaKey(f.data);
    feriadoMap[key] = f;
  }

  for (let d = 1; d <= diasNoMes; d++) {
    const dt = new Date(ano, mes - 1, d);
    const dow = dt.getDay();
    const fimDeSemana = dow === 0 || dow === 6;

    const isFuture = dt > hoje;
    const isoKey = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dataStr = `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
    const diaSemana = NOMES_DIA[dow];
    const dayRegs = byDay[isoKey] ?? [];
    const feriadoDia = feriadoMap[isoKey];
    const diaInformativo =
      dayRegs.some((r) => r.apenasInformativo) ||
      !!afastamentoDoDia(
        isoKey,
        afastamentos.filter((a) => a.apenasInformativo)
      );
    const afastamentosCalc = afastamentos.filter((a) => !a.apenasInformativo);
    const dayRegsCalc = dayRegs.filter((r) => !r.apenasInformativo);

    if (isFuture && fimDeSemana) continue;

    /* Antes do primeiro login: não conta falta nem jornada esperada. */
    if (inicioAtividades && isoKey < inicioAtividades) {
      if (fimDeSemana && dayRegs.length === 0) continue;
      result.push({
        data: dataStr,
        diaSemana,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: 0,
        status: "FOLGA",
        obs: "Anterior ao primeiro acesso",
        apenasInformativo: diaInformativo
      });
      continue;
    }

    /* Sem obrigação de ponto (assessor/gerente ou período pré-concursado). */
    const semObrigacao = diaEmPeriodoSemObrigacao(isoKey);
    if (semObrigacao && !isFuture) {
      const afastInfo = afastamentoDoDia(isoKey, afastamentos);
      if (fimDeSemana && dayRegs.length === 0 && !afastInfo) continue;
      result.push({
        data: dataStr,
        diaSemana,
        entrada: dayRegs.find((r) => r.tipo === "ENTRADA")
          ? fmtHora(dayRegs.find((r) => r.tipo === "ENTRADA")!.dataHora)
          : null,
        inicioIntervalo: dayRegs.find((r) => r.tipo === "INICIO_INTERVALO")
          ? fmtHora(dayRegs.find((r) => r.tipo === "INICIO_INTERVALO")!.dataHora)
          : null,
        fimIntervalo: dayRegs.find((r) => r.tipo === "FIM_INTERVALO")
          ? fmtHora(dayRegs.find((r) => r.tipo === "FIM_INTERVALO")!.dataHora)
          : null,
        saida: dayRegs.find((r) => r.tipo === "SAIDA")
          ? fmtHora(dayRegs.find((r) => r.tipo === "SAIDA")!.dataHora)
          : null,
        horasMin: 0,
        jornadaMin: 0,
        status: afastInfo ? "AFASTAMENTO" : "ISENTO",
        obs: afastInfo
          ? `${TIPO_AFASTAMENTO_LABEL[afastInfo.tipo] ?? "Afastamento"} (informativo)`
          : "Isento — Assessor/Gerente",
        apenasInformativo: true,
        observacoes: dayRegs.flatMap((r) => r.observacoes ?? [])
      });
      continue;
    }

    if (isFuture) {
      result.push({
        data: dataStr,
        diaSemana,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: jornadaEsperadaMin(isoKey, jornada),
        status: "FUTURO"
      });
      continue;
    }

    const afastamento = afastamentoDoDia(isoKey, afastamentosCalc);
    if (afastamento && !isAfastamentoParcial(afastamento)) {
      result.push({
        data: dataStr,
        diaSemana,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: 0,
        status: "AFASTAMENTO",
        obs: TIPO_AFASTAMENTO_LABEL[afastamento.tipo] ?? "Afastamento justificado",
        apenasInformativo: diaInformativo
      });
      continue;
    }
    const atestadoParcial = afastamento && isAfastamentoParcial(afastamento) ? afastamento : null;

    /* Afastamento só informativo: mostra no histórico sem efeito de cálculo. */
    const afastamentoInfo = afastamentoDoDia(
      isoKey,
      afastamentos.filter((a) => a.apenasInformativo)
    );
    if (afastamentoInfo && dayRegsCalc.length === 0) {
      result.push({
        data: dataStr,
        diaSemana,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: 0,
        status: "AFASTAMENTO",
        obs: `${TIPO_AFASTAMENTO_LABEL[afastamentoInfo.tipo] ?? "Afastamento"} (informativo)`,
        apenasInformativo: true
      });
      continue;
    }

    if (fimDeSemana && dayRegsCalc.length === 0 && !diaInformativo) continue;

    if (!fimDeSemana && dayRegsCalc.length === 0) {
      if (feriadoDia) {
        const jornadaBase = jornadaEsperadaMin(isoKey, jornada);
        const jornadaMandatoria = feriadoDia.marcoHorario
          ? calcularJornadaParcialFeriado(
              feriadoDia.marcoHorario,
              feriadoDia.marcoLado,
              jornadaBase,
              jornada.horaEntrada ?? "08:00",
              jornada.horaSaida ?? "17:00"
            )
          : 0;
        result.push({
          data: dataStr,
          diaSemana,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          horasMin: 0,
          jornadaMin: jornadaMandatoria,
          status: jornadaMandatoria > 0 ? "FALTA" : "FERIADO",
          obs: feriadoDia.marcoHorario
            ? `${feriadoDia.nome} (${feriadoDia.marcoLado === "ANTES" ? "até" : "após"} ${feriadoDia.marcoHorario})`
            : feriadoDia.nome,
          apenasInformativo: diaInformativo
        });
      } else if (diaInformativo) {
        result.push({
          data: dataStr,
          diaSemana,
          entrada: dayRegs.find((r) => r.tipo === "ENTRADA")
            ? fmtHora(dayRegs.find((r) => r.tipo === "ENTRADA")!.dataHora)
            : null,
          inicioIntervalo: dayRegs.find((r) => r.tipo === "INICIO_INTERVALO")
            ? fmtHora(dayRegs.find((r) => r.tipo === "INICIO_INTERVALO")!.dataHora)
            : null,
          fimIntervalo: dayRegs.find((r) => r.tipo === "FIM_INTERVALO")
            ? fmtHora(dayRegs.find((r) => r.tipo === "FIM_INTERVALO")!.dataHora)
            : null,
          saida: dayRegs.find((r) => r.tipo === "SAIDA")
            ? fmtHora(dayRegs.find((r) => r.tipo === "SAIDA")!.dataHora)
            : null,
          horasMin: 0,
          jornadaMin: 0,
          status: "ISENTO",
          obs: "Isento — Assessor/Gerente",
          apenasInformativo: true,
          observacoes: dayRegs.flatMap((r) => r.observacoes ?? [])
        });
      } else if (atestadoParcial) {
        const jornadaBase = jornadaEsperadaMin(isoKey, jornada);
        const jornadaMandatoria = calcularJornadaComAtestadoParcial(
          atestadoParcial.horarioInicio!,
          atestadoParcial.horarioFim!,
          jornadaBase,
          jornada.horaEntrada ?? "08:00",
          jornada.horaSaida ?? "17:00",
          {
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
          }
        );
        const label = labelAtestadoParcial(
          atestadoParcial.horarioInicio!,
          atestadoParcial.horarioFim!,
          atestadoParcial.tipo
        );
        result.push({
          data: dataStr,
          diaSemana,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          horasMin: 0,
          jornadaMin: jornadaMandatoria,
          status: jornadaMandatoria > 0 ? "FALTA" : "AFASTAMENTO",
          obs: label,
          atestadoParcial: true,
          atestadoParcialHorario: `${atestadoParcial.horarioInicio}–${atestadoParcial.horarioFim}`,
          semIntervalo: true,
          motivoSemIntervalo: "ATESTADO_PARCIAL",
          saidaNaoAplicavel: atestadoParcialDispensaSaida(
            atestadoParcial.horarioInicio!,
            atestadoParcial.horarioFim!,
            {
              almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
              almocoMinMin: jornada.almocoMinMin ?? 60,
              almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
            }
          ),
          apenasInformativo: diaInformativo
        });
      } else {
        result.push({
          data: dataStr,
          diaSemana,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          horasMin: 0,
          jornadaMin: jornadaEsperadaMin(isoKey, jornada),
          status: "FALTA",
          obs: "Ausência não registrada"
        });
      }
      continue;
    }

    const isHoje = dt.toDateString() === hoje.toDateString();
    const optsAlmocoAtestado = {
      almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
      almocoMinMin: jornada.almocoMinMin ?? 60,
      almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
    };

    const prepAtestado = atestadoParcial
      ? prepararRegsCalculoAtestadoParcial({
          registros: dayRegsCalc.map((r) => ({
            tipo: r.tipo,
            minuto: toMin(fmtHora(r.dataHora))
          })),
          horarioInicio: atestadoParcial.horarioInicio!,
          horarioFim: atestadoParcial.horarioFim!,
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          ...optsAlmocoAtestado,
          fecharVespertinoNoMarco: !isHoje
        })
      : null;

    const semAlmocoAtestado =
      !!prepAtestado?.semAlmoco ||
      dispensarAlmocoPorAtestadoParcial(!!atestadoParcial, dayRegsCalc, {
        horarioInicio: atestadoParcial?.horarioInicio,
        horarioFim: atestadoParcial?.horarioFim,
        ...optsAlmocoAtestado
      });
    const dayRegsHoras =
      semAlmocoAtestado || !!dayRegsCalc.find((r) => !!obsForcaSemIntervalo(r.observacoes))
        ? normalizarRegsAtestadoSemAlmoco(
            atestadoParcial
              ? dayRegsCalc.filter((r) => {
                  const m = toMin(fmtHora(r.dataHora));
                  const hi = toMin(atestadoParcial.horarioInicio!);
                  const hf = toMin(atestadoParcial.horarioFim!);
                  const fechaNoLimite =
                    r.tipo === "SAIDA" ||
                    r.tipo === "INTERROMPER_EXPEDIENTE" ||
                    r.tipo === "INICIO_INTERVALO";
                  return m < hi || m > hf || (m === hi && fechaNoLimite);
                })
              : dayRegsCalc
          )
        : atestadoParcial
          ? dayRegsCalc.filter((r) => {
              const m = toMin(fmtHora(r.dataHora));
              const hi = toMin(atestadoParcial.horarioInicio!);
              const hf = toMin(atestadoParcial.horarioFim!);
              const fechaNoLimite =
                r.tipo === "SAIDA" ||
                r.tipo === "INTERROMPER_EXPEDIENTE" ||
                r.tipo === "INICIO_INTERVALO";
              return m < hi || m > hf || (m === hi && fechaNoLimite);
            })
          : dayRegsCalc;

    const getOrig = (tipo: string) =>
      dayRegsCalc.find((r) => r.tipo === tipo) ?? dayRegs.find((r) => r.tipo === tipo);
    /* Exibição: sempre o registro real (nunca ocultar batida existente). */
    const getDisplay = (tipo: string) => dayRegs.find((r) => r.tipo === tipo);
    const entradaR = getOrig("ENTRADA") ?? getDisplay("ENTRADA");
    const iniAlmR = getDisplay("INICIO_INTERVALO");
    const fimAlmR = getDisplay("FIM_INTERVALO");
    /* Saída exibida = real (nunca a sintetizada do marco). */
    const saidaR = getDisplay("SAIDA");

    const entrada = entradaR ? fmtHora(entradaR.dataHora) : null;
    const inicioIntervalo = iniAlmR ? fmtHora(iniAlmR.dataHora) : null;
    const fimIntervalo = fimAlmR ? fmtHora(fimAlmR.dataHora) : null;
    const saida = saidaR ? fmtHora(saidaR.dataHora) : null;
    const saidaParaStatus = saida;

    let horasMin = 0;
    let status: StatusDia;
    let obs: string | undefined;

    const obsTurnoEarly = obsForcaSemIntervalo(entradaR?.observacoes);
    const calcOpts = {
      exigirIntervalo: exigirIntervaloGlobal && !obsTurnoEarly && !semAlmocoAtestado,
      almocoMinMin: jornada.almocoMinMin ?? 60,
      almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
      almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
      horaEntrada: jornada.horaEntrada ?? "08:00",
      horaSaida: jornada.horaSaida ?? "17:00",
      toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
      toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
    };

    // Atestado parcial (matutino ou vespertino): bloqueia colunas de intervalo
    const bloquearIntervalo = !!atestadoParcial || !!obsTurnoEarly || semAlmocoAtestado;
    const dispensaSaida =
      !!atestadoParcial &&
      atestadoParcialDispensaSaida(
        atestadoParcial.horarioInicio!,
        atestadoParcial.horarioFim!,
        optsAlmocoAtestado
      );

    if (prepAtestado) {
      horasMin = calcHorasTrabalhadasMinutos(prepAtestado.registros, {
        ...calcOpts,
        agoraMin: isHoje ? hoje.getHours() * 60 + hoje.getMinutes() : undefined
      });
      const pausaSemRetorno = temSaidaParcialSemRetorno(dayRegsCalc.length ? dayRegsCalc : dayRegs);
      if (!entrada) {
        status = "PENDENTE";
      } else if (dispensaSaida) {
        status = isHoje ? "PENDENTE" : "OK";
      } else if (saida || pausaSemRetorno) {
        /* Pausa/intervalo sem retorno fecha o trecho trabalhado (saldo até o fechamento). */
        status = isHoje && !saida ? "PENDENTE" : "OK";
      } else if (isHoje) {
        status = "PENDENTE";
      } else {
        status = "FALTA";
      }
      if (!obs) {
        obs = labelAtestadoParcial(
          atestadoParcial!.horarioInicio!,
          atestadoParcial!.horarioFim!,
          atestadoParcial!.tipo
        );
      }
    } else if (entrada && (saida || saidaParaStatus)) {
      horasMin = calcHorasMinutosDia(
        dayRegsHoras.length ? dayRegsHoras : dayRegs,
        undefined,
        calcOpts
      );
      status = "OK";
    } else if (entrada && isHoje) {
      const now = hoje.getHours() * 60 + hoje.getMinutes();
      horasMin = calcHorasMinutosDia(dayRegsHoras.length ? dayRegsHoras : dayRegs, now, calcOpts);
      status = "PENDENTE";
    } else if (
      entrada &&
      (inicioIntervalo || temPausaAberta(dayRegsCalc.length ? dayRegsCalc : dayRegs))
    ) {
      /* Almoço aberto ou pausa (INTERROMPER) sem retorno: credita entrada→fechamento. */
      horasMin = calcHorasMinutosDia(
        dayRegsHoras.length ? dayRegsHoras : dayRegs,
        undefined,
        calcOpts
      );
      status = "PENDENTE";
      if (!inicioIntervalo && temPausaAberta(dayRegsCalc.length ? dayRegsCalc : dayRegs)) {
        obs = "Pausa sem retorno — saldo até o interromper expediente";
      } else if (
        inicioIntervalo &&
        temIntervaloAberto(dayRegsCalc.length ? dayRegsCalc : dayRegs)
      ) {
        obs = "Intervalo sem retorno — saldo até o início do intervalo";
      }
    } else if (entrada) {
      horasMin = 0;
      status = "FALTA";
      obs = "Apenas entrada registrada — dia considerado falta";
    } else {
      status = "PENDENTE";
    }

    horasMin = Math.max(0, horasMin);

    let jornadaMin = jornadaEsperadaMin(isoKey, jornada);
    if (atestadoParcial && prepAtestado && !fimDeSemana) {
      const jornadaRef = calcularJornadaComAtestadoParcial(
        atestadoParcial.horarioInicio!,
        atestadoParcial.horarioFim!,
        jornadaMin,
        jornada.horaEntrada ?? "08:00",
        jornada.horaSaida ?? "17:00",
        {
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
        }
      );
      if (status === "FALTA" && horasMin === 0) {
        jornadaMin = jornadaRef;
      } else {
        const saldoExpediente = calcularSaldoAtestadoParcialPorExpediente({
          horarioInicioAtestado: atestadoParcial.horarioInicio!,
          horarioFimAtestado: atestadoParcial.horarioFim!,
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          fimTrabalhoMin: prepAtestado.fimTrabalhoMin,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoMinMin: jornada.almocoMinMin ?? 60,
          toleranciaCalculoMin: jornada.toleranciaCalculoMin ?? 0,
          horaExtraLimiteMin: jornada.horaExtraLimiteAuto ?? 120
        });
        const creditoAlmoco = creditoAlmocoDireitoDoDia({
          registros: dayRegsCalc.length ? dayRegsCalc : dayRegs,
          horarioInicioAtestado: atestadoParcial.horarioInicio,
          horarioFimAtestado: atestadoParcial.horarioFim,
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
          agoraMin: isHoje ? hoje.getHours() * 60 + hoje.getMinutes() : undefined,
          exigirIntervalo: exigirIntervaloGlobal && !obsTurnoEarly && !semAlmocoAtestado
        });
        /* SaldoCell usa horas − jornada: alinha para refletir saldo por expediente + crédito almoço */
        jornadaMin = Math.max(0, horasMin - (saldoExpediente + creditoAlmoco));
      }
      if (!obs) {
        obs = labelAtestadoParcial(
          atestadoParcial.horarioInicio!,
          atestadoParcial.horarioFim!,
          atestadoParcial.tipo
        );
      }
    } else if (fimDeSemana || feriadoDia) {
      if (feriadoDia?.marcoHorario && !fimDeSemana) {
        // Feriado parcial em dia útil: proporcional simples
        jornadaMin = calcularJornadaParcialFeriado(
          feriadoDia.marcoHorario,
          feriadoDia.marcoLado,
          jornadaMin,
          jornada.horaEntrada ?? "08:00",
          jornada.horaSaida ?? "17:00"
        );
        if (!obs)
          obs = `${feriadoDia.nome} (${feriadoDia.marcoLado === "ANTES" ? "até" : "após"} ${feriadoDia.marcoHorario})`;
      } else {
        // Feriado dia todo ou fim de semana: multiplicador sobre horas trabalhadas
        const pct = feriadoDia ? mult.feriadoPct : dow === 6 ? mult.sabadoPct : mult.domingoPct;
        const tipoLabel = feriadoDia
          ? `Feriado: ${feriadoDia.nome}`
          : dow === 6
            ? "Sábado"
            : "Domingo";
        if (!obs) obs = `${tipoLabel} — banco de horas: ${pct}%`;
        jornadaMin = Math.round(horasMin * (1 - pct / 100));
      }
    }

    const observacoesDia = dayRegs.flatMap((r) => r.observacoes ?? []);
    const obsTurno = obsTurnoEarly;

    const pausas: Pausa[] = [];
    let pausaAberta: string | null = null;
    for (const r of dayRegsCalc.length ? dayRegsCalc : dayRegs) {
      if (r.tipo === "INTERROMPER_EXPEDIENTE") {
        pausaAberta = fmtHora(r.dataHora);
      } else if (r.tipo === "REINICIAR_EXPEDIENTE") {
        pausas.push({ inicio: pausaAberta ?? "—", fim: fmtHora(r.dataHora) });
        pausaAberta = null;
      }
    }
    if (pausaAberta) pausas.push({ inicio: pausaAberta, fim: null });

    const almocoCurtoDetect = !bloquearIntervalo
      ? analisarAlmocoCurto(
          dayRegsCalc.map((r) => ({
            tipo: r.tipo,
            minuto: toMin(fmtHora(r.dataHora))
          })),
          {
            almocoMinMin: jornada.almocoMinMin ?? 60,
            exigirIntervalo: exigirIntervaloGlobal && !semAlmocoAtestado
          }
        )
      : null;

    result.push({
      data: dataStr,
      diaSemana,
      entrada,
      /* Nunca apagar batida existente: só deixa null se realmente não houver registro. */
      inicioIntervalo,
      fimIntervalo,
      saida,
      pausas: pausas.length ? pausas : undefined,
      horasMin,
      jornadaMin,
      status,
      obs,
      observacoes: observacoesDia.length ? observacoesDia : undefined,
      entradaEditada: !!entradaR?.ajustado,
      inicioIntervaloEditado: !!iniAlmR?.ajustado,
      fimIntervaloEditado: !!fimAlmR?.ajustado,
      saidaEditada: !!saidaR?.ajustado,
      semIntervalo: bloquearIntervalo,
      turno: obsTurno?.turno ?? (atestadoParcial ? "ATESTADO_PARCIAL" : undefined),
      motivoSemIntervalo: atestadoParcial ? "ATESTADO_PARCIAL" : obsTurnoEarly?.motivo,
      janelaAlmoco: obsTurno?.janelaAlmoco,
      atestadoParcial: !!atestadoParcial,
      atestadoParcialHorario: atestadoParcial
        ? `${atestadoParcial.horarioInicio}–${atestadoParcial.horarioFim}`
        : undefined,
      saidaNaoAplicavel: dispensaSaida && !saida,
      almocoCurto: almocoCurtoDetect
        ? {
            inicio: fmtMinDia(almocoCurtoDetect.inicioMin),
            fimRegistrado: fmtMinDia(almocoCurtoDetect.fimRegistradoMin),
            fimReferencia: fmtMinDia(almocoCurtoDetect.fimReferenciaMin),
            minimoMin: almocoCurtoDetect.minimoMin
          }
        : undefined,
      apenasInformativo: diaInformativo
    });
  }

  return result;
}

/** Totais do período — mesma regra do rodapé da página Histórico. */
export function calcularResumoHistorico(
  dias: DiaRegistro[],
  mes: number,
  ano: number
): ResumoHistorico {
  const diasCalc = dias.filter((r) => !r.apenasInformativo);
  const horasTrabalhadasMinutos = diasCalc
    .filter((r) => r.status === "OK" || r.status === "PENDENTE")
    .reduce((s, r) => s + r.horasMin, 0);
  const horasEsperadasMinutos = diasCalc
    .filter(
      (r) =>
        r.status !== "FUTURO" &&
        r.status !== "AFASTAMENTO" &&
        r.status !== "FOLGA" &&
        r.status !== "ISENTO"
    )
    .reduce((s, r) => s + r.jornadaMin, 0);
  const saldoMinutos = horasTrabalhadasMinutos - horasEsperadasMinutos;

  return {
    mes,
    ano,
    diasTrabalhados: diasCalc.filter((r) => r.status === "OK").length,
    horasTrabalhadasMinutos,
    horasEsperadasMinutos,
    horasExtrasMinutos: Math.max(0, saldoMinutos),
    horasFaltaMinutos: Math.max(0, -saldoMinutos),
    saldoMinutos
  };
}

/** Resumo a partir de bancoPorDia (já com margem de cálculo / tolerâncias do backend). */
export function resumoFromBancoPorDia(
  bancoPorDia: NonNullable<HistoricoApiResponse["bancoPorDia"]>,
  mes: number,
  ano: number,
  saldoMesBanco?: number
): ResumoHistorico {
  const dias = Object.values(bancoPorDia);
  const horasTrabalhadasMinutos = dias.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
  const horasEsperadasMinutos = dias.reduce((s, d) => s + d.jornadaEsperadaMinutos, 0);
  const horasExtrasMinutos = dias
    .filter((d) => d.saldoDiaMinutos > 0)
    .reduce((s, d) => s + d.saldoDiaMinutos, 0);
  const horasFaltaMinutos = dias
    .filter((d) => d.saldoDiaMinutos < 0)
    .reduce((s, d) => s + Math.abs(d.saldoDiaMinutos), 0);
  const saldoMinutos =
    saldoMesBanco !== undefined && saldoMesBanco !== null
      ? saldoMesBanco
      : dias.reduce((s, d) => s + d.saldoDiaMinutos, 0);

  return {
    mes,
    ano,
    diasTrabalhados: dias.filter(
      (d) => d.horasTrabalhadasMinutos > 0 && d.observacao !== "Afastamento"
    ).length,
    horasTrabalhadasMinutos,
    horasEsperadasMinutos,
    horasExtrasMinutos,
    horasFaltaMinutos,
    saldoMinutos
  };
}

export function resumoFromHistoricoApi(
  data: HistoricoApiResponse | null | undefined,
  mes: number,
  ano: number
): ResumoHistorico {
  if (data?.bancoPorDia && Object.keys(data.bancoPorDia).length > 0) {
    return resumoFromBancoPorDia(data.bancoPorDia, mes, ano, data.saldoMesBanco);
  }
  const dias = transformarHistorico(
    data?.registros ?? [],
    data?.afastamentos ?? [],
    mes,
    ano,
    data?.feriados ?? [],
    data?.multiplicadores ?? { sabadoPct: 100, domingoPct: 200, feriadoPct: 200 },
    data?.jornada ?? JORNADA_PADRAO,
    data?.inicioAtividades ?? null,
    {
      pontoObrigatorioDesde: data?.pontoObrigatorioDesde ?? null,
      semRegistroPonto: !!data?.semRegistroPonto,
      periodosSemObrigacao: data?.periodosSemObrigacao ?? []
    }
  );
  return calcularResumoHistorico(dias, mes, ano);
}
