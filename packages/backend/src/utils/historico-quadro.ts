import { dataBrasiliaISO, horarioDeDataBrasilia, hojeBrasiliaISO } from "./horario-brasilia";
import {
  JornadaHistoricoContext,
  jornadaEsperadaMin,
  resolverJornadaHistoricoContexto,
  calcularJornadaParcialFeriado,
  calcularJornadaComAtestadoParcial,
  calcularSaldoAtestadoParcialPorExpediente,
  prepararRegsCalculoAtestadoParcial,
  isAfastamentoParcial,
  dispensarAlmocoPorAtestadoParcial,
  temPausaAberta,
  temSaidaParcialSemRetorno,
  creditoAlmocoDireitoDoDia
} from "./jornada-historico";
import { calcHorasTrabalhadasMinutos } from "./calc-horas-trabalhadas";
import { observacaoForcaSemIntervalo } from "./turno-entrada";
import { horarioParaMinutos } from "./horario-brasilia";

export type { JornadaHistoricoContext };
export { resolverJornadaHistoricoContexto };

export interface RegistroHistorico {
  tipo: string;
  dataHora: Date;
  observacoes?: unknown;
}

export interface AfastamentoHistorico {
  dataInicio: Date;
  dataFim: Date;
  horarioInicio?: string | null;
  horarioFim?: string | null;
  tipo?: string;
}

function labelAfastamentoParcial(a: {
  tipo?: string;
  horarioInicio?: string | null;
  horarioFim?: string | null;
}): string {
  const nome =
    a.tipo === "ABONO"
      ? "Abono parcial"
      : a.tipo === "ATESTADO"
        ? "Atestado parcial"
        : "Afastamento parcial";
  return `${nome} ${a.horarioInicio}–${a.horarioFim}`;
}

export interface FeriadoHistorico {
  data: Date;
  nome: string;
  marcoHorario?: string | null;
  marcoLado?: string | null;
}

export interface PausaPar {
  inicio: string;
  fim: string | null;
}

export type StatusDiaQuadro = "OK" | "FALTA" | "PENDENTE" | "AFASTAMENTO" | "FUTURO" | "FOLGA";

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
}

export interface RelatorioQuadroMensal {
  dias: DiaQuadroPdf[];
  diasTrabalhados: number;
  horasTrabalhadasMinutos: number;
  horasTrabalhadasFormatado: string;
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
  forcarSemIntervalo?: boolean
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
      toleranciaSaidaMin: jornada?.toleranciaEntradaMin ?? jornada?.toleranciaSaidaMin ?? 5
    }
  );
}

