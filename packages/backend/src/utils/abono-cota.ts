import {
  resolverCicloBancoHoras,
  somarDiasIso,
  type MarcoBancoHorasRef
} from "./banco-horas-marco";

/**
 * Cota de abono diário (acordo coletivo): N dias a cada dois ciclos cheios do banco de horas.
 * A janela de um dia é o ciclo do dia + o ciclo anterior (e, para não furar o limite com datas
 * antigas, também o ciclo do dia + o seguinte). Os ciclos são os das datas-marco do banco.
 */

export const STATUS_SOLICITACAO_COTA_EM_USO = ["PENDENTE", "AGUARDANDO_RH", "APROVADA"] as const;

export interface JanelaCota {
  /** YYYY-MM-DD (inclusive) */
  inicio: string;
  /** YYYY-MM-DD (inclusive) */
  fim: string;
}

const INICIO_ABERTO = "0000-01-01";
const FIM_ABERTO = "9999-12-31";

/** Ciclo do banco que contém o dia: [início, véspera da próxima zeragem]. */
export function cicloDoDia(
  marcos: MarcoBancoHorasRef[],
  iso: string,
  deslocamentoDias = 0
): JanelaCota {
  const { cicloInicio, proximaZeragem } = resolverCicloBancoHoras(marcos, iso, deslocamentoDias);
  return {
    inicio: cicloInicio ?? INICIO_ABERTO,
    fim: proximaZeragem ? somarDiasIso(proximaZeragem, -1) : FIM_ABERTO
  };
}

/** Janela que mostra o saldo: ciclo do dia + ciclo anterior. */
export function janelaDoDia(
  marcos: MarcoBancoHorasRef[],
  iso: string,
  deslocamentoDias = 0
): JanelaCota {
  const atual = cicloDoDia(marcos, iso, deslocamentoDias);
  if (atual.inicio === INICIO_ABERTO) return atual;
  const anterior = cicloDoDia(marcos, somarDiasIso(atual.inicio, -1), deslocamentoDias);
  return { inicio: anterior.inicio, fim: atual.fim };
}

/** Janelas que precisam respeitar o limite para um dia: (anterior+atual) e (atual+seguinte). */
export function janelasDoDia(
  marcos: MarcoBancoHorasRef[],
  iso: string,
  deslocamentoDias = 0
): JanelaCota[] {
  const atual = cicloDoDia(marcos, iso, deslocamentoDias);
  const janelas = [janelaDoDia(marcos, iso, deslocamentoDias)];
  if (atual.fim !== FIM_ABERTO) {
    const seguinte = cicloDoDia(marcos, somarDiasIso(atual.fim, 1), deslocamentoDias);
    janelas.push({ inicio: atual.inicio, fim: seguinte.fim });
  }
  return janelas;
}

const fmtBr = (iso: string) => iso.split("-").reverse().join("/");

/** Erros de cota (vazio = válido). `existentes`: dias da cota já pedidos/aprovados. */
export function validarCotaAbono(opts: {
  cotaDias: number;
  marcos: MarcoBancoHorasRef[];
  novos: string[];
  existentes: string[];
  deslocamentoDias?: number;
}): string[] {
  const { cotaDias, marcos, novos, existentes, deslocamentoDias = 0 } = opts;
  if (cotaDias <= 0) return ["O abono por acordo coletivo não está habilitado."];
  const repetidos = novos.filter(
    (d) => existentes.includes(d) || novos.indexOf(d) !== novos.lastIndexOf(d)
  );
  if (repetidos.length) {
    return [`O dia ${fmtBr(repetidos[0])} já está na sua cota de abono ou repetido neste pedido.`];
  }
  const erros: string[] = [];
  const vistos = new Set<string>();
  for (const d of novos) {
    for (const j of janelasDoDia(marcos, d, deslocamentoDias)) {
      const chave = `${j.inicio}|${j.fim}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const dentro = (x: string) => x >= j.inicio && x <= j.fim;
      const total = existentes.filter(dentro).length + novos.filter(dentro).length;
      if (total > cotaDias) {
        const periodo =
          j.inicio === INICIO_ABERTO ? "o período" : `${fmtBr(j.inicio)} a ${fmtBr(j.fim)}`;
        erros.push(
          `A cota é de ${cotaDias} dia(s) de abono a cada dois ciclos; em ${periodo} este pedido passaria para ${total}.`
        );
      }
    }
  }
  return erros;
}
