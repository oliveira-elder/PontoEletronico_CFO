/**
 * Catálogo de endpoints do sistema — usado pela tela de Logs (Super Admin) para
 * mostrar, ao lado de cada endpoint, uma explicação do que ele faz, e para permitir
 * que a busca por texto livre encontre logs por assunto (ex.: "aprovar solicitação")
 * mesmo sem o usuário conhecer a URL exata.
 *
 * `pathPattern` usa a mesma sintaxe do NestJS (":param") e NÃO inclui o prefixo
 * "/api" — o matcher remove esse prefixo do path armazenado no AuditLog antes de
 * comparar. Ordem não importa: o matcher escolhe o padrão mais específico (com
 * menos ":params" e maior comprimento) quando mais de um bate.
 */
export interface EndpointCatalogEntry {
  method: string;
  pathPattern: string;
  titulo: string;
  descricao: string;
  categoria: string;
}

export const ENDPOINT_CATALOG: EndpointCatalogEntry[] = [
  /* ── Autenticação / sessão ── */
  {
    method: "GET",
    pathPattern: "/auth/me",
    titulo: "Login / sincronização de sessão",
    descricao:
      "Chamado a cada login (SSO Keycloak). Cria ou atualiza o usuário e o cadastro de " +
      "funcionário local, registra o horário do login (ultimoLoginEm) e bloqueia o acesso " +
      "de quem está com a conta desativada ou sem matrícula.",
    categoria: "Autenticação"
  },

  /* ── Ponto — autoatendimento do funcionário ── */
  {
    method: "GET",
    pathPattern: "/ponto/meu-perfil",
    titulo: "Meu perfil",
    descricao: "Retorna os dados do funcionário autenticado (cargo, gerência, jornada etc.).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/status",
    titulo: "Status do ponto",
    descricao: "Consulta o estado atual do dia (últimos registros, se pode bater ponto agora).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/registros",
    titulo: "Registrar ponto",
    descricao:
      "Registra uma marcação de ponto (entrada, saída, intervalo), com geolocalização/foto.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/historico",
    titulo: "Histórico de ponto",
    descricao: "Lista o histórico mensal de registros e o quadro de ponto do funcionário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/relatorio",
    titulo: "Relatório de ponto",
    descricao: "Gera relatório consolidado de horas trabalhadas do funcionário num período.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/banco-horas",
    titulo: "Banco de horas",
    descricao: "Consulta o saldo e a evolução do banco de horas do funcionário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/solicitacoes",
    titulo: "Minhas solicitações",
    descricao: "Lista as solicitações (férias, atestado, licença etc.) do próprio funcionário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/solicitacoes",
    titulo: "Nova solicitação",
    descricao:
      "Cria uma solicitação (férias, atestado, licença, abono, correção de ponto etc.) para " +
      "aprovação do chefe e depois do RH.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/solicitacoes/:id/documento-retorno",
    titulo: "Enviar documento de retorno",
    descricao:
      "Funcionário envia o documento de retorno (ex.: atestado/folha assinada) da solicitação.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/solicitacoes/:id/documento",
    titulo: "Anexar documento à solicitação",
    descricao: "Anexa/atualiza o documento (ex.: atestado médico) de uma solicitação existente.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/registros-do-dia",
    titulo: "Registros do dia",
    descricao: "Lista as marcações de ponto já feitas hoje pelo funcionário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/feriado-hoje",
    titulo: "Feriado hoje?",
    descricao: "Verifica se hoje é feriado configurado no sistema.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/feriados",
    titulo: "Lista de feriados",
    descricao: "Lista os feriados cadastrados visíveis ao funcionário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/ferias/saldo",
    titulo: "Saldo de férias",
    descricao: "Consulta o saldo de dias de férias disponíveis do funcionário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/verificar/conteudo",
    titulo: "Conferência automática de conteúdo",
    descricao:
      "Compara o texto de um PDF enviado (ou a leitura OCR de uma foto) com o documento original, sem login.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/verificar/documento/:sha256",
    titulo: "Verificação pública de qualquer documento assinado",
    descricao:
      "Confere, pela impressão digital do arquivo, qualquer documento emitido e assinado pelo sistema, sem login.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/verificar/arquivo/:sha256",
    titulo: "Verificação pública pelo arquivo",
    descricao:
      "Confere a autenticidade de um PDF enviado (pelo SHA-256 calculado no navegador), sem login.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/arquivos-fiscais/afd",
    titulo: "Extração do AFD",
    descricao: "Gera o Arquivo Fonte de Dados (Portaria MTP 671/2021) do REP — oficial ou extrato.",
    categoria: "Auditoria"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/arquivos-fiscais/aej",
    titulo: "Extração do AEJ",
    descricao:
      "Gera o Arquivo Eletrônico de Jornada (Portaria MTP 671/2021) dos funcionários escolhidos.",
    categoria: "Auditoria"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/arquivos-fiscais/pre-validacao",
    titulo: "Pré-validação do AFD/AEJ",
    descricao: "Verifica pendências antes da extração dos arquivos fiscais.",
    categoria: "Auditoria"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/rep-p",
    titulo: "Situação do REP-P",
    descricao: "Identificação, estado da operação, livro, relógio e certificado do REP-P.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/rep-p",
    titulo: "Salvar identificação do REP-P",
    descricao: "Atualiza a identificação do REP-P (INPI, local, responsável e desenvolvedor).",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/rep-p/iniciar-operacao",
    titulo: "Iniciar operação como REP-P",
    descricao: "Registra a virada irreversível do sistema para REP-P.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/rep-p/atestado",
    titulo: "Atestado Técnico (art. 89)",
    descricao: "Baixa o Atestado Técnico e Termo de Responsabilidade preenchido, para assinatura.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/registro-inpi",
    titulo: "Registro no INPI",
    descricao: "Consulta o checklist do registro do programa no INPI.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/registro-inpi",
    titulo: "Salvar registro no INPI",
    descricao: "Atualiza as etapas, o protocolo e o certificado do registro no INPI.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/registro-inpi/certificado-pdf",
    titulo: "Anexar certificado do INPI",
    descricao: "Envia o PDF do certificado de registro do programa.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/registro-inpi/certificado-pdf",
    titulo: "Baixar certificado do INPI",
    descricao: "Baixa o PDF do certificado de registro do programa.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/hora",
    titulo: "Hora do servidor",
    descricao:
      "Hora do servidor (Hora Legal Brasileira), usada no relógio exibido ao registrar ponto.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/termos-uso/vigente",
    titulo: "Termos de Uso vigentes",
    descricao: "Versão vigente dos Termos de Uso e a situação do aceite do usuário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/termos-uso/:id/aceitar",
    titulo: "Aceite dos Termos de Uso",
    descricao: "Registra o aceite dos Termos de Uso pelo usuário (nome, matrícula, data, IP).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/termos-uso/meus-aceites",
    titulo: "Meus aceites dos Termos de Uso",
    descricao: "Histórico dos aceites dos Termos de Uso do próprio usuário.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/termos-uso",
    titulo: "Versões dos Termos de Uso",
    descricao: "Histórico de versões dos Termos de Uso.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/termos-uso/:id",
    titulo: "Versão dos Termos de Uso",
    descricao: "Texto de uma versão dos Termos de Uso e da anterior, para comparação.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/termos-uso",
    titulo: "Novo Termo de Uso",
    descricao: "Cria uma nova versão dos Termos de Uso em rascunho.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/termos-uso/:id/editar",
    titulo: "Editar Termos de Uso",
    descricao:
      "Cria uma nova versão em rascunho a partir de uma versão existente (a original é mantida).",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/termos-uso/:id",
    titulo: "Salvar rascunho dos Termos de Uso",
    descricao: "Atualiza o texto de uma versão em rascunho.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/termos-uso/:id/publicar",
    titulo: "Publicar Termos de Uso",
    descricao: "Publica a versão; todos os usuários precisam aceitar novamente.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/termos-uso/:id",
    titulo: "Excluir rascunho dos Termos de Uso",
    descricao: "Exclui uma versão em rascunho.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/termos-uso/:id/aceites",
    titulo: "Aceites dos Termos de Uso",
    descricao: "Lista quem aceitou e quem está pendente em uma versão.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/comprovantes",
    titulo: "Meus comprovantes de ponto",
    descricao:
      "Lista os comprovantes de registro de ponto do próprio trabalhador (últimas 48 horas por padrão).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/comprovantes/ultimas-48h",
    titulo: "Baixar comprovantes das últimas 48 horas",
    descricao:
      "ZIP com os comprovantes de registro de ponto das últimas 48 horas do próprio trabalhador.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/comprovantes/:nsr/pdf",
    titulo: "Comprovante de registro de ponto (PDF)",
    descricao: "PDF assinado do comprovante de uma marcação do próprio trabalhador.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/verificar-marcacao/arquivo/:sha256",
    titulo: "Verificação pública de comprovante pelo arquivo",
    descricao:
      "Confere se um PDF é o comprovante original emitido pelo sistema (SHA-256 calculado no navegador).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/verificar-marcacao/conteudo",
    titulo: "Verificação pública de comprovante pelo conteúdo",
    descricao:
      "Compara o texto de um PDF (ou a leitura OCR de uma foto) com o comprovante original, sem login.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/verificar-marcacao/:hash",
    titulo: "Verificação pública de comprovante",
    descricao: "Confere um comprovante de registro de ponto pelo hash da marcação, sem login.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/arquivos-fiscais/situacao",
    titulo: "Situação do livro do REP",
    descricao: "NSR atual, instância (máquina) e bloqueios do livro de marcações.",
    categoria: "Auditoria"
  },
  {
    method: "GET",
    pathPattern: "/ponto/verificar/:codigo",
    titulo: "Verificação pública de documento",
    descricao: "Confere a autenticidade de um documento assinado pelo código/QR Code (sem login).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/solicitacoes/:id/ferias/documentos/:indice/assinar",
    titulo: "Assinar documento de férias",
    descricao:
      "Funcionário assina pelo sistema um documento de férias enviado pelo RH (selo digital no rodapé).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/solicitacoes/:id/ferias/rodadas/:ordem/documentos/:indice/assinar",
    titulo: "Assinar documento do 2º/3º período de férias",
    descricao:
      "Funcionário assina pelo sistema um documento da rodada de um período futuro das férias divididas.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/solicitacoes/:id/ferias/rodadas/:ordem/documentos/:indice/rejeitar",
    titulo: "Rejeitar documento do 2º/3º período de férias",
    descricao:
      "Funcionário rejeita, com justificativa, um documento da rodada de um período futuro das férias.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/solicitacoes/:id/ferias/documentos/:indice/rejeitar",
    titulo: "Rejeitar documento de férias",
    descricao:
      "Funcionário rejeita um documento de férias com justificativa; a solicitação volta ao RH.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/ferias/calendario",
    titulo: "Calendário da vedação de férias",
    descricao:
      "Feriados e dias úteis usados para conferir a vedação do início das férias antes de feriado/repouso.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/hora-extra/local-do-dia",
    titulo: "Local das batidas do dia (hora extra)",
    descricao:
      "Indica se as batidas do dia foram no CFO ou em casa, para a regra de hora extra do ACT.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/requerimento-endereco",
    titulo: "Requerimento de endereço",
    descricao: "Consulta a solicitação de atualização de endereço residencial pendente.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/requerimento-endereco/responder",
    titulo: "Responder requerimento de endereço",
    descricao: "Funcionário informa/confirma o endereço residencial solicitado pelo RH.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/requerimento-cadastro",
    titulo: "Requerimentos de cadastro",
    descricao:
      "Lista os requerimentos pendentes de dependentes, formação acadêmica e cursos, com os dados atuais.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/requerimento-cadastro/:tipo/responder",
    titulo: "Responder requerimento de cadastro",
    descricao:
      "Funcionário informa dependentes, formação acadêmica ou cursos/capacitações solicitados pelo RH.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/minha-foto/solicitar-atualizacao",
    titulo: "Solicitar atualização de foto",
    descricao: "Marca que a próxima marcação de ponto com foto deve atualizar a foto de perfil.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/documentos-rh",
    titulo: "Documentos do RH (listar)",
    descricao: "Lista documentos enviados pelo RH ao funcionário (guias, folhas de férias etc.).",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "POST",
    pathPattern: "/ponto/documentos-rh",
    titulo: "Documentos do RH (enviar)",
    descricao: "Envia um documento relacionado a uma solicitação do RH.",
    categoria: "Ponto — Autoatendimento"
  },

  /* ── Assinatura de quadro / banco de horas ── */
  {
    method: "GET",
    pathPattern: "/ponto/assinaturas",
    titulo: "Assinaturas de quadro",
    descricao: "Lista os quadros de ponto mensais pendentes/assinados pelo funcionário.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/ponto/assinaturas/ciclo-banco-horas",
    titulo: "Ciclo de assinatura do banco de horas",
    descricao: "Consulta o ciclo anual de assinatura do banco de horas do funcionário.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/ponto/assinaturas/ciclo-banco-horas/pdf",
    titulo: "PDF do ciclo de banco de horas",
    descricao: "Gera o PDF do relatório anual de banco de horas para assinatura.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/ponto/assinaturas/ciclo-banco-horas/assinatura",
    titulo: "Comprovante de assinatura do ciclo",
    descricao: "Consulta o comprovante/registro da assinatura digital do ciclo de banco de horas.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "POST",
    pathPattern: "/ponto/assinaturas/ciclo-banco-horas/assinar",
    titulo: "Assinar ciclo de banco de horas",
    descricao: "Funcionário assina digitalmente o ciclo anual de banco de horas.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "POST",
    pathPattern: "/ponto/assinaturas/:id/assinar",
    titulo: "Assinar quadro de ponto",
    descricao: "Funcionário assina digitalmente o quadro de ponto mensal.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/ponto/assinaturas/rascunho-pdf",
    titulo: "Rascunho de PDF do quadro",
    descricao: "Gera uma prévia em PDF do quadro de ponto antes da assinatura definitiva.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/ponto/assinaturas/:id/pdf",
    titulo: "PDF do quadro assinado",
    descricao: "Baixa o PDF final (com assinaturas) do quadro de ponto mensal.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/gestao/assinaturas",
    titulo: "Assinaturas pendentes (chefe)",
    descricao: "Lista os quadros de ponto da equipe aguardando assinatura/aprovação do chefe.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/gestao/assinaturas/:id/assinar",
    titulo: "Chefe assina quadro da equipe",
    descricao: "Chefe conclui a assinatura do quadro de ponto de um funcionário da equipe.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/gestao/assinaturas/:id/rejeitar",
    titulo: "Chefe rejeita quadro da equipe",
    descricao:
      "Chefe rejeita o quadro de ponto assinado por um funcionário, devolvendo para correção.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/assinaturas",
    titulo: "Assinaturas (RH — listar)",
    descricao: "RH lista todas as assinaturas de quadro de ponto do período.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/assinaturas/verificar",
    titulo: "Verificar autenticidade de assinatura",
    descricao: "Confere a validade/autenticidade de uma assinatura digital pelo código informado.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/assinaturas/gerar-mes",
    titulo: "Gerar assinaturas do mês",
    descricao:
      "Gera em lote os registros de assinatura de quadro de ponto para todos os funcionários no mês.",
    categoria: "Assinatura de Quadro"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/assinaturas/:id/pdf",
    titulo: "PDF de assinatura (RH)",
    descricao: "RH baixa o PDF de um quadro de ponto assinado.",
    categoria: "Assinatura de Quadro"
  },

  /* ── Auditoria — RH / Chefe ── */
  {
    method: "GET",
    pathPattern: "/auditoria/dashboard",
    titulo: "Dashboard de auditoria",
    descricao: "Indicadores gerais de ponto/frequência para o RH (visão consolidada).",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/dashboard/registros-hora",
    titulo: "Registros por hora (dashboard)",
    descricao: "Distribuição de marcações de ponto por hora do dia, para o dashboard de auditoria.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios",
    titulo: "Funcionários (auditoria — listar)",
    descricao: "Lista funcionários com indicadores de auditoria de ponto.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id",
    titulo: "Funcionário (auditoria — detalhe)",
    descricao: "Detalhe de auditoria de ponto de um funcionário específico.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/registros",
    titulo: "Registros de ponto do funcionário",
    descricao: "RH consulta o histórico bruto de marcações de ponto de um funcionário.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/relatorio",
    titulo: "Relatório do funcionário (RH)",
    descricao: "RH gera relatório de horas trabalhadas de um funcionário específico.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/banco-horas",
    titulo: "Banco de horas do funcionário (RH)",
    descricao: "RH consulta o saldo de banco de horas de um funcionário específico.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/documentos-rh",
    titulo: "Documentos do RH enviados ao funcionário",
    descricao: "Lista os documentos que o RH já enviou a este funcionário (guias, folhas etc.).",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "DELETE",
    pathPattern: "/auditoria/funcionarios/:funcionarioId/documentos-rh/:documentoId",
    titulo: "Excluir documento do RH",
    descricao: "Remove permanentemente um documento enviado pelo RH a um funcionário.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/registros",
    titulo: "Registros de ponto (RH — geral)",
    descricao: "RH lista/filtra registros de ponto de todos os funcionários.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/solicitacoes",
    titulo: "Solicitações (RH — geral)",
    descricao: "RH lista/filtra solicitações de todos os funcionários, em qualquer etapa.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "PUT",
    pathPattern: "/auditoria/solicitacoes/:id/status",
    titulo: "Alterar status de solicitação (RH)",
    descricao: "RH força a alteração de status de uma solicitação (ajuste administrativo).",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/afastamentos",
    titulo: "Afastamentos",
    descricao: "Lista os afastamentos (férias, licenças etc.) registrados dos funcionários.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/periodos",
    titulo: "Períodos de ponto",
    descricao: "Lista os períodos mensais de ponto e seus status de fechamento.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "PUT",
    pathPattern: "/auditoria/periodos/:id/status",
    titulo: "Fechar/reabrir período de ponto",
    descricao: "RH altera o status de fechamento de um período mensal de ponto.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/banco-horas",
    titulo: "Banco de horas (RH — geral)",
    descricao: "RH consulta o saldo de banco de horas de todos os funcionários.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/recalcular-historico-almoco",
    titulo: "Recalcular histórico de almoço",
    descricao: "Reprocessa em lote o cálculo de intervalo de almoço no histórico de ponto.",
    categoria: "Auditoria de Ponto"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/logs",
    titulo: "Logs de auditoria de ponto",
    descricao: "Consulta o histórico de ações administrativas sobre registros de ponto.",
    categoria: "Auditoria de Ponto"
  },

  /* ── Fluxo de aprovação: Chefe ── */
  {
    method: "GET",
    pathPattern: "/auditoria/gestao/equipe",
    titulo: "Minha equipe (chefe)",
    descricao:
      "Lista os funcionários sobre os quais o chefe tem autoridade (gerência, coordenação ou seção).",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/gestao/solicitacoes",
    titulo: "Solicitações da equipe (chefe)",
    descricao: "Lista as solicitações da equipe pendentes de decisão do chefe.",
    categoria: "Aprovações"
  },
  {
    method: "PATCH",
    pathPattern: "/auditoria/gestao/solicitacoes/:id",
    titulo: "Chefe aprova/rejeita solicitação",
    descricao: "Chefe decide (aprova ou rejeita) uma solicitação de um funcionário da equipe.",
    categoria: "Aprovações"
  },

  /* ── Fluxo de aprovação: RH ── */
  {
    method: "GET",
    pathPattern: "/auditoria/rh/solicitacoes",
    titulo: "Solicitações aguardando RH",
    descricao: "Lista as solicitações já aprovadas pelo chefe, aguardando decisão final do RH.",
    categoria: "Aprovações"
  },
  {
    method: "PATCH",
    pathPattern: "/auditoria/rh/solicitacoes/:id",
    titulo: "RH aprova/rejeita solicitação",
    descricao: "RH dá a decisão final (aprova ou rejeita) sobre uma solicitação.",
    categoria: "Aprovações"
  },
  {
    method: "PATCH",
    pathPattern: "/auditoria/rh/solicitacoes/:id/enviar-guia",
    titulo: "RH envia guia médica",
    descricao: "RH anexa e envia a guia médica referente a uma solicitação de atestado.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/ferias/rodadas",
    titulo: "Rodadas de Aviso/Recibo de férias (consulta)",
    descricao: "Lista os períodos futuros de férias divididas que aguardam Aviso e Recibo do RH.",
    categoria: "Aprovações"
  },
  {
    method: "PATCH",
    pathPattern: "/auditoria/rh/solicitacoes/:id/ferias/rodadas/:ordem/documentos",
    titulo: "RH envia Aviso e Recibo do 2º/3º período",
    descricao:
      "RH anexa Aviso e Recibo de um período futuro das férias divididas para assinatura do funcionário.",
    categoria: "Aprovações"
  },
  {
    method: "PATCH",
    pathPattern: "/auditoria/rh/solicitacoes/:id/enviar-folha-ferias",
    titulo: "RH envia folha de férias",
    descricao: "RH anexa e envia a folha de pagamento de férias para assinatura do funcionário.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/funcionarios/:id/banco-horas/liberacoes",
    titulo: "Tempo de banco liberado pelo RH (consulta)",
    descricao: "Saldo, tempo liberado, usado e disponível do funcionário para abono.",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/rh/funcionarios/:id/banco-horas/liberacoes",
    titulo: "RH libera tempo do banco para abono",
    descricao:
      "RH libera um tempo do banco de horas positivo (com validade e justificativa) para o funcionário usar como abono.",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/rh/funcionarios/:id/banco-horas/liberacoes/:liberacaoId/revogar",
    titulo: "RH revoga tempo de banco liberado",
    descricao: "RH revoga o tempo liberado e ainda não usado (com justificativa).",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/banco-horas/credito/simular",
    titulo: "Simular uso do tempo liberado",
    descricao: "Prévia de quanto o abono consumiria do tempo de banco liberado pelo RH.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/banco-horas/mes",
    titulo: "Banco de horas do mês (RH)",
    descricao: "Saldo por dia e acumulado do banco de horas de um mês do funcionário.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/cid-grupos",
    titulo: "Grupos do CID (dropdown do atestado)",
    descricao: "Lista os grupos do CID ativos para o atestado médico.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/cid-grupos/gestao",
    titulo: "Grupos do CID (gestão)",
    descricao: "RH lista todos os grupos do CID, ativos e inativos.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/cid-grupos",
    titulo: "RH adiciona grupo do CID",
    descricao: "Novo grupo do CID para o atestado médico.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/cid-grupos/:id",
    titulo: "RH edita grupo do CID",
    descricao: "Edita código e descrição de um grupo do CID.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/cid-grupos/:id/ativo",
    titulo: "RH ativa/desativa grupo do CID",
    descricao: "Ativa ou desativa um grupo do CID.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/cid-grupos/ordem",
    titulo: "RH reordena grupos do CID",
    descricao: "Define a ordem dos grupos do CID.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/cid-grupos/:id",
    titulo: "Super usuário exclui grupo do CID",
    descricao: "Exclusão definitiva (só super usuário).",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/tipos-licenca",
    titulo: "Tipos de licença (regras)",
    descricao: "Lista os tipos de licença ativos.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/tipos-licenca/gestao",
    titulo: "Tipos de licença (gestão)",
    descricao: "RH lista todos os tipos de licença.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/tipos-licenca",
    titulo: "RH adiciona tipo de licença",
    descricao: "Novo tipo de licença com suas regras.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/tipos-licenca/:id",
    titulo: "RH edita tipo de licença",
    descricao: "Edita as regras de um tipo de licença.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/tipos-licenca/:id/ativo",
    titulo: "RH ativa/desativa tipo de licença",
    descricao: "Ativa ou desativa um tipo de licença.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/tipos-licenca/ordem",
    titulo: "RH reordena tipos de licença",
    descricao: "Define a ordem dos tipos de licença.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/tipos-licenca/:id",
    titulo: "Super usuário exclui tipo de licença",
    descricao: "Exclusão definitiva (só super usuário).",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/licenca/tipos",
    titulo: "Tipos de licença do funcionário",
    descricao: "Tipos permitidos à categoria, com saldo por janela.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "PATCH",
    pathPattern: "/auditoria/rh/solicitacoes/:id/cid",
    titulo: "RH altera o CID do atestado",
    descricao: "RH completa ou corrige o grupo do CID do atestado.",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/rh/funcionarios/:id/solicitacoes",
    titulo: "RH abre solicitação em nome do funcionário",
    descricao:
      "RH cria atestado, licença, abono, day off, hora extra ou envio de documento pelo funcionário (marcado como do RH).",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/funcionarios/:id/solicitar/perfil",
    titulo: "Dados do funcionário para solicitação do RH",
    descricao: "Categoria e perfil usados pelos formulários.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/funcionarios/:id/solicitar/credito-banco",
    titulo: "Tempo liberado do funcionário (RH)",
    descricao: "Tempo de banco liberado disponível, para o RH solicitar abono.",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/rh/funcionarios/:id/solicitar/credito-banco/simular",
    titulo: "Simula tempo liberado (RH)",
    descricao: "Prévia do consumo do tempo liberado.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/funcionarios/:id/solicitar/abono-cota",
    titulo: "Cota de abono do funcionário (RH)",
    descricao: "Saldo da cota de abono diário, para o RH solicitar.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/funcionarios/:id/solicitar/licenca-tipos",
    titulo: "Tipos de licença do funcionário (RH)",
    descricao: "Tipos de licença permitidos, com saldo, para o RH solicitar.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/banco-horas/tolerancia-fechamento",
    titulo: "Tolerância do fechamento do banco (global)",
    descricao: "Consulta a tolerância global, em dias, do fechamento do banco de horas.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/banco-horas/tolerancia-fechamento",
    titulo: "RH define a tolerância global do fechamento",
    descricao: "Define quantos dias após a data-marco o banco de horas é fechado.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/gestao/funcionarios/:id/banco-horas/tolerancia-fechamento",
    titulo: "Tolerância do fechamento do funcionário",
    descricao: "Consulta a tolerância individual e a global do funcionário.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/gestao/funcionarios/:id/banco-horas/tolerancia-fechamento",
    titulo: "RH define a tolerância individual do fechamento",
    descricao: "Define, para um funcionário, quantos dias o fechamento do banco é adiado.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/fechamentos-situacao",
    titulo: "Fechamentos do banco por mudança de situação",
    descricao:
      "Saldo do banco de horas registrado quando o funcionário passou a não registrar ponto ou voltou a registrar.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/assinaturas/folhas",
    titulo: "Minhas folhas de ponto assinadas",
    descricao: "Lista as folhas totalmente assinadas (para baixar) e as que faltam assinar.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/folhas-assinadas",
    titulo: "Folhas assinadas do funcionário (RH)",
    descricao: "RH lista as folhas de ponto totalmente assinadas de um funcionário.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/saude-ocupacional/painel",
    titulo: "Painel de exames ocupacionais",
    descricao: "RH consulta a situação do exame periódico de todos os funcionários.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "GET",
    pathPattern: "/ponto/saude-ocupacional/funcionarios/:id/exames",
    titulo: "Exames do funcionário (RH)",
    descricao: "RH consulta o histórico de exames de um funcionário.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "POST",
    pathPattern: "/ponto/saude-ocupacional/funcionarios/:id/exames",
    titulo: "RH registra exame periódico",
    descricao: "RH lança um exame periódico já confirmado.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/saude-ocupacional/exames/:id",
    titulo: "RH edita exame periódico",
    descricao: "RH corrige os dados de um exame.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "POST",
    pathPattern: "/ponto/saude-ocupacional/exames/:id/confirmar",
    titulo: "RH confirma exame enviado",
    descricao: "RH confere o ASO e confirma o exame enviado pelo funcionário.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "POST",
    pathPattern: "/ponto/saude-ocupacional/exames/:id/devolver",
    titulo: "RH devolve exame enviado",
    descricao: "RH devolve o exame ao funcionário com o motivo.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "POST",
    pathPattern: "/ponto/saude-ocupacional/solicitar",
    titulo: "RH solicita exame ao funcionário",
    descricao: "RH cria a requisição de exame médico para funcionários.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "GET",
    pathPattern: "/ponto/saude-ocupacional/config",
    titulo: "Config. de exames ocupacionais",
    descricao: "Consulta periodicidade e dias de aviso.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/saude-ocupacional/config",
    titulo: "RH configura exames ocupacionais",
    descricao: "Define periodicidade (meses) e dias de aviso.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/saude-ocupacional/exames/:id",
    titulo: "Super usuário exclui exame",
    descricao: "Exclusão definitiva de um exame lançado.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "GET",
    pathPattern: "/ponto/saude-ocupacional/exames/:id/arquivo",
    titulo: "Baixar ASO",
    descricao: "Download do ASO (RH autorizado ou o próprio funcionário).",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "GET",
    pathPattern: "/ponto/meus-exames",
    titulo: "Meus exames médicos",
    descricao: "Funcionário consulta seus exames e o próximo vencimento.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "POST",
    pathPattern: "/ponto/meus-exames",
    titulo: "Enviar meu exame médico",
    descricao: "Funcionário envia o ASO do exame periódico para conferência.",
    categoria: "Saúde Ocupacional"
  },
  {
    method: "GET",
    pathPattern: "/ponto/abono/cota",
    titulo: "Cota de abono diário (meu saldo)",
    descricao:
      "Funcionário consulta o saldo e o histórico da cota de abono diário do acordo coletivo.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/funcionarios/:id/abono/cota",
    titulo: "Cota de abono diário do funcionário (RH)",
    descricao: "RH consulta o saldo e o histórico da cota de abono diário de um funcionário.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/banco-horas/credito",
    titulo: "Tempo de banco liberado pelo RH (meu)",
    descricao: "Funcionário consulta o tempo liberado pelo RH disponível para abono.",
    categoria: "Ponto — Autoatendimento"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/funcionarios/:id/ferias/saldo",
    titulo: "Saldo de férias (RH)",
    descricao: "RH consulta o saldo de férias de um funcionário específico.",
    categoria: "Aprovações"
  },
  {
    method: "GET",
    pathPattern: "/auditoria/rh/funcionarios/:id/ferias/calendario",
    titulo: "Calendário de vedação de férias (RH)",
    descricao: "Feriados e dias úteis do funcionário para conferir a vedação ao agendar férias.",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/rh/funcionarios/:id/ferias",
    titulo: "RH agenda férias",
    descricao:
      "RH agenda as férias de um ciclo do funcionário (aprovadas na hora, com justificativa).",
    categoria: "Aprovações"
  },
  {
    method: "PUT",
    pathPattern: "/auditoria/rh/funcionarios/:id/ferias/:solicitacaoId",
    titulo: "RH altera férias",
    descricao:
      "RH altera férias aprovadas ou em análise; a original é cancelada e os afastamentos refeitos.",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/rh/funcionarios/:id/ferias/:solicitacaoId/cancelar",
    titulo: "RH cancela férias",
    descricao:
      "RH cancela férias do funcionário com justificativa; remove os afastamentos e libera o saldo.",
    categoria: "Aprovações"
  },
  {
    method: "POST",
    pathPattern: "/auditoria/rh/funcionarios/:id/correcao-ponto",
    titulo: "RH cria correção de ponto",
    descricao:
      "RH registra uma correção de ponto em nome do funcionário, para aprovação do Gerente de RH.",
    categoria: "Aprovações"
  },
  {
    method: "PATCH",
    pathPattern: "/auditoria/admin/correcoes-rh/:id",
    titulo: "Aprovar correção criada pelo RH",
    descricao:
      "Gerente de RH (ponto-admin) aprova ou rejeita uma correção de ponto criada pelo RH.",
    categoria: "Aprovações"
  },

  /* ── Sincronização com AD / API de ramais ── */
  {
    method: "GET",
    pathPattern: "/admin/extensions/config",
    titulo: "Configuração da API de ramais",
    descricao:
      "Consulta a URL/token configurados para a API de sincronização com o AD (Extensions).",
    categoria: "Sincronização (AD/Extensions)"
  },
  {
    method: "PUT",
    pathPattern: "/admin/extensions/config",
    titulo: "Salvar configuração da API de ramais",
    descricao: "Atualiza a URL/token usados para sincronizar gerências e funcionários com o AD.",
    categoria: "Sincronização (AD/Extensions)"
  },
  {
    method: "DELETE",
    pathPattern: "/admin/extensions/config",
    titulo: "Remover configuração customizada",
    descricao:
      "Remove a configuração customizada da API de ramais, voltando ao padrão do ambiente.",
    categoria: "Sincronização (AD/Extensions)"
  },
  {
    method: "POST",
    pathPattern: "/admin/extensions/test",
    titulo: "Testar conexão com a API de ramais",
    descricao: "Testa a conectividade com a API de seções/ramais do AD.",
    categoria: "Sincronização (AD/Extensions)"
  },
  {
    method: "GET",
    pathPattern: "/admin/extensions/lookup",
    titulo: "Consultar usuário no AD",
    descricao: "Consulta os dados de um usuário específico na API de ramais (AD), sem sincronizar.",
    categoria: "Sincronização (AD/Extensions)"
  },
  {
    method: "POST",
    pathPattern: "/admin/extensions/sync",
    titulo: "Sincronizar Gerências",
    descricao:
      "Sincroniza gerências e funcionários a partir do AD. Só cria/atualiza quem tem matrícula " +
      "(staffId) real — sem matrícula, o funcionário é ignorado e sem acesso ao sistema.",
    categoria: "Sincronização (AD/Extensions)"
  },
  {
    method: "GET",
    pathPattern: "/admin/extensions/sync/status",
    titulo: "Status da última sincronização",
    descricao:
      "Consulta o resultado (criados, atualizados, ignorados, erros) da última sincronização.",
    categoria: "Sincronização (AD/Extensions)"
  },

  /* ── Gestão de Funcionários (RH) ── */
  {
    method: "GET",
    pathPattern: "/ponto/gestao/gerencias",
    titulo: "Listar gerências",
    descricao: "Lista as gerências/departamentos cadastrados.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "POST",
    pathPattern: "/ponto/gestao/gerencias",
    titulo: "Criar gerência",
    descricao: "Cria uma nova gerência/departamento.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/gestao/gerencias/:id",
    titulo: "Editar gerência",
    descricao: "Atualiza dados de uma gerência (nome, sigla, responsável, descrição, ativa).",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/gestao/gerencias/:id/responsavel",
    titulo: "Definir responsável da gerência",
    descricao: "Define/remove qual usuário é o responsável (chefe) oficial de uma gerência.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/gestao/gerencias/:id",
    titulo: "Excluir gerência",
    descricao: "Remove uma gerência do sistema.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "GET",
    pathPattern: "/ponto/gestao/funcionarios",
    titulo: "Listar funcionários",
    descricao:
      "Lista todos os funcionários cadastrados, com dados de gerência, categoria e situação.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "POST",
    pathPattern: "/ponto/gestao/funcionarios",
    titulo: "Cadastrar funcionário",
    descricao: "Cria manualmente um novo funcionário (fora do fluxo de sincronização com o AD).",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/gestao/funcionarios/:id",
    titulo: "Editar funcionário",
    descricao:
      "Atualiza dados de um funcionário: matrícula, cargo, categoria, gerência, situação " +
      "(ativo/inativo), chefe substituto, campos manuais configurados, entre outros.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "POST",
    pathPattern: "/ponto/gestao/funcionarios/:id/requerimento-endereco",
    titulo: "Solicitar endereço a um funcionário",
    descricao: "Envia ao funcionário um pedido para confirmar/atualizar o endereço residencial.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "POST",
    pathPattern: "/ponto/gestao/requerimento-endereco/todos",
    titulo: "Solicitar endereço a todos",
    descricao:
      "Envia o pedido de confirmação de endereço residencial para todos os funcionários ativos.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "GET",
    pathPattern: "/ponto/gestao/requerimento-endereco/alvos",
    titulo: "Contar destinatários do requerimento de endereço",
    descricao: "Quantidade de funcionários ativos que receberiam o pedido de endereço.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "POST",
    pathPattern: "/ponto/gestao/funcionarios/:id/requerimento-cadastro/:tipo",
    titulo: "Solicitar dado cadastral a um funcionário",
    descricao:
      "Envia ao funcionário um pedido para informar dependentes, formação acadêmica ou cursos.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "GET",
    pathPattern: "/ponto/gestao/requerimento-cadastro/:tipo/alvos",
    titulo: "Contar destinatários do requerimento de cadastro",
    descricao: "Quantidade de Empregados e Comissionados ativos que receberiam o pedido.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "POST",
    pathPattern: "/ponto/gestao/requerimento-cadastro/:tipo/todos",
    titulo: "Solicitar dado cadastral a todos",
    descricao:
      "Envia o pedido de dependentes, formação acadêmica ou cursos a todos os Empregados e Comissionados ativos.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "GET",
    pathPattern: "/ponto/gestao/funcionarios/:id/endereco",
    titulo: "Ver endereço do funcionário",
    descricao: "Consulta o endereço residencial cadastrado de um funcionário.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/gestao/funcionarios/:id/endereco",
    titulo: "Editar endereço do funcionário",
    descricao: "RH atualiza manualmente o endereço residencial de um funcionário.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/gestao/funcionarios/:id/modalidade",
    titulo: "Definir modalidade de trabalho",
    descricao: "Define se o funcionário trabalha em home office e/ou modelo híbrido.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/gestao/funcionarios/:id/jornada-periodo",
    titulo: "Definir jornada do funcionário",
    descricao: "Associa um período de jornada de trabalho específico ao funcionário.",
    categoria: "Gestão de Funcionários"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/gestao/funcionarios/:id",
    titulo: "Excluir funcionário",
    descricao:
      "Exclui permanentemente o cadastro de um funcionário. Restrito a Super Administrador, " +
      "com número de chamado interno obrigatório para auditoria.",
    categoria: "Gestão de Funcionários"
  },

  /* ── Configurações do sistema (ponto/config) ── */
  {
    method: "GET",
    pathPattern: "/ponto/config/sistema",
    titulo: "Configurações gerais do sistema",
    descricao:
      "Consulta as configurações institucionais, de geolocalização e de modos de bater ponto.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/sistema",
    titulo: "Salvar configurações gerais",
    descricao:
      "Atualiza as configurações institucionais, de geolocalização e períodos de trabalho.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/branding",
    titulo: "Identidade institucional (público)",
    descricao:
      "Endpoint público com nome, telefone e e-mail institucional exibidos no cabeçalho/login.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/provedores",
    titulo: "Provedores de rede",
    descricao: "Lista os provedores de internet homologados para bater ponto.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/provedores",
    titulo: "Cadastrar provedor de rede",
    descricao: "Adiciona um novo provedor de internet homologado.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/provedores/:id/toggle",
    titulo: "Ativar/desativar provedor",
    descricao: "Ativa ou desativa um provedor de rede homologado.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/provedores/:id",
    titulo: "Excluir provedor de rede",
    descricao: "Remove um provedor de internet homologado.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/subredes",
    titulo: "Sub-redes homologadas",
    descricao: "Lista as faixas de IP/sub-redes homologadas para bater ponto via desktop.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/subredes",
    titulo: "Cadastrar sub-rede",
    descricao: "Adiciona uma nova sub-rede homologada.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/subredes/:id",
    titulo: "Excluir sub-rede",
    descricao: "Remove uma sub-rede homologada.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/areas",
    titulo: "Áreas de viagem",
    descricao: "Lista as áreas geográficas homologadas para o modo viagem.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/areas",
    titulo: "Cadastrar área de viagem",
    descricao: "Adiciona uma nova área geográfica homologada para bater ponto em viagem.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/areas/:id",
    titulo: "Editar área de viagem",
    descricao: "Atualiza os dados de uma área de viagem homologada.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/areas/:id/toggle",
    titulo: "Ativar/desativar área de viagem",
    descricao: "Ativa ou desativa uma área de viagem homologada.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/areas/:id",
    titulo: "Excluir área de viagem",
    descricao: "Remove uma área de viagem homologada.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/jornadas",
    titulo: "Jornadas de trabalho",
    descricao: "Lista os períodos/jornadas de trabalho configurados.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/jornadas",
    titulo: "Criar jornada de trabalho",
    descricao: "Cria um novo período/jornada de trabalho configurável.",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/jornadas/:id",
    titulo: "Editar jornada de trabalho",
    descricao: "Atualiza um período/jornada de trabalho já cadastrado.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/jornadas/:id/padrao",
    titulo: "Definir jornada padrão",
    descricao: "Marca uma jornada como a padrão do sistema.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/jornadas/:id",
    titulo: "Excluir jornada de trabalho",
    descricao: "Remove um período/jornada de trabalho configurado.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/banco-horas/marcos",
    titulo: "Marcos de vencimento do banco de horas",
    descricao: "Lista as datas-marco de vencimento anual do banco de horas.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/banco-horas/marcos",
    titulo: "Criar marco de banco de horas",
    descricao: "Cadastra uma nova data-marco de vencimento do banco de horas.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/banco-horas/marcos/:id",
    titulo: "Excluir marco de banco de horas",
    descricao: "Remove uma data-marco de vencimento do banco de horas.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/solicitacoes",
    titulo: "Regras de solicitações",
    descricao:
      "Consulta as regras de negócio configuráveis para solicitações (prazos, limites etc.).",
    categoria: "Configurações"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/config/solicitacoes",
    titulo: "Salvar regras de solicitações",
    descricao: "Atualiza as regras de negócio configuráveis para solicitações.",
    categoria: "Configurações"
  },
  {
    method: "GET",
    pathPattern: "/ponto/config/feriados",
    titulo: "Feriados (configuração)",
    descricao: "Lista os feriados cadastrados para fins de configuração/edição.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/feriados/importar",
    titulo: "Importar feriados do ano",
    descricao: "Importa automaticamente os feriados nacionais/estaduais de um ano de referência.",
    categoria: "Configurações"
  },
  {
    method: "POST",
    pathPattern: "/ponto/config/feriados",
    titulo: "Cadastrar feriado",
    descricao: "Adiciona manualmente um feriado ao calendário.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/feriados/:id",
    titulo: "Editar feriado",
    descricao: "Atualiza os dados de um feriado cadastrado.",
    categoria: "Configurações"
  },
  {
    method: "PATCH",
    pathPattern: "/ponto/config/feriados/:id/bloqueio",
    titulo: "Bloquear/desbloquear feriado",
    descricao: "Define se um feriado bloqueia o registro de ponto normal naquele dia.",
    categoria: "Configurações"
  },
  {
    method: "DELETE",
    pathPattern: "/ponto/config/feriados/:id",
    titulo: "Excluir feriado",
    descricao: "Remove um feriado do calendário.",
    categoria: "Configurações"
  },

  /* ── Notificações ── */
  {
    method: "GET",
    pathPattern: "/notificacao/minhas",
    titulo: "Minhas notificações",
    descricao: "Lista as notificações internas recebidas pelo usuário autenticado.",
    categoria: "Notificações"
  },
  {
    method: "GET",
    pathPattern: "/notificacao/contagem",
    titulo: "Contagem de notificações não lidas",
    descricao: "Retorna quantas notificações não lidas o usuário tem (sino do cabeçalho).",
    categoria: "Notificações"
  },
  {
    method: "PATCH",
    pathPattern: "/notificacao/marcar-todas-lidas",
    titulo: "Marcar todas como lidas",
    descricao: "Marca todas as notificações do usuário como lidas.",
    categoria: "Notificações"
  },
  {
    method: "PATCH",
    pathPattern: "/notificacao/:id/lida",
    titulo: "Marcar notificação como lida",
    descricao: "Marca uma notificação específica como lida.",
    categoria: "Notificações"
  },
  {
    method: "GET",
    pathPattern: "/notificacao/email-config",
    titulo: "Configuração de e-mail (SMTP)",
    descricao: "Consulta a configuração do servidor de e-mail usado para notificações.",
    categoria: "Notificações"
  },
  {
    method: "PUT",
    pathPattern: "/notificacao/email-config",
    titulo: "Salvar configuração de e-mail",
    descricao: "Atualiza host, porta, credenciais e remetente do servidor SMTP.",
    categoria: "Notificações"
  },
  {
    method: "POST",
    pathPattern: "/notificacao/email-config/testar",
    titulo: "Testar envio de e-mail",
    descricao: "Envia um e-mail de teste para validar a configuração SMTP.",
    categoria: "Notificações"
  },
  {
    method: "GET",
    pathPattern: "/notificacao/config",
    titulo: "Configuração de eventos de notificação",
    descricao: "Lista todos os eventos de notificação do sistema e se e-mail/sistema estão ativos.",
    categoria: "Notificações"
  },
  {
    method: "PUT",
    pathPattern: "/notificacao/config/:id",
    titulo: "Ativar/desativar evento de notificação",
    descricao: "Liga ou desliga o envio por e-mail e/ou pelo sistema de um evento de notificação.",
    categoria: "Notificações"
  },
  {
    method: "POST",
    pathPattern: "/notificacao/manual",
    titulo: "Envio manual de notificação",
    descricao:
      "RH/admin envia manualmente uma notificação (e-mail/sistema) para um grupo de pessoas.",
    categoria: "Notificações"
  },
  {
    method: "GET",
    pathPattern: "/notificacao/emails-funcionarios/:grupo",
    titulo: "E-mails de um grupo",
    descricao: "Lista os e-mails dos funcionários de um grupo (todos, gestores, RH etc.).",
    categoria: "Notificações"
  },

  /* ── Sistema / Super Admin ── */
  {
    method: "GET",
    pathPattern: "/sistema/super-admins",
    titulo: "Listar super administradores",
    descricao: "Lista quem tem a permissão de Super Administrador concedida atualmente.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "GET",
    pathPattern: "/sistema/candidatos-gerti",
    titulo: "Candidatos a Super Admin (GERTI)",
    descricao:
      "Lista funcionários da GERTI elegíveis a receber a permissão de Super Administrador.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "POST",
    pathPattern: "/sistema/super-admins",
    titulo: "Conceder Super Administrador",
    descricao: "Concede a permissão de Super Administrador a um usuário.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "DELETE",
    pathPattern: "/sistema/super-admins/:userId",
    titulo: "Revogar Super Administrador",
    descricao: "Revoga a permissão de Super Administrador de um usuário.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "GET",
    pathPattern: "/sistema/start",
    titulo: "Consultar Start do Sistema",
    descricao:
      "Consulta o estado do processo de Start (go-live) do sistema para um mês de referência.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "GET",
    pathPattern: "/sistema/start/pendencias",
    titulo: "Pendências do Start",
    descricao: "Lista solicitações de Start do Sistema aguardando aprovação da GERTI ou do RH.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "POST",
    pathPattern: "/sistema/start",
    titulo: "Solicitar Start do Sistema",
    descricao: "Super Administrador solicita o go-live do sistema para um mês de referência.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "POST",
    pathPattern: "/sistema/start/:id/aprovar-gerti",
    titulo: "GERTI aprova Start",
    descricao: "Responsável da GERTI aprova a solicitação de Start do Sistema, encaminhando ao RH.",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "POST",
    pathPattern: "/sistema/start/:id/aprovar-rh",
    titulo: "RH aprova e executa Start",
    descricao: "Responsável do RH aprova o Start, executando o go-live (marco de banco de horas).",
    categoria: "Sistema / Super Admin"
  },
  {
    method: "POST",
    pathPattern: "/sistema/start/:id/rejeitar",
    titulo: "Rejeitar Start do Sistema",
    descricao: "GERTI ou RH rejeita a solicitação de Start do Sistema.",
    categoria: "Sistema / Super Admin"
  },

  /* ── Logs / Observabilidade (Super Admin) ── */
  {
    method: "GET",
    pathPattern: "/logs/entries",
    titulo: "Consultar logs de auditoria",
    descricao: "Lista/filtra as requisições registradas no AuditLog (tela de Logs do Super Admin).",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/catalog",
    titulo: "Catálogo de endpoints",
    descricao: "Retorna a lista de endpoints do sistema com título, descrição e categoria.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/dashboard",
    titulo: "Dashboard de logs",
    descricao: "Indicadores de volume e categorias de requisições nos últimos 30 dias.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/performance",
    titulo: "Desempenho do sistema",
    descricao: "Métricas de latência (p50/p95), volume por hora e taxa de erro nas últimas 24h.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/metrics/system",
    titulo: "Métricas do processo (host)",
    descricao: "Uso de memória/CPU e tempo de atividade do processo do backend.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/export/csv",
    titulo: "Exportar logs (CSV)",
    descricao: "Exporta os logs filtrados em formato CSV.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/stream",
    titulo: "Logs em tempo real (SSE)",
    descricao: "Conexão de eventos ao vivo para novos registros de log (Server-Sent Events).",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/backup/jobs",
    titulo: "Jobs de backup",
    descricao: "Lista os jobs de backup do banco de dados e seu histórico.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "POST",
    pathPattern: "/logs/backup/jobs",
    titulo: "Agendar job de backup",
    descricao: "Agenda manualmente a execução de um backup do banco de dados.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/backup/polling-config",
    titulo: "Configuração de polling de backup",
    descricao: "Consulta o intervalo de verificação do agente de backup.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "POST",
    pathPattern: "/logs/api-tokens",
    titulo: "Criar token de API",
    descricao: "Gera um novo token de acesso para integração via API externa.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/api-tokens",
    titulo: "Listar tokens de API",
    descricao: "Lista os tokens de API emitidos para integrações externas.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "PATCH",
    pathPattern: "/logs/api-tokens/:id/revoke",
    titulo: "Revogar token de API",
    descricao: "Revoga um token de API emitido, invalidando seu uso.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "DELETE",
    pathPattern: "/logs/api-tokens/:id",
    titulo: "Excluir token de API",
    descricao: "Remove permanentemente um token de API.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/api-servidora/config",
    titulo: "Configuração da API Servidora",
    descricao:
      "Consulta a configuração da integração de API Servidora (feriados/consulta pública).",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/api-servidora/feriados-preview",
    titulo: "Prévia de feriados (API Servidora)",
    descricao: "Mostra uma prévia dos feriados que serão expostos pela API pública.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/ingest/events",
    titulo: "Eventos de ingestão recebidos",
    descricao: "Lista os eventos recebidos pela API de ingestão de logs (MonitorSistema).",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/ingest/config",
    titulo: "Configuração de ingestão",
    descricao: "Consulta a configuração da chave/URL de ingestão de logs.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/ingest/local-ip",
    titulo: "IP local do servidor",
    descricao: "Retorna o IP local do servidor, usado para configurar a integração de ingestão.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "PUT",
    pathPattern: "/logs/ingest/destination",
    titulo: "Definir destino da ingestão",
    descricao: "Define a URL de destino para onde os audit logs são replicados (MonitorSistema).",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "DELETE",
    pathPattern: "/logs/ingest/destination",
    titulo: "Remover destino da ingestão",
    descricao: "Remove a URL de destino configurada para replicação de logs.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "POST",
    pathPattern: "/logs/ingest/test-connection",
    titulo: "Testar conexão de ingestão",
    descricao: "Testa a conectividade com o destino configurado de ingestão de logs.",
    categoria: "Logs / Observabilidade"
  },
  {
    method: "GET",
    pathPattern: "/logs/ingest/polling-config",
    titulo: "Configuração de polling de ingestão",
    descricao: "Consulta o intervalo de verificação da ingestão de logs.",
    categoria: "Logs / Observabilidade"
  },

  /* ── APIs de integração externa (públicas/servidor a servidor) ── */
  {
    method: "GET",
    pathPattern: "/api-publica/v1/feriados",
    titulo: "Feriados (API pública)",
    descricao: "Endpoint público (autenticado por chave de sistema) com a lista de feriados.",
    categoria: "APIs Externas"
  },
  {
    method: "GET",
    pathPattern: "/api-publica/v1/configuracoes",
    titulo: "Configurações (API pública)",
    descricao: "Endpoint público (autenticado por chave de sistema) com configurações gerais.",
    categoria: "APIs Externas"
  },
  {
    method: "GET",
    pathPattern: "/backup-agent/jobs/next",
    titulo: "Próximo job de backup (agente)",
    descricao: "Agente externo de backup consulta se há um job de backup pendente para executar.",
    categoria: "APIs Externas"
  },
  {
    method: "POST",
    pathPattern: "/backup-agent/runs/:runId/heartbeat",
    titulo: "Heartbeat do backup (agente)",
    descricao: "Agente de backup sinaliza que uma execução de backup está em andamento.",
    categoria: "APIs Externas"
  },
  {
    method: "POST",
    pathPattern: "/backup-agent/runs/:runId/artifact",
    titulo: "Enviar artefato de backup",
    descricao: "Agente de backup envia o arquivo gerado ao concluir o backup.",
    categoria: "APIs Externas"
  },
  {
    method: "POST",
    pathPattern: "/backup-agent/runs/:runId/failure",
    titulo: "Reportar falha de backup",
    descricao: "Agente de backup informa que uma execução de backup falhou.",
    categoria: "APIs Externas"
  },
  {
    method: "POST",
    pathPattern: "/ingest/push-http",
    titulo: "Receber evento externo (ingestão)",
    descricao:
      "Endpoint que recebe eventos de auditoria/observabilidade enviados por outro sistema.",
    categoria: "APIs Externas"
  },
  {
    method: "GET",
    pathPattern: "/glpi/sso-redirect",
    titulo: "Redirecionamento SSO — GLPI",
    descricao: "Gera o link de acesso autenticado (SSO) ao sistema GLPI de chamados.",
    categoria: "APIs Externas"
  },
  {
    method: "POST",
    pathPattern: "/glpi/tickets",
    titulo: "Abrir chamado no GLPI",
    descricao: "Cria um chamado técnico no sistema GLPI a partir do ponto eletrônico.",
    categoria: "APIs Externas"
  },

  /* ── Administração de usuários (Keycloak) ── */
  {
    method: "GET",
    pathPattern: "/admin/keycloak/grupos",
    titulo: "Grupos do Keycloak",
    descricao: "Lista os grupos de acesso configurados no Keycloak (SSO).",
    categoria: "Administração"
  },
  {
    method: "PUT",
    pathPattern: "/admin/keycloak/grupos/:id/papeis",
    titulo: "Definir papéis de um grupo",
    descricao: "Define quais papéis (roles) um grupo do Keycloak concede aos seus membros.",
    categoria: "Administração"
  },
  {
    method: "DELETE",
    pathPattern: "/admin/keycloak/grupos/:id/papeis",
    titulo: "Remover papéis de um grupo",
    descricao: "Remove papéis (roles) associados a um grupo do Keycloak.",
    categoria: "Administração"
  },
  {
    method: "GET",
    pathPattern: "/admin/keycloak/usuarios",
    titulo: "Usuários do Keycloak",
    descricao: "Lista/busca usuários cadastrados no Keycloak (SSO).",
    categoria: "Administração"
  },
  {
    method: "GET",
    pathPattern: "/admin/keycloak/usuarios/:id/grupos",
    titulo: "Grupos de um usuário",
    descricao: "Lista a quais grupos do Keycloak um usuário pertence.",
    categoria: "Administração"
  },
  {
    method: "GET",
    pathPattern: "/admin/grupos-sistema",
    titulo: "Grupos/papéis do sistema",
    descricao: "Lista os papéis de acesso definidos internamente pelo sistema de ponto.",
    categoria: "Administração"
  },
  {
    method: "GET",
    pathPattern: "/admin/usuarios",
    titulo: "Usuários locais (busca)",
    descricao: "Busca usuários já sincronizados localmente no sistema de ponto.",
    categoria: "Administração"
  },
  {
    method: "PATCH",
    pathPattern: "/admin/usuarios/:id/email-real",
    titulo: "Corrigir e-mail real do usuário",
    descricao: "Corrige manualmente o e-mail institucional real de um usuário.",
    categoria: "Administração"
  },

  /* ── Perfis do RH (Gerente de RH) ── */
  {
    method: "GET",
    pathPattern: "/ponto/perfis-rh/minhas",
    titulo: "Minhas permissões do RH",
    descricao: "Abas e funções do RH liberadas para o usuário logado (monta menu e abas).",
    categoria: "Perfis do RH"
  },
  {
    method: "GET",
    pathPattern: "/ponto/perfis-rh/funcionarios",
    titulo: "Listar perfis do RH",
    descricao: "Gerente de RH lista os funcionários do RH e as permissões de cada um.",
    categoria: "Perfis do RH"
  },
  {
    method: "PUT",
    pathPattern: "/ponto/perfis-rh/funcionarios/:id",
    titulo: "Salvar perfil do RH",
    descricao: "Gerente de RH define as abas e funções liberadas para um funcionário do RH.",
    categoria: "Perfis do RH"
  },
  {
    method: "POST",
    pathPattern: "/ponto/perfis-rh/copiar",
    titulo: "Copiar perfil do RH",
    descricao: "Gerente de RH aplica o perfil de um funcionário do RH a vários outros.",
    categoria: "Perfis do RH"
  },

  /* ── Requisições do RH ao funcionário ── */
  {
    method: "POST",
    pathPattern: "/requisicoes-rh",
    titulo: "RH cria requisição",
    descricao:
      "RH cria uma requisição dirigida a um funcionário (exame periódico, envio de documento etc.).",
    categoria: "Requisições do RH"
  },
  {
    method: "GET",
    pathPattern: "/requisicoes-rh",
    titulo: "Listar requisições (RH)",
    descricao: "RH lista as requisições que criou e o status de resposta de cada uma.",
    categoria: "Requisições do RH"
  },
  {
    method: "GET",
    pathPattern: "/requisicoes-rh/minhas",
    titulo: "Minhas requisições do RH",
    descricao: "Funcionário lista as requisições que o RH abriu para ele.",
    categoria: "Requisições do RH"
  },
  {
    method: "GET",
    pathPattern: "/requisicoes-rh/:id",
    titulo: "Detalhe da requisição",
    descricao: "Consulta o detalhe de uma requisição específica do RH.",
    categoria: "Requisições do RH"
  },
  {
    method: "DELETE",
    pathPattern: "/requisicoes-rh/:id",
    titulo: "Excluir requisição",
    descricao: "RH cancela/exclui uma requisição criada.",
    categoria: "Requisições do RH"
  },
  {
    method: "PATCH",
    pathPattern: "/requisicoes-rh/:id/visualizar",
    titulo: "Marcar requisição como vista",
    descricao: "Funcionário marca que visualizou a requisição do RH.",
    categoria: "Requisições do RH"
  },
  {
    method: "PATCH",
    pathPattern: "/requisicoes-rh/:id/responder",
    titulo: "Responder requisição do RH",
    descricao: "Funcionário responde/atende a uma requisição aberta pelo RH.",
    categoria: "Requisições do RH"
  },

  /* ── Outros ── */
  {
    method: "GET",
    pathPattern: "/modules/configs",
    titulo: "Configurações de módulos por área",
    descricao: "Lista quais módulos estão habilitados para cada área da instituição.",
    categoria: "Outros"
  },
  {
    method: "POST",
    pathPattern: "/modules/configs",
    titulo: "Salvar configuração de módulo",
    descricao: "Habilita/desabilita um módulo para uma área específica.",
    categoria: "Outros"
  },
  {
    method: "GET",
    pathPattern: "/org/areas",
    titulo: "Áreas da organização",
    descricao: "Lista as áreas/departamentos cadastrados na estrutura organizacional.",
    categoria: "Outros"
  },
  {
    method: "GET",
    pathPattern: "/realtime/capabilities",
    titulo: "Capacidades de tempo real",
    descricao:
      "Informa quais recursos de tempo real (SSE/websocket) estão disponíveis no ambiente.",
    categoria: "Outros"
  },
  {
    method: "POST",
    pathPattern: "/chat/ask",
    titulo: "Perguntar ao assistente",
    descricao: "Envia uma pergunta ao assistente de chat baseado em regras simples.",
    categoria: "Outros"
  },
  {
    method: "POST",
    pathPattern: "/content/items",
    titulo: "Criar conteúdo público",
    descricao: "Cria um item de conteúdo público (aviso/banner) exibido na intranet.",
    categoria: "Outros"
  },
  {
    method: "PATCH",
    pathPattern: "/content/items/:id/status",
    titulo: "Alterar status de conteúdo",
    descricao: "Publica ou despublica um item de conteúdo.",
    categoria: "Outros"
  },
  {
    method: "GET",
    pathPattern: "/content/public/index",
    titulo: "Conteúdo público (índice)",
    descricao: "Lista os conteúdos públicos publicados no momento.",
    categoria: "Outros"
  },
  {
    method: "POST",
    pathPattern: "/content/banners",
    titulo: "Criar banner",
    descricao: "Cria um banner de destaque exibido na página inicial.",
    categoria: "Outros"
  }
];

