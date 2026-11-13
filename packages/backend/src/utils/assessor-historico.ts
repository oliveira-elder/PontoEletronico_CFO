/**
 * Nível e período em que o funcionário exerce a função de assessor. É só registro: não altera a
 * isenção de ponto nem o banco de horas (isso continua vindo de isFiscal/categoria). Funções PURAS.
 */
export const NIVEL_ASSESSOR_MIN = 1;
export const NIVEL_ASSESSOR_MAX = 15;

export interface PeriodoAssessor {
  id?: string;
  nivel: number;
  /** AAAA-MM-DD */
  vigenciaDesde: string;
  /** AAAA-MM-DD; null = em aberto */
  vigenciaAte: string | null;
}

const FIM_ABERTO = "9999-12-31";

/** Data civil AAAA-MM-DD existente (ano entre 1900 e 2100). */
export function dataCivilValida(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d &&
    y >= 1900 &&
    y <= 2100
  );
}

/** Algarismos romanos de 1 a 15 (I a XV). */
export function nivelRomano(nivel: number): string {
  const tabela: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  let n = nivel;
  let out = "";
  for (const [valor, simbolo] of tabela) {
    while (n >= valor) {
      out += simbolo;
      n -= valor;
    }
  }
  return out;
}

/**
 * Valida um período de assessor contra os já registrados (ignorando `ignorarId` na edição).
 * Devolve a mensagem de erro (para um 400) ou null.
 */
export function validarPeriodoAssessor(
  entrada: { nivel: unknown; vigenciaDesde: unknown; vigenciaAte?: unknown },
  existentes: PeriodoAssessor[],
  ignorarId?: string
): string | null {
  const nivel = Number(entrada.nivel);
  if (!Number.isInteger(nivel) || nivel < NIVEL_ASSESSOR_MIN || nivel > NIVEL_ASSESSOR_MAX) {
    return `Informe o nível do assessor (de I a ${nivelRomano(NIVEL_ASSESSOR_MAX)}).`;
  }
  const desde = entrada.vigenciaDesde;
  if (!desde) return "Informe a data de início.";
  if (!dataCivilValida(desde)) return "Início: informe uma data válida (dia/mês/ano).";
  const fim =
    entrada.vigenciaAte === undefined || entrada.vigenciaAte === null || entrada.vigenciaAte === ""
      ? null
      : entrada.vigenciaAte;
  if (fim !== null && !dataCivilValida(fim)) return "Fim: informe uma data válida (dia/mês/ano).";
  if (fim !== null && fim < desde) {
    return "A data de fim deve ser igual ou posterior à data de início.";
  }
  const fimEfetivo = fim ?? FIM_ABERTO;
  const choque = existentes.find(
    (p) =>
      p.id !== ignorarId && desde <= (p.vigenciaAte ?? FIM_ABERTO) && fimEfetivo >= p.vigenciaDesde
  );
  if (choque) return "O período se sobrepõe a outro período de assessor já registrado.";
  return null;
}
