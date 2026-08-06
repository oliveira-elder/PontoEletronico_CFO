/**
 * (espelho da regra do backend/shared — sem CJS no Vite)
 *
 * Cálculo de minutos trabalhados com intervalo de almoço mínimo obrigatório
 * e tolerância simétrica de entrada/saída (apenas no cálculo; horário exibido permanece real).
 *
 * Regra: em jornadas com intervalo, o almoço tem duração mínima `almocoMinMin`
 * (padrão 60), contada a partir do INÍCIO_INTERVALO registrado. Se o funcionário
 * retornar antes (FIM_INTERVALO antecipado), o horário registrado é preservado
 * na tela, mas o cálculo retoma o expediente só em início + almocoMinMin.
 * Excesso de almoço até `almocoMinMin + toleranciaEntradaMin` também conta como mínimo.
 */

export type RegistroMinuto = { tipo: string; minuto: number };

export interface CalcHorasOpts {
  /** Minuto do dia (0–1439) para fechar trecho aberto no dia corrente. */
  agoraMin?: number;
  /** Duração mínima de almoço em minutos. Padrão 60. */
  almocoMinMin?: number;
  /**
   * Se false, não exige nem força dedução de almoço
   * (estagiário / menor aprendiz / turno vespertino-noturno).
   */
  exigirIntervalo?: boolean;
  /** Início da janela de almoço (HH:MM). Padrão 11:30. */
  almocoPodeIniciarA?: string;
  /** Fim da janela de almoço (HH:MM). Padrão 13:00. */
  almocoPodeIniciarAte?: string;
  /** Horário nominal de entrada (HH:MM) para snap simétrico. */
  horaEntrada?: string;
  /** Horário nominal de saída (HH:MM) para snap simétrico. */
  horaSaida?: string;
  /**
   * Tolerância simétrica de entrada (±N) e excesso de almoço (até mín+N).
   * INTERROMPER/REINICIAR não usam esta tolerância.
   */
  toleranciaEntradaMin?: number;
  /** Tolerância simétrica de saída (±N em torno de horaSaida). */
  toleranciaSaidaMin?: number;
}

export interface AlmocoCurtoInfo {
  inicioMin: number;
  fimRegistradoMin: number;
  fimReferenciaMin: number;
  minimoMin: number;
}