function afastamentoDoDia(
  isoKey: string,
  afastamentos: AfastamentoHistorico[]
): AfastamentoHistorico | undefined {
  return afastamentos.find((a) => {
    const inicio = dataBrasiliaISO(a.dataInicio);
    const fim = dataBrasiliaISO(a.dataFim);
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
      return "Pendente";
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
  opts?: { forcarSemIntervalo?: boolean }
): RelatorioQuadroMensal {
  const forcarSemIntervalo = !!opts?.forcarSemIntervalo;
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
      dataBrasiliaISO(f.data),
      { nome: f.nome, marcoHorario: f.marcoHorario, marcoLado: f.marcoLado }
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

    /* Antes do primeiro login no sistema: não conta falta nem jornada. */
    if (inicioAtividades && iso < inicioAtividades) {
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

    const afastamento = afastamentoDoDia(iso, afastamentos);
    if (afastamento && !isAfastamentoParcial(afastamento)) {
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
        statusInterno: "AFASTAMENTO"
      });
      continue;
    }

    const dayRegs = byDay.get(iso) ?? [];
    const parcial = afastamento && isAfastamentoParcial(afastamento) ? afastamento : null;
    const semAlmocoParcial = dispensarAlmocoPorAtestadoParcial(!!parcial, dayRegs, {
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
        horasMin = calcHorasMinutosDia(dayRegs, undefined, jornada, forcarSemIntervaloDia);
        statusInterno = "OK";
      } else if (entrada && isHoje) {
        horasMin = calcHorasMinutosDia(dayRegs, agoraMinBrasilia(), jornada, forcarSemIntervaloDia);
        statusInterno = "PENDENTE";
      } else if (entrada && inicioIntervalo) {
        horasMin = calcHorasMinutosDia(dayRegs, undefined, jornada, forcarSemIntervaloDia);
        statusInterno = "PENDENTE";
      } else {
        horasMin = calcHorasMinutosDia(dayRegs, undefined, jornada, forcarSemIntervaloDia);
        statusInterno = "PENDENTE";
      }
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
        multiplicadorPct: pct
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
      } else if (parcial) {
        const jornadaMin = calcularJornadaComAtestadoParcial(
          parcial.horarioInicio!,
          parcial.horarioFim!,
          {
            horaEntrada: jornada.horaEntrada ?? "08:00",
            horaSaida: jornada.horaSaida ?? "17:00",
            jornadaDiariaMin: jornadaEsperadaMin(iso, jornada),
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
          }
        );
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
          status: labelAfastamentoParcial(parcial),
          statusInterno: jornadaMin > 0 ? "FALTA" : "AFASTAMENTO"
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

    if (entrada && saida) {
      horasMin = calcHorasMinutosDia(dayRegs, undefined, jornada, forcarSemIntervaloDia);
      statusInterno = "OK";
    } else if (entrada && isHoje) {
      horasMin = calcHorasMinutosDia(dayRegs, agoraMinBrasilia(), jornada, forcarSemIntervaloDia);
      statusInterno = "PENDENTE";
    } else if (entrada && (inicioIntervalo || temPausaAberta(dayRegs))) {
      horasMin = calcHorasMinutosDia(dayRegs, undefined, jornada, forcarSemIntervaloDia);
      statusInterno = "PENDENTE";
    } else if (entrada) {
      horasMin = 0;
      statusInterno = "FALTA";
    } else {
      horasMin = calcHorasMinutosDia(dayRegs, undefined, jornada, forcarSemIntervaloDia);
      statusInterno = "PENDENTE";
    }

    horasMin = Math.max(0, horasMin);

    let saldoMin: number | null;
    let multiplicadorPct: number | undefined;
    const jornadaBase = jornadaEsperadaMin(iso, jornada);
    const jornadaMin = parcial
      ? calcularJornadaComAtestadoParcial(parcial.horarioInicio!, parcial.horarioFim!, {
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
        saldoMin = statusInterno === "FALTA" ? -jornadaMandatoria : horasMin - jornadaMandatoria;
      } else {
        // Feriado dia todo: saldo = horas * feriadoPct%
        saldoMin = Math.round((horasMin * feriadoPct) / 100);
        multiplicadorPct = feriadoPct;
      }
    } else if (parcial) {
      const regsMin = dayRegs.map((r) => ({
        tipo: r.tipo,
        minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora).substring(0, 5))
      }));
      const prep = prepararRegsCalculoAtestadoParcial({
        registros: regsMin,
        horarioInicio: parcial.horarioInicio!,
        horarioFim: parcial.horarioFim!,
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
      saldoMin = calcularSaldoAtestadoParcialPorExpediente({
        horarioInicioAtestado: parcial.horarioInicio!,
        horarioFimAtestado: parcial.horarioFim!,
        horaEntrada: jornada.horaEntrada ?? "08:00",
        horaSaida: jornada.horaSaida ?? "17:00",
        fimTrabalhoMin: prep.fimTrabalhoMin,
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoMinMin: jornada.almocoMinMin ?? 60,
        toleranciaCalculoMin:
          (jornada as { toleranciaCalculoMin?: number }).toleranciaCalculoMin ?? 0,
        horaExtraLimiteMin: 120
      });
      saldoMin += creditoAlmocoDireitoDoDia({
        registros: dayRegs,
        horarioInicioAtestado: parcial.horarioInicio,
        horarioFimAtestado: parcial.horarioFim,
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
        agoraMin: isHoje ? agoraMinBrasilia() : undefined,
        exigirIntervalo: !forcarSemIntervaloDia
      });
      if (statusInterno !== "OK" && (saida || temSaidaParcialSemRetorno(dayRegs)) && !isHoje) {
        statusInterno = "OK";
      }
    } else if (statusInterno === "FALTA") {
      saldoMin = -jornadaMin;
    } else {
      saldoMin = horasMin - jornadaMin;
      saldoMin += creditoAlmocoDireitoDoDia({
        registros: dayRegs,
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
        agoraMin: isHoje ? agoraMinBrasilia() : undefined,
        exigirIntervalo: !forcarSemIntervaloDia
      });
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
      status: parcial
        ? labelAfastamentoParcial(parcial)
        : feriadoDia
          ? feriadoDia.marcoHorario
            ? `Trabalhado (Feriado parcial: ${feriadoDia.nome})`
            : `Trabalhado (Feriado: ${feriadoDia.nome})`
          : statusPdfDe(statusInterno, false),
      statusInterno,
      multiplicadorPct
    });
  }

  const horasTrabalhadasMinutos = dias
    .filter((d) => d.statusInterno === "OK" || d.statusInterno === "PENDENTE")
    .reduce((s, d) => s + d.horasMin, 0);

  const diasTrabalhados = dias.filter((d) => d.statusInterno === "OK").length;

  const saldoMinutos = dias
    .filter((d) => d.saldoMin !== null)
    .reduce((s, d) => s + (d.saldoMin ?? 0), 0);

  return {
    dias,
    diasTrabalhados,
    horasTrabalhadasMinutos,
    horasTrabalhadasFormatado: fmtMin(horasTrabalhadasMinutos).replace(/^\+/, ""),
    saldoMinutos,
    saldoFormatado: fmtSaldoMin(saldoMinutos)
  };
}
