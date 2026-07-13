/* Transformação e resumo do histórico — mesma lógica da página /ponto/historico */

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
  /** Primeiro login no sistema (YYYY-MM-DD, Brasília). */
  inicioAtividades?: string | null;
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
  jornada: JornadaHistorico = JORNADA_PADRAO,
  inicioAtividades?: string | null,
  opts?: {
    pontoObrigatorioDesde?: string | null;
    semRegistroPonto?: boolean;
    periodosSemObrigacao?: Array<{ inicio: string; fim: string | null }>;
  }
): DiaRegistro[] {
  const hoje = new Date();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const NOMES_DIA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const result: DiaRegistro[] = [];
  const pontoObrigatorioDesde = opts?.pontoObrigatorioDesde ?? null;
  const semRegistroPonto = !!opts?.semRegistroPonto;
  const periodosSemObrigacao = opts?.periodosSemObrigacao ?? [];

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
        obs: TIPO_AFASTAMENTO_LABEL[afastamento.tipo] ?? "Afastamento justificado",
        apenasInformativo: diaInformativo
      });
      continue;
    }

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

    const get = (tipo: string) =>
      dayRegsCalc.find((r) => r.tipo === tipo) ?? dayRegs.find((r) => r.tipo === tipo);
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
      horasMin = calcHorasMinutosDia(dayRegsCalc.length ? dayRegsCalc : dayRegs);
      status = "OK";
    } else if (entrada && isHoje) {
      const now = hoje.getHours() * 60 + hoje.getMinutes();
      horasMin = calcHorasMinutosDia(dayRegsCalc.length ? dayRegsCalc : dayRegs, now);
      status = "PENDENTE";
    } else if (entrada && inicioIntervalo) {
      horasMin = calcHorasMinutosDia(dayRegsCalc.length ? dayRegsCalc : dayRegs);
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
    const obsTurno = (entradaR?.observacoes ?? []).find((o) => o.tipo === "TURNO_SEM_INTERVALO");

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
      saidaEditada: !!saidaR?.ajustado,
      semIntervalo: !!obsTurno,
      turno: obsTurno?.turno,
      motivoSemIntervalo: obsTurno?.motivo,
      janelaAlmoco: obsTurno?.janelaAlmoco,
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
