import { dataBrasiliaISO, horarioDeDataBrasilia, hojeBrasiliaISO } from "./horario-brasilia";

export interface RegistroHistorico {
  tipo: string;
  dataHora: Date;
}

export interface AfastamentoHistorico {
  dataInicio: Date;
  dataFim: Date;
}

export interface FeriadoHistorico {
  data: Date;
  nome: string;
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

/** Mesma regra de HistoricoPage.calcHorasMinutosDia / PontoService.calcHorasMinutos. */
function calcHorasMinutosDia(regs: RegistroHistorico[], agoraMin?: number): number {
  let total = 0;
  let entradaMin: number | null = null;
  for (const r of regs) {
    const ts = horaParaMin(horarioDeDataBrasilia(r.dataHora));
    if (r.tipo === "ENTRADA" || r.tipo === "REINICIAR_EXPEDIENTE") {
      entradaMin = ts;
    } else if (
      (r.tipo === "INICIO_INTERVALO" || r.tipo === "INTERROMPER_EXPEDIENTE") &&
      entradaMin !== null
    ) {
      total += ts - entradaMin;
      entradaMin = null;
    } else if (r.tipo === "FIM_INTERVALO") {
      entradaMin = ts;
    } else if (r.tipo === "SAIDA" && entradaMin !== null) {
      total += ts - entradaMin;
      entradaMin = null;
    }
  }
  if (entradaMin !== null && agoraMin !== undefined) {
    total += agoraMin - entradaMin;
  }
  return total;
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
      return "Folga";
  }
}

/**
 * Monta os dias do quadro com a mesma lógica da página /ponto/historico.
 * - Fins de semana sem registros → Folga.
 * - Fins de semana COM registros → status correto + saldo multiplicado (sabadoPct/domingoPct).
 * - Feriados COM registros em dia útil → saldo multiplicado (feriadoPct).
 * - Feriados em dia útil sem registros → saldo neutro (0).
 */
export function montarRelatorioQuadro(
  registros: RegistroHistorico[],
  afastamentos: AfastamentoHistorico[],
  mes: number,
  ano: number,
  jornadaHorasDia: number,
  feriados: FeriadoHistorico[] = [],
  sabadoPct = 100,
  domingoPct = 200,
  feriadoPct = 200
): RelatorioQuadroMensal {
  const jornadaMin = jornadaHorasDia * 60;
  const hojeIso = hojeBrasiliaISO();
  const [hY, hM, hD] = hojeIso.split("-").map(Number);
  const hoje = new Date(hY, hM - 1, hD);

  const byDay = new Map<string, RegistroHistorico[]>();
  for (const r of registros) {
    const key = dataBrasiliaISO(r.dataHora);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r);
  }

  const feriadoMap = new Map(feriados.map((f) => [dataBrasiliaISO(f.data), f.nome]));

  const totalDays = new Date(ano, mes, 0).getDate();
  const dias: DiaQuadroPdf[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dt = new Date(ano, mes - 1, d);
    const dow = dt.getDay();
    const fimDeSemana = dow === 0 || dow === 6;
    const isFuture = dt > hoje;
    const isHoje = iso === hojeIso;
    const nomeFeriado = feriadoMap.get(iso);

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

    const afastamento = afastamentoDoDia(iso, afastamentos);
    if (afastamento) {
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

    // Fim de semana: só aparece se tiver registros; caso contrário é Folga
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
          status: "Folga",
          statusInterno: "FOLGA"
        });
        continue;
      }
      // Fim de semana com registros: processa normalmente com multiplicador
      const pct = nomeFeriado ? feriadoPct : dow === 6 ? sabadoPct : domingoPct;
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
        horasMin = calcHorasMinutosDia(dayRegs);
        statusInterno = "OK";
      } else if (entrada && isHoje) {
        horasMin = calcHorasMinutosDia(dayRegs, agoraMinBrasilia());
        statusInterno = "PENDENTE";
      } else if (entrada && inicioIntervalo) {
        horasMin = calcHorasMinutosDia(dayRegs);
        statusInterno = "PENDENTE";
      } else {
        horasMin = calcHorasMinutosDia(dayRegs);
        statusInterno = "PENDENTE";
      }
      horasMin = Math.max(0, horasMin);
      // jornadaMin = 0 (não há jornada esperada no fim de semana); saldo = horas * multiplicador
      const saldoMin = Math.round((horasMin * pct) / 100);
      const tipoLabel = nomeFeriado ? "Feriado" : dow === 6 ? "Sábado" : "Domingo";
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
      // Feriado sem trabalho → saldo neutro (não é falta)
      if (nomeFeriado) {
        dias.push({
          iso,
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          pausas: [],
          horasMin: 0,
          horasFormatado: "—",
          saldoMin: 0,
          saldoFormatado: "—",
          status: `Feriado: ${nomeFeriado}`,
          statusInterno: "AFASTAMENTO"
        });
      } else {
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
      horasMin = calcHorasMinutosDia(dayRegs);
      statusInterno = "OK";
    } else if (entrada && isHoje) {
      horasMin = calcHorasMinutosDia(dayRegs, agoraMinBrasilia());
      statusInterno = "PENDENTE";
    } else if (entrada && inicioIntervalo) {
      horasMin = calcHorasMinutosDia(dayRegs);
      statusInterno = "PENDENTE";
    } else if (entrada) {
      horasMin = 0;
      statusInterno = "FALTA";
    } else {
      horasMin = calcHorasMinutosDia(dayRegs);
      statusInterno = "PENDENTE";
    }

    horasMin = Math.max(0, horasMin);

    // Feriado com trabalho: jornadaMin = 0, saldo = horas * feriadoPct%
    let saldoMin: number | null;
    let multiplicadorPct: number | undefined;
    if (nomeFeriado) {
      saldoMin = Math.round((horasMin * feriadoPct) / 100);
      multiplicadorPct = feriadoPct;
    } else if (statusInterno === "FALTA") {
      saldoMin = -jornadaMin;
    } else {
      saldoMin = horasMin - jornadaMin;
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
      status: nomeFeriado
        ? `Trabalhado (Feriado: ${nomeFeriado})`
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
