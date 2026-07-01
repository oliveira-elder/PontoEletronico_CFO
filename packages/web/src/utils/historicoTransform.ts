/* Transformação e resumo do histórico — mesma lógica da página /ponto/historico */

export type StatusDia =
  | "OK"
  | "FALTA"
  | "PENDENTE"
  | "AFASTAMENTO"
  | "FERIADO"
  | "FUTURO"
  | "FOLGA";

export interface ObservacaoRegistro {
  data: string;
  texto: string;
  tipo?: string;
  tipoRegistro?: string;
  horarioAnterior?: string | null;
  horarioNovo?: string;
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
}

export interface ApiRegistro {
  tipo: string;
  dataHora: string;
  ajustado?: boolean;
  observacoes?: ObservacaoRegistro[];
}

export interface ApiAfastamento {
  tipo: string;
  dataInicio: string;
  dataFim: string;
  justificativa?: string | null;
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
}

export interface HistoricoApiResponse {
  mes: number;
  ano: number;
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
  vigenciaDesde: null
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

function toMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
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

function calcHorasMinutosDia(dayRegs: ApiRegistro[], agoraMin?: number): number {
  let total = 0;
  let entradaMin: number | null = null;
  for (const r of dayRegs) {
    const ts = toMin(fmtHora(r.dataHora));
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
  jornada: JornadaHistorico = JORNADA_PADRAO
): DiaRegistro[] {
  const hoje = new Date();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const result: DiaRegistro[] = [];

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

    if (isFuture && fimDeSemana) continue;

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

    const afastamento = afastamentoDoDia(isoKey, afastamentos);
    if (afastamento) {
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
        obs: TIPO_AFASTAMENTO_LABEL[afastamento.tipo] ?? "Afastamento justificado"
      });
      continue;
    }

    if (fimDeSemana && dayRegs.length === 0) continue;

    if (!fimDeSemana && dayRegs.length === 0) {
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
            : feriadoDia.nome
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

    const get = (tipo: string) => dayRegs.find((r) => r.tipo === tipo);
    const entradaR = get("ENTRADA");
    const iniAlmR = get("INICIO_INTERVALO");
    const fimAlmR = get("FIM_INTERVALO");
    const saidaR = get("SAIDA");

    const entrada = entradaR ? fmtHora(entradaR.dataHora) : null;
    const inicioIntervalo = iniAlmR ? fmtHora(iniAlmR.dataHora) : null;
    const fimIntervalo = fimAlmR ? fmtHora(fimAlmR.dataHora) : null;
    const saida = saidaR ? fmtHora(saidaR.dataHora) : null;

    const isHoje = dt.toDateString() === hoje.toDateString();

    let horasMin = 0;
    let status: StatusDia;
    let obs: string | undefined;

    if (entrada && saida) {
      horasMin = calcHorasMinutosDia(dayRegs);
      status = "OK";
    } else if (entrada && isHoje) {
      const now = hoje.getHours() * 60 + hoje.getMinutes();
      horasMin = calcHorasMinutosDia(dayRegs, now);
      status = "PENDENTE";
    } else if (entrada && inicioIntervalo) {
      horasMin = calcHorasMinutosDia(dayRegs);
      status = "PENDENTE";
    } else if (entrada) {
      horasMin = 0;
      status = "FALTA";
      obs = "Apenas entrada registrada — dia considerado falta";
    } else {
      status = "PENDENTE";
    }

    horasMin = Math.max(0, horasMin);

    let jornadaMin = jornadaEsperadaMin(isoKey, jornada);
    if (fimDeSemana || feriadoDia) {
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

    const pausas: Pausa[] = [];
    let pausaAberta: string | null = null;
    for (const r of dayRegs) {
      if (r.tipo === "INTERROMPER_EXPEDIENTE") {
        pausaAberta = fmtHora(r.dataHora);
      } else if (r.tipo === "REINICIAR_EXPEDIENTE") {
        pausas.push({ inicio: pausaAberta ?? "—", fim: fmtHora(r.dataHora) });
        pausaAberta = null;
      }
    }
    if (pausaAberta) pausas.push({ inicio: pausaAberta, fim: null });

    result.push({
      data: dataStr,
      diaSemana,
      entrada,
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
      saidaEditada: !!saidaR?.ajustado
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
  const horasTrabalhadasMinutos = dias
    .filter((r) => r.status === "OK" || r.status === "PENDENTE")
    .reduce((s, r) => s + r.horasMin, 0);
  const horasEsperadasMinutos = dias
    .filter((r) => r.status !== "FUTURO" && r.status !== "AFASTAMENTO")
    .reduce((s, r) => s + r.jornadaMin, 0);
  const saldoMinutos = horasTrabalhadasMinutos - horasEsperadasMinutos;

  return {
    mes,
    ano,
    diasTrabalhados: dias.filter((r) => r.status === "OK").length,
    horasTrabalhadasMinutos,
    horasEsperadasMinutos,
    horasExtrasMinutos: Math.max(0, saldoMinutos),
    horasFaltaMinutos: Math.max(0, -saldoMinutos),
    saldoMinutos
  };
}

export function resumoFromHistoricoApi(
  data: HistoricoApiResponse | null | undefined,
  mes: number,
  ano: number
): ResumoHistorico {
  const dias = transformarHistorico(
    data?.registros ?? [],
    data?.afastamentos ?? [],
    mes,
    ano,
    data?.feriados ?? [],
    data?.multiplicadores ?? { sabadoPct: 100, domingoPct: 200, feriadoPct: 200 },
    data?.jornada ?? JORNADA_PADRAO
  );
  return calcularResumoHistorico(dias, mes, ano);
}
