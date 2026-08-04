/**
 * Atalhos (rotas) por tipo de notificação in-app.
 * Mantido espelhado ao backend (`atalhos-evento.ts`).
 */
export interface AtalhoNotificacao {
  path: string;
  label: string;
}

export const ATALHOS_NOTIFICACAO: Record<string, AtalhoNotificacao> = {
  ASSINAR_QUADRO: { path: "/ponto/historico", label: "Histórico — Assinar quadro" },
  ASSINAR_QUADRO_GESTOR: {
    path: "/ponto/aprovacoes?etapa=assinaturas",
    label: "Aprovações — Assinaturas de quadro"
  },
  ASSINATURA_CONCLUIDA: { path: "/ponto/historico", label: "Histórico" },
  FERIAS_OBRIGATORIO: { path: "/ponto/solicitacoes", label: "Solicitações — Agendar férias" },
  SOLICITACAO_APROVADA: { path: "/ponto/solicitacoes", label: "Minhas solicitações" },
  SOLICITACAO_RECUSADA: { path: "/ponto/solicitacoes", label: "Minhas solicitações" },
  BANCO_HORAS_VENCIMENTO: { path: "/ponto/banco-horas", label: "Banco de Horas" },
  SOLICITACAO_NOVA_GESTOR: {
    path: "/ponto/aprovacoes?etapa=gestor",
    label: "Aprovações — Pendências do gestor"
  },
  SOLICITACAO_AGUARDANDO_RH: {
    path: "/ponto/aprovacoes?etapa=rh",
    label: "Aprovações — RH"
  },
  RH_DOCUMENTO_ENVIADO: { path: "/ponto/documentos-rh", label: "Documentos do RH" },
  DOCUMENTO_RETORNO_PENDENTE: {
    path: "/ponto/solicitacoes",
    label: "Solicitações — Enviar documento"
  },
  REGISTRO_PONTO: { path: "/ponto/gestao", label: "Gestão de Funcionários" },
  AFASTAMENTO_REGISTRADO: { path: "/ponto/historico", label: "Histórico" },
  PERIODO_FECHADO: { path: "/ponto/historico", label: "Histórico" },
  REQUISICAO_RH: { path: "/ponto/minhas-requisicoes", label: "Minhas Requisições do RH" },
  PAPEL_CRITICO_DESATIVADO: {
    path: "/ponto/gestao",
    label: "Gestão de Funcionários"
  },
  REGISTRO_PONTO_INCOMPLETO: {
    path: "/ponto/solicitacoes",
    label: "Solicitações — Correção de ponto"
  },
  SUPER_ADMIN_CONCEDIDO: { path: "/ponto/sistema", label: "Sistema" },
  SUPER_ADMIN_REVOGADO: { path: "/ponto/sistema", label: "Sistema" },
  SISTEMA_START_SOLICITADO: { path: "/ponto/sistema", label: "Sistema — Start" },
  SISTEMA_START_AGUARDANDO_RH: { path: "/ponto/sistema", label: "Sistema — Start" },
  SISTEMA_START_APROVADO: { path: "/ponto/sistema", label: "Sistema — Start" },
  SISTEMA_START_REJEITADO: { path: "/ponto/sistema", label: "Sistema — Start" }
};

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Quebra o texto em segmentos de texto e URL para renderizar links. */
export function segmentosComLinks(texto: string): Array<{ tipo: "texto" | "link"; valor: string }> {
  const partes: Array<{ tipo: "texto" | "link"; valor: string }> = [];
  let ultimo = 0;
  for (const match of texto.matchAll(URL_RE)) {
    const idx = match.index ?? 0;
    if (idx > ultimo) {
      partes.push({ tipo: "texto", valor: texto.slice(ultimo, idx) });
    }
    partes.push({ tipo: "link", valor: match[0] });
    ultimo = idx + match[0].length;
  }
  if (ultimo < texto.length) {
    partes.push({ tipo: "texto", valor: texto.slice(ultimo) });
  }
  return partes;
}
