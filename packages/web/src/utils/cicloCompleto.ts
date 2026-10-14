/**
 * Ciclo completo de batidas de um dia em casa (home office / híbrido em casa).
 * Espelho de backend/src/utils/ciclo-completo.ts — mantenha os dois iguais.
 *
 * O dia só é "OK" com: Entrada → (≥ 1 intervalo de almoço fechado: Início + Fim) → Saída,
 * mais pares adicionais (Interromper/Reiniciar ou outro Início/Fim), cada um fechado e em
 * ordem. Não bastam 2 batidas nem pares soltos. Confere só a ESTRUTURA: janela de almoço,
 * mínimo de 60 min e tolerância continuam nas regras de cálculo de hoje.
 */

export interface BatidaCiclo {
  tipo: string;
  observacoes?: unknown;
}

export interface ResultadoCiclo {
  completo: boolean;
  /** O que falta, em linguagem simples (ex.: "Início do intervalo"). */
  faltas: string[];
}

/**
 * Intervalo "duração zero" que o registro cria sozinho ao encerrar sem almoço
 * (ponto.service → baterPonto). Não é uma batida real do funcionário.
 */
export function ehIntervaloAutomatico(observacoes: unknown): boolean {
  return (
    Array.isArray(observacoes) &&
    observacoes.some(
      (o) =>
        !!o &&
        typeof o === "object" &&
        (o as { tipo?: string }).tipo === "AJUSTE_AUTOMATICO" &&
        /^Intervalo de almoço não (registrado|realizado)/.test(
          String((o as { texto?: string }).texto ?? "")
        )
    )
  );
}

type Estado = "FORA" | "TRABALHANDO" | "ALMOCO" | "PAUSA" | "ENCERRADO";

/**
 * Que intervalo o dia exige:
 * — "ALMOCO": Início + Fim do intervalo (almoço);
 * — "ALMOCO_OU_PAUSA": almoço OU uma pausa fechada (Interromper + Reiniciar) — jornadas curtas
 *   (estagiário/aprendiz) e turno que começa após a janela de almoço, em que o botão de
 *   Início/Fim do intervalo não existe;
 * — "NENHUM": só Entrada e Saída.
 */
export type ModoIntervalo = "ALMOCO" | "ALMOCO_OU_PAUSA" | "NENHUM";

/**
 * `registros`: do dia, em ordem cronológica. `semIntervalo`: turno sem intervalo
 * (entrada após a janela de almoço, estagiário/aprendiz, atestado que cobre o almoço) —
 * não exige o almoço, só Entrada e Saída.
 */
export function cicloCompleto(
  registros: BatidaCiclo[],
  opts: { semIntervalo?: boolean; modoIntervalo?: ModoIntervalo } = {}
): ResultadoCiclo {
  const modo: ModoIntervalo = opts.semIntervalo ? "NENHUM" : (opts.modoIntervalo ?? "ALMOCO");
  const reais = registros.filter(
    (r) =>
      !(
        (r.tipo === "INICIO_INTERVALO" || r.tipo === "FIM_INTERVALO") &&
        ehIntervaloAutomatico(r.observacoes)
      )
  );
  const faltas: string[] = [];
  let estado: Estado = "FORA";
  let almocosFechados = 0;
  let pausasFechadas = 0;
  let ordemInvalida = false;
  let viuInicioAlmoco = false;

  for (const r of reais) {
    switch (r.tipo) {
      case "ENTRADA":
        if (estado === "FORA") estado = "TRABALHANDO";
        else ordemInvalida = true;
        break;
      case "INICIO_INTERVALO":
        viuInicioAlmoco = true;
        /* Também após uma pausa: o sistema inicia o almoço junto da pausa que cruzou a janela. */
        if (estado === "TRABALHANDO" || estado === "PAUSA") estado = "ALMOCO";
        else ordemInvalida = true;
        break;
      case "FIM_INTERVALO":
        /* Também fecha uma pausa que cruzou a janela de almoço (o retorno é Fim do intervalo). */
        if (estado === "ALMOCO" || estado === "PAUSA") {
          estado = "TRABALHANDO";
          almocosFechados++;
        } else ordemInvalida = true;
        break;
      case "INTERROMPER_EXPEDIENTE":
        if (estado === "TRABALHANDO") estado = "PAUSA";
        else ordemInvalida = true;
        break;
      case "REINICIAR_EXPEDIENTE":
        if (estado === "PAUSA") {
          estado = "TRABALHANDO";
          pausasFechadas++;
        } else ordemInvalida = true;
        break;
      case "SAIDA":
        if (estado === "TRABALHANDO") estado = "ENCERRADO";
        else ordemInvalida = true;
        break;
      default:
        break;
    }
  }

  if (!reais.some((r) => r.tipo === "ENTRADA")) faltas.push("Entrada");
  if (estado === "ALMOCO") faltas.push("Fim do intervalo");
  if (estado === "PAUSA") faltas.push("Retorno da pausa (Reiniciar expediente)");
  const intervaloOk = almocosFechados > 0 || (modo === "ALMOCO_OU_PAUSA" && pausasFechadas > 0);
  if (modo !== "NENHUM" && !intervaloOk && estado !== "ALMOCO" && estado !== "PAUSA") {
    faltas.push(
      viuInicioAlmoco
        ? "Fim do intervalo"
        : modo === "ALMOCO_OU_PAUSA"
          ? "Intervalo (Início e Fim do intervalo, ou uma pausa com retorno)"
          : "Início e Fim do intervalo"
    );
  }
  /* "Saída" só falta se não existe nenhuma; com par aberto, a falta já é o fechamento dele. */
  if (!reais.some((r) => r.tipo === "SAIDA")) faltas.push("Saída");
  if (ordemInvalida && faltas.length === 0) faltas.push("Ordem correta das batidas");

  const unicas = [...new Set(faltas)];
  return { completo: unicas.length === 0, faltas: unicas };
}

/** Mantido para a regra do home office (mesma função, modo "ALMOCO"). */
export const cicloCompletoEmCasa = cicloCompleto;

/** Texto para a etiqueta de status do dia ("em casa" no home office; sem complemento no presencial). */
export function textoCicloIncompleto(faltas: string[], emCasa = true): string {
  return `Ciclo incompleto${emCasa ? " em casa" : ""} — falta: ${faltas.join("; ")}`;
}
