/**
 * Regras de correção de ponto envolvendo pausa (INTERROMPER / REINICIAR).
 *
 * — INTERROMPER nunca pode ser criado/corrigido/excluído via correção
 *   (pausa é exceção batida no dia; sem pausa real não se “inventa” o início).
 * — REINICIAR só após o dia fechado (data < hoje), para quem esqueceu de retomar.
 */

export type ItemCorrecaoPonto = {
  acao?: string;
  tipoRegistro?: string;
  horario?: string;
  registroId?: string;
};

export const TIPOS_CORRECAO_PONTO_PERMITIDOS = new Set([
  "ENTRADA",
  "INICIO_INTERVALO",
  "FIM_INTERVALO",
  "SAIDA",
  "REINICIAR_EXPEDIENTE"
]);

function horarioParaMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutosDeDataHora(dataHora: Date | string): number {
  const d = typeof dataHora === "string" ? new Date(dataHora) : dataHora;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const min = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + min;
}

/** INTERROMPER sem REINICIAR correspondente (pausa aberta). */
export function encontrarPausaAberta<T extends { tipo: string; dataHora?: Date | string }>(
  registros: T[]
): T | null {
  let aberta: T | null = null;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") aberta = r;
    else if (r.tipo === "REINICIAR_EXPEDIENTE") aberta = null;
  }
  return aberta;
}

/** Último INTERROMPER do dia (âncora para validar horário do retorno). */
function encontrarUltimoInterromper<T extends { tipo: string; dataHora?: Date | string }>(
  registros: T[]
): T | null {
  let ultimo: T | null = null;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") ultimo = r;
  }
  return ultimo;
}

export function validarItensCorrecaoPontoPausa(opts: {
  correcoes: ItemCorrecaoPonto[];
  /** YYYY-MM-DD (Brasília) do dia da correção */
  dataRefIso: string;
  /** YYYY-MM-DD (Brasília) de hoje */
  hojeIso: string;
  registrosDoDia: Array<{ tipo: string; dataHora?: Date | string }>;
}): string | null {
  const { correcoes, dataRefIso, hojeIso, registrosDoDia } = opts;
  const pausaAberta = encontrarPausaAberta(registrosDoDia);
  const temReiniciar = registrosDoDia.some((r) => r.tipo === "REINICIAR_EXPEDIENTE");
  const ancoraPausa = pausaAberta ?? encontrarUltimoInterromper(registrosDoDia);

  for (const c of correcoes) {
    const tipo = c.tipoRegistro ?? "";
    if (tipo === "INTERROMPER_EXPEDIENTE") {
      return (
        "Não é permitido incluir, corrigir ou excluir o início da pausa (Interromper Expediente) " +
        "por correção de ponto. A pausa só pode ser registrada no próprio dia."
      );
    }
    if (!TIPOS_CORRECAO_PONTO_PERMITIDOS.has(tipo)) {
      return `Tipo de registro não permitido em correção de ponto: ${tipo}.`;
    }
    if (tipo === "REINICIAR_EXPEDIENTE") {
      if (dataRefIso >= hojeIso) {
        return (
          "A correção do retorno da pausa (Reiniciar Expediente) só é permitida a partir do dia seguinte, " +
          "quando o dia estiver fechado."
        );
      }
      if (c.acao === "INCLUIR" && !pausaAberta) {
        return "Só é possível incluir o retorno da pausa quando houver Interromper Expediente sem Reiniciar no dia.";
      }
      if (c.acao === "CORRIGIR" && !temReiniciar) {
        return "Não há retorno de pausa para corrigir neste dia.";
      }
      if (c.acao === "EXCLUIR") {
        return "Não é permitido excluir o retorno da pausa por esta via; ajuste o horário se necessário.";
      }
      if (c.horario && ancoraPausa?.dataHora) {
        const novoMin = horarioParaMinutos(c.horario);
        const pausaMin = minutosDeDataHora(ancoraPausa.dataHora);
        if (novoMin != null && novoMin <= pausaMin) {
          return "O horário do retorno da pausa deve ser posterior ao início da pausa (Interromper Expediente).";
        }
      }
    }
  }
  return null;
}
