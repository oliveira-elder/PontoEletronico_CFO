/**
 * Atalhos por evento de notificação/e-mail.
 * Links de e-mail apontam só para a home (SSO); o caminho no app é descritivo.
 */
export interface AtalhoEvento {
  /**
   * Rota interna (uso in-app / referência). Não usar como deep link em e-mail.
   */
  path: string;
  /** Rótulo curto do evento */
  label: string;
  /** Caminho descritivo no menu do sistema (exibido no e-mail/notificação) */
  caminho: string;
}

export const ATALHOS_EVENTO: Record<string, AtalhoEvento> = {
  ASSINAR_QUADRO: {
    path: "/ponto/historico",
    label: "Histórico — Assinar quadro",
    caminho: "Histórico → Assinar quadro do mês"
  },
  FOLHA_PONTO_CORRECAO_PENDENTE: {
    path: "/ponto/historico",
    label: "Histórico — Folha de ponto",
    caminho: "Histórico → localize o mês da folha"
  },
  ASSINAR_QUADRO_GESTOR: {
    path: "/ponto/aprovacoes?etapa=assinaturas",
    label: "Aprovações — Assinaturas de quadro",
    caminho: "Aprovações → Assinaturas de quadro"
  },
  ASSINATURA_CONCLUIDA: {
    path: "/ponto/historico",
    label: "Histórico",
    caminho: "Histórico"
  },
  FERIAS_OBRIGATORIO: {
    path: "/ponto/solicitacoes",
    label: "Solicitações — Agendar férias",
    caminho: "Solicitações → Nova solicitação → Férias"
  },
  SOLICITACAO_APROVADA: {
    path: "/ponto/solicitacoes",
    label: "Minhas solicitações",
    caminho: "Solicitações → Minhas solicitações"
  },
  SOLICITACAO_RECUSADA: {
    path: "/ponto/solicitacoes",
    label: "Minhas solicitações",
    caminho: "Solicitações → Minhas solicitações"
  },
  BANCO_HORAS_VENCIMENTO: {
    path: "/ponto/banco-horas",
    label: "Banco de Horas",
    caminho: "Evolução do Banco de Horas"
  },
  SOLICITACAO_NOVA_GESTOR: {
    path: "/ponto/aprovacoes?etapa=gestor",
    label: "Aprovações — Pendências do gestor",
    caminho: "Aprovações → Pendências do gestor"
  },
  SOLICITACAO_AGUARDANDO_RH: {
    path: "/ponto/aprovacoes?etapa=rh",
    label: "Aprovações — RH",
    caminho: "Aprovações → Pendências do RH"
  },
  RH_DOCUMENTO_ENVIADO: {
    path: "/ponto/documentos-rh",
    label: "Documentos do RH",
    caminho: "Documentos do RH"
  },
  DOCUMENTO_RETORNO_PENDENTE: {
    path: "/ponto/solicitacoes",
    label: "Solicitações — Enviar documento",
    caminho: "Solicitações → Nova solicitação → Envio de documento"
  },
  REGISTRO_PONTO: {
    path: "/ponto/gestao",
    label: "Gestão de Funcionários",
    caminho: "Gestão"
  },
  AFASTAMENTO_REGISTRADO: {
    path: "/ponto/historico",
    label: "Histórico",
    caminho: "Histórico"
  },
  PERIODO_FECHADO: {
    path: "/ponto/historico",
    label: "Histórico",
    caminho: "Histórico"
  },
  REQUISICAO_RH: {
    path: "/ponto/minhas-requisicoes",
    label: "Minhas Requisições do RH",
    caminho: "Minhas Requisições do RH"
  },
  PAPEL_CRITICO_DESATIVADO: {
    path: "/ponto/gestao",
    label: "Gestão de Funcionários",
    caminho: "Gestão"
  },
  REGISTRO_PONTO_INCOMPLETO: {
    path: "/ponto/solicitacoes",
    label: "Solicitações — Correção de ponto",
    caminho: "Solicitações → Nova solicitação → Correção de ponto"
  },
  SUPER_ADMIN_CONCEDIDO: {
    path: "/ponto/sistema",
    label: "Sistema",
    caminho: "Start / Super Admin"
  },
  SUPER_ADMIN_REVOGADO: {
    path: "/ponto/sistema",
    label: "Sistema",
    caminho: "Start / Super Admin"
  },
  SISTEMA_START_SOLICITADO: {
    path: "/ponto/sistema",
    label: "Sistema — Start",
    caminho: "Start / Super Admin"
  },
  SISTEMA_START_AGUARDANDO_RH: {
    path: "/ponto/sistema",
    label: "Sistema — Start",
    caminho: "Start / Super Admin"
  },
  SISTEMA_START_APROVADO: {
    path: "/ponto/sistema",
    label: "Sistema — Start",
    caminho: "Start / Super Admin"
  },
  SISTEMA_START_REJEITADO: {
    path: "/ponto/sistema",
    label: "Sistema — Start",
    caminho: "Start / Super Admin"
  }
};

