import { horarioParaMinutos } from "./horario-brasilia";
import { labelCategoriaSemIntervalo, type CategoriaSemIntervaloAlmoco } from "./categoria-jornada";
import type { ObservacaoRegistro } from "./registro-observacoes";

export type TurnoEntrada = "MATUTINO" | "VESPERTINO" | "NOTURNO";
export type MotivoSemIntervalo = "DURANTE_JANELA" | "APOS_JANELA" | "CATEGORIA_CARGA_CORRIDA";

export const LIMITE_TURNO_NOTURNO = "22:00";

export interface ClassificacaoTurnoEntrada {
  turno: TurnoEntrada;
  semIntervalo: boolean;
  motivo?: MotivoSemIntervalo;
  janelaAlmoco: string;
}

/** Classifica o turno da ENTRADA pelo horário vs janela de almoço configurada. */
export function classificarTurnoEntrada(
  horaHHMM: string,
  almocoPodeIniciarA: string,
  almocoPodeIniciarAte: string
): ClassificacaoTurnoEntrada {
  const hora = horarioParaMinutos(horaHHMM.substring(0, 5));
  const inicioAlmoco = horarioParaMinutos(almocoPodeIniciarA);
  const fimAlmoco = horarioParaMinutos(almocoPodeIniciarAte);
  const limiarNoturno = horarioParaMinutos(LIMITE_TURNO_NOTURNO);
  const janelaAlmoco = `${almocoPodeIniciarA}–${almocoPodeIniciarAte}`;

  if (hora < inicioAlmoco) {
    return { turno: "MATUTINO", semIntervalo: false, janelaAlmoco };
  }

  const motivo: MotivoSemIntervalo = hora <= fimAlmoco ? "DURANTE_JANELA" : "APOS_JANELA";
  const turno: TurnoEntrada = hora >= limiarNoturno ? "NOTURNO" : "VESPERTINO";
  return { turno, semIntervalo: true, motivo, janelaAlmoco };
}

export function labelTurno(turno: TurnoEntrada): string {
  if (turno === "VESPERTINO") return "vespertino";
  if (turno === "NOTURNO") return "noturno";
  return "matutino";
}

export function textoObservacaoTurnoSemIntervalo(c: ClassificacaoTurnoEntrada): string {
  const t = labelTurno(c.turno);
  if (c.motivo === "DURANTE_JANELA") {
    return (
      `Entrada em turno ${t} durante a janela de almoço vigente (${c.janelaAlmoco}). ` +
      `Intervalo de almoço não se aplica a esta jornada — o expediente iniciou após o horário usual de entrada.`
    );
  }
  return (
    `Entrada em turno ${t} após a janela de almoço (${c.janelaAlmoco}). ` +
    `Intervalo não realizado porque a jornada começou fora do fluxo matutino usual.`
  );
}

export function criarObservacaoTurnoSemIntervalo(c: ClassificacaoTurnoEntrada): ObservacaoRegistro {
  return {
    data: new Date().toISOString(),
    tipo: "TURNO_SEM_INTERVALO",
    texto: textoObservacaoTurnoSemIntervalo(c),
    turno: c.turno,
    motivo: c.motivo,
    janelaAlmoco: c.janelaAlmoco
  };
}

/** Estagiário / menor aprendiz: carga horária corrida, sem almoço no ponto. */
export function criarObservacaoCategoriaSemIntervalo(
  categoria: CategoriaSemIntervaloAlmoco,
  turno: TurnoEntrada = "MATUTINO"
): ObservacaoRegistro {
  const label = labelCategoriaSemIntervalo(categoria);
  return {
    data: new Date().toISOString(),
    tipo: "TURNO_SEM_INTERVALO",
    texto:
      `${label} realiza carga horária corrida — intervalo de almoço não se aplica a esta jornada. ` +
      `Use Interromper/Reiniciar Expediente para pausas; o tempo pausado não conta como trabalhado.`,
    turno,
    motivo: "CATEGORIA_CARGA_CORRIDA"
  };
}

export function observacaoTurnoSemIntervalo(observacoes: unknown): ObservacaoRegistro | undefined {
  if (!Array.isArray(observacoes)) return undefined;
  return (observacoes as ObservacaoRegistro[]).find((o) => o.tipo === "TURNO_SEM_INTERVALO");
}
