import { parseObservacoes } from "./registro-observacoes";
import { ehDiaAbonado } from "./feriado-rotulo";
import {
  dataBrasiliaISO,
  dataCivilISO,
  dataCivilFimAfastamento,
  horarioDeDataBrasilia,
  hojeBrasiliaISO
} from "./horario-brasilia";
import {
  JornadaHistoricoContext,
  jornadaEsperadaMin,
  resolverJornadaHistoricoContexto,
  calcularJornadaParcialFeriado,
  calcularJornadaComAtestadosParciais,
  calcularJanelasEfetivasComCreditoDeslocamento,
  prepararRegsCalculoAtestadosParciais,
  isAfastamentoParcial,
  labelAtestadosParciais,
  dispensarAlmocoPorAtestadoParcial,
  temPausaAberta,
  temSaidaParcialSemRetorno,
  creditoAlmocoDireitoDoDia,
  aplicarMargemCalculoDiario
} from "./jornada-historico";
import { calcHorasTrabalhadasMinutos } from "./calc-horas-trabalhadas";
import { observacaoForcaSemIntervalo } from "./turno-entrada";
import { horarioParaMinutos } from "./horario-brasilia";
import { cicloCompleto, cicloCompletoEmCasa, textoCicloIncompleto } from "./ciclo-completo";
import type { ExigenciaCiclo } from "./ciclo-completo-presencial";

export type { JornadaHistoricoContext };
export { resolverJornadaHistoricoContexto };

export interface RegistroHistorico {
  tipo: string;
  dataHora: Date;
  observacoes?: unknown;
}

export interface AfastamentoHistorico {
  dataInicio: Date | string;
  dataFim: Date | string;
  horarioInicio?: string | null;
  horarioFim?: string | null;
  tipo?: string;
}

export interface FeriadoHistorico {
  data: Date | string;
  nome: string;
  /** "ABONO" = abono do RH (não é feriado): dia neutro, status = nome. */
  tipo?: string | null;
  marcoHorario?: string | null;
  marcoLado?: string | null;
}

export interface PausaPar {
  inicio: string;
  fim: string | null;
}

/**
 * FALTA = não houve nenhum registro no dia útil (o funcionário optou por faltar; o banco desconta).
 * INCONSISTENTE = o registro foi iniciado e não foi completado corretamente (só entrada, intervalo
 * ou pausa sem retorno, sem saída, intervalo exigido não registrado…). Impede assinar a folha.
 * PENDENTE = dia de hoje, ainda em andamento.
 */
export type StatusDiaQuadro =
  | "OK"
  | "FALTA"
  | "PENDENTE"
  | "INCONSISTENTE"
  | "AFASTAMENTO"
  | "FUTURO"
  | "FOLGA";

export interface DiaQuadroPdf {
  iso: string;
  entrada: string | null;
  inicioIntervalo: string | null;
  fimIntervalo: string | null;
  saida: string | null;
  pausas: PausaPar[];
  horasMin: number;
  horasFormatado: string;
  saldoMin: number | null;
  saldoFormatado: string;
  status: string;
  statusInterno: StatusDiaQuadro;
  /** Multiplicador aplicado ao banco de horas neste dia (ex.: 200 = dobro). 100 = normal. */
  multiplicadorPct?: number;
  /** Dia em casa sem o ciclo completo de batidas (o que falta, em texto). */
  cicloIncompleto?: string;
  /**
   * Dia útil remunerado sem batidas (atestado, férias, licença, abono, isenção/cessão): conta
   * como dia trabalhado. Falta, inconsistência, feriado e fim de semana não.
   */
  remunerado?: boolean;
  /** Correções/inclusões aprovadas nas batidas do dia (texto "alterado de X para Y"). */
  ajustes?: string[];
  /** Ajustes automáticos de almoço feitos só no cálculo (o registro não muda). */
  ajustesAlmoco?: string[];
  /** Mesmas correções, estruturadas: tipo da batida, horário anterior (null = inclusão) e novo. */
  ajustesDetalhe?: Array<{ tipoRegistro: string; anterior: string | null; novo: string }>;
  /** Hora extra creditada ao banco no dia (apuração do banco, com a regra de autorização). */
  heAutorizadaMin?: number;
  /** Hora extra apurada que não foi creditada (sem aprovação / acima do limite). */
  heNaoAutorizadaMin?: number;
  /** Débito e crédito do dia no banco de horas. */
  debitoMin?: number;
  creditoMin?: number;
}

