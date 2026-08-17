import { horarioParaMinutos, minutosParaHorario } from "./horario-brasilia";

/** Média aritmética de horários HH:mm (Brasília), arredondada ao minuto. */
export function mediaHorariosHHMM(horarios: string[]): string | null {
  if (!horarios.length) return null;
  const soma = horarios.reduce((acc, h) => acc + horarioParaMinutos(h), 0);
  return minutosParaHorario(soma / horarios.length);
}

export function clampHorarioNaJanela(hora: string, ini: string, fim: string): string {
  const t = horarioParaMinutos(hora);
  const a = horarioParaMinutos(ini);
  const b = horarioParaMinutos(fim);
  if (t < a) return ini.substring(0, 5);
  if (t > b) return fim.substring(0, 5);
  return hora.substring(0, 5);
}

/**
 * Previsão de início de almoço: média do histórico do colaborador,
 * limitada à janela configurada no período. Sem histórico, usa o início da janela.
 */
export function previsaoInicioAlmoco(opts: {
  historicoHHMM: string[];
  janelaInicio: string;
  janelaFim: string;
  fallback: string;
}): string {
  const { historicoHHMM, janelaInicio, janelaFim, fallback } = opts;
  if (!historicoHHMM.length) return fallback.substring(0, 5);

  const ini = horarioParaMinutos(janelaInicio);
  const fim = horarioParaMinutos(janelaFim);
  const margem = 30;
  const naFaixa = historicoHHMM.filter((h) => {
    const t = horarioParaMinutos(h);
    return t >= ini - margem && t <= fim + margem;
  });
  const amostra = naFaixa.length ? naFaixa : historicoHHMM;
  const media = mediaHorariosHHMM(amostra);
  if (!media) return fallback.substring(0, 5);
  return clampHorarioNaJanela(media, janelaInicio, janelaFim);
}
