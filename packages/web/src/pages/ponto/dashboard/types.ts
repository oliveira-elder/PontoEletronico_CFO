/* ─── Tipos do dashboard de Gestão (snapshot atual, sem filtro de período) ─── */

export type ChaveTotal = { chave: string; total: number };

export interface DetalheFuncionario {
  id: string;
  nome: string;
  matricula: string | null;
  categoria: string;
  lotacao: string | null;
  cargo: string | null;
  nivelCargo: string | null;
  chefe: boolean;
  /** YYYY-MM-DD */
  dataAdmissao: string | null;
  contratoTermino: string | null;
  situacaoHoje: "TRABALHANDO" | "FERIAS" | "AFASTADO";
  genero: string | null;
  raca: string | null;
  escolaridades: string[];
  faixaEtaria: string | null;
  modalidade: "presencial" | "homeOffice" | "hibrido";
  valeTransporte: boolean;
  isentoRegistroPonto: boolean;
}

export interface GestaoDashboardStats {
  totais: { total: number; ativos: number; inativos: number; chefes: number };
  porCategoria: ChaveTotal[];
  porLotacao: { nome: string; total: number }[];
  porCargo: { nome: string; total: number }[];
  porModalidade: { presencial: number; homeOffice: number; hibrido: number };
  porGenero: ChaveTotal[];
  porRaca: ChaveTotal[];
  porEscolaridade: ChaveTotal[];
  faixaEtaria: ChaveTotal[];
  aniversariantes: { nome: string; dia: number; mes: number }[];
  isencaoPonto: { obrigatorio: number; isento: number };
  valeTransporte: { sim: number; nao: number };
  admissoesDesligamentos: { chave: string; admissoes: number; desligamentos: number }[];
  contratosAVencer: {
    nome: string;
    matricula: string | null;
    categoria: string;
    contratoTermino: string;
  }[];
  /** Antecedência (dias) configurada para o aviso de fim de contrato. */
  contratoAvisoDias?: number;
  chefesPorLotacao: { gerenciaId: string; nome: string; temChefe: boolean }[];
  totalDependentes: number;
  dependentesMedia: number;
  tenurePorCategoria: { chave: string; mediaAnos: number }[];
  detalheFuncionarios: DetalheFuncionario[];
}

/* ─── Tipos do dashboard de Auditoria (filtrável por período) ─── */

export interface RankingItem {
  funcionarioId: string;
  nome: string;
  matricula: string;
  minutos: number;
  minutosFormatado: string;
}

export interface RankingQuantidadeItem {
  funcionarioId: string;
  nome: string;
  matricula: string;
  quantidade: number;
}

export interface AuditoriaDashboardData {
  totalFuncionarios: number;
  funcionariosAtivos: number;
  registrosHoje: number;
  trabalhando: number;
  emIntervalo: number;
  pausados?: number;
  solicitacoesPendentes: number;
  afastamentosAtivos: number;
  periodosAbertos: number;
  periodosFechados: number;
  periodosAprovados: number;
  registrosPorDia: { data: string; entradas: number }[];
  registrosPorTempo?: { data: string; total: number }[];
  topAtrasados?: RankingItem[];
  topAdiantados?: RankingItem[];
  topBancoNegativo?: RankingItem[];
  topBancoPositivo?: RankingItem[];
  topMaisAtestados?: RankingQuantidadeItem[];
  topMenosAtestados?: RankingQuantidadeItem[];
  topMaisAbonos?: RankingQuantidadeItem[];
  topMenosAbonos?: RankingQuantidadeItem[];
  atrasoMedioPorGerencia?: {
    gerenciaId: string;
    nome: string;
    minutos: number;
    funcionarios: number;
  }[];
  atestadosPorMes?: { mes: string; label: string; total: number }[];
  filtro?: { dataInicio: string; dataFim: string };
  origens: { origem: string; total: number }[];
  usoCanal: {
    totalRegistros: number;
    mobile: number;
    desktop: number;
    web: number;
    totem: number;
    pctMobile: number;
    pctDesktop: number;
    pctWeb: number;
    pctTotem: number;
  };
  afastamentosPorTipo?: { tipo: string; total: number }[];
  afastamentosPorCategoria?: { categoria: string; total: number }[];
  solicitacoesPorStatus?: { status: string; total: number }[];
  solicitacoesPorTipo?: { tipo: string; total: number }[];
  tempoMedioAprovacao?: {
    gestorHoras: number;
    rhHoras: number;
    amostraGestor: number;
    amostraRh: number;
  };
  assinaturaPorStatus?: { status: string; total: number }[];
  registrosAjustados?: { total: number; ajustados: number; pct: number };
  feriasPorMes?: { mes: string; label: string; total: number }[];
}

export const LABEL_TIPO_AFASTAMENTO: Record<string, string> = {
  FERIAS: "Férias",
  LICENCA_MEDICA: "Licença Médica",
  ATESTADO: "Atestado",
  LICENCA_MATERNIDADE: "Licença Maternidade",
  LICENCA_PATERNIDADE: "Licença Paternidade",
  FALTA_JUSTIFICADA: "Falta Justificada",
  FALTA_INJUSTIFICADA: "Falta Injustificada",
  ABONO: "Abono"
};

export const LABEL_STATUS_SOLICITACAO: Record<string, string> = {
  PENDENTE: "Pendente",
  AGUARDANDO_RH: "Aguardando RH",
  AGUARDANDO_DOCUMENTO_FUNCIONARIO: "Aguard. Documento",
  AGUARDANDO_GESTOR_RH: "Aguard. Gerente RH",
  APROVADA: "Aprovada",
  REJEITADA: "Rejeitada",
  REJEITADA_GESTOR: "Rejeitada (Gestor)",
  REJEITADA_RH: "Rejeitada (RH)",
  CANCELADA: "Cancelada"
};

export const LABEL_TIPO_SOLICITACAO: Record<string, string> = {
  CORRECAO_PONTO: "Correção de Ponto",
  ATESTADO: "Atestado",
  FERIAS: "Férias",
  LICENCA: "Licença e Outros",
  ABONO: "Abono",
  DAY_OFF: "Day Off",
  HORA_EXTRA: "Hora Extra",
  ENVIO_DOCUMENTO_RH: "Envio Documento RH"
};

export const LABEL_STATUS_ASSINATURA: Record<string, string> = {
  PENDENTE_FUNCIONARIO: "Pendente Funcionário",
  PENDENTE_GESTOR: "Pendente Gestor",
  CONCLUIDA: "Concluída",
  DISPENSADA: "Dispensada"
};

export const LABEL_CATEGORIA_FUNC: Record<string, string> = {
  ESTAGIARIO: "Estagiário",
  MENOR_APRENDIZ: "Jovem Aprendiz",
  CONCURSADO: "Efetivo",
  ASSESSOR: "Comissionado"
};

export function categoriaFuncLabel(chave: string): string {
  return LABEL_CATEGORIA_FUNC[chave] ?? chave;
}

export const MESES_LABEL = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez"
];

export function mesLabelDeChave(chave: string): string {
  const [ano, mes] = chave.split("-");
  return `${MESES_LABEL[Number(mes) - 1]}/${ano.slice(2)}`;
}