export interface RelatorioQuadroMensal {
  dias: DiaQuadroPdf[];
  diasTrabalhados: number;
  horasTrabalhadasMinutos: number;
  horasTrabalhadasFormatado: string;
  horasEsperadasMinutos: number;
  saldoMinutos: number;
  saldoFormatado: string;
}

function fmtMin(m: number): string {
  const sign = m < 0 ? "-" : m > 0 ? "+" : "";
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}m`;
}

function fmtSaldoMin(m: number): string {
  const sign = m < 0 ? "-" : m > 0 ? "+" : "";
  const abs = Math.abs(m);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}m`;
}

function horaParaMin(horario: string): number {
  const [h, m] = horario.split(":").map(Number);
  return h * 60 + m;
}

function agoraMinBrasilia(): number {
  return horaParaMin(horarioDeDataBrasilia(new Date()));
}

/** Mesma regra de HistoricoPage / PontoService — com almoço mínimo obrigatório. */
function calcHorasMinutosDia(
  regs: RegistroHistorico[],
  agoraMin?: number,
  jornada?: JornadaHistoricoContext,
  forcarSemIntervalo?: boolean,
  ajustes?: string[]
): number {
  const entrada = regs.find((r) => r.tipo === "ENTRADA");
  return calcHorasTrabalhadasMinutos(
    regs.map((r) => ({
      tipo: r.tipo,
      minuto: horaParaMin(horarioDeDataBrasilia(r.dataHora))
    })),
    {
      agoraMin,
      exigirIntervalo: !forcarSemIntervalo && !observacaoForcaSemIntervalo(entrada?.observacoes),
      almocoMinMin: jornada?.almocoMinMin ?? 60,
      almocoPodeIniciarA: jornada?.almocoPodeIniciarA ?? "11:30",
      almocoPodeIniciarAte: jornada?.almocoPodeIniciarAte ?? "13:00",
      horaEntrada: jornada?.horaEntrada ?? "08:00",
      horaSaida: jornada?.horaSaida ?? "17:00",
      toleranciaEntradaMin: jornada?.toleranciaEntradaMin ?? 5,
      toleranciaSaidaMin: jornada?.toleranciaEntradaMin ?? jornada?.toleranciaSaidaMin ?? 5,
      ajustes
    }
  );
}

/** Correções/inclusões aprovadas das batidas do dia, estruturadas. */
function ajustesDetalheDoDia(
  regs: RegistroHistorico[]
): Array<{ tipoRegistro: string; anterior: string | null; novo: string }> {
  const out: Array<{ tipoRegistro: string; anterior: string | null; novo: string }> = [];
  for (const r of regs) {
    for (const o of parseObservacoes(r.observacoes)) {
      if ((o.tipo === "AJUSTE_HORARIO" || o.tipo === "INCLUSAO_PONTO") && o.horarioNovo) {
        out.push({
          tipoRegistro: o.tipoRegistro ?? r.tipo,
          anterior: o.horarioAnterior ?? null,
          novo: o.horarioNovo
        });
      }
    }
  }
  return out;
}

/** Textos das correções/inclusões aprovadas registradas nas batidas do dia. */
function ajustesDoDia(regs: RegistroHistorico[]): string[] {
  const out: string[] = [];
  for (const r of regs) {
    for (const o of parseObservacoes(r.observacoes)) {
      if ((o.tipo === "AJUSTE_HORARIO" || o.tipo === "INCLUSAO_PONTO") && o.texto) {
        out.push(o.texto);
      }
    }
  }
  return [...new Set(out)];
}

function afastamentosDoDia(
  isoKey: string,
  afastamentos: AfastamentoHistorico[]
): AfastamentoHistorico[] {
  return afastamentos.filter((a) => {
    const inicio = dataBrasiliaISO(a.dataInicio);
    const fim = dataCivilFimAfastamento(a.dataInicio, a.dataFim);
    return isoKey >= inicio && isoKey <= fim;
  });
}

