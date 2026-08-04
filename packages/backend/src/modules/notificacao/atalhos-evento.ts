/**
 * Atalhos (deep links) por evento de notificação/e-mail.
 * O path é relativo à base pública do frontend (ex.: https://ponto.cfo.org.br).
 */
export interface AtalhoEvento {
  /** Caminho absoluto no app, começando com /ponto/... */
  path: string;
  /** Rótulo amigável exibido no corpo */
  label: string;
}

export const ATALHOS_EVENTO: Record<string, AtalhoEvento> = {
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

/** URL pública do frontend usada em links de e-mail. */
export function getAppBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ??
    process.env.VITE_APP_BASE_URL ??
    "https://ponto.cfo.org.br"
  ).replace(/\/$/, "");
}

export function urlAtalhoEvento(eventoId: string): string | null {
  const atalho = ATALHOS_EVENTO[eventoId];
  if (!atalho) return null;
  return `${getAppBaseUrl()}${atalho.path}`;
}

/**
 * Anexa ao corpo a linha de atalho com URL absoluta, se o evento tiver rota.
 * Evita duplicar quando o link já estiver presente.
 */
export function anexarAtalhoAoCorpo(corpo: string, eventoId?: string | null): string {
  if (!eventoId) return corpo;
  const atalho = ATALHOS_EVENTO[eventoId];
  if (!atalho) return corpo;

  const url = `${getAppBaseUrl()}${atalho.path}`;
  if (corpo.includes(url) || corpo.includes(atalho.path)) return corpo;

  return `${corpo}\n\nAtalho — ${atalho.label}:\n${url}`;
}

/** Converte corpo plain text em HTML, transformando URLs em links clicáveis. */
export function corpoParaHtmlEmail(corpo: string): string {
  const comQuebras = corpo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return comQuebras.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#7a1e26;text-decoration:underline;">$1</a>'
  );
}
