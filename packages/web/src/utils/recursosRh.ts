/**
 * Catálogo de permissões do RH (Perfis do RH): abas/áreas das páginas de RH e as
 * funções (pontos de função) de cada uma. Espelho de backend/src/utils/recursos-rh.ts
 * — manter os dois iguais.
 *
 * - Aba: chave "pagina.aba" — permissão "Ver" (a aba aparece e os dados são consultáveis).
 * - Função: chave "pagina.aba.funcao" — ação liberada; só vale com o Ver da aba-mãe.
 */
export type PaginaRh =
  | "dashboard"
  | "gestao"
  | "requisicoes"
  | "saude"
  | "auditoria"
  | "configuracoes";

export interface FuncaoRh {
  chave: string;
  rotulo: string;
  descricao: string;
}

export interface AbaRh {
  chave: string;
  pagina: PaginaRh;
  rotulo: string;
  funcoes: FuncaoRh[];
}

const f = (chave: string, rotulo: string, descricao: string): FuncaoRh => ({
  chave,
  rotulo,
  descricao
});

export const ABAS_RH: AbaRh[] = [
  /* ── Dashboard (só leitura) ── */
  {
    chave: "dashboard.visao-geral",
    pagina: "dashboard",
    rotulo: "Visão Geral do Quadro",
    funcoes: []
  },
  {
    chave: "dashboard.perfil-diversidade",
    pagina: "dashboard",
    rotulo: "Perfil e Diversidade",
    funcoes: []
  },
  {
    chave: "dashboard.alertas-eventos",
    pagina: "dashboard",
    rotulo: "Alertas e Eventos",
    funcoes: []
  },
  {
    chave: "dashboard.ponto-frequencia",
    pagina: "dashboard",
    rotulo: "Ponto e Frequência",
    funcoes: []
  },
  {
    chave: "dashboard.afastamentos",
    pagina: "dashboard",
    rotulo: "Afastamentos e Atestados",
    funcoes: []
  },
  {
    chave: "dashboard.solicitacoes",
    pagina: "dashboard",
    rotulo: "Solicitações e Aprovações",
    funcoes: []
  },

  /* ── Gestão ── */
  {
    chave: "gestao.funcionarios",
    pagina: "gestao",
    rotulo: "Funcionários (lista e ficha)",
    funcoes: [
      f(
        "gestao.funcionarios.editar",
        "Editar cadastro",
        "Salvar dados cadastrais, endereço, modalidade e jornada."
      ),
      f("gestao.funcionarios.lotacao", "Lotação", "Incluir, editar e remover períodos de lotação."),
      f("gestao.funcionarios.cessao", "Cessão", "Incluir, editar e remover períodos de cessão."),
      f(
        "gestao.funcionarios.banco-horas",
        "Tolerância do fechamento do banco",
        "Definir, para o funcionário, quantos dias o fechamento do banco de horas é adiado."
      ),
      f(
        "gestao.funcionarios.requerimento",
        "Requerimento individual",
        "Pedir ao funcionário endereço, dependentes, formação ou cursos."
      )
    ]
  },
  {
    chave: "gestao.solicitar-todos",
    pagina: "gestao",
    rotulo: "Solicitar a todos",
    funcoes: [
      f(
        "gestao.solicitar-todos.endereco",
        "Endereço",
        "Enviar o requerimento de endereço a todos."
      ),
      f(
        "gestao.solicitar-todos.dependentes",
        "Dependentes",
        "Enviar o requerimento de dependentes a todos."
      ),
      f(
        "gestao.solicitar-todos.formacao",
        "Formação Acadêmica",
        "Enviar o requerimento de formação a todos."
      ),
      f(
        "gestao.solicitar-todos.cursos",
        "Cursos/Capacitações",
        "Enviar o requerimento de cursos a todos."
      )
    ]
  },
  {
    chave: "gestao.ramais",
    pagina: "gestao",
    rotulo: "Integração de ramais",
    funcoes: [
      f(
        "gestao.ramais.sincronizar",
        "Sincronizar",
        "Sincronizar gerências e funcionários com a API de ramais."
      )
    ]
  },

  /* ── Requisições do RH ── */
  {
    chave: "requisicoes.requisicoes",
    pagina: "requisicoes",
    rotulo: "Requisições (acompanhar)",
    funcoes: [
      f(
        "requisicoes.requisicoes.criar",
        "Criar requisição",
        "Criar e enviar novas requisições aos funcionários."
      ),
      f("requisicoes.requisicoes.excluir", "Excluir requisição", "Excluir requisições enviadas.")
    ]
  },

  /* ── Saúde Ocupacional (aba da Auditoria) ── */
  {
    chave: "saude.exames",
    pagina: "auditoria",
    rotulo: "Exames médicos periódicos",
    funcoes: [
      f(
        "saude.exames.registrar",
        "Registrar, conferir e solicitar exames",
        "Lançar o exame, conferir/devolver o ASO enviado e solicitar exame ao funcionário."
      ),
      f(
        "saude.exames.configurar",
        "Configurar periodicidade e avisos",
        "Definir a periodicidade (meses) e a antecedência do aviso de vencimento."
      )
    ]
  },

  /* ── Auditoria ── */
  {
    chave: "auditoria.funcionarios",
    pagina: "auditoria",
    rotulo: "Funcionários",
    funcoes: [
      f(
        "auditoria.funcionarios.corrigir-ponto",
        "Corrigir ponto",
        "Lançar correção de ponto (vai ao Gerente de RH)."
      ),
      f(
        "auditoria.funcionarios.liberar-banco-horas",
        "Liberar tempo do banco para abono",
        "Liberar (e revogar) tempo do banco de horas positivo para o funcionário usar como abono."
      ),
      f(
        "auditoria.funcionarios.arquivos-fiscais",
        "Extrair AFD e AEJ",
        "Gerar o Arquivo Fonte de Dados (AFD) e o Arquivo Eletrônico de Jornada (AEJ) da Portaria MTP 671/2021, por funcionário ou por grupo."
      ),
      f(
        "auditoria.funcionarios.solicitar",
        "Abrir solicitação em nome do funcionário",
        "Criar atestado, licença, abono, day off, hora extra e envio de documento pelo funcionário (fica marcado como do RH)."
      ),
      f(
        "auditoria.funcionarios.excluir-documento",
        "Excluir documento do RH",
        "Excluir documentos enviados ao funcionário."
      ),
      f(
        "auditoria.funcionarios.ferias",
        "Agendar, alterar e cancelar férias",
        "Configurar férias do funcionário pelo RH (com justificativa; avisa funcionário e chefe)."
      )
    ]
  },
  { chave: "auditoria.registros", pagina: "auditoria", rotulo: "Registros", funcoes: [] },
  {
    chave: "auditoria.solicitacoes",
    pagina: "auditoria",
    rotulo: "Solicitações",
    funcoes: [
      f(
        "auditoria.solicitacoes.alterar-cid",
        "Completar/alterar o CID do atestado",
        "Informar ou corrigir o grupo do CID de um atestado já enviado."
      ),
      f(
        "auditoria.solicitacoes.alterar-status",
        "Alterar status",
        "Aprovar ou rejeitar diretamente o status de uma solicitação."
      )
    ]
  },
  { chave: "auditoria.afastamentos", pagina: "auditoria", rotulo: "Afastamentos", funcoes: [] },
  {
    chave: "auditoria.banco-horas",
    pagina: "auditoria",
    rotulo: "Banco de Horas",
    funcoes: [
      f(
        "auditoria.banco-horas.periodos",
        "Fechar/aprovar período",
        "Fechar ou aprovar períodos de ponto."
      ),
      f(
        "auditoria.banco-horas.recalcular",
        "Recalcular almoço do histórico",
        "Reprocessar o almoço no histórico de todos."
      )
    ]
  },
  { chave: "auditoria.logs", pagina: "auditoria", rotulo: "Logs", funcoes: [] },
  {
    chave: "auditoria.validacoes",
    pagina: "auditoria",
    rotulo: "Validações",
    funcoes: [
      f("auditoria.validacoes.gerar", "Gerar assinaturas", "Gerar as assinaturas do quadro mensal.")
    ]
  },

  /* ── Configurações ── */
  {
    chave: "configuracoes.institucional",
    pagina: "configuracoes",
    rotulo: "Instituição",
    funcoes: [
      f(
        "configuracoes.institucional.salvar",
        "Salvar dados da instituição",
        "Dados, endereço, localização e identidade visual."
      ),
      f(
        "configuracoes.institucional.rep-p",
        "Configurar o REP-P e o registro no INPI",
        "Identificação do REP-P, checklist do registro no INPI, certificado e início da operação como REP-P."
      )
    ]
  },
  {
    chave: "configuracoes.rede",
    pagina: "configuracoes",
    rotulo: "Rede & IP",
    funcoes: [
      f(
        "configuracoes.rede.provedores",
        "Gerenciar provedores",
        "Incluir, ativar e remover provedores."
      ),
      f("configuracoes.rede.subredes", "Gerenciar sub-redes", "Incluir e remover sub-redes.")
    ]
  },
  {
    chave: "configuracoes.periodos",
    pagina: "configuracoes",
    rotulo: "Períodos",
    funcoes: [
      f(
        "configuracoes.periodos.salvar",
        "Salvar parâmetros de jornada/banco",
        "Jornada, tolerâncias, almoço, banco de horas e multiplicadores."
      ),
      f(
        "configuracoes.periodos.jornadas",
        "Gerenciar jornadas",
        "Criar, editar e remover jornadas."
      ),
      f(
        "configuracoes.periodos.marcos",
        "Marcos do banco de horas",
        "Incluir e remover marcos de zeragem."
      ),
      f(
        "configuracoes.periodos.aviso-contrato",
        "Aviso de fim de contrato",
        "Antecedência do aviso de fim de contrato."
      )
    ]
  },
  {
    chave: "configuracoes.registro",
    pagina: "configuracoes",
    rotulo: "Registro",
    funcoes: [
      f(
        "configuracoes.registro.salvar",
        "Salvar modos de registro",
        "Modos de registro e verificações (sub-rede, geolocalização, foto)."
      )
    ]
  },
  {
    chave: "configuracoes.areas",
    pagina: "configuracoes",
    rotulo: "Áreas Especiais",
    funcoes: [
      f(
        "configuracoes.areas.gerenciar",
        "Gerenciar áreas",
        "Criar, editar, ativar e excluir áreas especiais."
      )
    ]
  },
  {
    chave: "configuracoes.solicitacoes",
    pagina: "configuracoes",
    rotulo: "Solicitações",
    funcoes: [
      f(
        "configuracoes.solicitacoes.salvar",
        "Salvar regras de solicitações",
        "Regras de atestado, férias e tipos ativos."
      ),
      f(
        "configuracoes.solicitacoes.cid-grupos",
        "Gerenciar grupos do CID",
        "Adicionar, editar e desativar os grupos do CID do atestado médico."
      ),
      f(
        "configuracoes.solicitacoes.tipos-licenca",
        "Gerenciar tipos de licença",
        "Adicionar, editar e desativar os tipos de licença e suas regras."
      )
    ]
  },
  {
    chave: "configuracoes.feriados",
    pagina: "configuracoes",
    rotulo: "Feriados",
    funcoes: [
      f(
        "configuracoes.feriados.gerenciar",
        "Gerenciar feriados",
        "Criar, editar, excluir, bloquear e importar feriados."
      ),
      f(
        "configuracoes.feriados.abonar",
        "Abonar dia",
        "Criar ou editar um abono do RH (não é feriado)."
      )
    ]
  },
  {
    chave: "configuracoes.termos",
    pagina: "configuracoes",
    rotulo: "Termos de uso",
    funcoes: [
      f(
        "configuracoes.termos.gerenciar",
        "Gerenciar os Termos de Uso",
        "Criar, editar (nova versão) e publicar os Termos de Uso e consultar os aceites."
      )
    ]
  },
  {
    chave: "configuracoes.notificacoes",
    pagina: "configuracoes",
    rotulo: "Notificações",
    funcoes: [
      f(
        "configuracoes.notificacoes.eventos",
        "Salvar configurações de eventos",
        "Canais e destinatários de cada evento."
      ),
      f(
        "configuracoes.notificacoes.email",
        "Configurar e-mail (SMTP)",
        "Servidor de e-mail e teste de envio."
      ),
      f(
        "configuracoes.notificacoes.manual",
        "Enviar notificação manual",
        "Enviar uma notificação avulsa."
      )
    ]
  }
];