function extrairPausas(regs: RegistroHistorico[]): PausaPar[] {
  const pausas: PausaPar[] = [];
  let pausaAberta: string | null = null;
  for (const r of regs) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") {
      pausaAberta = horarioDeDataBrasilia(r.dataHora);
    } else if (r.tipo === "REINICIAR_EXPEDIENTE") {
      pausas.push({ inicio: pausaAberta ?? "—", fim: horarioDeDataBrasilia(r.dataHora) });
      pausaAberta = null;
    }
  }
  if (pausaAberta) pausas.push({ inicio: pausaAberta, fim: null });
  return pausas;
}

function statusPdfDe(status: StatusDiaQuadro, semRegistros: boolean): string {
  switch (status) {
    case "OK":
      return "Trabalhado";
    case "PENDENTE":
      return "Em andamento";
    case "INCONSISTENTE":
      return "Inconsistente";
    case "FALTA":
      return semRegistros ? "Sem registro" : "Falta";
    case "AFASTAMENTO":
      return "Afastamento";
    case "FUTURO":
      return "—";
    case "FOLGA":
      return "Sem Expediente";
  }
}

/**
 * Monta os dias do quadro com a mesma lógica da página /ponto/historico.
 * - Fins de semana sem registros → Sem Expediente.
 * - Fins de semana COM registros → status correto + saldo multiplicado (sabadoPct/domingoPct).
 * - Feriados COM registros em dia útil → saldo multiplicado (feriadoPct).
 * - Feriados em dia útil sem registros → saldo neutro (0).
 */
/**
 * ÚNICA regra de "dias trabalhados" do sistema (modal de assinatura, folha, PDF, relatórios e
 * PeriodoPonto): conta o dia com situação OK (inclui atestado parcial com horas trabalhadas) e
 * o dia útil remunerado sem batidas (atestado, férias, licença, abono, isenção/cessão).
 * Não contam: falta, inconsistente, em andamento, feriado, fim de semana e folga.
 */
export function contarDiasTrabalhados(
  dias: Array<{ statusInterno: string; remunerado?: boolean }>
): number {
  return dias.filter((d) => d.statusInterno === "OK" || d.remunerado === true).length;
}

