export interface ObservacaoRegistro {
  data: string;
  texto: string;
  tipo?: "AJUSTE_HORARIO" | "INCLUSAO_PONTO" | "AJUSTE_AUTOMATICO";
  solicitacaoId?: string;
  tipoRegistro?: string;
  horarioAnterior?: string | null;
  horarioNovo?: string;
}

export const TIPO_PONTO_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Início de Intervalo",
  FIM_INTERVALO: "Fim de Intervalo",
  SAIDA: "Saída",
  INTERROMPER_EXPEDIENTE: "Interromper Expediente",
  REINICIAR_EXPEDIENTE: "Reiniciar Expediente"
};

export function parseObservacoes(raw: unknown): ObservacaoRegistro[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ObservacaoRegistro[];
  return [];
}

export function appendObservacao(
  existentes: unknown,
  nova: ObservacaoRegistro
): ObservacaoRegistro[] {
  return [...parseObservacoes(existentes), nova];
}

export function textoAjusteHorario(params: {
  tipoRegistro: string;
  horarioAnterior?: string | null;
  horarioNovo: string;
  solicitacaoId: string;
  acao: "CORRIGIR" | "INCLUIR";
  autorRH?: string; // quando definido, indica correção iniciada pelo RH
}): string {
  const label = TIPO_PONTO_LABEL[params.tipoRegistro] ?? params.tipoRegistro;

  if (params.autorRH) {
    const sufixo = `pelo setor de RH (${params.autorRH}), aprovada pelo Gerente de RH`;
    if (params.acao === "INCLUIR") {
      return `Horário de ${label} (${params.horarioNovo}) incluído ${sufixo}.`;
    }
    if (params.horarioAnterior) {
      return `Horário de ${label} alterado de ${params.horarioAnterior} para ${params.horarioNovo} ${sufixo}.`;
    }
    return `Horário de ${label} ajustado para ${params.horarioNovo} ${sufixo}.`;
  }

  if (params.acao === "INCLUIR") {
    return `Horário de ${label} (${params.horarioNovo}) incluído conforme sua solicitação aprovada.`;
  }
  if (params.horarioAnterior) {
    return `Horário de ${label} alterado de ${params.horarioAnterior} para ${params.horarioNovo} conforme sua solicitação aprovada.`;
  }
  return `Horário de ${label} ajustado para ${params.horarioNovo} conforme sua solicitação aprovada.`;
}

export function criarObservacaoAjuste(params: {
  tipoRegistro: string;
  horarioAnterior?: string | null;
  horarioNovo: string;
  solicitacaoId: string;
  acao: "CORRIGIR" | "INCLUIR";
  autorRH?: string;
}): ObservacaoRegistro {
  return {
    data: new Date().toISOString(),
    tipo: params.acao === "INCLUIR" ? "INCLUSAO_PONTO" : "AJUSTE_HORARIO",
    texto: textoAjusteHorario(params),
    solicitacaoId: params.solicitacaoId,
    tipoRegistro: params.tipoRegistro,
    horarioAnterior: params.horarioAnterior ?? null,
    horarioNovo: params.horarioNovo
  };
}
