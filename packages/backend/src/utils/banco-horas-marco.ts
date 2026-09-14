/** Utilitários para datas marco do banco de horas (recorrência anual dia/mês). */

export type MarcoBancoHorasRef = {
  dia: number;
  mes: number;
  /** null = recorrente todo ano; preenchido = só naquele ano */
  ano?: number | null;
};

/** Último dia válido do mês (1–12) no ano informado. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Monta YYYY-MM-DD; dia inválido (ex. 31/02) é clampado ao último dia do mês. */
export function isoDeDiaMes(ano: number, mes: number, dia: number): string {
  const max = diasNoMes(ano, mes);
  const d = Math.min(Math.max(1, dia), max);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function chaveMarcoAnual(mes: number, dia: number): string {
  return `A-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function chaveMarcoUnico(ano: number, mes: number, dia: number): string {
  return `U-${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Expande marcos em datas civis YYYY-MM-DD no intervalo de anos [anoMin, anoMax].
 * Marcos anuais geram uma data por ano; marcos com ano fixo só naquele ano.
 */
export function expandirMarcosIso(
  marcos: MarcoBancoHorasRef[],
  anoMin: number,
  anoMax: number
): string[] {
  const set = new Set<string>();
  for (const m of marcos) {
    if (m.ano != null) {
      if (m.ano >= anoMin && m.ano <= anoMax) {
        set.add(isoDeDiaMes(m.ano, m.mes, m.dia));
      }
      continue;
    }
    for (let y = anoMin; y <= anoMax; y++) {
      set.add(isoDeDiaMes(y, m.mes, m.dia));
    }
  }
  return [...set].sort();
}

/**
 * A partir de marcos e a data de hoje, calcula início do ciclo e próxima zeragem.
 * O dia da virada (data marco) já pertence ao ciclo seguinte: o ciclo anterior
 * vai até o dia anterior, e as horas do dia configurado entram no novo saldo.
 */
export function resolverCicloBancoHoras(
  marcos: MarcoBancoHorasRef[],
  hojeIso: string
): { cicloInicio: string | null; proximaZeragem: string | null } {
  const [y] = hojeIso.split("-").map(Number);
  const marcosIso = expandirMarcosIso(marcos, y - 5, y + 2);
  const marcosPassados = marcosIso.filter((d) => d <= hojeIso);
  const marcosFuturos = marcosIso.filter((d) => d > hojeIso);

  const cicloInicio = marcosPassados.length > 0 ? marcosPassados[marcosPassados.length - 1] : null;
  const proximaZeragem = marcosFuturos.length > 0 ? marcosFuturos[0] : null;
  return { cicloInicio, proximaZeragem };
}

/** Soma (ou subtrai) dias civis em YYYY-MM-DD, sem DST. */
export function somarDiasIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

export type CicloBancoHorasRef = {
  inicio: string;
  fim: string;
  atual: boolean;
};

/**
 * Lista os ciclos de banco de horas. Os cortes são institucionais (datas marco);
 * a origem é o go-live, quando existir. Se o servidor entrou no dia da virada
 * (ou depois), o ciclo que acabou de fechar ainda entra na lista.
 */
export function listarCiclosBancoHoras(
  marcos: MarcoBancoHorasRef[],
  inicioAtividades: string,
  hojeIso: string,
  dataInicioProducao?: string | null
): CicloBancoHorasRef[] {
  if (!hojeIso) return [];

  const origem =
    dataInicioProducao && dataInicioProducao <= hojeIso ? dataInicioProducao : inicioAtividades;
  if (!origem || origem > hojeIso) return [];

  const [y] = hojeIso.split("-").map(Number);
  const todosMarcos = expandirMarcosIso(marcos, y - 10, y + 1).filter((d) => d <= hojeIso);
  const marcosIso = todosMarcos.filter((d) => d >= origem);

  const inicios: string[] = [];
  if (marcosIso.length === 0 || marcosIso[0] > origem) {
    inicios.push(origem);
  }
  for (const m of marcosIso) {
    if (inicios[inicios.length - 1] !== m) inicios.push(m);
  }

  /* Primeiro acesso no dia da virada (ou depois): inclui o ciclo encerrado.
     Os cortes seguem o marco, não a data de cadastro do servidor. */
  if (inicios.length === 1) {
    const marcoAtual = todosMarcos[todosMarcos.length - 1] ?? null;
    if (marcoAtual && inicios[0] >= marcoAtual) {
      const marcoAnterior = todosMarcos.filter((d) => d < marcoAtual).at(-1);
      const inicioAnterior =
        marcoAnterior ??
        (dataInicioProducao && dataInicioProducao < marcoAtual ? dataInicioProducao : null);
      if (inicioAnterior) {
        inicios.length = 0;
        inicios.push(inicioAnterior, marcoAtual);
      }
    }
  }

  return inicios
    .map((inicio, i) => {
      const proximo = inicios[i + 1];
      const fim = proximo ? somarDiasIso(proximo, -1) : hojeIso;
      return { inicio, fim, atual: i === inicios.length - 1 };
    })
    .filter((c) => c.inicio <= c.fim);
}