export function montarRelatorioQuadro(
  registros: RegistroHistorico[],
  afastamentos: AfastamentoHistorico[],
  mes: number,
  ano: number,
  jornada: JornadaHistoricoContext,
  feriados: FeriadoHistorico[] = [],
  sabadoPct = 100,
  domingoPct = 200,
  feriadoPct = 200,
  inicioAtividades?: string | null,
  opts?: {
    forcarSemIntervalo?: boolean;
    /** Dias em casa que exigem o ciclo completo de batidas para serem "OK". */
    diasCicloCompletoEmCasa?: string[];
    /** Ponto presencial: dias que exigem o ciclo (e o tipo de intervalo) pela jornada, com a lei. */
    exigenciasCicloPresencial?: Record<string, ExigenciaCiclo>;
    /** Dia sem obrigação de ponto (cessão/isenção): devolve o rótulo, ou null. */
    diaNeutro?: (iso: string) => string | null;
    /** Rótulo "Home Office"/"Híbrido" por dia (só quando bateu em casa). */
    rotuloModalidadePorDia?: Record<string, string>;
  }
): RelatorioQuadroMensal {
  const forcarSemIntervalo = !!opts?.forcarSemIntervalo;
  const exigeCiclo = new Set(opts?.diasCicloCompletoEmCasa ?? []);
  /* Dia em casa com as batidas incompletas deixa de ser OK (fica Pendente até regularizar). */
  const aplicarCiclo = (
    iso: string,
    regs: RegistroHistorico[],
    status: StatusDiaQuadro,
    semIntervalo: boolean
  ): { status: StatusDiaQuadro; cicloIncompleto?: string } => {
    if (status !== "OK" || !exigeCiclo.has(iso)) return { status };
    const r = cicloCompletoEmCasa(regs, { semIntervalo });
    return r.completo
      ? { status }
      : { status: "INCONSISTENTE", cicloIncompleto: textoCicloIncompleto(r.faltas) };
  };
  const exigePresencial = opts?.exigenciasCicloPresencial ?? {};
  /* Presencial: o dia só é OK com o intervalo que a jornada exige (almoço, ou almoço/pausa na
     jornada curta e no turno que começa após a janela). Atestado que cobre o almoço e feriado
     parcial dispensam. O intervalo automático do registro não conta como batida real. */
  const aplicarCicloPresencial = (
    iso: string,
    regs: RegistroHistorico[],
    status: StatusDiaQuadro,
    dispensado: boolean,
    turnoSemIntervalo: boolean
  ): { status: StatusDiaQuadro; cicloIncompleto?: string } => {
    const ex = exigePresencial[iso];
    if (status !== "OK" || !ex || dispensado) return { status };
    const r = cicloCompleto(regs, {
      modoIntervalo: turnoSemIntervalo ? "ALMOCO_OU_PAUSA" : ex.modo
    });
    return r.completo
      ? { status }
      : { status: "INCONSISTENTE", cicloIncompleto: textoCicloIncompleto(r.faltas, false) };
  };
  const hojeIso = hojeBrasiliaISO();
  const [hY, hM, hD] = hojeIso.split("-").map(Number);
  const hoje = new Date(hY, hM - 1, hD);

  const byDay = new Map<string, RegistroHistorico[]>();
  for (const r of registros) {
    const key = dataBrasiliaISO(r.dataHora);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r);
  }

  const feriadoMap = new Map(
    feriados.map((f) => [
      dataCivilISO(f.data),
      {
        nome: f.nome,
        abono: ehDiaAbonado(f),
        marcoHorario: f.marcoHorario,
        marcoLado: f.marcoLado
      }
    ])
  );

  const totalDays = new Date(ano, mes, 0).getDate();
  const dias: DiaQuadroPdf[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dt = new Date(ano, mes - 1, d);
    const dow = dt.getDay();
    const fimDeSemana = dow === 0 || dow === 6;
    const isFuture = dt > hoje;
    const isHoje = iso === hojeIso;
    const feriadoDia = feriadoMap.get(iso);
    const dayRegs = byDay.get(iso) ?? [];
    /* Ajustes automáticos de almoço feitos só no cálculo (vão para "Ocorrências do período"). */
    const ajustesAlmocoDia: string[] = [];
    /* Dia de expediente da jornada (não é fim de semana/folga nem feriado). */
    const diaUtilRemunerado = !fimDeSemana && jornadaEsperadaMin(iso, jornada) > 0 && !feriadoDia;

    if (isFuture) {
      dias.push({
        iso,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        pausas: [],
        horasMin: 0,
        horasFormatado: "—",
        saldoMin: null,
        saldoFormatado: "—",
        status: "—",
        statusInterno: "FUTURO"
      });
      continue;
    }

    /* Antes do primeiro login: não conta falta. Se houver batidas, conta presença. */
    if (inicioAtividades && iso < inicioAtividades && dayRegs.length === 0) {
      dias.push({
        iso,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        pausas: [],
        horasMin: 0,
        horasFormatado: "—",
        saldoMin: null,
        saldoFormatado: "—",
        status: "—",
        statusInterno: "FOLGA"
      });
      continue;
    }

    /* Cessão / período isento: dia neutro, sem falta nem saldo (mesma regra do banco). */
    const rotuloNeutro = opts?.diaNeutro?.(iso) ?? null;
    if (rotuloNeutro && !(fimDeSemana && dayRegs.length === 0)) {
      dias.push({
        iso,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        pausas: [],
        horasMin: 0,
        horasFormatado: "—",
        saldoMin: null,
        saldoFormatado: "—",
        status: rotuloNeutro,
        statusInterno: "AFASTAMENTO",
        remunerado: diaUtilRemunerado
      });
      continue;
    }

    const afastamentosDia = afastamentosDoDia(iso, afastamentos);
    const afastamentoIntegral = afastamentosDia.find((a) => !isAfastamentoParcial(a));
    if (afastamentoIntegral) {
      dias.push({
        iso,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        pausas: [],
        horasMin: 0,
        horasFormatado: "—",
        saldoMin: null,
        saldoFormatado: "—",
        status: "Afastamento",
        statusInterno: "AFASTAMENTO",
        /* Falta injustificada não é remunerada. */
        remunerado: diaUtilRemunerado && afastamentoIntegral.tipo !== "FALTA_INJUSTIFICADA"
      });
      continue;
    }

    /* Abono do RH: dia neutro (mesmo com batidas) e status = nome cadastrado. */
    if (feriadoDia?.abono) {
      dias.push({
        iso,
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        pausas: [],
        horasMin: 0,
        horasFormatado: "—",
        saldoMin: null,
        saldoFormatado: "—",
        status: feriadoDia.nome,
        statusInterno: "AFASTAMENTO",
        remunerado: !fimDeSemana && jornadaEsperadaMin(iso, jornada) > 0
      });
      continue;
    }

    const parciais = afastamentosDia.filter(isAfastamentoParcial);
    const parcial = parciais[0] ?? null;
    const janelasParciais = parciais.map((p) => ({
      horarioInicio: p.horarioInicio!,
      horarioFim: p.horarioFim!
    }));
    const semAlmocoParcial = dispensarAlmocoPorAtestadoParcial(parciais.length > 0, dayRegs, {
      horarioInicio: parcial?.horarioInicio,
      horarioFim: parcial?.horarioFim,
      almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
      almocoMinMin: jornada.almocoMinMin ?? 60,
      almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
    });
    const forcarSemIntervaloDia = forcarSemIntervalo || semAlmocoParcial;

    // Fim de semana: só aparece se tiver registros; caso contrário é Sem Expediente
    if (fimDeSemana) {
      if (dayRegs.length === 0) {
        dias.push({
          iso,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          pausas: [],
          horasMin: 0,
          horasFormatado: "—",
          saldoMin: null,
          saldoFormatado: "—",
          status: "Sem Expediente",
          statusInterno: "FOLGA"
        });
        continue;
      }
      // Fim de semana com registros: processa normalmente com multiplicador
      const pct = feriadoDia ? feriadoPct : dow === 6 ? sabadoPct : domingoPct;
      const get = (tipo: string) => dayRegs.find((r) => r.tipo === tipo);
      const entradaR = get("ENTRADA");
      const iniAlmR = get("INICIO_INTERVALO");
      const fimAlmR = get("FIM_INTERVALO");
      const saidaR = get("SAIDA");
      const entrada = entradaR ? horarioDeDataBrasilia(entradaR.dataHora) : null;
      const inicioIntervalo = iniAlmR ? horarioDeDataBrasilia(iniAlmR.dataHora) : null;
      const fimIntervalo = fimAlmR ? horarioDeDataBrasilia(fimAlmR.dataHora) : null;
      const saida = saidaR ? horarioDeDataBrasilia(saidaR.dataHora) : null;
      const pausas = extrairPausas(dayRegs);
      let horasMin = 0;
      let statusInterno: StatusDiaQuadro;
      if (entrada && saida) {
        horasMin = calcHorasMinutosDia(
          dayRegs,
          undefined,
          jornada,
          forcarSemIntervaloDia,
          ajustesAlmocoDia
        );
        statusInterno = "OK";
      } else if (entrada && isHoje) {
        horasMin = calcHorasMinutosDia(
          dayRegs,
          agoraMinBrasilia(),
          jornada,
          forcarSemIntervaloDia,
          ajustesAlmocoDia
        );
        statusInterno = "PENDENTE";
      } else if (entrada && inicioIntervalo) {
        horasMin = calcHorasMinutosDia(
          dayRegs,
          undefined,
          jornada,
          forcarSemIntervaloDia,
          ajustesAlmocoDia
        );
        statusInterno = "INCONSISTENTE";
      } else {
        horasMin = calcHorasMinutosDia(
          dayRegs,
          undefined,
          jornada,
          forcarSemIntervaloDia,
          ajustesAlmocoDia
        );
        statusInterno = isHoje ? "PENDENTE" : "INCONSISTENTE";
      }
      const cicloFds = aplicarCiclo(
        iso,
        dayRegs,
        statusInterno,
        forcarSemIntervaloDia || !!feriadoDia?.marcoHorario
      );
      statusInterno = cicloFds.status;
      horasMin = Math.max(0, horasMin);
      // jornadaMin = 0 (não há jornada esperada no fim de semana); saldo = horas * multiplicador
      const saldoMin = Math.round((horasMin * pct) / 100);
      const tipoLabel = feriadoDia ? "Feriado" : dow === 6 ? "Sábado" : "Domingo";
      dias.push({
        iso,
        entrada,
        inicioIntervalo,
        fimIntervalo,
        saida,
        pausas,
        horasMin,
        horasFormatado: fmtMin(horasMin).replace(/^\+/, ""),
        saldoMin,
        saldoFormatado: fmtSaldoMin(saldoMin),
        status: `Trabalhado (${tipoLabel})`,
        statusInterno,
        multiplicadorPct: pct,
        ...(ajustesAlmocoDia.length ? { ajustesAlmoco: [...new Set(ajustesAlmocoDia)] } : {}),
        ...(cicloFds.cicloIncompleto ? { cicloIncompleto: cicloFds.cicloIncompleto } : {})
      });
      continue;
    }

    // Dia útil sem registros
    if (dayRegs.length === 0) {
      // Feriado sem trabalho
      if (feriadoDia) {
        const jornadaMandatoria = feriadoDia.marcoHorario
          ? calcularJornadaParcialFeriado(feriadoDia.marcoHorario, feriadoDia.marcoLado, {
              horaEntrada: jornada.horaEntrada ?? "08:00",
              horaSaida: jornada.horaSaida ?? "17:00",
              jornadaDiariaMin: jornadaEsperadaMin(iso, jornada)
            })
          : 0;
        dias.push({
          iso,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          pausas: [],
          horasMin: 0,
          horasFormatado: "—",
          saldoMin: -jornadaMandatoria,
          saldoFormatado: jornadaMandatoria === 0 ? "—" : fmtSaldoMin(-jornadaMandatoria),
          status: feriadoDia.marcoHorario
            ? `Feriado parcial: ${feriadoDia.nome} (${feriadoDia.marcoLado === "ANTES" ? "até" : "após"} ${feriadoDia.marcoHorario})`
            : `Feriado: ${feriadoDia.nome}`,
          statusInterno: jornadaMandatoria > 0 ? "FALTA" : "AFASTAMENTO"
        });
      } else if (parciais.length > 0) {
        const jornadaMin = calcularJornadaComAtestadosParciais(janelasParciais, {
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          jornadaDiariaMin: jornadaEsperadaMin(iso, jornada),
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
        });
        dias.push({
          iso,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          pausas: [],
          horasMin: 0,
          horasFormatado: "0h00m",
          saldoMin: -jornadaMin,
          saldoFormatado: jornadaMin === 0 ? "—" : fmtSaldoMin(-jornadaMin),
          status: labelAtestadosParciais(parciais),
          statusInterno: jornadaMin > 0 ? "FALTA" : "AFASTAMENTO",
          remunerado: jornadaMin === 0 && diaUtilRemunerado
        });
      } else {
        const jornadaMin = jornadaEsperadaMin(iso, jornada);
        dias.push({
          iso,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          pausas: [],
          horasMin: 0,
          horasFormatado: "0h00m",
          saldoMin: -jornadaMin,
          saldoFormatado: fmtSaldoMin(-jornadaMin),
          status: "Sem registro",
          statusInterno: "FALTA"
        });
      }
      continue;
    }

    // Dia útil com registros
    const get = (tipo: string) => dayRegs.find((r) => r.tipo === tipo);
    const entradaR = get("ENTRADA");
    const iniAlmR = get("INICIO_INTERVALO");
    const fimAlmR = get("FIM_INTERVALO");
    const saidaR = get("SAIDA");

    const entrada = entradaR ? horarioDeDataBrasilia(entradaR.dataHora) : null;
    const inicioIntervalo = iniAlmR ? horarioDeDataBrasilia(iniAlmR.dataHora) : null;
    const fimIntervalo = fimAlmR ? horarioDeDataBrasilia(fimAlmR.dataHora) : null;
    const saida = saidaR ? horarioDeDataBrasilia(saidaR.dataHora) : null;
    const pausas = extrairPausas(dayRegs);

    let horasMin = 0;
    let statusInterno: StatusDiaQuadro;
    let saldoComoFalta = false;

    if (entrada && saida) {
      horasMin = calcHorasMinutosDia(
        dayRegs,
        undefined,
        jornada,
        forcarSemIntervaloDia,
        ajustesAlmocoDia
      );
      statusInterno = "OK";
    } else if (entrada && isHoje) {
      horasMin = calcHorasMinutosDia(
        dayRegs,
        agoraMinBrasilia(),
        jornada,
        forcarSemIntervaloDia,
        ajustesAlmocoDia
      );
      statusInterno = "PENDENTE";
    } else if (entrada && (inicioIntervalo || temPausaAberta(dayRegs))) {
      horasMin = calcHorasMinutosDia(
        dayRegs,
        undefined,
        jornada,
        forcarSemIntervaloDia,
        ajustesAlmocoDia
      );
      statusInterno = "INCONSISTENTE";
    } else if (entrada) {
      /* Só a entrada, em dia passado: registro iniciado e não concluído. O saldo continua
         descontando a jornada (como a falta), mas o status é Inconsistente. */
      horasMin =
        dayRegs.length > 1
          ? /* Há outras batidas (ex.: pausa/retorno sem saída): conta o trabalho comprovado, como o Banco. */
            calcHorasMinutosDia(
              dayRegs,
              undefined,
              jornada,
              forcarSemIntervaloDia,
              ajustesAlmocoDia
            )
          : 0;
      statusInterno = "INCONSISTENTE";
      saldoComoFalta = true;
    } else {
      horasMin = calcHorasMinutosDia(
        dayRegs,
        undefined,
        jornada,
        forcarSemIntervaloDia,
        ajustesAlmocoDia
      );
      statusInterno = isHoje ? "PENDENTE" : "INCONSISTENTE";
    }
    const cicloDia = aplicarCiclo(
      iso,
      dayRegs,
      statusInterno,
      forcarSemIntervaloDia || !!feriadoDia?.marcoHorario
    );
    statusInterno = cicloDia.status;
    const cicloPres = aplicarCicloPresencial(
      iso,
      dayRegs,
      statusInterno,
      semAlmocoParcial || !!feriadoDia?.marcoHorario,
      !!observacaoForcaSemIntervalo(dayRegs.find((r) => r.tipo === "ENTRADA")?.observacoes)
    );
    statusInterno = cicloPres.status;

    horasMin = Math.max(0, horasMin);

    let saldoMin: number | null;
    let multiplicadorPct: number | undefined;
    const jornadaBase = jornadaEsperadaMin(iso, jornada);
    const regsMinParaCredito =
      parciais.length > 0
        ? dayRegs.map((r) => ({
            tipo: r.tipo,
            minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora).substring(0, 5))
          }))
        : [];
    const janelasEfetivasParciais =
      parciais.length > 0
        ? calcularJanelasEfetivasComCreditoDeslocamento(janelasParciais, regsMinParaCredito, {
            toleranciaRetornoMin: jornada.atestadoTempoRetornoMin ?? 60,
            toleranciaIdaMin: jornada.atestadoTempoIdaMin ?? 60,
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA,
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte
          })
        : janelasParciais;
    const jornadaMin =
      parciais.length > 0
        ? calcularJornadaComAtestadosParciais(janelasEfetivasParciais, {
            horaEntrada: jornada.horaEntrada ?? "08:00",
            horaSaida: jornada.horaSaida ?? "17:00",
            jornadaDiariaMin: jornadaBase,
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
          })
        : jornadaBase;
    if (feriadoDia) {
      if (feriadoDia.marcoHorario) {
        // Feriado parcial: proporcional simples
        const jornadaMandatoria = calcularJornadaParcialFeriado(
          feriadoDia.marcoHorario,
          feriadoDia.marcoLado,
          {
            horaEntrada: jornada.horaEntrada ?? "08:00",
            horaSaida: jornada.horaSaida ?? "17:00",
            jornadaDiariaMin: jornadaBase
          }
        );
        saldoMin =
          statusInterno === "FALTA" || saldoComoFalta
            ? -jornadaMandatoria
            : horasMin - jornadaMandatoria;
      } else {
        // Feriado dia todo: saldo = horas * feriadoPct%
        saldoMin = Math.round((horasMin * feriadoPct) / 100);
        multiplicadorPct = feriadoPct;
      }
    } else if (parciais.length > 0) {
      const prep = prepararRegsCalculoAtestadosParciais({
        registros: regsMinParaCredito,
        janelas: janelasParciais,
        horaEntrada: jornada.horaEntrada ?? "08:00",
        horaSaida: jornada.horaSaida ?? "17:00",
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
        fecharVespertinoNoMarco: iso < hojeBrasiliaISO()
      });
      horasMin = calcHorasTrabalhadasMinutos(prep.registros, {
        exigirIntervalo: !prep.semAlmoco,
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
        horaEntrada: jornada.horaEntrada ?? "08:00",
        horaSaida: jornada.horaSaida ?? "17:00",
        toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
        toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
      });
      /* Saldo = horas − jornada abonada pelo período solicitado (ex.: 08:00–09:30). */
      saldoMin = aplicarMargemCalculoDiario(
        horasMin - jornadaMin,
        (jornada as { toleranciaCalculoMin?: number }).toleranciaCalculoMin ?? 0
      );
      saldoMin += creditoAlmocoDireitoDoDia({
        registros: dayRegs,
        horarioInicioAtestado: parcial?.horarioInicio,
        horarioFimAtestado: parcial?.horarioFim,
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
        agoraMin: isHoje ? agoraMinBrasilia() : undefined,
        exigirIntervalo: !forcarSemIntervaloDia
      });
      if (statusInterno !== "OK" && (saida || temSaidaParcialSemRetorno(dayRegs)) && !isHoje) {
        statusInterno = "OK";
      }
    } else if (statusInterno === "FALTA" || saldoComoFalta) {
      saldoMin = -jornadaMin;
    } else {
      saldoMin = horasMin - jornadaMin;
      const creditoAlmoco = creditoAlmocoDireitoDoDia({
        registros: dayRegs,
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
        agoraMin: isHoje ? agoraMinBrasilia() : undefined,
        exigirIntervalo: !forcarSemIntervaloDia
      });
      saldoMin += creditoAlmoco;
      if (creditoAlmoco > 0) {
        ajustesAlmocoDia.push(
          `Crédito de ${Math.floor(creditoAlmoco / 60)}h${String(creditoAlmoco % 60).padStart(2, "0")} de almoço não usufruído (pausa/atestado)`
        );
      }
    }

    dias.push({
      iso,
      entrada,
      inicioIntervalo,
      fimIntervalo,
      saida,
      pausas,
      horasMin,
      horasFormatado: fmtMin(horasMin).replace(/^\+/, ""),
      saldoMin,
      saldoFormatado: saldoMin === null ? "—" : fmtSaldoMin(saldoMin),
      status:
        parciais.length > 0
          ? labelAtestadosParciais(parciais)
          : feriadoDia
            ? feriadoDia.marcoHorario
              ? `Trabalhado (Feriado parcial: ${feriadoDia.nome})`
              : `Trabalhado (Feriado: ${feriadoDia.nome})`
            : statusInterno === "OK" && opts?.rotuloModalidadePorDia?.[iso]
              ? `${statusPdfDe(statusInterno, false)} - ${opts.rotuloModalidadePorDia[iso]}`
              : statusPdfDe(statusInterno, false),
      statusInterno,
      multiplicadorPct,
      ...(ajustesAlmocoDia.length ? { ajustesAlmoco: [...new Set(ajustesAlmocoDia)] } : {}),
      ...(ajustesDoDia(dayRegs).length
        ? { ajustes: ajustesDoDia(dayRegs), ajustesDetalhe: ajustesDetalheDoDia(dayRegs) }
        : {}),
      ...(cicloDia.cicloIncompleto || cicloPres.cicloIncompleto
        ? { cicloIncompleto: cicloDia.cicloIncompleto ?? cicloPres.cicloIncompleto }
        : {})
    });
  }

  const horasTrabalhadasMinutos = dias
    .filter((d) => ["OK", "PENDENTE", "INCONSISTENTE"].includes(d.statusInterno))
    .reduce((s, d) => s + d.horasMin, 0);

  const diasTrabalhados = contarDiasTrabalhados(dias);

  const horasEsperadasMinutos = dias.reduce((s, d) => {
    if (d.statusInterno === "FUTURO" || d.statusInterno === "FOLGA") return s;
    if (d.statusInterno === "AFASTAMENTO") return s;
    if (d.multiplicadorPct && d.multiplicadorPct !== 100) return s;
    if (d.saldoMin === null) return s;
    return s + Math.max(0, d.horasMin - d.saldoMin);
  }, 0);

  const saldoMinutos = dias
    .filter((d) => d.saldoMin !== null)
    .reduce((s, d) => s + (d.saldoMin ?? 0), 0);

  return {
    dias,
    diasTrabalhados,
    horasTrabalhadasMinutos,
    horasTrabalhadasFormatado: fmtMin(horasTrabalhadasMinutos).replace(/^\+/, ""),
    horasEsperadasMinutos,
    saldoMinutos,
    saldoFormatado: fmtSaldoMin(saldoMinutos)
  };
}