/** URL pública do frontend (home) usada em links de e-mail. */
export function getAppBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ??
    process.env.VITE_APP_BASE_URL ??
    "https://ponto.cfo.org.br"
  ).replace(/\/$/, "");
}

/** Home do sistema com barra final — único link válido via SSO. */
export function urlHomeSistema(): string {
  return `${getAppBaseUrl()}/`;
}

/**
 * @deprecated Preferir urlHomeSistema() em e-mails.
 * Deep link absoluto para o evento (notificações in-app).
 */
export function urlAtalhoEvento(eventoId: string): string | null {
  const atalho = ATALHOS_EVENTO[eventoId];
  if (!atalho) return null;
  return `${getAppBaseUrl()}${atalho.path}`;
}

/**
 * E-mail: anexa home (SSO) + caminho descritivo no menu.
 * Evita duplicar quando o bloco já estiver presente.
 */
export function anexarAtalhoEmailAoCorpo(corpo: string, eventoId?: string | null): string {
  if (!eventoId) return corpo;
  const atalho = ATALHOS_EVENTO[eventoId];
  if (!atalho) return corpo;

  if (
    corpo.includes("Acesse o sistema:") ||
    corpo.includes("Caminho para correção") ||
    corpo.includes(`Caminho: ${atalho.caminho}`)
  ) {
    return corpo;
  }

  if (eventoId === "REGISTRO_PONTO_INCOMPLETO") {
    return (
      `${corpo}\n\nAcesse o sistema: ${urlHomeSistema()}\n` +
      `Caminho para correção de ponto: Solicitações → Nova solicitação → Correção de ponto\n` +
      `Caminho para envio de atestado: Solicitações → Nova solicitação → Atestado médico`
    );
  }

  return `${corpo}\n\nAcesse o sistema: ${urlHomeSistema()}\nCaminho: ${atalho.caminho}`;
}

/**
 * Notificação in-app: anexa deep link (usuário já autenticado).
 * Evita duplicar quando o link já estiver presente.
 */
export function anexarAtalhoNotificacaoAoCorpo(corpo: string, eventoId?: string | null): string {
  if (!eventoId) return corpo;
  const atalho = ATALHOS_EVENTO[eventoId];
  if (!atalho) return corpo;

  const url = `${getAppBaseUrl()}${atalho.path}`;
  if (corpo.includes(url) || corpo.includes(atalho.path)) return corpo;

  return `${corpo}\n\nAtalho — ${atalho.label}:\n${url}`;
}

/** @deprecated Use anexarAtalhoEmailAoCorpo ou anexarAtalhoNotificacaoAoCorpo. */
export function anexarAtalhoAoCorpo(corpo: string, eventoId?: string | null): string {
  return anexarAtalhoEmailAoCorpo(corpo, eventoId);
}

/** Converte corpo plain text em HTML, transformando URLs em links clicáveis. */
export function corpoParaHtmlEmail(corpo: string): string {
  const escaped = corpo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const comDestaque = escaped.replace(
    /(^|\n)(ATENÇÃO:[^\n]*)/g,
    `$1<div style="margin:16px 0;padding:12px 14px;background:#FEF3C7;border:1px solid #D97706;border-left:4px solid #B45309;border-radius:8px;color:#92400E;font-weight:700;line-height:1.45;">$2</div>`
  );

  const comQuebras = comDestaque.replace(/\n/g, "<br>");

  return comQuebras.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#7a1e26;text-decoration:underline;">$1</a>'
  );
}