/** Aba-mãe de cada função. */
export const ABA_DA_FUNCAO: Record<string, string> = Object.fromEntries(
  ABAS_RH.flatMap((a) => a.funcoes.map((fn) => [fn.chave, a.chave]))
);

export const TODOS_RECURSOS_RH: string[] = ABAS_RH.flatMap((a) => [
  a.chave,
  ...a.funcoes.map((fn) => fn.chave)
]);

const RECURSOS_VALIDOS = new Set(TODOS_RECURSOS_RH);
export const recursoRhValido = (r: string) => RECURSOS_VALIDOS.has(r);

/**
 * O conjunto de permissões concedidas cobre o recurso? Aba: basta a chave.
 * Função: a chave da função E o Ver da aba-mãe.
 */
export function temRecursoRh(concedidos: Set<string>, recurso: string): boolean {
  if (!concedidos.has(recurso)) return false;
  const mae = ABA_DA_FUNCAO[recurso];
  return !mae || concedidos.has(mae);
}

/**
 * Campos de ConfiguracaoSistema por função — PUT /ponto/config/sistema é compartilhado
 * pelas abas Instituição, Registro e Períodos.
 */
export const CAMPOS_SISTEMA_POR_FUNCAO: Record<string, string[]> = {
  "configuracoes.institucional.salvar": [
    "nome",
    "cnpj",
    "endereco",
    "numero",
    "bairro",
    "cidade",
    "uf",
    "cep",
    "telefone",
    "emailInstitucional",
    "lat",
    "lng",
    "raioMetros"
  ],
  "configuracoes.registro.salvar": [
    "modoDesktop",
    "modoMobile",
    "modoHibrido",
    "modoViagem",
    "desktopCheckSubrede",
    "desktopCheckGeo",
    "mobileCheckSubrede",
    "mobileCheckGeo",
    "mobileExigirFoto",
    "hibridoExigirFoto",
    "cicloCompletoEmCasaDesde",
    "cicloCompletoPresencialDesde"
  ],
  "configuracoes.periodos.salvar": [
    "horaEntrada",
    "horaSaida",
    "pontoHorarioMinimo",
    "pontoHorarioMaximo",
    "jornadaDiariaMin",
    "jornadaSemanalMin",
    "diasUteis",
    "tipoFlexibilidade",
    "toleranciaEntradaMin",
    "toleranciaSaidaMin",
    "toleranciaHoraExtraMin",
    "toleranciaCalculoMin",
    "almocoPodeIniciarA",
    "almocoPodeIniciarAte",
    "almocoMinMin",
    "almocoMaxMin",
    "hibridoMaxDiasSemana",
    "hibridoExigeAprovacao",
    "viagemJanelaMinutos",
    "viagemExigeAprovacao",
    "bancoHorasLimiteMin",
    "bancoHorasVigenciaDias",
    "bancoHorasSabadoPct",
    "bancoHorasDomingoPct",
    "bancoHorasFeriadoPct",
    "horaExtraLimiteAuto",
    "interjornadaMin",
    "intervaloLongoAcimaDeMin",
    "intervaloCurtoAcimaDeMin",
    "intervaloCurtoMinMin"
  ],
  "configuracoes.periodos.aviso-contrato": [
    "contratoAvisoAntecedenciaDias",
    "jornadaAcordoColetivo"
  ]
};

/** A página tem ao menos uma aba/área liberada (usado no menu e no acesso direto). */
export function paginaRhLiberada(pode: (recurso: string) => boolean, pagina: PaginaRh): boolean {
  return ABAS_RH.some((a) => a.pagina === pagina && pode(a.chave));
}