function horaParaMinutos(horario: string): number {
  const [h, m] = horario.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Se |minuto - nominal| ≤ tolerância, retorna o nominal; senão o minuto real. */
function snapDentroTolerancia(
  minuto: number,
  nominalHhMm: string | undefined,
  toleranciaMin: number | undefined
): number {
  const tol = Math.max(0, Number(toleranciaMin) || 0);
  if (!nominalHhMm || tol <= 0) return minuto;
  const nominal = horaParaMinutos(nominalHhMm);
  return Math.abs(minuto - nominal) <= tol ? nominal : minuto;
}

/**
 * Detecta almoço registrado com duração inferior ao mínimo configurado.
 * Usado para ícone/informativo na UI (horário exibido ≠ referência de cálculo).
 */
export function analisarAlmocoCurto(
  registros: RegistroMinuto[],
  opts: { almocoMinMin?: number; exigirIntervalo?: boolean } = {}
): AlmocoCurtoInfo | null {
  if (opts.exigirIntervalo === false) return null;
  const almocoMinMin = Math.max(0, opts.almocoMinMin ?? 60);
  if (almocoMinMin <= 0) return null;

  let emAlmocoDesde: number | null = null;
  for (const r of registros) {
    if (r.tipo === "INICIO_INTERVALO") {
      emAlmocoDesde = r.minuto;
    } else if (r.tipo === "FIM_INTERVALO" && emAlmocoDesde !== null) {
      const duracao = r.minuto - emAlmocoDesde;
      if (duracao >= 0 && duracao < almocoMinMin) {
        return {
          inicioMin: emAlmocoDesde,
          fimRegistradoMin: r.minuto,
          fimReferenciaMin: emAlmocoDesde + almocoMinMin,
          minimoMin: almocoMinMin
        };
      }
      emAlmocoDesde = null;
    } else if (r.tipo === "ENTRADA" || r.tipo === "SAIDA" || r.tipo === "REINICIAR_EXPEDIENTE") {
      emAlmocoDesde = null;
    }
  }
  return null;
}

/**
 * Soma minutos efetivamente trabalhados a partir dos registros do dia.
 */
export function calcHorasTrabalhadasMinutos(
  registros: RegistroMinuto[],
  opts: CalcHorasOpts = {}
): number {
  const almocoMinMin = Math.max(0, opts.almocoMinMin ?? 60);
  const exigirIntervalo = opts.exigirIntervalo !== false;
  const janelaAlmocoMin = horaParaMinutos(opts.almocoPodeIniciarA ?? "11:30");
  const fimJanelaAlmocoMin = horaParaMinutos(opts.almocoPodeIniciarAte ?? "13:00");
  const tolEntrada = Math.max(0, Number(opts.toleranciaEntradaMin) || 0);
  const almocoTolMax = almocoMinMin + tolEntrada;

  let total = 0;
  let entradaMin: number | null = null;
  let emAlmocoDesde: number | null = null;
  let minutosAlmocoRegistrados = 0;
  let ultrapassouJanelaAlmoco = false;
  let houveEntrada = false;

  const marcarJanela = (ts: number) => {
    if (ts >= janelaAlmocoMin) ultrapassouJanelaAlmoco = true;
  };

  for (const r of registros) {
    const ts = r.minuto;
    if (r.tipo === "ENTRADA") {
      houveEntrada = true;
      /* Snap simétrico só na ENTRADA (início de jornada), não em REINICIAR. */
      entradaMin = snapDentroTolerancia(ts, opts.horaEntrada, opts.toleranciaEntradaMin);
      emAlmocoDesde = null;
      marcarJanela(ts);
    } else if (r.tipo === "REINICIAR_EXPEDIENTE") {
      houveEntrada = true;
      entradaMin = ts;
      emAlmocoDesde = null;
      marcarJanela(ts);
    } else if (r.tipo === "INICIO_INTERVALO" && entradaMin !== null) {
      total += ts - entradaMin;
      entradaMin = null;
      emAlmocoDesde = ts;
      marcarJanela(ts);
    } else if (r.tipo === "INTERROMPER_EXPEDIENTE" && entradaMin !== null) {
      total += ts - entradaMin;
      entradaMin = null;
      marcarJanela(ts);
    } else if (r.tipo === "FIM_INTERVALO") {
      if (emAlmocoDesde !== null) {
        const duracaoReg = Math.max(0, ts - emAlmocoDesde);
        if (exigirIntervalo && almocoMinMin > 0 && duracaoReg < almocoMinMin) {
          /* Fim antecipado: mantém horário na tela, mas o cálculo usa início+mínimo. */
          minutosAlmocoRegistrados += almocoMinMin;
          entradaMin = emAlmocoDesde + almocoMinMin;
        } else if (
          exigirIntervalo &&
          almocoMinMin > 0 &&
          tolEntrada > 0 &&
          duracaoReg <= almocoTolMax
        ) {
          /* Excesso dentro da tolerância de entrada (mesmo N): conta como mínimo. */
          minutosAlmocoRegistrados += almocoMinMin;
          entradaMin = emAlmocoDesde + almocoMinMin;
        } else {
          minutosAlmocoRegistrados += duracaoReg;
          entradaMin = ts;
        }
        emAlmocoDesde = null;
      } else {
        entradaMin = ts;
      }
      marcarJanela(ts);
    } else if (r.tipo === "SAIDA") {
      const saidaCalc = snapDentroTolerancia(ts, opts.horaSaida, opts.toleranciaSaidaMin);
      marcarJanela(ts);
      if (emAlmocoDesde !== null) {
        const retornoPresumido = emAlmocoDesde + almocoMinMin;
        minutosAlmocoRegistrados += almocoMinMin;
        if (saidaCalc > retornoPresumido) total += saidaCalc - retornoPresumido;
        emAlmocoDesde = null;
        entradaMin = null;
      } else if (entradaMin !== null) {
        total += Math.max(0, saidaCalc - entradaMin);
        entradaMin = null;
      }
    }
  }

  if (entradaMin !== null && opts.agoraMin !== undefined) {
    marcarJanela(opts.agoraMin);
    total += Math.max(0, opts.agoraMin - entradaMin);
  }

  if (emAlmocoDesde !== null && opts.agoraMin !== undefined) {
    marcarJanela(opts.agoraMin);
  }

  /*
   * Dedução mínima de almoço quando a jornada chega à janela:
   * - ciclo fechado/sem intervalo (emAlmocoDesde null): sempre, se deficit;
   * - almoço aberto: só se o INÍCIO foi DEPOIS do fim da janela (ex.: 15:22),
   *   ou seja, trabalhou a janela de almoço sem intervalo real.
   * Estagiário/menor aprendiz: exigirIntervalo=false — não deduz.
   */
  if (exigirIntervalo && almocoMinMin > 0 && houveEntrada && ultrapassouJanelaAlmoco) {
    const almocoAbertoTardio = emAlmocoDesde !== null && emAlmocoDesde > fimJanelaAlmocoMin;
    if (emAlmocoDesde === null || almocoAbertoTardio) {
      const deficit = Math.max(0, almocoMinMin - minutosAlmocoRegistrados);
      if (deficit > 0) total = Math.max(0, total - deficit);
    }
  }

  return Math.max(0, Math.round(total));
}

export type FaltanteRegistro = "ENTRADA" | "INICIO_INTERVALO" | "FIM_INTERVALO" | "SAIDA";

/** Detecta registros obrigatórios ausentes no ciclo do dia. */
export function faltantesCicloPonto(
  registros: Array<{ tipo: string }>,
  opts: { exigirIntervalo?: boolean; exigirSaida?: boolean } = {}
): FaltanteRegistro[] {
  const exigirIntervalo = opts.exigirIntervalo !== false;
  const exigirSaida = opts.exigirSaida !== false;
  const tipos = new Set(registros.map((r) => r.tipo));
  const faltantes: FaltanteRegistro[] = [];

  if (!tipos.has("ENTRADA")) faltantes.push("ENTRADA");
  if (exigirIntervalo) {
    if (!tipos.has("INICIO_INTERVALO")) faltantes.push("INICIO_INTERVALO");
    if (!tipos.has("FIM_INTERVALO")) faltantes.push("FIM_INTERVALO");
  }
  if (exigirSaida && !tipos.has("SAIDA")) faltantes.push("SAIDA");

  return faltantes;
}

export function cicloPontoIncompleto(
  registros: Array<{ tipo: string }>,
  opts: { exigirIntervalo?: boolean; exigirSaida?: boolean } = {}
): boolean {
  return faltantesCicloPonto(registros, opts).length > 0;
}