/** Remove acentos para comparação de busca tolerante a "coordenacao" vs "coordenação". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Prefixo estático de um pathPattern — trecho antes do primeiro ":param". */
function prefixoEstatico(pathPattern: string): string {
  const idx = pathPattern.indexOf(":");
  return idx === -1 ? pathPattern : pathPattern.slice(0, idx);
}

function pathPatternParaRegex(pathPattern: string): RegExp {
  const escapado = pathPattern
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${escapado}/?$`, "i");
}

const CATALOGO_COM_REGEX = ENDPOINT_CATALOG.map((e) => ({
  entry: e,
  regex: pathPatternParaRegex(e.pathPattern)
}));

/** Remove o prefixo "/api" (se houver) de um path armazenado no AuditLog. */
function semPrefixoApi(path: string): string {
  return path.startsWith("/api/") ? path.slice(4) : path;
}

/** Encontra a descrição de um endpoint pelo método + path (path como veio na requisição,
 *  ex.: "/api/ponto/gestao/funcionarios/cmt123abc"). Retorna null se não houver nenhuma
 *  entrada correspondente no catálogo (endpoint ainda não documentado). */
export function matchEndpoint(
  method: string | null | undefined,
  path: string | null | undefined
): EndpointCatalogEntry | null {
  if (!method || !path) return null;
  const alvo = semPrefixoApi(path);
  const candidatos = CATALOGO_COM_REGEX.filter(
    (c) => c.entry.method === method.toUpperCase() && c.regex.test(alvo)
  );
  if (candidatos.length === 0) return null;
  // Prioriza o padrão mais específico (menos ":" = menos parâmetros livres).
  candidatos.sort((a, b) => {
    const paramsA = (a.entry.pathPattern.match(/:/g) ?? []).length;
    const paramsB = (b.entry.pathPattern.match(/:/g) ?? []).length;
    if (paramsA !== paramsB) return paramsA - paramsB;
    return b.entry.pathPattern.length - a.entry.pathPattern.length;
  });
  return candidatos[0].entry;
}

/** Busca endpoints do catálogo cujo título/descrição/categoria/caminho contenha o texto
 *  informado (usada para a busca por assunto na tela de Logs — ex.: buscar "aprovar
 *  solicitação" encontra os endpoints de aprovação mesmo sem o usuário saber a URL). */
export function buscarEndpointsPorTexto(q: string): EndpointCatalogEntry[] {
  const alvo = normalizar(q.trim());
  if (!alvo) return [];
  return ENDPOINT_CATALOG.filter((e) =>
    [e.titulo, e.descricao, e.categoria, e.pathPattern].some((campo) =>
      normalizar(campo).includes(alvo)
    )
  );
}

/** Prefixos estáticos únicos dos endpoints encontrados por busca textual — usados para
 *  filtrar o AuditLog por "path contém este prefixo" quando a busca é por assunto. */
export function prefixosParaBusca(q: string): string[] {
  const matches = buscarEndpointsPorTexto(q);
  return Array.from(new Set(matches.map((m) => prefixoEstatico(m.pathPattern)).filter(Boolean)));
}
