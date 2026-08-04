import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import {
  BarChart2Icon,
  UsersIcon,
  ClockIcon,
  InboxIcon,
  CalendarIcon,
  DownloadIcon,
  SearchIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  Edit2Icon,
  FileTextIcon,
  DatabaseIcon,
  InfoIcon,
  Trash2Icon,
  CoffeeIcon
} from "../../components/icons";
import { calcHorasTrabalhadasMinutos, analisarAlmocoCurto } from "../../utils/calcHorasTrabalhadas";
import {
  FeriasDetalheBlock,
  LinkDocumentoAnexado,
  LogTimelineGestor,
  SolicitacaoResumo,
  textoResumo
} from "./solicitacaoUi";

/* ═══════════════════════════════════════════════
   TIPOS
═══════════════════════════════════════════════ */

interface RankingItem {
  funcionarioId: string;
  nome: string;
  matricula: string;
  minutos: number;
  minutosFormatado: string;
}

interface RankingQuantidadeItem {
  funcionarioId: string;
  nome: string;
  matricula: string;
  quantidade: number;
}

interface Dashboard {
  totalFuncionarios: number;
  funcionariosAtivos: number;
  registrosHoje: number;
  trabalhando: number;
  emIntervalo: number;
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
  atestadosPorMes?: { mes: string; label: string; total: number }[];
  filtro?: { dataInicio: string; dataFim: string };
  ultimosLogs: AuditLog[];
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
}

interface Funcionario {
  id: string;
  matricula: string;
  cargo: string;
  departamento: string | null;
  categoria: string;
  ativo: boolean;
  jornadaHorasDia: number;
  fotoPerfilUrl?: string | null;
  subsecao?: string | null;
  isManager?: boolean;
  ramal?: string | null;
  sala?: string | null;
  andar?: string | null;
  statusPonto?: "presente" | "ausente";
  user: { name: string; email: string };
  gerencia: { nome: string; sigla: string } | null;
  totalRegistros: number;
  totalSolicitacoes: number;
  totalAfastamentos: number;
  solicitacoesPendentes: number;
  periodoFormatado: {
    horasTrabalhadas: string;
    horasExtras: string;
    horasFalta: string;
    status: string;
  };
  ultimoRegistro: { tipo: string; dataHora: string; origem: string } | null;
  periodo: PeriodoRaw | null;
}

function slugLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Área organizacional do profissional (subseção), com fallback amigável. */
function areaProfissional(f: {
  subsecao?: string | null;
  cargo?: string | null;
  departamento?: string | null;
}): string {
  if (f.subsecao) return slugLabel(f.subsecao);
  if (f.departamento?.trim()) return f.departamento.trim();
  const cargo = f.cargo?.trim();
  if (cargo && cargo.toLowerCase() !== "a definir") return cargo;
  return "—";
}

/** Status do ponto (hoje, Brasília) — usa API ou deriva de ultimoRegistro. */
function statusPontoFuncionario(f: Funcionario): "presente" | "ausente" {
  if (f.statusPonto === "presente" || f.statusPonto === "ausente") return f.statusPonto;
  const u = f.ultimoRegistro;
  if (!u?.dataHora) return "ausente";
  const fmt = (d: Date | string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(typeof d === "string" ? new Date(d) : d);
  if (fmt(u.dataHora) !== fmt(new Date())) return "ausente";
  if (u.tipo === "ENTRADA" || u.tipo === "FIM_INTERVALO" || u.tipo === "REINICIAR_EXPEDIENTE") {
    return "presente";
  }
  return "ausente";
}

function infoContato(f: {
  ramal?: string | null;
  sala?: string | null;
  andar?: string | null;
}): string | null {
  const partes = [
    f.ramal ? `Ramal ${f.ramal}` : null,
    f.sala ? `Sala ${f.sala}` : null,
    f.andar ?? null
  ].filter((v): v is string => Boolean(v));
  return partes.length ? partes.join(" · ") : null;
}

interface PeriodoRaw {
  id: string;
  mes: number;
  ano: number;
  horasTrabalhadasMinutos: number;
  horasExtrasMinutos: number;
  horasFaltaMinutos: number;
  diasTrabalhados: number;
  status: string;
}

interface Registro {
  id: string;
  tipo: string;
  dataHora: string;
  origem: string;
  modoRegistro: string;
  ipOrigem: string | null;
  latitude: number | null;
  longitude: number | null;
  dentroPerimetro: boolean;
  fotoUrl: string | null;
  observacao: string | null;
  ajustado: boolean;
  ajustadoPor: string | null;
  funcionario: {
    id: string;
    matricula: string;
    cargo: string;
    fotoPerfilUrl?: string | null;
    user: { name: string; email: string };
    gerencia: { nome: string; sigla: string } | null;
  };
}

interface Solicitacao extends SolicitacaoResumo {
  status: string;
  // Legado
  observacaoGestor: string | null;
  resolvidoPor: string | null;
  resolvidoEm: string | null;
  // Bifásico — Gestor
  gestorUserId: string | null;
  // Bifásico — RH
  rhUserId: string | null;
  rhObservacao: string | null;
  rhResolvidoEm: string | null;
  funcionario: {
    id: string;
    matricula: string | null;
    cargo: string;
    fotoPerfilUrl: string | null;
    user: { name: string; email: string; emailReal?: string | null };
    gerencia: { nome: string; sigla: string } | null;
  };
}

interface Afastamento {
  id: string;
  tipo: string;
  dataInicio: string;
  dataFim: string;
  justificativa: string | null;
  documentoUrl: string | null;
  aprovadoPor: string | null;
  createdAt: string;
  funcionario: {
    id: string;
    matricula: string;
    cargo: string;
    fotoPerfilUrl?: string | null;
    user: { name: string; email: string };
    gerencia: { nome: string; sigla: string } | null;
  };
}

interface SaldoFerias {
  dataAdmissao: string;
  ciclosVencidos: number;
  diasDisponiveis: number;
  diasGozo: number;
  diasVendidos: number;
  totalVencido: number;
  obrigatorio: boolean;
  mesesTotal: number;
  ciclos: Array<{ numero: number; inicio: string; fim: string }>;
}

interface Periodo {
  id: string;
  mes: number;
  ano: number;
  horasTrabalhadasMinutos: number;
  horasExtrasMinutos: number;
  horasFaltaMinutos: number;
  diasTrabalhados: number;
  status: string;
  fechadoEm: string | null;
  aprovadoPor: string | null;
  horasTrabalhadasFormatado: string;
  horasExtrasFormatado: string;
  horasFaltaFormatado: string;
  funcionario: {
    id: string;
    matricula: string;
    cargo: string;
    jornadaHorasDia: number;
    fotoPerfilUrl?: string | null;
    user: { name: string; email: string };
    gerencia: { nome: string; sigla: string } | null;
  };
}

interface BancoHorasDia {
  data: string;
  horasTrabalhadasMinutos: number;
  jornadaEsperadaMinutos: number;
  saldoDiaMinutos: number;
  saldoAcumuladoMinutos: number;
  observacao?: string;
}

interface BancoHorasItem {
  funcionario: { id: string; matricula: string; nome: string; email: string };
  gerencia: { nome: string; sigla: string } | null;
  cicloInicio: string | null;
  proximaZeragem: string | null;
  saldoAtualMinutos: number;
  saldoFormatado: string;
  limiteMinutos: number;
  excedeLimite: boolean;
}

interface BancoHorasFuncionarioDetalhe extends BancoHorasItem {
  tipoFlexibilidade: string;
  dias: BancoHorasDia[];
}

interface DocumentoRhEnvio {
  id: string;
  descricao: string;
  arquivoUrl: string;
  nomeArquivo: string | null;
  mimeType: string | null;
  createdAt: string;
  origem?: "LEGADO" | "SOLICITACAO";
  status?: string | null;
  solicitacaoId?: string | null;
  rhObservacao?: string | null;
  rhResolvidoEm?: string | null;
}

interface AuditLog {
  id: string;
  actorUserId: string | null;
  username: string | null;
  nomeUsuario: string | null;
  emailUsuario: string | null;
  method: string | null;
  path: string | null;
  action: string;
  statusCode: number | null;
  durationMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  payload: unknown;
  createdAt: string;
}

/* ─── Mapa de descrições dos endpoints ─── */
type EndpointInfo = { desc: string; categoria: string };
const ENDPOINT_MAP: Array<{ re: RegExp; info: EndpointInfo }> = [
  // Ponto — registro
  {
    re: /^POST \/api\/ponto\/registros$/,
    info: { desc: "Registro de ponto (entrada / saída / intervalo)", categoria: "Ponto" }
  },
  {
    re: /^GET \/api\/ponto\/historico/,
    info: { desc: "Consulta de histórico mensal de ponto", categoria: "Ponto" }
  },
  {
    re: /^GET \/api\/ponto\/relatorio/,
    info: { desc: "Relatório mensal de horas trabalhadas", categoria: "Ponto" }
  },
  {
    re: /^GET \/api\/ponto\/status/,
    info: { desc: "Verificação do estado atual do funcionário", categoria: "Ponto" }
  },
  // Solicitações
  {
    re: /^GET \/api\/ponto\/solicitacoes/,
    info: { desc: "Listagem de solicitações do funcionário", categoria: "Solicitações" }
  },
  {
    re: /^POST \/api\/ponto\/solicitacoes/,
    info: { desc: "Nova solicitação (correção, atestado, férias…)", categoria: "Solicitações" }
  },
  // Perfil
  {
    re: /^POST \/api\/ponto\/minha-foto/,
    info: { desc: "Solicitação de atualização de foto de perfil", categoria: "Perfil" }
  },
  // Configurações
  {
    re: /^GET \/api\/ponto\/config\/sistema/,
    info: { desc: "Leitura das configurações do sistema", categoria: "Configurações" }
  },
  {
    re: /^PUT \/api\/ponto\/config\/sistema/,
    info: { desc: "Atualização das configurações do sistema", categoria: "Configurações" }
  },
  {
    re: /^POST \/api\/ponto\/config\/provedores/,
    info: { desc: "Cadastro de provedor de internet", categoria: "Configurações" }
  },
  {
    re: /^PATCH \/api\/ponto\/config\/provedores/,
    info: { desc: "Ativação / desativação de provedor", categoria: "Configurações" }
  },
  {
    re: /^DELETE \/api\/ponto\/config\/provedores/,
    info: { desc: "Remoção de provedor de internet", categoria: "Configurações" }
  },
  {
    re: /^POST \/api\/ponto\/config\/subredes/,
    info: { desc: "Cadastro de sub-rede configurada", categoria: "Configurações" }
  },
  {
    re: /^DELETE \/api\/ponto\/config\/subredes/,
    info: { desc: "Remoção de sub-rede", categoria: "Configurações" }
  },
  {
    re: /^POST \/api\/ponto\/config\/areas/,
    info: { desc: "Cadastro de área de viagem", categoria: "Configurações" }
  },
  {
    re: /^PATCH \/api\/ponto\/config\/areas/,
    info: { desc: "Atualização de área de viagem", categoria: "Configurações" }
  },
  {
    re: /^DELETE \/api\/ponto\/config\/areas/,
    info: { desc: "Remoção de área de viagem", categoria: "Configurações" }
  },
  // Gestão
  {
    re: /^GET \/api\/ponto\/gestao\/funcionarios$/,
    info: { desc: "Listagem de funcionários", categoria: "Gestão" }
  },
  {
    re: /^POST \/api\/ponto\/gestao\/funcionarios$/,
    info: { desc: "Cadastro de novo funcionário", categoria: "Gestão" }
  },
  {
    re: /^PUT \/api\/ponto\/gestao\/funcionarios/,
    info: { desc: "Atualização de dados do funcionário", categoria: "Gestão" }
  },
  {
    re: /^DELETE \/api\/ponto\/gestao\/funcionarios/,
    info: { desc: "Exclusão de funcionário", categoria: "Gestão" }
  },
  {
    re: /^GET \/api\/ponto\/gestao\/gerencias$/,
    info: { desc: "Listagem de gerências / departamentos", categoria: "Gestão" }
  },
  {
    re: /^POST \/api\/ponto\/gestao\/gerencias$/,
    info: { desc: "Criação de gerência", categoria: "Gestão" }
  },
  {
    re: /^PUT \/api\/ponto\/gestao\/gerencias/,
    info: { desc: "Atualização de gerência", categoria: "Gestão" }
  },
  {
    re: /^DELETE \/api\/ponto\/gestao\/gerencias/,
    info: { desc: "Exclusão de gerência", categoria: "Gestão" }
  },
  // Administração
  {
    re: /^GET \/api\/admin\/keycloak\/grupos$/,
    info: { desc: "Listagem de grupos do AD via Keycloak", categoria: "Administração" }
  },
  {
    re: /^PUT \/api\/admin\/keycloak\/grupos/,
    info: { desc: "Atribuição de papéis a grupo do AD", categoria: "Administração" }
  },
  {
    re: /^DELETE \/api\/admin\/keycloak\/grupos/,
    info: { desc: "Remoção de papéis de grupo do AD", categoria: "Administração" }
  },
  {
    re: /^GET \/api\/admin\/keycloak\/usuarios/,
    info: { desc: "Listagem de usuários do AD via Keycloak", categoria: "Administração" }
  },
  {
    re: /^GET \/api\/admin\/grupos-sistema/,
    info: { desc: "Mapeamento de grupos para papéis do sistema", categoria: "Administração" }
  },
  // Sistema — Super Admin / Start
  {
    re: /^GET \/api\/sistema\/super-admins$/,
    info: { desc: "Listagem de Super Administradores", categoria: "Administração" }
  },
  {
    re: /^GET \/api\/sistema\/candidatos-gerti$/,
    info: { desc: "Listagem de candidatos GERTI a Super Admin", categoria: "Administração" }
  },
  {
    re: /^POST \/api\/sistema\/super-admins$/,
    info: { desc: "Concessão de Super Administrador", categoria: "Administração" }
  },
  {
    re: /^DELETE \/api\/sistema\/super-admins/,
    info: { desc: "Revogação de Super Administrador", categoria: "Administração" }
  },
  {
    re: /^GET \/api\/sistema\/start\/pendencias$/,
    info: { desc: "Consulta de pendências de Start do sistema", categoria: "Administração" }
  },
  {
    re: /^GET \/api\/sistema\/start$/,
    info: { desc: "Status do Start / go-live do sistema", categoria: "Administração" }
  },
  {
    re: /^POST \/api\/sistema\/start\/[^/]+\/aprovar-gerti$/,
    info: { desc: "Aprovação GERTI do Start do sistema", categoria: "Administração" }
  },
  {
    re: /^POST \/api\/sistema\/start\/[^/]+\/aprovar-rh$/,
    info: { desc: "Aprovação RH e execução do Start do sistema", categoria: "Administração" }
  },
  {
    re: /^POST \/api\/sistema\/start\/[^/]+\/rejeitar$/,
    info: { desc: "Rejeição do Start do sistema", categoria: "Administração" }
  },
  {
    re: /^POST \/api\/sistema\/start$/,
    info: { desc: "Solicitação de Start / go-live do sistema", categoria: "Administração" }
  },
  // Autenticação
  {
    re: /^GET \/api\/auth\/me$/,
    info: { desc: "Sincronização de perfil pós-login", categoria: "Autenticação" }
  },
  // Auditoria
  {
    re: /^GET \/api\/auditoria\/dashboard/,
    info: { desc: "Acesso ao painel de auditoria", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/funcionarios\/[^/]+\/registros/,
    info: { desc: "Registros de ponto do funcionário (auditoria)", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/funcionarios\/[^/]+\/relatorio/,
    info: { desc: "Relatório mensal do funcionário (auditoria)", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/funcionarios\/[^/]+/,
    info: { desc: "Detalhes do funcionário (auditoria)", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/funcionarios$/,
    info: { desc: "Listagem de funcionários para auditoria", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/registros/,
    info: { desc: "Consulta global de registros de ponto", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/solicitacoes/,
    info: { desc: "Consulta de solicitações (auditoria)", categoria: "Auditoria" }
  },
  {
    re: /^PUT \/api\/auditoria\/solicitacoes/,
    info: { desc: "Aprovação / rejeição de solicitação", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/afastamentos/,
    info: { desc: "Consulta de afastamentos (auditoria)", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/periodos/,
    info: { desc: "Consulta de períodos mensais (auditoria)", categoria: "Auditoria" }
  },
  {
    re: /^PUT \/api\/auditoria\/periodos/,
    info: { desc: "Fechamento / aprovação de período mensal", categoria: "Auditoria" }
  },
  {
    re: /^GET \/api\/auditoria\/logs/,
    info: { desc: "Consulta dos logs de auditoria do sistema", categoria: "Auditoria" }
  }
];

const CATEGORIA_COR: Record<string, { bg: string; color: string }> = {
  Ponto: { bg: "rgba(47,125,79,0.09)", color: "#2f7d4f" },
  Solicitações: { bg: "rgba(198,127,0,0.09)", color: "#c67f00" },
  Perfil: { bg: "rgba(124,58,237,0.09)", color: "#7c3aed" },
  Configurações: { bg: "rgba(37,99,235,0.09)", color: "#2563eb" },
  Gestão: { bg: "rgba(122,30,38,0.08)", color: "#7a1e26" },
  Administração: { bg: "rgba(0,128,128,0.09)", color: "#006666" },
  Autenticação: { bg: "rgba(107,114,128,0.09)", color: "#4b5563" },
  Auditoria: { bg: "rgba(8,145,178,0.09)", color: "#0891b2" }
};

function getEndpointInfo(action: string): EndpointInfo | null {
  for (const entry of ENDPOINT_MAP) {
    if (entry.re.test(action)) return entry.info;
  }
  return null;
}

type Aba =
  | "dashboard"
  | "funcionarios"
  | "registros"
  | "solicitacoes"
  | "afastamentos"
  | "periodos"
  | "logs"
  | "validacoes";

/* ═══════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════ */

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function fmtDataCurta(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function fmtDataAssinatura(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function toHM(min: number) {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}`;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function tipoPontoLabel(tipo: string) {
  const map: Record<string, string> = {
    ENTRADA: "Entrada",
    INICIO_INTERVALO: "Início Intervalo",
    FIM_INTERVALO: "Fim Intervalo",
    SAIDA: "Saída",
    INTERROMPER_EXPEDIENTE: "Interromper Expediente",
    REINICIAR_EXPEDIENTE: "Reiniciar Expediente"
  };
  return map[tipo] ?? tipo;
}

function tipoPontoCor(tipo: string) {
  const map: Record<string, string> = {
    ENTRADA: "#2f7d4f",
    SAIDA: "#c8393f",
    INICIO_INTERVALO: "#c67f00",
    FIM_INTERVALO: "#2563eb",
    INTERROMPER_EXPEDIENTE: "#6b7280",
    REINICIAR_EXPEDIENTE: "#6b7280"
  };
  return map[tipo] ?? "#6b7280";
}

function statusSolBadge(status: string) {
  if (status === "PENDENTE")
    return { bg: "rgba(198,127,0,0.12)", color: "#c67f00", label: "Aguardando Gestor" };
  if (status === "AGUARDANDO_RH")
    return { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Aguardando RH" };
  if (status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO")
    return {
      bg: "rgba(198,127,0,0.12)",
      color: "#c67f00",
      label: "Aguardando Doc. Funcionário"
    };
  if (status === "AGUARDANDO_GESTOR_RH")
    return { bg: "rgba(122,30,38,0.10)", color: "#7a1e26", label: "Aguardando Gerente de RH" };
  if (status === "APROVADA")
    return { bg: "rgba(47,125,79,0.12)", color: "#2f7d4f", label: "Aprovada pelo RH" };
  if (status === "REJEITADA_GESTOR")
    return { bg: "rgba(200,57,63,0.10)", color: "#c8393f", label: "Rejeitada pelo Gestor" };
  if (status === "REJEITADA_RH")
    return { bg: "rgba(200,57,63,0.10)", color: "#c8393f", label: "Rejeitada pelo RH" };
  if (status === "CANCELADA")
    return { bg: "rgba(109,110,113,0.12)", color: "#6d6e71", label: "Cancelada" };
  return { bg: "rgba(200,57,63,0.10)", color: "#c8393f", label: "Rejeitada" };
}

function statusPeriodoBadge(status: string) {
  if (status === "ABERTO") return { bg: "rgba(37,99,235,0.10)", color: "#2563eb", label: "Aberto" };
  if (status === "FECHADO")
    return { bg: "rgba(198,127,0,0.12)", color: "#c67f00", label: "Fechado" };
  return { bg: "rgba(47,125,79,0.12)", color: "#2f7d4f", label: "Aprovado" };
}

function tipoAfastamentoLabel(tipo: string) {
  const map: Record<string, string> = {
    FERIAS: "Férias",
    LICENCA_MEDICA: "Licença Médica",
    ATESTADO: "Atestado",
    LICENCA_MATERNIDADE: "Lic. Maternidade",
    LICENCA_PATERNIDADE: "Lic. Paternidade",
    FALTA_JUSTIFICADA: "Falta Justificada",
    FALTA_INJUSTIFICADA: "Falta Injustificada",
    ABONO: "Abono"
  };
  return map[tipo] ?? tipo;
}

function exportCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const lines = [
    keys.join(";"),
    ...rows.map((r) =>
      keys
        .map((k) => {
          const v = r[k];
          if (v == null) return "";
          const s = String(v).replace(/"/g, '""');
          return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
        })
        .join(";")
    )
  ];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════
   COMPONENTES PEQUENOS
═══════════════════════════════════════════════ */

const statValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "var(--ink-900)",
  lineHeight: 1,
  fontFamily: "var(--font-display)"
};

function StatCard({
  label,
  value,
  sub,
  color,
  icon,
  onClick
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const clicavel = typeof onClick === "function";
  return (
    <div
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clicavel
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        cursor: clicavel ? "pointer" : "default",
        transition: clicavel ? "border-color 150ms, box-shadow 150ms" : undefined
      }}
      onMouseEnter={
        clicavel
          ? (e) => {
              e.currentTarget.style.borderColor = "rgba(122,30,38,0.28)";
              e.currentTarget.style.boxShadow = "0 2px 10px rgba(122,30,38,0.08)";
            }
          : undefined
      }
      onMouseLeave={
        clicavel
          ? (e) => {
              e.currentTarget.style.borderColor = "rgba(122,30,38,0.08)";
              e.currentTarget.style.boxShadow = "none";
            }
          : undefined
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {icon && (
          <span style={{ color: color ?? "var(--burgundy-600)", opacity: 0.85 }}>{icon}</span>
        )}
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-500)"
          }}
        >
          {label}
        </span>
      </div>
      <span style={{ ...statValueStyle, ...(color ? { color } : {}) }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}>{sub}</span>}
    </div>
  );
}

function FuncAvatar({
  name,
  fotoUrl,
  size = 36
}: {
  name: string;
  fotoUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: fotoUrl ? "transparent" : "var(--burgundy-600)",
        border: fotoUrl ? "2px solid var(--burgundy-600)" : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        flexShrink: 0,
        overflow: "hidden"
      }}
    >
      {fotoUrl ? (
        <img
          src={fotoUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        (name[0] ?? "?").toUpperCase()
      )}
    </div>
  );
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "var(--radius-full)",
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
        marginLeft: 6,
        verticalAlign: "middle"
      }}
    >
      {label}
    </span>
  );
}

function Pagination({
  page,
  total,
  limit,
  onChange
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "14px 16px",
        borderTop: "1px solid rgba(122,30,38,0.06)"
      }}
    >
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        style={btnStyle(false, page <= 1)}
      >
        <ArrowLeftIcon size={14} />
      </button>
      {Array.from({ length: Math.min(7, pages) }, (_, i) => {
        let p: number;
        if (pages <= 7) p = i + 1;
        else if (page <= 4) p = i + 1;
        else if (page >= pages - 3) p = pages - 6 + i;
        else p = page - 3 + i;
        return (
          <button key={p} onClick={() => onChange(p)} style={btnStyle(p === page, false)}>
            {p}
          </button>
        );
      })}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        style={{ ...btnStyle(false, page >= pages), transform: "rotate(180deg)" }}
      >
        <ArrowLeftIcon size={14} />
      </button>
      <span style={{ fontSize: 11, color: "var(--ink-400)", marginLeft: 8 }}>
        {total} registros
      </span>
    </div>
  );
}

function btnStyle(active: boolean, disabled: boolean) {
  return {
    minWidth: 28,
    height: 28,
    borderRadius: "var(--radius-md)",
    border: active ? "none" : "1px solid rgba(122,30,38,0.12)",
    background: active ? "var(--burgundy-600)" : "transparent",
    color: active ? "#fff" : "var(--ink-600)",
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px"
  } as React.CSSProperties;
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-500)"
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "7px 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.18)",
          fontSize: 12.5,
          fontFamily: "var(--font-body)",
          outline: "none",
          background: "#fff"
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-500)"
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "7px 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.18)",
          fontSize: 12.5,
          fontFamily: "var(--font-body)",
          background: "#fff",
          cursor: "pointer"
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ─── Modal genérico ─── */
function Modal({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,5,6,0.50)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 520,
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(10,5,6,0.20)"
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, var(--burgundy-700) 0%, var(--burgundy-600) 100%)",
            padding: "20px 24px"
          }}
        >
          <p
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              margin: 0
            }}
          >
            Auditoria
          </p>
          <h2
            style={{
              color: "#fff",
              fontSize: 18,
              margin: "4px 0 0",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontWeight: 400
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", margin: "2px 0 0" }}>
              {subtitle}
            </p>
          )}
        </div>
        <div style={{ padding: "20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ABA DASHBOARD
═══════════════════════════════════════════════ */

const LOGS_LIMIT = 50;

function TabDashboard({
  token,
  onAbrirFuncionarios
}: {
  token: string;
  onAbrirFuncionarios?: (statusPonto?: "presente" | "ausente") => void;
}) {
  const isoBrasilia = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
  const hoje = new Date();
  const seteAtras = new Date(hoje);
  seteAtras.setDate(seteAtras.getDate() - 6);
  const isoHoje = isoBrasilia(hoje);
  const isoInicio = isoBrasilia(seteAtras);

  const [dataInicio, setDataInicio] = useState(isoInicio);
  const [dataFim, setDataFim] = useState(isoHoje);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modoPontualidade, setModoPontualidade] = useState<"atrasados" | "adiantados">("atrasados");
  const [modoBanco, setModoBanco] = useState<"negativo" | "positivo">("negativo");
  const [modoAtestado, setModoAtestado] = useState<"mais" | "menos">("mais");
  const [modoAbono, setModoAbono] = useState<"mais" | "menos">("mais");
  const [diaDetalhe, setDiaDetalhe] = useState<string | null>(null);
  const [serieDetalhe, setSerieDetalhe] = useState<
    { label: string; minuto: number; total: number }[]
  >([]);
  const [horaLoading, setHoraLoading] = useState(false);
  const [horaErro, setHoraErro] = useState<string | null>(null);
  /** Posições dos pontos em coordenadas de tela (clientX/Y) para hit-test do clique. */
  const pontosDiaRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const chartHostRef = useRef<HTMLDivElement | null>(null);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  const carregarDashboard = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setErro(null);
      }
      try {
        const params = new URLSearchParams();
        if (dataInicio) params.set("dataInicio", dataInicio);
        if (dataFim) params.set("dataFim", dataFim);
        const res = await api.get<Dashboard>(`/auditoria/dashboard?${params}`, token);
        setData(res);
        if (silent) setErro(null);
      } catch (e) {
        if (!silent) setErro((e as Error).message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, dataInicio, dataFim]
  );

  const carregarLogs = useCallback(
    async (page: number, silent = false) => {
      if (!silent) setLogsLoading(true);
      try {
        const res = await api.get<{ total: number; logs: AuditLog[] }>(
          `/auditoria/logs?page=${page}&limit=${LOGS_LIMIT}`,
          token
        );
        setLogs(res?.logs ?? []);
        setLogsTotal(res?.total ?? 0);
        setLogsPage(page);
      } finally {
        if (!silent) setLogsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void carregarDashboard(false);
  }, [carregarDashboard]);

  useEffect(() => {
    void carregarLogs(1, false);
  }, [carregarLogs]);

  const abrirDia = useCallback(
    async (dia: string, silent = false) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
      if (!silent) {
        setDiaDetalhe(dia);
        setSerieDetalhe([]);
        setHoraErro(null);
        setHoraLoading(true);
      }

      const agregarPorMinuto = (datas: Array<string | Date>) => {
        const map = new Map<string, number>();
        for (const raw of datas) {
          const d = typeof raw === "string" ? new Date(raw) : raw;
          if (Number.isNaN(d.getTime())) continue;
          const label = new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          }).format(d);
          map.set(label, (map.get(label) ?? 0) + 1);
        }
        return Array.from(map.entries())
          .map(([label, total]) => {
            const [hh, mm] = label.split(":").map(Number);
            return { label, minuto: hh * 60 + mm, total };
          })
          .sort((a, b) => a.minuto - b.minuto);
      };

      try {
        /* Preferência: endpoint dedicado (quando o backend já foi reiniciado). */
        try {
          const res = await api.get<{
            data: string;
            porMinuto?: { label: string; minuto: number; total: number }[];
            porHora?: { hora: number; label: string; total: number }[];
          }>(`/auditoria/dashboard/registros-hora?data=${dia}`, token);
          if (res?.porMinuto && res.porMinuto.length > 0) {
            setSerieDetalhe(res.porMinuto);
            setDiaDetalhe(res.data ?? dia);
            setHoraErro(null);
            return;
          }
          if (res?.porHora) {
            setSerieDetalhe(
              res.porHora
                .filter((h) => h.total > 0)
                .map((h) => ({
                  label: `${String(h.hora).padStart(2, "0")}:00`,
                  minuto: h.hora * 60,
                  total: h.total
                }))
            );
            setDiaDetalhe(res.data ?? dia);
            setHoraErro(null);
            return;
          }
        } catch {
          /* 404 ou indisponível — fallback abaixo */
        }

        /* Fallback: agrega HH:MM a partir de GET /auditoria/registros (já disponível). */
        const horarios: Array<string | Date> = [];
        let page = 1;
        let total = Infinity;
        while (horarios.length < total && page <= 20) {
          const res = await api.get<{
            total: number;
            registros: Array<{ dataHora: string }>;
          }>(`/auditoria/registros?dataInicio=${dia}&dataFim=${dia}&page=${page}&limit=500`, token);
          total = res?.total ?? 0;
          for (const r of res?.registros ?? []) horarios.push(r.dataHora);
          if (!res?.registros?.length) break;
          page += 1;
        }
        setSerieDetalhe(agregarPorMinuto(horarios));
        setDiaDetalhe(dia);
        setHoraErro(null);
      } catch (e) {
        if (!silent) {
          setHoraErro((e as Error).message || "Não foi possível carregar o dia.");
          setSerieDetalhe([]);
        }
      } finally {
        if (!silent) setHoraLoading(false);
      }
    },
    [token]
  );

  function voltarSerieDiaria() {
    setDiaDetalhe(null);
    setSerieDetalhe([]);
    setHoraErro(null);
    pontosDiaRef.current.clear();
  }

  /**
   * Recharts 3: onClick NÃO traz activePayload/chartX.
   * Compara clientX/Y com a posição na tela de cada ponto (≤ HIT_PX).
   */
  function onClickSerieDiaria(_state: unknown, event?: { clientX?: number; clientY?: number }) {
    if (diaDetalhe) return;
    const clientX = event?.clientX;
    const clientY = event?.clientY;
    if (typeof clientX !== "number" || typeof clientY !== "number") return;

    /* Atualiza posições com getBoundingClientRect (respeita transforms do Recharts). */
    const host = chartHostRef.current;
    if (host) {
      host.querySelectorAll<SVGCircleElement>("circle[data-dia]").forEach((el) => {
        const dia = el.getAttribute("data-dia");
        if (!dia) return;
        const r = el.getBoundingClientRect();
        pontosDiaRef.current.set(dia, {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2
        });
      });
    }

    const HIT_PX = 28;
    let melhorDia: string | null = null;
    let melhorDist = HIT_PX;
    for (const [dia, p] of pontosDiaRef.current.entries()) {
      const dist = Math.hypot(p.x - clientX, p.y - clientY);
      if (dist <= melhorDist) {
        melhorDist = dist;
        melhorDia = dia;
      }
    }
    if (melhorDia) void abrirDia(melhorDia);
  }

  /* Ao mudar o filtro de datas, sai do drill-down horário */
  useEffect(() => {
    setDiaDetalhe(null);
    setSerieDetalhe([]);
    setHoraErro(null);
    pontosDiaRef.current.clear();
  }, [dataInicio, dataFim]);

  /* Polling completo do dashboard (cards, gráficos e logs) a cada 30s */
  useEffect(() => {
    const POLL_MS = 30_000;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void carregarDashboard(true);
      void carregarLogs(logsPage, true);
      if (diaDetalhe) void abrirDia(diaDetalhe, true);
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [carregarDashboard, carregarLogs, logsPage, diaDetalhe, abrirDia]);

  if (loading && !data) return <Loading />;
  if (erro && !data) return <ErroBox msg={erro} />;
  if (!data) return null;

  const maxEntradas = Math.max(...(data.registrosPorDia ?? []).map((d) => d.entradas), 1);
  const uc = data.usoCanal;
  /* Fallback: se a API antiga não envia registrosPorTempo, usa entradas do período */
  const serieBase =
    data.registrosPorTempo && data.registrosPorTempo.length > 0
      ? data.registrosPorTempo
      : (data.registrosPorDia ?? []).map((d) => ({ data: d.data, total: d.entradas }));
  const serieLinha = serieBase.map((d) => ({
    ...d,
    label: new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short"
    })
  }));
  const rankingPont =
    modoPontualidade === "atrasados" ? (data.topAtrasados ?? []) : (data.topAdiantados ?? []);
  const rankingBanco =
    modoBanco === "negativo" ? (data.topBancoNegativo ?? []) : (data.topBancoPositivo ?? []);
  const rankingAtestado =
    modoAtestado === "mais" ? (data.topMaisAtestados ?? []) : (data.topMenosAtestados ?? []);
  const rankingAbono =
    modoAbono === "mais" ? (data.topMaisAbonos ?? []) : (data.topMenosAbonos ?? []);
  /* Ordem da API: maior primeiro. No BarChart vertical o 1º item fica no topo. */
  const abbreviarNome = (nome: string) =>
    nome.split(" ")[0] + (nome.split(" ")[1] ? ` ${nome.split(" ")[1][0]}.` : "");
  const chartPont = rankingPont.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    minutos: r.minutos,
    label: r.minutosFormatado
  }));
  const chartBanco = rankingBanco.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    minutos: r.minutos,
    label: r.minutosFormatado
  }));
  const chartAtestado = rankingAtestado.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    quantidade: r.quantidade,
    label: String(r.quantidade)
  }));
  const chartAbono = rankingAbono.map((r) => ({
    nome: abbreviarNome(r.nome),
    nomeCompleto: r.nome,
    quantidade: r.quantidade,
    label: String(r.quantidade)
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Filtro de período */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "14px 16px",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end"
        }}
      >
        <InputField label="Data início" type="date" value={dataInicio} onChange={setDataInicio} />
        <InputField label="Data fim" type="date" value={dataFim} onChange={setDataFim} />
        <button
          className="btn btn-primary"
          onClick={carregarDashboard}
          style={{ padding: "7px 16px", fontSize: 12 }}
        >
          <RefreshCwIcon size={13} /> &nbsp;Atualizar
        </button>
        {erro && (
          <span style={{ fontSize: 12, color: "#c8393f", alignSelf: "center" }}>{erro}</span>
        )}
      </div>

      {/* ── 8 cards em 2 linhas × 4 colunas — altura uniforme ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridAutoRows: "130px",
          gap: 12
        }}
      >
        {/* Linha 1 */}
        <StatCard
          label="Funcionários"
          value={data.totalFuncionarios}
          sub={`${data.funcionariosAtivos} ativos`}
          icon={<UsersIcon size={16} />}
          onClick={() => onAbrirFuncionarios?.()}
        />
        <StatCard
          label="Trabalhando agora"
          value={data.trabalhando}
          sub="no expediente"
          color="#2f7d4f"
          icon={<ClockIcon size={16} />}
          onClick={() => onAbrirFuncionarios?.("presente")}
        />
        <StatCard
          label="Em intervalo"
          value={data.emIntervalo}
          sub="pausa ativa"
          color="#c67f00"
          icon={<ClockIcon size={16} />}
        />
        <StatCard
          label="Registros hoje"
          value={data.registrosHoje}
          sub="todos os tipos"
          icon={<BarChart2Icon size={16} />}
        />

        {/* Linha 2 */}
        <StatCard
          label="Sol. pendentes"
          value={data.solicitacoesPendentes}
          sub="aguardando revisão"
          color={data.solicitacoesPendentes > 0 ? "#c67f00" : undefined}
          icon={<InboxIcon size={16} />}
        />
        <StatCard
          label="Afastamentos"
          value={data.afastamentosAtivos}
          sub="ativos hoje"
          color="#c8393f"
          icon={<CalendarIcon size={16} />}
        />
        <StatCard
          label="Períodos abertos"
          value={data.periodosAbertos}
          sub={`${data.periodosFechados} fechados · ${data.periodosAprovados} aprovados`}
          color="#2563eb"
          icon={<BarChart2Icon size={16} />}
        />

        {/* Card 8 — Uso por canal (todo o período) */}
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            minWidth: 0
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--burgundy-600)", opacity: 0.85 }}>
              <BarChart2Icon size={16} />
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-500)"
              }}
            >
              Uso por canal
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--ink-900)",
                lineHeight: 1,
                fontFamily: "var(--font-display)"
              }}
            >
              {uc.totalRegistros.toLocaleString("pt-BR")}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-400)" }}>registros totais</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              display: "flex",
              background: "rgba(122,30,38,0.06)"
            }}
          >
            {uc.pctMobile > 0 && (
              <div style={{ width: `${uc.pctMobile}%`, background: "#7c3aed" }} />
            )}
            {uc.pctDesktop > 0 && (
              <div style={{ width: `${uc.pctDesktop}%`, background: "#2f7d4f" }} />
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "Mobile", pct: uc.pctMobile, color: "#7c3aed" },
              { label: "Desktop", pct: uc.pctDesktop, color: "#2f7d4f" }
            ].map((item) => (
              <div
                key={item.label}
                style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: item.color,
                    flexShrink: 0
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--ink-600)" }}>{item.label}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--ink-900)",
                    marginLeft: "auto"
                  }}
                >
                  {item.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico + origens (existente) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            height: 130,
            boxSizing: "border-box"
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginBottom: 16
            }}
          >
            Entradas no período
          </p>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            {data.registrosPorDia.map((d) => {
              const pct = maxEntradas > 0 ? (d.entradas / maxEntradas) * 100 : 0;
              const dt = new Date(d.data + "T12:00:00");
              const dayName = dt.toLocaleDateString("pt-BR", { weekday: "short" });
              const eHoje = d.data === isoHoje;
              return (
                <div
                  key={d.data}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    minWidth: 0
                  }}
                >
                  <span
                    style={{
                      ...statValueStyle,
                      color: eHoje ? "var(--burgundy-600)" : "var(--ink-900)"
                    }}
                  >
                    {d.entradas}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(pct, 4)}%`,
                      background: eHoje ? "var(--burgundy-600)" : "var(--burgundy-200)",
                      borderRadius: "3px 3px 0 0",
                      minHeight: 4
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--ink-400)",
                      textTransform: "capitalize"
                    }}
                  >
                    {dayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            height: 130,
            boxSizing: "border-box"
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              marginBottom: 12
            }}
          >
            Origens (hoje)
          </p>
          {data.origens.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--ink-400)", fontStyle: "italic" }}>
              Sem registros hoje.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.origens.map((o) => {
                const cores: Record<string, string> = {
                  WEB: "#2563eb",
                  MOBILE: "#7c3aed",
                  DESKTOP: "#2f7d4f",
                  TOTEM: "#c67f00"
                };
                return (
                  <div key={o.origem} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: cores[o.origem] ?? "#6b7280",
                        flexShrink: 0
                      }}
                    />
                    <span style={{ flex: 1, fontSize: 12, color: "var(--ink-700)" }}>
                      {o.origem}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-900)" }}>
                      {o.total}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Gráfico de linha — registros por tempo (largura total, acima dos Logs) */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "18px 20px"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap"
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: 0
            }}
          >
            {diaDetalhe
              ? `Registros por horário — ${new Date(diaDetalhe + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}`
              : "Quantidade de registros por tempo"}
          </p>
          {diaDetalhe && (
            <button
              type="button"
              onClick={voltarSerieDiaria}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4
              }}
            >
              <ArrowLeftIcon size={12} /> Voltar ao período
            </button>
          )}
        </div>
        {!diaDetalhe && (
          <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "0 0 8px" }}>
            Clique no ponto de um dia para ver a quantidade de registros por horário (HH:MM).
          </p>
        )}
        {horaErro && (
          <p style={{ fontSize: 12, color: "#b91c1c", margin: "0 0 8px" }}>{horaErro}</p>
        )}
        <div style={{ width: "100%", height: 280 }}>
          {horaLoading ? (
            <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
              Carregando…
            </p>
          ) : diaDetalhe ? (
            serieDetalhe.length === 0 ? (
              <p
                style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}
              >
                Sem registros neste dia.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieDetalhe} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    width={36}
                  />
                  <Tooltip
                    formatter={(v: number | string) => [v as number, "Registros"]}
                    labelFormatter={(label: string) => `Horário ${label}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Registros"
                    stroke="var(--burgundy-600)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--burgundy-600)" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )
          ) : serieLinha.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
              Sem registros no período.
            </p>
          ) : (
            <div ref={chartHostRef} style={{ width: "100%", height: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={serieLinha}
                  margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
                  onClick={onClickSerieDiaria}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    width={36}
                  />
                  <Tooltip
                    formatter={(v: number | string) => [v as number, "Registros"]}
                    labelFormatter={(
                      _l: string,
                      payload?: Array<{ payload?: { data?: string } }>
                    ) => {
                      const d = payload?.[0]?.payload?.data;
                      return d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "";
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Registros"
                    stroke="var(--burgundy-600)"
                    strokeWidth={2.5}
                    isAnimationActive={false}
                    activeDot={{
                      r: 7,
                      fill: "var(--burgundy-600)",
                      stroke: "#fff",
                      strokeWidth: 2,
                      style: { cursor: "pointer" }
                    }}
                    dot={(props: {
                      cx?: number;
                      cy?: number;
                      payload?: { data?: string; total?: number };
                      index?: number;
                    }) => {
                      const { cx, cy, payload, index } = props;
                      if (cx == null || cy == null || !payload?.data) {
                        return <g key={`empty-dot-${index ?? 0}`} />;
                      }
                      return (
                        <circle
                          key={`dot-${payload.data}`}
                          data-dia={payload.data}
                          cx={cx}
                          cy={cy}
                          r={6}
                          fill="var(--burgundy-600)"
                          stroke="#fff"
                          strokeWidth={2}
                          style={{ cursor: "pointer", pointerEvents: "none" }}
                        />
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Top 10 pontualidade + Top 10 banco lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            minWidth: 0
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap"
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: 0
              }}
            >
              Top 10 {modoPontualidade === "atrasados" ? "mais atrasados" : "mais adiantados"}
            </p>
            <button
              type="button"
              onClick={() =>
                setModoPontualidade((m) => (m === "atrasados" ? "adiantados" : "atrasados"))
              }
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer"
              }}
            >
              Ver {modoPontualidade === "atrasados" ? "adiantados" : "atrasados"}
            </button>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            {chartPont.length === 0 ? (
              <p
                style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}
              >
                Sem dados no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartPont} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} unit="m" />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={88}
                    tick={{ fontSize: 11, fill: "#374151" }}
                  />
                  <Tooltip
                    formatter={(
                      v: number | string,
                      _n: string,
                      item?: { payload?: { label?: string } }
                    ) => [
                      item?.payload?.label ?? `${v}m`,
                      modoPontualidade === "atrasados" ? "Atraso médio" : "Adiantamento médio"
                    ]}
                    labelFormatter={(
                      _l: string,
                      p?: Array<{ payload?: { nomeCompleto?: string } }>
                    ) => p?.[0]?.payload?.nomeCompleto ?? ""}
                  />
                  <Bar
                    dataKey="minutos"
                    name="Minutos"
                    fill={modoPontualidade === "atrasados" ? "#c8393f" : "#2f7d4f"}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            minWidth: 0
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap"
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: 0
              }}
            >
              Top 10 banco {modoBanco === "negativo" ? "negativo" : "positivo"}
            </p>
            <button
              type="button"
              onClick={() => setModoBanco((m) => (m === "negativo" ? "positivo" : "negativo"))}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer"
              }}
            >
              Ver {modoBanco === "negativo" ? "positivos" : "negativos"}
            </button>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            {chartBanco.length === 0 ? (
              <p
                style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}
              >
                Sem dados no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartBanco} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#6b7280" }} unit="m" />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={88}
                    tick={{ fontSize: 11, fill: "#374151" }}
                  />
                  <Tooltip
                    formatter={(
                      v: number | string,
                      _n: string,
                      item?: { payload?: { label?: string } }
                    ) => [
                      item?.payload?.label ?? `${v}m`,
                      modoBanco === "negativo" ? "Déficit" : "Crédito"
                    ]}
                    labelFormatter={(
                      _l: string,
                      p?: Array<{ payload?: { nomeCompleto?: string } }>
                    ) => p?.[0]?.payload?.nomeCompleto ?? ""}
                  />
                  <Bar
                    dataKey="minutos"
                    name="Minutos"
                    fill={modoBanco === "negativo" ? "#c8393f" : "#2f7d4f"}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Top 10 atestados + Top 10 abonos lado a lado */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            minWidth: 0
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap"
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: 0
              }}
            >
              Top 10 {modoAtestado === "mais" ? "mais atestados" : "menos atestados"}
            </p>
            <button
              type="button"
              onClick={() => setModoAtestado((m) => (m === "mais" ? "menos" : "mais"))}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer"
              }}
            >
              Ver {modoAtestado === "mais" ? "menos atestados" : "mais atestados"}
            </button>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            {chartAtestado.length === 0 ? (
              <p
                style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}
              >
                Sem dados no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartAtestado} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={88}
                    tick={{ fontSize: 11, fill: "#374151" }}
                  />
                  <Tooltip
                    formatter={(
                      v: number | string,
                      _n: string,
                      item?: { payload?: { label?: string } }
                    ) => [item?.payload?.label ?? String(v), "Atestados"]}
                    labelFormatter={(
                      _l: string,
                      p?: Array<{ payload?: { nomeCompleto?: string } }>
                    ) => p?.[0]?.payload?.nomeCompleto ?? ""}
                  />
                  <Bar
                    dataKey="quantidade"
                    name="Atestados"
                    fill={modoAtestado === "mais" ? "#c8393f" : "#2f7d4f"}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: "18px 20px",
            minWidth: 0
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap"
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-500)",
                margin: 0
              }}
            >
              Top 10{" "}
              {modoAbono === "mais" ? "mais solicitações de abono" : "menos solicitações de abono"}
            </p>
            <button
              type="button"
              onClick={() => setModoAbono((m) => (m === "mais" ? "menos" : "mais"))}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                background: "transparent",
                color: "var(--burgundy-600)",
                cursor: "pointer"
              }}
            >
              Ver {modoAbono === "mais" ? "menos solicitações" : "mais solicitações"}
            </button>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            {chartAbono.length === 0 ? (
              <p
                style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}
              >
                Sem dados no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartAbono} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={88}
                    tick={{ fontSize: 11, fill: "#374151" }}
                  />
                  <Tooltip
                    formatter={(
                      v: number | string,
                      _n: string,
                      item?: { payload?: { label?: string } }
                    ) => [item?.payload?.label ?? String(v), "Solicitações de abono"]}
                    labelFormatter={(
                      _l: string,
                      p?: Array<{ payload?: { nomeCompleto?: string } }>
                    ) => p?.[0]?.payload?.nomeCompleto ?? ""}
                  />
                  <Bar
                    dataKey="quantidade"
                    name="Abonos"
                    fill={modoAbono === "mais" ? "#c8393f" : "#2f7d4f"}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Atestados por mês (últimos 12 meses) */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "18px 20px"
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-500)",
            margin: "0 0 12px"
          }}
        >
          Atestados por mês
        </p>
        <div style={{ width: "100%", height: 280 }}>
          {(data.atestadosPorMes ?? []).length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-400)", textAlign: "center", padding: 40 }}>
              Sem dados.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.atestadosPorMes}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,30,38,0.08)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
                <Tooltip
                  formatter={(v: number | string) => [v as number, "Atestados"]}
                  labelFormatter={(
                    _l: string,
                    payload?: Array<{ payload?: { mes?: string; label?: string } }>
                  ) => {
                    const mes = payload?.[0]?.payload?.mes;
                    if (!mes) return payload?.[0]?.payload?.label ?? "";
                    const [y, m] = mes.split("-").map(Number);
                    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
                      month: "long",
                      year: "numeric"
                    });
                  }}
                />
                <Bar dataKey="total" name="Atestados" fill="#c8393f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Últimos logs */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          overflow: "hidden"
        }}
      >
        {/* Cabeçalho dos logs */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(122,30,38,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <ShieldCheckIcon size={14} style={{ color: "var(--burgundy-600)" }} />
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: 0,
              flex: 1
            }}
          >
            Logs e Auditoria
          </p>
          {logsLoading && (
            <span style={{ fontSize: 11, color: "var(--ink-400)" }}>Carregando…</span>
          )}
          {logsTotal > 0 && (
            <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
              {logsTotal.toLocaleString("pt-BR")} registros
            </span>
          )}
          <button
            onClick={() => carregarLogs(logsPage)}
            disabled={logsLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.18)",
              background: "transparent",
              color: "var(--burgundy-600)",
              fontSize: 11,
              fontWeight: 600,
              cursor: logsLoading ? "not-allowed" : "pointer",
              opacity: logsLoading ? 0.5 : 1
            }}
          >
            <RefreshCwIcon size={11} /> Atualizar
          </button>
        </div>

        {/* Linhas de log */}
        {logsLoading ? (
          <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "var(--ink-400)" }}>
            Carregando…
          </div>
        ) : logs.length === 0 ? (
          <p style={{ padding: 20, fontSize: 12, color: "var(--ink-400)", textAlign: "center" }}>
            Nenhum log registrado.
          </p>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid rgba(122,30,38,0.04)",
                display: "flex",
                gap: 12,
                alignItems: "flex-start"
              }}
            >
              <MethodBadge method={log.method} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--burgundy-600)",
                  background: "rgba(122,30,38,0.06)",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-sm)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 220
                }}
              >
                {log.path ?? log.action}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: "var(--ink-500)" }}>
                {log.username ?? log.actorUserId ?? "sistema"}
              </span>
              {log.statusCode != null &&
                (() => {
                  const sb = statusBadge(log.statusCode);
                  return sb ? (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: sb.color,
                        background: sb.bg,
                        padding: "1px 6px",
                        borderRadius: "var(--radius-sm)",
                        fontFamily: "var(--font-mono)",
                        flexShrink: 0
                      }}
                    >
                      {sb.label}
                    </span>
                  ) : null;
                })()}
              <span style={{ fontSize: 10.5, color: "var(--ink-400)", whiteSpace: "nowrap" }}>
                {fmtDateTime(log.createdAt)}
              </span>
            </div>
          ))
        )}

        {/* Paginação */}
        <Pagination
          page={logsPage}
          total={logsTotal}
          limit={LOGS_LIMIT}
          onChange={(p) => carregarLogs(p)}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ABA FUNCIONÁRIOS
═══════════════════════════════════════════════ */

function TabFuncionarios({
  token,
  initialStatusPonto = "",
  isSuperAdmin = false
}: {
  token: string;
  initialStatusPonto?: "" | "presente" | "ausente";
  isSuperAdmin?: boolean;
}) {
  const hoje = new Date();
  const primeiroDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const hojeIso = hoje.toISOString().slice(0, 10);

  const [lista, setLista] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [filtroStatusPonto, setFiltroStatusPonto] = useState(initialStatusPonto);
  const [dataInicio, setDataInicio] = useState(primeiroDiaMes);
  const [dataFim, setDataFim] = useState(hojeIso);
  const [selecionado, setSelecionado] = useState<Funcionario | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (busca) params.set("busca", busca);
      if (filtroAtivo !== "") params.set("ativo", filtroAtivo);
      if (filtroStatusPonto) params.set("statusPonto", filtroStatusPonto);
      if (dataInicio) params.set("dataInicio", dataInicio);
      if (dataFim) params.set("dataFim", dataFim);
      const data = await api.get<Funcionario[]>(`/auditoria/funcionarios?${params}`, token);
      let rows = data ?? [];
      /* Fallback: se a API ainda não filtrar/devolver statusPonto, deriva no client. */
      if (filtroStatusPonto) {
        rows = rows.filter((f) => statusPontoFuncionario(f) === filtroStatusPonto);
      }
      setLista(rows);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, busca, filtroAtivo, filtroStatusPonto, dataInicio, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function exportar() {
    exportCSV(
      lista.map((f) => ({
        Matricula: f.matricula,
        Nome: f.user.name,
        Email: f.user.email,
        Cargo: f.cargo,
        Gerencia: f.gerencia?.nome ?? "",
        Subsecao: f.subsecao ? slugLabel(f.subsecao) : "",
        Ramal: f.ramal ?? "",
        Sala: f.sala ?? "",
        Andar: f.andar ?? "",
        Status: f.ativo ? "Ativo" : "Inativo",
        StatusPonto: statusPontoFuncionario(f) === "presente" ? "Presente" : "Ausente",
        HorasExtras: f.solicitacoesPendentes > 0 ? "0h00m" : f.periodoFormatado.horasExtras,
        HorasFalta: f.solicitacoesPendentes > 0 ? "0h00m" : f.periodoFormatado.horasFalta,
        SolicitacoesPendentes: f.solicitacoesPendentes
      })),
      `funcionarios_${dataInicio}_${dataFim}.csv`
    );
  }

  if (selecionado) {
    return (
      <DetalhesFuncionario
        funcionario={selecionado}
        token={token}
        isSuperAdmin={isSuperAdmin}
        onBack={() => setSelecionado(null)}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filtros */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "14px 16px",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end"
        }}
      >
        <div style={{ flex: "1 1 200px" }}>
          <InputField
            label="Buscar"
            value={busca}
            onChange={setBusca}
            placeholder="Nome, matrícula, cargo…"
          />
        </div>
        <SelectField
          label="Cadastro"
          value={filtroAtivo}
          onChange={setFiltroAtivo}
          options={[
            { value: "", label: "Todos" },
            { value: "true", label: "Ativos" },
            { value: "false", label: "Inativos" }
          ]}
        />
        <SelectField
          label="Ponto"
          value={filtroStatusPonto}
          onChange={(v) => setFiltroStatusPonto(v === "presente" || v === "ausente" ? v : "")}
          options={[
            { value: "", label: "Todos" },
            { value: "presente", label: "Presente" },
            { value: "ausente", label: "Ausente" }
          ]}
        />
        <InputField label="Data início" type="date" value={dataInicio} onChange={setDataInicio} />
        <InputField label="Data fim" type="date" value={dataFim} onChange={setDataFim} />
        <button
          className="btn btn-primary"
          onClick={carregar}
          style={{ padding: "7px 16px", fontSize: 12, alignSelf: "flex-end" }}
        >
          <SearchIcon size={13} /> &nbsp;Buscar
        </button>
        <button
          onClick={exportar}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            alignSelf: "flex-end",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.20)",
            background: "transparent",
            color: "var(--burgundy-600)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <DownloadIcon size={13} /> CSV
        </button>
      </div>

      {erro && <ErroBox msg={erro} />}

      {/* Tabela */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 110px 1fr 1fr 100px",
            padding: "10px 16px",
            background: "var(--cream-50)",
            borderBottom: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          {[
            "Funcionário",
            "Cargo / Gerência",
            "Status ponto",
            "Extras / Falta",
            "Sol. pend.",
            ""
          ].map((c) => (
            <span
              key={c || "acao"}
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "var(--ink-500)"
              }}
            >
              {c}
            </span>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Loading />
          </div>
        ) : lista.length === 0 ? (
          <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
            Nenhum funcionário encontrado.
          </p>
        ) : (
          lista.map((f) => {
            const comPendentes = f.solicitacoesPendentes > 0;
            const horasExtras = comPendentes ? "0h00m" : f.periodoFormatado.horasExtras;
            const horasFalta = comPendentes ? "0h00m" : f.periodoFormatado.horasFalta;
            const presente = statusPontoFuncionario(f) === "presente";
            return (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 110px 1fr 1fr 100px",
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(122,30,38,0.04)",
                  alignItems: "center"
                }}
              >
                {/* Funcionário */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <FuncAvatar name={f.user.name} fotoUrl={f.fotoPerfilUrl} size={32} />
                  <div>
                    <p
                      style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}
                    >
                      {f.user.name}
                      {!f.ativo && (
                        <Badge label="Inativo" bg="rgba(200,57,63,0.10)" color="#c8393f" />
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: 10.5,
                        color: "var(--ink-500)",
                        margin: "2px 0 0",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      {f.matricula} · {f.user.email}
                    </p>
                  </div>
                </div>
                {/* Área / Hierarquia */}
                <div>
                  <p style={{ fontSize: 12, color: "var(--ink-700)", margin: 0 }}>
                    {areaProfissional(f)}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "1px 0 0" }}>
                    {f.gerencia?.nome ?? "—"}
                    {f.isManager ? " · Gerente" : ""}
                  </p>
                  {infoContato(f) && (
                    <p style={{ fontSize: 10.5, color: "var(--ink-400)", margin: "1px 0 0" }}>
                      {infoContato(f)}
                    </p>
                  )}
                </div>
                {/* Status do ponto */}
                <div>
                  <Badge
                    label={presente ? "Presente" : "Ausente"}
                    bg={presente ? "rgba(47,125,79,0.12)" : "rgba(198,127,0,0.12)"}
                    color={presente ? "#2f7d4f" : "#c67f00"}
                  />
                </div>
                {/* Extras / Falta */}
                <div>
                  <p style={{ fontSize: 11, color: "#2f7d4f", margin: 0 }}>+{horasExtras}</p>
                  <p style={{ fontSize: 11, color: "#c8393f", margin: "1px 0 0" }}>-{horasFalta}</p>
                </div>
                {/* Pendentes */}
                <div>
                  {f.solicitacoesPendentes > 0 ? (
                    <Badge
                      label={String(f.solicitacoesPendentes)}
                      bg="rgba(198,127,0,0.12)"
                      color="#c67f00"
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--ink-400)" }}>0</span>
                  )}
                </div>
                {/* Ação */}
                <button
                  onClick={() => setSelecionado(f)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.20)",
                    background: "transparent",
                    color: "var(--burgundy-600)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  Ver detalhes
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ─── Detalhe de funcionário ─── */
function DetalhesFuncionario({
  funcionario,
  token,
  isSuperAdmin = false,
  onBack
}: {
  funcionario: Funcionario;
  token: string;
  isSuperAdmin?: boolean;
  onBack: () => void;
}) {
  const [subAba, setSubAba] = useState<
    | "registros"
    | "historico"
    | "periodos"
    | "solicitacoes"
    | "afastamentos"
    | "bancoHoras"
    | "documentos"
    | "ferias"
  >("registros");
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [relatorio, setRelatorio] = useState<Record<string, unknown> | null>(null);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [afastamentos, setAfastamentos] = useState<Afastamento[]>([]);
  const [bancoHoras, setBancoHoras] = useState<BancoHorasFuncionarioDetalhe | null>(null);
  const [documentosRh, setDocumentosRh] = useState<DocumentoRhEnvio[]>([]);
  const [feriasHistorico, setFeriasHistorico] = useState<Solicitacao[]>([]);
  const [feriasSaldo, setFeriasSaldo] = useState<SaldoFerias | null>(null);
  const [loading, setLoading] = useState(false);

  const carregarRegistros = useCallback(async () => {
    setLoading(true);
    try {
      const [regsResp, rel] = await Promise.all([
        api.get<{ registros: Registro[] }>(
          `/auditoria/funcionarios/${funcionario.id}/registros?mes=${mes}&ano=${ano}`,
          token
        ),
        api.get<Record<string, unknown>>(
          `/auditoria/funcionarios/${funcionario.id}/relatorio?mes=${mes}&ano=${ano}`,
          token
        )
      ]);
      setRegistros(regsResp?.registros ?? []);
      setRelatorio(rel);
    } finally {
      setLoading(false);
    }
  }, [funcionario.id, token, mes, ano]);

  const carregarSolicitacoes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ solicitacoes: Solicitacao[] }>(
        `/auditoria/solicitacoes?funcionarioId=${funcionario.id}&limit=200`,
        token
      );
      setSolicitacoes((data as { solicitacoes: Solicitacao[] }).solicitacoes ?? []);
    } finally {
      setLoading(false);
    }
  }, [funcionario.id, token]);

  const carregarAfastamentos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ afastamentos: Afastamento[] }>(
        `/auditoria/afastamentos?funcionarioId=${funcionario.id}&limit=200`,
        token
      );
      setAfastamentos((data as { afastamentos: Afastamento[] }).afastamentos ?? []);
    } finally {
      setLoading(false);
    }
  }, [funcionario.id, token]);

  const carregarBancoHoras = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<BancoHorasFuncionarioDetalhe>(
        `/auditoria/funcionarios/${funcionario.id}/banco-horas`,
        token
      );
      setBancoHoras(data);
    } finally {
      setLoading(false);
    }
  }, [funcionario.id, token]);

  const carregarDocumentosRh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<DocumentoRhEnvio[]>(
        `/auditoria/funcionarios/${funcionario.id}/documentos-rh`,
        token
      );
      setDocumentosRh(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [funcionario.id, token]);

  const carregarFerias = useCallback(async () => {
    setLoading(true);
    try {
      const [solData, saldoData] = await Promise.all([
        api.get<{ solicitacoes: Solicitacao[] }>(
          `/auditoria/solicitacoes?funcionarioId=${funcionario.id}&tipo=FERIAS&limit=200`,
          token
        ),
        api
          .get<SaldoFerias>(`/auditoria/rh/funcionarios/${funcionario.id}/ferias/saldo`, token)
          .catch(() => null)
      ]);
      setFeriasHistorico((solData as { solicitacoes: Solicitacao[] }).solicitacoes ?? []);
      setFeriasSaldo(saldoData);
    } finally {
      setLoading(false);
    }
  }, [funcionario.id, token]);

  useEffect(() => {
    if (subAba === "registros") carregarRegistros();
    else if (subAba === "solicitacoes") carregarSolicitacoes();
    else if (subAba === "afastamentos") carregarAfastamentos();
    else if (subAba === "bancoHoras") carregarBancoHoras();
    else if (subAba === "documentos") carregarDocumentosRh();
    else if (subAba === "ferias") carregarFerias();
  }, [
    subAba,
    carregarRegistros,
    carregarSolicitacoes,
    carregarAfastamentos,
    carregarBancoHoras,
    carregarDocumentosRh,
    carregarFerias
  ]);

  function exportarRelatorio() {
    if (!registros.length) return;
    exportCSV(
      registros.map((r) => ({
        Data: fmtDateTime(r.dataHora),
        Tipo: tipoPontoLabel(r.tipo),
        Origem: r.origem,
        Modo: r.modoRegistro,
        IP: r.ipOrigem ?? "",
        DentroPerimetro: r.dentroPerimetro ? "Sim" : "Não",
        Ajustado: r.ajustado ? "Sim" : "Não",
        Observacao: r.observacao ?? ""
      })),
      `registros_${funcionario.matricula}_${mes}_${ano}.csv`
    );
  }

  const rel = relatorio as {
    diasTrabalhados?: number;
    horasTrabalhadasFormatado?: string;
    horasExtrasFormatado?: string;
    horasFaltaFormatado?: string;
    saldoFormatado?: string;
    saldoMinutos?: number;
  } | null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onBack}
          style={{
            padding: "7px 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.20)",
            background: "transparent",
            color: "var(--burgundy-600)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600
          }}
        >
          <ArrowLeftIcon size={13} /> Voltar
        </button>
        <FuncAvatar name={funcionario.user.name} fotoUrl={funcionario.fotoPerfilUrl} size={40} />
        <div>
          <h2
            style={{
              fontSize: 18,
              margin: 0,
              fontFamily: "var(--font-display)",
              fontStyle: "italic"
            }}
          >
            {funcionario.user.name}
          </h2>
          <p style={{ fontSize: 11, color: "var(--ink-500)", margin: 0 }}>
            {funcionario.matricula} · {areaProfissional(funcionario)}
            {funcionario.gerencia
              ? ` · ${funcionario.gerencia.sigla || funcionario.gerencia.nome}`
              : ""}
            {funcionario.isManager ? " · Gerente" : ""}
          </p>
          {infoContato(funcionario) && (
            <p style={{ fontSize: 10.5, color: "var(--ink-400)", margin: "2px 0 0" }}>
              {infoContato(funcionario)}
            </p>
          )}
        </div>
      </div>

      {/* Card resumo + controles */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: "16px 20px",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "flex-end"
        }}
      >
        <SelectField
          label="Mês"
          value={mes}
          onChange={(v) => {
            setMes(v);
          }}
          options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
        />
        <SelectField
          label="Ano"
          value={ano}
          onChange={(v) => {
            setAno(v);
          }}
          options={Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)).map(
            (a) => ({
              value: a,
              label: a
            })
          )}
        />
        <button
          className="btn btn-primary"
          onClick={carregarRegistros}
          style={{ padding: "7px 14px", fontSize: 12, alignSelf: "flex-end" }}
        >
          <RefreshCwIcon size={12} /> &nbsp;Atualizar
        </button>

        {rel && (
          <div style={{ display: "flex", gap: 20, marginLeft: "auto", flexWrap: "wrap" }}>
            <div>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--ink-400)",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em"
                }}
              >
                Dias trab.
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
                {rel.diasTrabalhados ?? 0}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--ink-400)",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em"
                }}
              >
                Horas trab.
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
                {rel.horasTrabalhadasFormatado}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--ink-400)",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em"
                }}
              >
                Extras
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#2f7d4f" }}>
                {rel.horasExtrasFormatado}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--ink-400)",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em"
                }}
              >
                Falta
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#c8393f" }}>
                {rel.horasFaltaFormatado}
              </p>
            </div>
            <div>
              <p
                style={{
                  fontSize: 10,
                  color: "var(--ink-400)",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.10em"
                }}
              >
                Saldo
              </p>
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  margin: 0,
                  color: (rel.saldoMinutos ?? 0) >= 0 ? "#2f7d4f" : "#c8393f"
                }}
              >
                {rel.saldoFormatado}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sub-abas */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid rgba(122,30,38,0.08)",
          flexWrap: "wrap"
        }}
      >
        {(
          [
            {
              id: "registros",
              label: "Registros de Ponto",
              cor: "#2563eb",
              icone: <ClockIcon size={13} />
            },
            {
              id: "historico",
              label: "Histórico",
              cor: "#6b0f1a",
              icone: <BarChart2Icon size={13} />
            },
            {
              id: "solicitacoes",
              label: "Solicitações",
              cor: "#c67f00",
              icone: <InboxIcon size={13} />
            },
            {
              id: "ferias",
              label: "Férias",
              cor: "#2f7d4f",
              icone: <span style={{ fontSize: 13, lineHeight: 1 }}>🌴</span>
            },
            {
              id: "afastamentos",
              label: "Afastamentos",
              cor: "#7c3aed",
              icone: <CalendarIcon size={13} />
            },
            {
              id: "bancoHoras",
              label: "Banco de Horas",
              cor: "#0891b2",
              icone: <DatabaseIcon size={13} />
            },
            {
              id: "documentos",
              label: "Documentos",
              cor: "#475569",
              icone: <FileTextIcon size={13} />
            }
          ] as const
        ).map((a) => {
          const ativo = subAba === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setSubAba(a.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 16px",
                borderRadius: "var(--radius-md) var(--radius-md) 0 0",
                border: "none",
                background: ativo ? a.cor : "transparent",
                color: ativo ? "#fff" : a.cor,
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer"
              }}
            >
              {a.icone}
              {a.label}
            </button>
          );
        })}
        {subAba === "registros" && (
          <button
            onClick={exportarRelatorio}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.20)",
              background: "transparent",
              color: "var(--burgundy-600)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "center"
            }}
          >
            <DownloadIcon size={12} /> Exportar CSV
          </button>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : subAba === "registros" ? (
        <RegistrosPorDia registros={registros} />
      ) : subAba === "historico" ? (
        <TabHistoricoFunc funcionarioId={funcionario.id} token={token} />
      ) : subAba === "solicitacoes" ? (
        <TabelaSolicitacoes solicitacoes={solicitacoes} />
      ) : subAba === "ferias" ? (
        <PainelFerias
          saldo={feriasSaldo}
          historico={feriasHistorico}
          onRecarregar={carregarFerias}
        />
      ) : subAba === "afastamentos" ? (
        <TabelaAfastamentos afastamentos={afastamentos} />
      ) : subAba === "bancoHoras" && bancoHoras ? (
        <BancoHorasDiasTabela dados={bancoHoras} />
      ) : subAba === "documentos" ? (
        <TabelaDocumentosRh
          documentos={documentosRh}
          funcionarioId={funcionario.id}
          token={token}
          isSuperAdmin={isSuperAdmin}
          onExcluido={carregarDocumentosRh}
        />
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   REGISTROS POR DIA — TIMELINE (detalhe do funcionário)
═══════════════════════════════════════════════ */

/* ─── Configurações visuais por tipo de ponto ─── */
const TIPO_CONFIG: Record<string, { cor: string; label: string; icone: React.ReactNode }> = {
  ENTRADA: {
    cor: "#2f7d4f",
    label: "Entrada",
    icone: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 3l14 9-14 9V3z" />
      </svg>
    )
  },
  INICIO_INTERVALO: {
    cor: "#c67f00",
    label: "Início Intervalo",
    icone: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    )
  },
  FIM_INTERVALO: {
    cor: "#2563eb",
    label: "Fim Intervalo",
    icone: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 3l13 9-13 9V3z" />
        <rect x="19" y="3" width="2" height="18" rx="1" />
      </svg>
    )
  },
  SAIDA: {
    cor: "#7a1e26",
    label: "Saída",
    icone: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    )
  },
  INTERROMPER_EXPEDIENTE: {
    cor: "#6b7280",
    label: "Interromper Expediente",
    icone: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    )
  },
  REINICIAR_EXPEDIENTE: {
    cor: "#6b7280",
    label: "Reiniciar Expediente",
    icone: (
      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 3l14 9-14 9V3z" />
      </svg>
    )
  }
};

const ORIGEM_CONFIG: Record<string, { cor: string; bg: string }> = {
  MOBILE: { cor: "#7c3aed", bg: "rgba(124,58,237,0.10)" },
  WEB: { cor: "#2563eb", bg: "rgba(37,99,235,0.10)" },
  DESKTOP: { cor: "#2f7d4f", bg: "rgba(47,125,79,0.10)" },
  TOTEM: { cor: "#c67f00", bg: "rgba(198,127,0,0.10)" }
};

/* ─── Timeline horizontal ─── */
function TimelineHorizontal({ registros: regs }: { registros: Registro[] }) {
  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div
        style={{
          display: "flex",
          minWidth: regs.length * 180,
          padding: "0 4px"
        }}
      >
        {regs.map((r, idx) => {
          const cfg = TIPO_CONFIG[r.tipo] ?? { cor: "#6b7280", label: r.tipo, icone: null };
          const origemCfg = ORIGEM_CONFIG[r.origem] ?? {
            cor: "#6b7280",
            bg: "rgba(107,114,128,0.10)"
          };
          const hora = new Date(r.dataHora).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          });
          const isFirst = idx === 0;
          const isLast = idx === regs.length - 1;

          return (
            <div
              key={r.id}
              style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column" }}
            >
              {/* ── Linha de conectores + círculo ── */}
              <div style={{ display: "flex", alignItems: "center", height: 52 }}>
                {/* Conector esquerdo */}
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: isFirst ? "transparent" : "rgba(122,30,38,0.14)"
                  }}
                />
                {/* Círculo central */}
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: cfg.cor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    flexShrink: 0,
                    boxShadow: `0 4px 12px ${cfg.cor}55`,
                    position: "relative",
                    zIndex: 1
                  }}
                >
                  {cfg.icone}
                </div>
                {/* Conector direito */}
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    background: isLast ? "transparent" : "rgba(122,30,38,0.14)"
                  }}
                />
              </div>

              {/* ── Informações abaixo do nó ── */}
              <div
                style={{
                  padding: "12px 10px 20px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  textAlign: "center"
                }}
              >
                {/* Hora */}
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: cfg.cor,
                    fontFamily: "var(--font-mono)",
                    lineHeight: 1
                  }}
                >
                  {hora}
                </span>

                {/* Tipo */}
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: cfg.cor,
                    background: `${cfg.cor}12`,
                    padding: "3px 10px",
                    borderRadius: "var(--radius-full)"
                  }}
                >
                  {cfg.label}
                </span>

                {/* Todos os badges em linha única */}
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}
                >
                  {/* Origem */}
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: origemCfg.cor,
                      background: origemCfg.bg,
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {r.origem}
                  </span>

                  {/* Perímetro — só quando coordenadas foram coletadas */}
                  {r.latitude != null && r.longitude != null && (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: r.dentroPerimetro ? "#2f7d4f" : "#c8393f",
                        background: r.dentroPerimetro
                          ? "rgba(47,125,79,0.09)"
                          : "rgba(200,57,63,0.07)",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {r.dentroPerimetro ? "✓ Perímetro" : "✗ Fora"}
                    </span>
                  )}

                  {/* Mapa — link externo Google Maps */}
                  {r.latitude != null && r.longitude != null && (
                    <a
                      href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "#1a73e8",
                        background: "rgba(26,115,232,0.09)",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        whiteSpace: "nowrap",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3
                      }}
                    >
                      <svg
                        width={10}
                        height={10}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      Mapa
                    </a>
                  )}

                  {/* IP */}
                  {r.ipOrigem && (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 500,
                        color: "var(--ink-500)",
                        background: "rgba(122,30,38,0.05)",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      {r.ipOrigem}
                    </span>
                  )}

                  {/* Ajustado */}
                  {r.ajustado && (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: "#c67f00",
                        background: "rgba(198,127,0,0.10)",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        whiteSpace: "nowrap"
                      }}
                    >
                      Ajustado
                    </span>
                  )}
                </div>

                {/* Observação */}
                {r.observacao && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--ink-500)",
                      fontStyle: "italic",
                      maxWidth: 160,
                      lineHeight: 1.4,
                      textAlign: "center"
                    }}
                  >
                    "{r.observacao}"
                  </span>
                )}

                {/* Foto grande — centralizada sob o nó */}
                {r.fotoUrl ? (
                  <img
                    src={r.fotoUrl}
                    alt={`Foto — ${cfg.label}`}
                    style={{
                      width: 120,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: "var(--radius-lg)",
                      border: `2px solid ${cfg.cor}35`,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
                      marginTop: 4
                    }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: "var(--radius-lg)",
                      border: "2px dashed rgba(122,30,38,0.12)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      marginTop: 4,
                      background: "rgba(122,30,38,0.02)"
                    }}
                  >
                    <svg
                      width={28}
                      height={28}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(122,30,38,0.25)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span
                      style={{
                        fontSize: 9.5,
                        color: "rgba(122,30,38,0.30)",
                        fontWeight: 600,
                        letterSpacing: "0.06em"
                      }}
                    >
                      sem foto
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Linha de dia (colapsável) ─── */
function DiaRow({
  data,
  registros: regs,
  aberto,
  onToggle
}: {
  data: string;
  registros: Registro[];
  aberto: boolean;
  onToggle: () => void;
}) {
  const dt = new Date(data + "T12:00:00");
  const diaSemana = dt.toLocaleDateString("pt-BR", { weekday: "long" });
  const dataCurta = dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  /* Cálculo de horas — idêntico ao Histórico: minutos a partir de HH:MM
     (Brasília). Trecho aberto só conta no dia corrente. */
  const hojeIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const eHoje = data === hojeIso;

  const fmtHoraBR = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(iso));
  const toMin = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  };

  let minutos = 0;
  let entradaMin: number | null = null;
  for (const r of regs) {
    const ts = toMin(fmtHoraBR(r.dataHora));
    if (r.tipo === "ENTRADA" || r.tipo === "REINICIAR_EXPEDIENTE") {
      entradaMin = ts;
    } else if (
      (r.tipo === "INICIO_INTERVALO" ||
        r.tipo === "INTERROMPER_EXPEDIENTE" ||
        r.tipo === "SAIDA") &&
      entradaMin !== null
    ) {
      minutos += ts - entradaMin;
      entradaMin = null;
    } else if (r.tipo === "FIM_INTERVALO") {
      entradaMin = ts;
    }
  }
  if (entradaMin !== null && eHoje) {
    minutos += Math.max(0, toMin(fmtHoraBR(new Date().toISOString())) - entradaMin);
  }
  const horasStr = `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}m`;

  const regsOrdenados = [...regs].sort(
    (a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()
  );

  /* Status atual com base no último registro do dia.
     Em dias anteriores sem SAÍDA: jornada não completa. */
  const ultimoTipo = regsOrdenados.at(-1)?.tipo;
  const temSaida = regsOrdenados.some((r) => r.tipo === "SAIDA");
  const diaPassado = data < hojeIso;

  const statusPorTipo: Record<
    string,
    { titulo: string; situacao?: "presente" | "ausente"; cor: string; bg: string; borda: string }
  > = {
    ENTRADA: {
      titulo: "Iniciou a jornada",
      situacao: "presente",
      cor: "#2f7d4f",
      bg: "rgba(47,125,79,0.08)",
      borda: "#2f7d4f"
    },
    REINICIAR_EXPEDIENTE: {
      titulo: "Reiniciou o expediente",
      situacao: "presente",
      cor: "#2f7d4f",
      bg: "rgba(47,125,79,0.08)",
      borda: "#2f7d4f"
    },
    FIM_INTERVALO: {
      titulo: "Retornou do almoço",
      situacao: "presente",
      cor: "#2f7d4f",
      bg: "rgba(47,125,79,0.08)",
      borda: "#2f7d4f"
    },
    INICIO_INTERVALO: {
      titulo: "Saiu para o almoço",
      situacao: "ausente",
      cor: "#c67f00",
      bg: "rgba(198,127,0,0.08)",
      borda: "#c67f00"
    },
    INTERROMPER_EXPEDIENTE: {
      titulo: "Interrompeu o expediente",
      situacao: "ausente",
      cor: "#6b7280",
      bg: "rgba(107,114,128,0.10)",
      borda: "#6b7280"
    },
    SAIDA: {
      titulo: "Finalizou o expediente",
      cor: "#7a1e26",
      bg: "rgba(122,30,38,0.08)",
      borda: "#7a1e26"
    }
  };

  let status: {
    titulo: string;
    situacao?: "presente" | "ausente";
    cor: string;
    bg: string;
    borda: string;
  };
  if (!ultimoTipo) {
    status = {
      titulo: "Sem registros",
      cor: "#c8393f",
      bg: "rgba(200,57,63,0.08)",
      borda: "#c8393f"
    };
  } else if (diaPassado && !temSaida) {
    status = {
      titulo: "Jornada não foi completada",
      cor: "#c8393f",
      bg: "rgba(200,57,63,0.08)",
      borda: "#c8393f"
    };
  } else {
    status = statusPorTipo[ultimoTipo] ?? {
      titulo: tipoPontoLabel(ultimoTipo),
      cor: "#c67f00",
      bg: "rgba(198,127,0,0.08)",
      borda: "#c67f00"
    };
  }

  const temFotos = regs.some((r) => r.fotoUrl);

  const horarioComLegenda = regsOrdenados.map((r) => {
    const hora = new Date(r.dataHora).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    const labelCurto =
      r.tipo === "ENTRADA"
        ? "Entrada"
        : r.tipo === "SAIDA"
          ? "Saída"
          : r.tipo === "INICIO_INTERVALO"
            ? "Intervalo"
            : r.tipo === "FIM_INTERVALO"
              ? "Retorno"
              : r.tipo === "INTERROMPER_EXPEDIENTE"
                ? "Pausa"
                : r.tipo === "REINICIAR_EXPEDIENTE"
                  ? "Retomada"
                  : tipoPontoLabel(r.tipo);
    return { hora, label: labelCurto, cor: tipoPontoCor(r.tipo) };
  });

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(122,30,38,0.07)",
        overflow: "hidden"
      }}
    >
      {/* Cabeçalho do dia — clicável */}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 20px",
          background: aberto ? "rgba(122,30,38,0.03)" : "transparent",
          border: "none",
          borderLeft: `4px solid ${status.borda}`,
          cursor: "pointer",
          textAlign: "left",
          transition: "background 150ms"
        }}
      >
        {/* Data + status */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 12
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink-900)",
                margin: 0,
                textTransform: "capitalize"
              }}
            >
              {diaSemana}
            </p>
            <p
              style={{
                fontSize: 11.5,
                color: "var(--ink-500)",
                margin: "1px 0 0",
                fontFamily: "var(--font-mono)"
              }}
            >
              {dataCurta}
            </p>
          </div>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: status.cor,
              background: status.bg,
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              whiteSpace: "nowrap",
              alignSelf: "center",
              flexShrink: 0,
              lineHeight: 1.2
            }}
            title={status.situacao ? `${status.titulo} — ${status.situacao}` : status.titulo}
          >
            <span>{status.titulo}</span>
            {status.situacao && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                  color: status.situacao === "presente" ? "#2f7d4f" : "#c67f00",
                  background:
                    status.situacao === "presente"
                      ? "rgba(47,125,79,0.14)"
                      : "rgba(198,127,0,0.14)",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-full)"
                }}
              >
                {status.situacao}
              </span>
            )}
          </span>
        </div>

        {/* Horas + horários dos registros */}
        {regs.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 3,
              minWidth: 0,
              flexShrink: 1
            }}
          >
            {minutos > 0 && (
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: "var(--ink-900)",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                  lineHeight: 1.1
                }}
              >
                {horasStr}
              </span>
            )}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: "2px 8px",
                maxWidth: 280
              }}
            >
              {horarioComLegenda.map((item, i) => (
                <span
                  key={`${item.hora}-${item.label}-${i}`}
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "center",
                    lineHeight: 1.15
                  }}
                >
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "var(--ink-800)",
                      fontFamily: "var(--font-mono)"
                    }}
                  >
                    {item.hora}
                  </span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: item.cor,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {item.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Nº de registros */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--ink-500)",
            background: "rgba(122,30,38,0.06)",
            padding: "3px 10px",
            borderRadius: "var(--radius-full)",
            whiteSpace: "nowrap"
          }}
        >
          {regs.length} {regs.length === 1 ? "registro" : "registros"}
        </span>

        {/* Foto indicador */}
        {temFotos && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#7c3aed",
              background: "rgba(124,58,237,0.08)",
              padding: "3px 10px",
              borderRadius: "var(--radius-full)",
              whiteSpace: "nowrap"
            }}
          >
            📷 foto
          </span>
        )}

        {/* Chevron */}
        <span
          style={{
            color: "var(--ink-400)",
            transition: "transform 220ms",
            transform: aberto ? "rotate(180deg)" : "rotate(0deg)",
            display: "flex",
            flexShrink: 0
          }}
        >
          <ChevronDownIcon size={16} />
        </span>
      </button>

      {/* Timeline expandida — horizontal */}
      {aberto && (
        <div
          style={{
            padding: "20px 16px 8px",
            background: "rgba(122,30,38,0.015)",
            borderTop: "1px solid rgba(122,30,38,0.06)"
          }}
        >
          <TimelineHorizontal registros={regs} />
        </div>
      )}
    </div>
  );
}

/* ─── Componente principal — agrupa por dia ─── */
function RegistrosPorDia({ registros }: { registros: Registro[] }) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  if (registros.length === 0) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          padding: 48,
          textAlign: "center",
          color: "var(--ink-400)",
          fontSize: 13
        }}
      >
        Nenhum registro encontrado para o período selecionado.
      </div>
    );
  }

  /* Agrupar por data YYYY-MM-DD, ordenar decrescente */
  const porDia = new Map<string, Registro[]>();
  for (const r of registros) {
    const key = new Date(r.dataHora).toISOString().slice(0, 10);
    if (!porDia.has(key)) porDia.set(key, []);
    porDia.get(key)!.push(r);
  }
  const dias = Array.from(porDia.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, regs]) => ({
      data,
      regs: regs.sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())
    }));

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        overflow: "hidden"
      }}
    >
      {dias.map(({ data, regs }) => (
        <DiaRow
          key={data}
          data={data}
          registros={regs}
          aberto={diaAberto === data}
          onToggle={() => setDiaAberto((d) => (d === data ? null : data))}
        />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ABA REGISTROS GLOBAL
═══════════════════════════════════════════════ */

function TabRegistros({ token }: { token: string }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(hoje.toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(hoje.toISOString().slice(0, 10));
  const [tipo, setTipo] = useState("");
  const [origem, setOrigem] = useState("");
  const [ajustado, setAjustado] = useState("");

  const limit = 50;

  const carregar = useCallback(
    async (p = 1) => {
      setLoading(true);
      setErro(null);
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(limit) });
        if (dataInicio) params.set("dataInicio", dataInicio);
        if (dataFim) params.set("dataFim", dataFim);
        if (tipo) params.set("tipo", tipo);
        if (origem) params.set("origem", origem);
        if (ajustado !== "") params.set("ajustado", ajustado);

        const data = await api.get<{ total: number; registros: Registro[] }>(
          `/auditoria/registros?${params}`,
          token
        );
        setRegistros(data?.registros ?? []);
        setTotal(data?.total ?? 0);
        setPage(p);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token, dataInicio, dataFim, tipo, origem, ajustado]
  );

  useEffect(() => {
    carregar(1);
  }, [carregar]);

  function exportar() {
    exportCSV(
      registros.map((r) => ({
        Data: fmtDateTime(r.dataHora),
        Funcionario: r.funcionario.user.name,
        Matricula: r.funcionario.matricula,
        Gerencia: r.funcionario.gerencia?.nome ?? "",
        Tipo: tipoPontoLabel(r.tipo),
        Origem: r.origem,
        Modo: r.modoRegistro,
        IP: r.ipOrigem ?? "",
        DentroPerimetro: r.dentroPerimetro ? "Sim" : "Não",
        Ajustado: r.ajustado ? "Sim" : "Não",
        Observacao: r.observacao ?? ""
      })),
      `registros_${dataInicio}_${dataFim}.csv`
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filtros */}
      <FiltrosBox>
        <InputField label="Data início" type="date" value={dataInicio} onChange={setDataInicio} />
        <InputField label="Data fim" type="date" value={dataFim} onChange={setDataFim} />
        <SelectField
          label="Tipo"
          value={tipo}
          onChange={setTipo}
          options={[
            { value: "", label: "Todos" },
            { value: "ENTRADA", label: "Entrada" },
            { value: "INICIO_INTERVALO", label: "Início Intervalo" },
            { value: "FIM_INTERVALO", label: "Fim Intervalo" },
            { value: "SAIDA", label: "Saída" },
            { value: "INTERROMPER_EXPEDIENTE", label: "Interromper Expediente" },
            { value: "REINICIAR_EXPEDIENTE", label: "Reiniciar Expediente" }
          ]}
        />
        <SelectField
          label="Origem"
          value={origem}
          onChange={setOrigem}
          options={[
            { value: "", label: "Todas" },
            { value: "WEB", label: "Web" },
            { value: "MOBILE", label: "Mobile" },
            { value: "DESKTOP", label: "Desktop" },
            { value: "TOTEM", label: "Totem" }
          ]}
        />
        <SelectField
          label="Ajustado"
          value={ajustado}
          onChange={setAjustado}
          options={[
            { value: "", label: "Todos" },
            { value: "true", label: "Sim" },
            { value: "false", label: "Não" }
          ]}
        />
        <BtnBuscar onClick={() => carregar(1)} />
        <BtnCSV onClick={exportar} />
      </FiltrosBox>

      {erro && <ErroBox msg={erro} />}

      <CardTabela>
        <TabelaRegistros registros={loading ? [] : registros} showFuncionario loading={loading} />
        <Pagination page={page} total={total} limit={limit} onChange={(p) => carregar(p)} />
      </CardTabela>
    </div>
  );
}

/* ─── Tabela de registros reutilizável ─── */
function TabelaRegistros({
  registros,
  showFuncionario = false,
  loading = false
}: {
  registros: Registro[];
  showFuncionario?: boolean;
  loading?: boolean;
}) {
  if (loading) return <Loading />;
  if (!registros.length)
    return (
      <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
        Nenhum registro encontrado para o período.
      </p>
    );

  return (
    <div>
      {showFuncionario && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "130px 2fr 110px 80px 80px 80px 80px",
            padding: "10px 16px",
            background: "var(--cream-50)",
            borderBottom: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          {["Data/Hora", "Funcionário", "Tipo", "Origem", "Modo", "Perím.", "Ajust."].map((c) => (
            <span
              key={c}
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--ink-500)"
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {registros.map((r) => (
        <div
          key={r.id}
          style={{
            display: "grid",
            gridTemplateColumns: showFuncionario
              ? "130px 2fr 110px 80px 80px 80px 80px"
              : "130px 110px 80px 80px 80px 80px 1fr",
            padding: "10px 16px",
            borderBottom: "1px solid rgba(122,30,38,0.04)",
            alignItems: "center",
            gap: 4
          }}
        >
          <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-700)" }}>
            {fmtDateTime(r.dataHora)}
          </span>
          {showFuncionario && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FuncAvatar
                name={r.funcionario.user.name}
                fotoUrl={r.funcionario.fotoPerfilUrl}
                size={28}
              />
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: "var(--ink-900)" }}>
                  {r.funcionario.user.name}
                </p>
                <p
                  style={{
                    fontSize: 10.5,
                    color: "var(--ink-400)",
                    margin: 0,
                    fontFamily: "var(--font-mono)"
                  }}
                >
                  {r.funcionario.matricula}
                  {r.funcionario.gerencia ? ` · ${r.funcionario.gerencia.nome}` : ""}
                </p>
              </div>
            </div>
          )}
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: tipoPontoCor(r.tipo),
              padding: "2px 0"
            }}
          >
            {tipoPontoLabel(r.tipo)}
          </span>
          <Badge
            label={r.origem}
            bg={
              r.origem === "WEB"
                ? "rgba(37,99,235,0.10)"
                : r.origem === "MOBILE"
                  ? "rgba(124,58,237,0.10)"
                  : "rgba(47,125,79,0.10)"
            }
            color={r.origem === "WEB" ? "#2563eb" : r.origem === "MOBILE" ? "#7c3aed" : "#2f7d4f"}
          />
          <span style={{ fontSize: 11, color: "var(--ink-600)" }}>{r.modoRegistro}</span>
          <span style={{ fontSize: 12 }}>{r.dentroPerimetro ? "✓" : "✗"}</span>
          {r.ajustado ? (
            <Badge label="Ajust." bg="rgba(198,127,0,0.12)" color="#c67f00" />
          ) : (
            <span style={{ fontSize: 11, color: "var(--ink-300)" }}>—</span>
          )}
          {!showFuncionario && (
            <span
              style={{
                fontSize: 11,
                color: "var(--ink-400)",
                fontFamily: "var(--font-mono)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {r.ipOrigem ?? ""}
              {r.observacao ? ` · ${r.observacao}` : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ABA SOLICITAÇÕES
═══════════════════════════════════════════════ */

function TabSolicitacoes({
  token,
  isPontoAdmin = false
}: {
  token: string;
  isPontoAdmin?: boolean;
}) {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [modalAdminSol, setModalAdminSol] = useState<Solicitacao | null>(null);
  const [modalAdminDecisao, setModalAdminDecisao] = useState<"APROVAR" | "REJEITAR">("APROVAR");
  const [adminObs, setAdminObs] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminErro, setAdminErro] = useState("");
  const [feedback, setFeedback] = useState("");

  const limit = 30;

  const carregar = useCallback(
    async (p = 1) => {
      setLoading(true);
      setErro(null);
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(limit) });
        if (statusFiltro) params.set("status", statusFiltro);
        if (tipoFiltro) params.set("tipo", tipoFiltro);
        const data = await api.get<{ total: number; solicitacoes: Solicitacao[] }>(
          `/auditoria/solicitacoes?${params}`,
          token
        );
        setSolicitacoes(data?.solicitacoes ?? []);
        setTotal(data?.total ?? 0);
        setPage(p);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token, statusFiltro, tipoFiltro]
  );

  useEffect(() => {
    carregar(1);
  }, [carregar]);

  async function confirmarAdmin() {
    if (!modalAdminSol) return;
    if (modalAdminDecisao === "REJEITAR" && !adminObs.trim()) {
      setAdminErro("O motivo da rejeição é obrigatório.");
      return;
    }
    setAdminLoading(true);
    setAdminErro("");
    try {
      await api.patch(
        `/auditoria/admin/correcoes-rh/${modalAdminSol.id}`,
        { decisao: modalAdminDecisao, observacao: adminObs },
        token
      );
      setModalAdminSol(null);
      setFeedback(
        modalAdminDecisao === "APROVAR"
          ? "Correção aprovada e aplicada no histórico."
          : "Correção rejeitada."
      );
      await carregar(page);
    } catch (e) {
      setAdminErro((e as Error).message || "Erro ao processar decisão.");
    } finally {
      setAdminLoading(false);
    }
  }

  function exportar() {
    exportCSV(
      solicitacoes.map((s) => ({
        Funcionario: s.funcionario.user.name,
        Matricula: s.funcionario.matricula,
        Tipo: s.tipo,
        DataReferencia: fmtDate(s.dataReferencia),
        Descricao: s.descricao,
        Status: s.status,
        ObservacaoGestor: s.observacaoGestor ?? "",
        ResolvidoPor: s.resolvidoPor ?? "",
        ResolvidoEm: s.resolvidoEm ? fmtDate(s.resolvidoEm) : "",
        CriadoEm: fmtDate(s.createdAt)
      })),
      `solicitacoes_${statusFiltro || "todas"}${tipoFiltro ? `_${tipoFiltro}` : ""}.csv`.replace(
        /,/g,
        "-"
      )
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Modal aprovação Gerente de RH */}
      {modalAdminSol && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
          onClick={(e) => e.target === e.currentTarget && !adminLoading && setModalAdminSol(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "var(--radius-xl)",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                background:
                  modalAdminDecisao === "APROVAR" ? "rgba(47,125,79,0.06)" : "rgba(200,57,63,0.06)",
                borderBottom: "1px solid rgba(122,30,38,0.10)",
                padding: "18px 22px"
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: modalAdminDecisao === "APROVAR" ? "#2f7d4f" : "#c8393f",
                  fontFamily: "var(--font-display)"
                }}
              >
                {modalAdminDecisao === "APROVAR"
                  ? "✅ Aprovar Correção de Ponto"
                  : "❌ Rejeitar Correção de Ponto"}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
                {modalAdminSol.funcionario.user.name} · {fmtDate(modalAdminSol.dataReferencia)}
              </p>
            </div>
            <div
              style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}
            >
              {modalAdminDecisao === "APROVAR" && (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-700)", lineHeight: 1.6 }}>
                  Os registros de ponto do dia serão alterados conforme solicitado pelo RH e
                  marcados como <strong>modificados pelo RH</strong>. Confirma?
                </p>
              )}
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink-700)",
                    display: "block",
                    marginBottom: 4
                  }}
                >
                  {modalAdminDecisao === "REJEITAR" ? (
                    <>
                      Motivo da rejeição <span style={{ color: "var(--red)" }}>*</span>
                    </>
                  ) : (
                    "Observação (opcional)"
                  )}
                </label>
                <textarea
                  value={adminObs}
                  onChange={(e) => setAdminObs(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid rgba(122,30,38,0.14)",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                    resize: "vertical",
                    boxSizing: "border-box"
                  }}
                />
              </div>
              {adminErro && (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠️ {adminErro}</p>
              )}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setModalAdminSol(null)}
                  disabled={adminLoading}
                  style={{
                    padding: "9px 18px",
                    border: "1px solid rgba(0,0,0,0.15)",
                    borderRadius: "var(--radius-md)",
                    background: "#fff",
                    cursor: adminLoading ? "not-allowed" : "pointer",
                    fontSize: 13
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarAdmin}
                  disabled={adminLoading}
                  style={{
                    padding: "9px 22px",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    background: adminLoading
                      ? "#9ca3af"
                      : modalAdminDecisao === "APROVAR"
                        ? "#2f7d4f"
                        : "#c8393f",
                    color: "#fff",
                    cursor: adminLoading ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 700
                  }}
                >
                  {adminLoading
                    ? "Processando…"
                    : modalAdminDecisao === "APROVAR"
                      ? "Confirmar aprovação"
                      : "Confirmar rejeição"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          style={{
            background: feedback.startsWith("Correção aprovada") ? "#d1fae5" : "#fee2e2",
            border: `1px solid ${feedback.startsWith("Correção aprovada") ? "#6ee7b7" : "#fca5a5"}`,
            borderRadius: "var(--radius-md)",
            padding: "10px 16px",
            fontSize: 13,
            color: feedback.startsWith("Correção aprovada") ? "#065f46" : "#7a1e26",
            fontWeight: 500
          }}
        >
          {feedback}
        </div>
      )}

      <FiltrosBox>
        <SelectField
          label="Status"
          value={statusFiltro}
          onChange={setStatusFiltro}
          options={[
            { value: "", label: "Todos" },
            {
              value: "PENDENTE,AGUARDANDO_RH,AGUARDANDO_DOCUMENTO_FUNCIONARIO,AGUARDANDO_GESTOR_RH",
              label: "Em andamento"
            },
            { value: "PENDENTE", label: "Aguardando Gestor" },
            { value: "AGUARDANDO_RH", label: "Aguardando RH" },
            { value: "AGUARDANDO_DOCUMENTO_FUNCIONARIO", label: "Aguardando Doc. Funcionário" },
            { value: "AGUARDANDO_GESTOR_RH", label: "Aguardando Gerente de RH" },
            { value: "APROVADA", label: "Aprovadas pelo RH" },
            { value: "REJEITADA_GESTOR", label: "Rejeitadas pelo Gestor" },
            { value: "REJEITADA_RH", label: "Rejeitadas pelo RH" },
            { value: "REJEITADA", label: "Rejeitadas (legado)" },
            { value: "CANCELADA", label: "Canceladas" }
          ]}
        />
        <SelectField
          label="Tipo"
          value={tipoFiltro}
          onChange={setTipoFiltro}
          options={[
            { value: "", label: "Todos" },
            { value: "CORRECAO_PONTO", label: "Correção de Ponto" },
            { value: "ATESTADO", label: "Atestado" },
            { value: "FERIAS", label: "Férias" },
            { value: "LICENCA", label: "Licença" },
            { value: "ABONO", label: "Abono" },
            { value: "DAY_OFF", label: "Day Off de Aniversário" },
            { value: "HORA_EXTRA", label: "Hora Extra" },
            { value: "ENVIO_DOCUMENTO_RH", label: "Envio de Documento ao RH" }
          ]}
        />
        <BtnBuscar onClick={() => carregar(1)} />
        <BtnCSV onClick={exportar} />
      </FiltrosBox>

      {erro && <ErroBox msg={erro} />}

      <CardTabela>
        <TabelaSolicitacoes
          solicitacoes={loading ? [] : solicitacoes}
          loading={loading}
          isPontoAdmin={isPontoAdmin}
          onAprovarAdmin={(s) => {
            setModalAdminSol(s);
            setModalAdminDecisao("APROVAR");
            setAdminObs("");
            setAdminErro("");
            setFeedback("");
          }}
          onRejeitarAdmin={(s) => {
            setModalAdminSol(s);
            setModalAdminDecisao("REJEITAR");
            setAdminObs("");
            setAdminErro("");
            setFeedback("");
          }}
        />
        <Pagination page={page} total={total} limit={limit} onChange={(p) => carregar(p)} />
      </CardTabela>
    </div>
  );
}

/* ─── Tabela de solicitações (com ações de admin para AGUARDANDO_GESTOR_RH) ─── */
function TabelaSolicitacoes({
  solicitacoes,
  loading = false,
  isPontoAdmin = false,
  onAprovarAdmin,
  onRejeitarAdmin
}: {
  solicitacoes: Solicitacao[];
  loading?: boolean;
  isPontoAdmin?: boolean;
  onAprovarAdmin?: (s: Solicitacao) => void;
  onRejeitarAdmin?: (s: Solicitacao) => void;
}) {
  if (loading) return <Loading />;
  if (!solicitacoes.length)
    return (
      <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
        Nenhuma solicitação encontrada.
      </p>
    );

  return (
    <>
      {solicitacoes.map((s) => {
        const bd = statusSolBadge(s.status);
        const resumo = textoResumo(s);
        const isCorrecaoRH = s.status === "AGUARDANDO_GESTOR_RH";
        const meta = s.metadados as Record<string, unknown> | null;
        const correcoesDia = Array.isArray(meta?.correcoesDia)
          ? (meta!.correcoesDia as Array<{
              acao: string;
              tipoRegistro: string;
              horario: string;
              horarioOriginal?: string;
            }>)
          : null;

        return (
          <div
            key={s.id}
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(122,30,38,0.04)",
              borderLeft: isCorrecaoRH ? "3px solid #7a1e26" : "none",
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              flexWrap: "wrap"
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: s.funcionario.fotoPerfilUrl ? "transparent" : "var(--burgundy-600)",
                border: s.funcionario.fotoPerfilUrl ? "2px solid var(--burgundy-600)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
                overflow: "hidden"
              }}
            >
              {s.funcionario.fotoPerfilUrl ? (
                <img
                  src={s.funcionario.fotoPerfilUrl}
                  alt={s.funcionario.user.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                s.funcionario.user.name[0].toUpperCase()
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
                {s.funcionario.user.name}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-400)",
                  margin: "2px 0 4px",
                  fontFamily: "var(--font-mono)"
                }}
              >
                {s.funcionario.matricula}
                {s.funcionario.gerencia ? ` · ${s.funcionario.gerencia.nome}` : ""}
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge
                  label={
                    s.tipo === "ENVIO_DOCUMENTO_RH"
                      ? "Envio de Documento ao RH"
                      : s.tipo.replace(/_/g, " ")
                  }
                  bg="rgba(122,30,38,0.06)"
                  color="var(--burgundy-700)"
                />
                <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                  Ref: {fmtDate(s.dataReferencia)}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
                  Enviada: {fmtDate(s.createdAt)}
                </span>
              </div>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-700)",
                  margin: "6px 0 0",
                  lineHeight: 1.5,
                  fontWeight: 500
                }}
              >
                {resumo}
              </p>
              {s.tipo === "FERIAS" && <FeriasDetalheBlock meta={s.metadados} />}
              {(s.tipo === "ATESTADO" || s.tipo === "ENVIO_DOCUMENTO_RH") &&
                typeof meta?.documentoUrl === "string" && (
                  <LinkDocumentoAnexado
                    href={meta.documentoUrl as string}
                    nomeArquivo={
                      typeof meta.nomeArquivo === "string"
                        ? meta.nomeArquivo
                        : s.tipo === "ATESTADO"
                          ? "Atestado"
                          : null
                    }
                    variant="funcionario"
                  />
                )}
              {s.status === "AGUARDANDO_RH" && s.tipo !== "ENVIO_DOCUMENTO_RH" && (
                <LogTimelineGestor s={s} />
              )}

              {/* Detalhes da correção criada pelo RH */}
              {isCorrecaoRH && correcoesDia && correcoesDia.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 12px",
                    background: "rgba(122,30,38,0.04)",
                    border: "1px solid rgba(122,30,38,0.12)",
                    borderRadius: "var(--radius-md)"
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--ink-400)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em"
                    }}
                  >
                    Correções propostas pelo RH{" "}
                    {meta?.criadoPorNome ? `(${meta.criadoPorNome as string})` : ""}
                  </p>
                  {correcoesDia.map((c, i) => (
                    <p key={i} style={{ margin: "0 0 2px", fontSize: 12, color: "var(--ink-700)" }}>
                      {c.acao === "CORRIGIR" ? "✏️" : c.acao === "INCLUIR" ? "➕" : "🗑️"}{" "}
                      <strong>{c.tipoRegistro.replace(/_/g, " ")}</strong>
                      {c.acao === "CORRIGIR" && c.horarioOriginal
                        ? `: ${c.horarioOriginal} → ${c.horario}`
                        : c.acao === "INCLUIR"
                          ? `: ${c.horario}`
                          : " (excluir)"}
                    </p>
                  ))}
                </div>
              )}

              {s.descricao && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--ink-600)",
                    margin: "6px 0 0",
                    fontStyle: "italic",
                    lineHeight: 1.5
                  }}
                >
                  "{s.descricao}"
                </p>
              )}
              {s.rhObservacao && (
                <p
                  style={{
                    fontSize: 11.5,
                    color: "#065f46",
                    margin: "4px 0 0",
                    fontStyle: "italic"
                  }}
                >
                  RH: {s.rhObservacao}
                </p>
              )}
              {s.observacaoGestor && !s.gestorObservacao && (
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-500)",
                    margin: "4px 0 0",
                    fontStyle: "italic"
                  }}
                >
                  Obs: {s.observacaoGestor}
                </p>
              )}
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}
            >
              <Badge label={bd.label} bg={bd.bg} color={bd.color} />
              {s.resolvidoEm && (
                <span style={{ fontSize: 10.5, color: "var(--ink-400)" }}>
                  {fmtDate(s.resolvidoEm)}
                </span>
              )}
              {isCorrecaoRH && isPontoAdmin && onAprovarAdmin && onRejeitarAdmin && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button
                    onClick={() => onAprovarAdmin(s)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "5px 12px",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      background: "#2f7d4f",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 11.5,
                      fontWeight: 600
                    }}
                  >
                    <CheckCircleIcon size={12} /> Aprovar
                  </button>
                  <button
                    onClick={() => onRejeitarAdmin(s)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "5px 12px",
                      border: "none",
                      borderRadius: "var(--radius-md)",
                      background: "#c8393f",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 11.5,
                      fontWeight: 600
                    }}
                  >
                    Rejeitar
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════
   ABA AFASTAMENTOS
═══════════════════════════════════════════════ */

function TabAfastamentos({ token }: { token: string }) {
  const [afastamentos, setAfastamentos] = useState<Afastamento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("");
  const [ativo, setAtivo] = useState("");

  const limit = 30;

  const carregar = useCallback(
    async (p = 1) => {
      setLoading(true);
      setErro(null);
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(limit) });
        if (tipo) params.set("tipo", tipo);
        if (ativo === "true") params.set("ativo", "true");
        const data = await api.get<{ total: number; afastamentos: Afastamento[] }>(
          `/auditoria/afastamentos?${params}`,
          token
        );
        setAfastamentos(data?.afastamentos ?? []);
        setTotal(data?.total ?? 0);
        setPage(p);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token, tipo, ativo]
  );

  useEffect(() => {
    carregar(1);
  }, [carregar]);

  function exportar() {
    exportCSV(
      afastamentos.map((a) => ({
        Funcionario: a.funcionario.user.name,
        Matricula: a.funcionario.matricula,
        Tipo: tipoAfastamentoLabel(a.tipo),
        Inicio: fmtDate(a.dataInicio),
        Fim: fmtDate(a.dataFim),
        Justificativa: a.justificativa ?? "",
        AprovadoPor: a.aprovadoPor ?? ""
      })),
      `afastamentos.csv`
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FiltrosBox>
        <SelectField
          label="Tipo"
          value={tipo}
          onChange={setTipo}
          options={[
            { value: "", label: "Todos" },
            { value: "FERIAS", label: "Férias" },
            { value: "LICENCA_MEDICA", label: "Licença Médica" },
            { value: "ATESTADO", label: "Atestado" },
            { value: "LICENCA_MATERNIDADE", label: "Lic. Maternidade" },
            { value: "LICENCA_PATERNIDADE", label: "Lic. Paternidade" },
            { value: "FALTA_JUSTIFICADA", label: "Falta Justificada" },
            { value: "FALTA_INJUSTIFICADA", label: "Falta Injustificada" },
            { value: "ABONO", label: "Abono" }
          ]}
        />
        <SelectField
          label="Apenas ativos"
          value={ativo}
          onChange={setAtivo}
          options={[
            { value: "", label: "Todos" },
            { value: "true", label: "Ativos hoje" }
          ]}
        />
        <BtnBuscar onClick={() => carregar(1)} />
        <BtnCSV onClick={exportar} />
      </FiltrosBox>

      {erro && <ErroBox msg={erro} />}

      <CardTabela>
        <TabelaAfastamentos afastamentos={loading ? [] : afastamentos} loading={loading} />
        <Pagination page={page} total={total} limit={limit} onChange={(p) => carregar(p)} />
      </CardTabela>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ABA HISTÓRICO DO FUNCIONÁRIO — tipos e helpers
═══════════════════════════════════════════════ */

type StatusDia =
  | "OK"
  | "FALTA"
  | "PENDENTE"
  | "AFASTAMENTO"
  | "FERIADO"
  | "FUTURO"
  | "FOLGA"
  | "ISENTO";

interface JornadaHistorico {
  anteriorMin: number;
  atualMin: number;
  horaEntrada?: string;
  horaSaida?: string;
  almocoMinMin?: number;
  almocoPodeIniciarA?: string;
  almocoPodeIniciarAte?: string;
  toleranciaCalculoMin?: number;
  horaExtraLimiteAuto?: number;
  vigenciaDesde: string | null;
}

const JORNADA_PADRAO_AUD: JornadaHistorico = {
  anteriorMin: 480,
  atualMin: 480,
  vigenciaDesde: null,
  horaEntrada: "08:00",
  horaSaida: "17:00",
  almocoMinMin: 60,
  almocoPodeIniciarA: "11:30",
  almocoPodeIniciarAte: "13:00",
  toleranciaCalculoMin: 5,
  horaExtraLimiteAuto: 120
};

function jornadaMinDia(isoKey: string, jornada: JornadaHistorico): number {
  if (jornada.vigenciaDesde && isoKey >= jornada.vigenciaDesde) return jornada.atualMin;
  return jornada.anteriorMin;
}

interface DiaHist {
  data: string;
  diaSemana: string;
  entrada: string | null;
  inicioIntervalo: string | null;
  fimIntervalo: string | null;
  saida: string | null;
  pausas?: { inicio: string; fim: string | null }[];
  horasMin: number;
  jornadaMin: number;
  status: StatusDia;
  obs?: string;
  observacoes?: {
    data: string;
    texto: string;
    tipo?: string;
    turno?: string;
    motivo?: string;
    janelaAlmoco?: string;
  }[];
  entradaEditada?: boolean;
  inicioIntervaloEditado?: boolean;
  fimIntervaloEditado?: boolean;
  saidaEditada?: boolean;
  semIntervalo?: boolean;
  turno?: string;
  motivoSemIntervalo?: string;
  janelaAlmoco?: string;
  atestadoParcial?: boolean;
  atestadoParcialHorario?: string;
  saidaNaoAplicavel?: boolean;
  almocoCurto?: {
    inicio: string;
    fimRegistrado: string;
    fimReferencia: string;
    minimoMin: number;
  };
}

interface ApiRegHist {
  id: string;
  tipo: string;
  dataHora: string;
  ajustado?: boolean;
  observacoes?: {
    data: string;
    texto: string;
    tipo?: string;
    turno?: string;
    motivo?: string;
    janelaAlmoco?: string;
  }[];
}
interface ApiAfast {
  tipo: string;
  dataInicio: string;
  dataFim: string;
  horarioInicio?: string | null;
  horarioFim?: string | null;
}
interface ApiFeriadoH {
  data: string;
  nome: string;
  marcoHorario?: string | null;
  marcoLado?: string | null;
}

const TIPO_AFAST_LABEL: Record<string, string> = {
  FERIAS: "Férias",
  ATESTADO: "Atestado médico",
  LICENCA_MEDICA: "Licença",
  LICENCA_MATERNIDADE: "Lic. maternidade",
  LICENCA_PATERNIDADE: "Lic. paternidade",
  FALTA_JUSTIFICADA: "Falta justificada",
  ABONO: "Abono"
};

function labelParcialAfast(tipo: string | undefined, hi: string, hf: string): string {
  const nome =
    tipo === "ABONO"
      ? "Abono parcial"
      : tipo === "ATESTADO"
        ? "Atestado médico parcial"
        : "Afastamento parcial";
  return `${nome} (${hi}–${hf})`;
}

function badgeLabelParcialH(obs?: string): string {
  if (obs?.startsWith("Abono parcial")) return "Abono parcial";
  if (obs?.startsWith("Afastamento parcial")) return "Afastamento parcial";
  return "Atestado médico parcial";
}

function toMinH(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}
function fmtHoraH(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}
function dtKeyH(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}
function calcHorasH(
  regs: ApiRegHist[],
  agoraMin?: number,
  opts?: {
    exigirIntervalo?: boolean;
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
    almocoPodeIniciarAte?: string;
  }
): number {
  const entrada = regs.find((r) => r.tipo === "ENTRADA");
  const obsSemIntervalo = (
    entrada as { observacoes?: Array<{ tipo?: string }> } | undefined
  )?.observacoes?.some((o) => o.tipo === "TURNO_SEM_INTERVALO");
  return calcHorasTrabalhadasMinutos(
    regs.map((r) => ({ tipo: r.tipo, minuto: toMinH(fmtHoraH(r.dataHora)) })),
    {
      agoraMin,
      exigirIntervalo: opts?.exigirIntervalo !== false && !obsSemIntervalo,
      almocoMinMin: opts?.almocoMinMin ?? 60,
      almocoPodeIniciarA: opts?.almocoPodeIniciarA ?? "11:30",
      almocoPodeIniciarAte: opts?.almocoPodeIniciarAte ?? "13:00"
    }
  );
}
function normalizarRegsSemAlmocoH<T extends { tipo: string }>(regs: T[]): T[] {
  const temSaida = regs.some((r) => r.tipo === "SAIDA");
  if (temSaida) {
    return regs.filter((r) => r.tipo !== "INICIO_INTERVALO" && r.tipo !== "FIM_INTERVALO");
  }
  const temInicio = regs.some((r) => r.tipo === "INICIO_INTERVALO");
  const temFim = regs.some((r) => r.tipo === "FIM_INTERVALO");
  if (temInicio && !temFim) {
    return regs
      .map((r) => (r.tipo === "INICIO_INTERVALO" ? { ...r, tipo: "SAIDA" } : r))
      .filter((r) => r.tipo !== "FIM_INTERVALO");
  }
  return regs.filter((r) => r.tipo !== "INICIO_INTERVALO" && r.tipo !== "FIM_INTERVALO");
}
function atestadoEhMatutinoH(horarioFim: string, jornada: JornadaHistorico): boolean {
  const inicioAlmoco = toMinH(jornada.almocoPodeIniciarA ?? "12:00");
  const duracao = Math.max(0, jornada.almocoMinMin ?? 60);
  return toMinH(horarioFim) <= inicioAlmoco + duracao;
}
function aplicarMargemH(saldo: number, tolerancia?: number | null): number {
  const margem = Math.max(0, Number(tolerancia) || 0);
  if (margem > 0 && Math.abs(saldo) <= margem) return 0;
  return saldo;
}
function saldoAtestadoExpedienteH(opts: {
  hi: string;
  hf: string;
  horaEntrada: string;
  horaSaida: string;
  fimTrabalhoMin: number | null;
  jornada: JornadaHistorico;
}): number {
  const marco = marcoAtestadoH(opts.hi, opts.hf, opts.horaEntrada, opts.horaSaida, opts.jornada);
  if (opts.fimTrabalhoMin == null) return 0;
  let delta = opts.fimTrabalhoMin - marco;
  const limiteHe = Math.max(0, opts.jornada.horaExtraLimiteAuto ?? 120);
  if (delta > 0) delta = Math.min(delta, limiteHe);
  return aplicarMargemH(delta, opts.jornada.toleranciaCalculoMin ?? 5);
}
function marcoAtestadoH(
  hi: string,
  hf: string,
  horaEntrada: string,
  horaSaida: string,
  jornada: JornadaHistorico
): number {
  const matutino = atestadoEhMatutinoH(hf, jornada);
  const entr = toMinH(horaEntrada);
  const sai = toMinH(horaSaida);
  const almoco = Math.max(0, jornada.almocoMinMin ?? 60);
  const noon = 12 * 60;
  const pref = toMinH(jornada.almocoPodeIniciarA ?? "12:00");
  let lunchStart: number;
  if (noon >= entr && noon + almoco <= sai) lunchStart = noon;
  else if (pref >= entr && pref + almoco <= sai) lunchStart = pref;
  else lunchStart = Math.max(entr, Math.min(pref, sai - almoco));
  return matutino ? toMinH(horaSaida) : Math.min(toMinH(hi), lunchStart);
}
function prepararRegsAtestadoH(opts: {
  registros: Array<{ tipo: string; minuto: number }>;
  hi: string;
  hf: string;
  horaEntrada: string;
  horaSaida: string;
  jornada: JornadaHistorico;
  fecharVespertinoNoMarco?: boolean;
}): {
  registros: Array<{ tipo: string; minuto: number }>;
  fimTrabalhoMin: number | null;
  semAlmoco: boolean;
} {
  const hiM = toMinH(opts.hi);
  const hfM = toMinH(opts.hf);
  const fora =
    hfM > hiM ? opts.registros.filter((r) => r.minuto < hiM || r.minuto > hfM) : opts.registros;
  const matutino = atestadoEhMatutinoH(opts.hf, opts.jornada);
  const semAlmoco = matutino || !fora.some((r) => r.tipo === "INICIO_INTERVALO");
  let registros = semAlmoco ? normalizarRegsSemAlmocoH(fora) : fora;
  const marco = marcoAtestadoH(opts.hi, opts.hf, opts.horaEntrada, opts.horaSaida, opts.jornada);
  let fimTrabalhoMin = fimTrabalhoMinH(registros);
  if (
    opts.fecharVespertinoNoMarco &&
    !matutino &&
    fimTrabalhoMin == null &&
    registros.some((r) => r.tipo === "ENTRADA")
  ) {
    registros = [...registros, { tipo: "SAIDA", minuto: marco }];
    fimTrabalhoMin = marco;
  }
  return { registros, fimTrabalhoMin, semAlmoco };
}
function fimTrabalhoMinH(regs: Array<{ tipo: string; minuto: number }>): number | null {
  const saida = [...regs].reverse().find((r) => r.tipo === "SAIDA");
  if (saida) return saida.minuto;
  if (!regs.some((r) => r.tipo === "FIM_INTERVALO")) {
    const ini = [...regs].reverse().find((r) => r.tipo === "INICIO_INTERVALO");
    if (ini) return ini.minuto;
  }
  const fim = [...regs].reverse().find((r) => r.tipo === "FIM_INTERVALO");
  return fim ? fim.minuto : null;
}
function afastDoDia(key: string, lista: ApiAfast[]) {
  return lista.find((a) => key >= dtKeyH(a.dataInicio) && key <= dtKeyH(a.dataFim));
}
function isAfastParcial(a: { horarioInicio?: string | null; horarioFim?: string | null }) {
  return !!(a.horarioInicio && a.horarioFim);
}
function atestadoDispensaSaida(
  horarioInicio: string,
  horarioFim: string,
  jornadaOrAte: string | JornadaHistorico = "13:00"
): boolean {
  void horarioInicio;
  if (typeof jornadaOrAte === "object" && jornadaOrAte) {
    return !atestadoEhMatutinoH(horarioFim, jornadaOrAte);
  }
  if (toMinH(horarioFim) <= toMinH(jornadaOrAte)) return false;
  return true;
}
function calcJornadaAtestadoParcial(
  horarioInicio: string,
  horarioFim: string,
  jornadaDiariaMin: number,
  horaEntrada: string,
  horaSaida: string,
  opts?: {
    almocoMinMin?: number;
    almocoPodeIniciarA?: string;
    almocoPodeIniciarAte?: string;
  }
): number {
  const entr = toMinH(horaEntrada);
  const sai = toMinH(horaSaida);
  const hi = toMinH(horarioInicio);
  const hf = toMinH(horarioFim);
  if (sai <= entr || hf <= hi) return Math.max(0, jornadaDiariaMin);

  const almoco = Math.max(0, opts?.almocoMinMin ?? 60);
  const noon = 12 * 60;
  const pref = toMinH(opts?.almocoPodeIniciarA ?? "11:30");
  let lunchStart: number;
  if (noon >= entr && noon + almoco <= sai) lunchStart = noon;
  else if (pref >= entr && pref + almoco <= sai) lunchStart = pref;
  else lunchStart = Math.max(entr, Math.min(pref, sai - almoco));
  const lunchEnd = lunchStart + almoco;

  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

  const cobertos = overlap(hi, hf, entr, lunchStart) + overlap(hi, hf, lunchEnd, sai);
  return Math.max(0, jornadaDiariaMin - cobertos);
}
function textoObsLeg(t: string) {
  return t.replace(/\s*\(#[a-z0-9]+\)/gi, "").replace(/\s*#[a-z0-9]+\.?/gi, ".");
}
function fmtObsDt(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function buildHistorico(
  regs: ApiRegHist[],
  afasts: ApiAfast[],
  mes: number,
  ano: number,
  feriados: ApiFeriadoH[] = [],
  sabadoPct = 100,
  domingoPct = 200,
  feriadoPct = 200,
  jornada: JornadaHistorico = JORNADA_PADRAO_AUD,
  periodosSemObrigacao: Array<{ inicio: string; fim: string | null }> = [],
  exigirIntervalo = true
): DiaHist[] {
  const hoje = new Date();
  const dias = new Date(ano, mes, 0).getDate();
  const NOMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const byDay: Record<string, ApiRegHist[]> = {};
  for (const r of regs) {
    const k = dtKeyH(r.dataHora);
    (byDay[k] ??= []).push(r);
  }
  const feriadoMap: Record<string, ApiFeriadoH> = {};
  for (const f of feriados) {
    feriadoMap[dtKeyH(f.data)] = f;
  }

  const diaIsento = (isoKey: string) =>
    periodosSemObrigacao.some((p) => isoKey >= p.inicio && (p.fim == null || isoKey <= p.fim));

  function calcJornadaParcial(
    marco: string,
    lado: string | null | undefined,
    jornadaDiariaMin: number,
    entrada: string,
    saida: string
  ): number {
    const toMin = (h: string) => {
      const [hh, mm] = h.split(":").map(Number);
      return hh * 60 + mm;
    };
    const e = toMin(entrada);
    const s = toMin(saida);
    const m = toMin(marco);
    const total = s - e;
    if (total <= 0) return 0;
    const prop = lado === "ANTES" ? (s - m) / total : (m - e) / total;
    return Math.round(jornadaDiariaMin * Math.max(0, Math.min(1, prop)));
  }

  const result: DiaHist[] = [];
  for (let d = 1; d <= dias; d++) {
    const dt = new Date(ano, mes - 1, d);
    const dow = dt.getDay();
    const fimDeSemana = dow === 0 || dow === 6;
    const isFuture = dt > hoje;
    const isoKey = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dataStr = `${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
    const feriadoDia = feriadoMap[isoKey];
    const nomeFeriado = feriadoDia?.nome;
    if (isFuture) {
      result.push({
        data: dataStr,
        diaSemana: NOMES[dow],
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: jornadaMinDia(isoKey, jornada),
        status: "FUTURO"
      });
      continue;
    }

    if (diaIsento(isoKey)) {
      const dayRegsIsento = byDay[isoKey] ?? [];
      const getI = (tipo: string) => dayRegsIsento.find((r) => r.tipo === tipo);
      result.push({
        data: dataStr,
        diaSemana: NOMES[dow],
        entrada: getI("ENTRADA") ? fmtHoraH(getI("ENTRADA")!.dataHora) : null,
        inicioIntervalo: getI("INICIO_INTERVALO")
          ? fmtHoraH(getI("INICIO_INTERVALO")!.dataHora)
          : null,
        fimIntervalo: getI("FIM_INTERVALO") ? fmtHoraH(getI("FIM_INTERVALO")!.dataHora) : null,
        saida: getI("SAIDA") ? fmtHoraH(getI("SAIDA")!.dataHora) : null,
        horasMin: 0,
        jornadaMin: 0,
        status: "ISENTO",
        obs: "Isento — Assessor/Gerente",
        observacoes: dayRegsIsento.flatMap((r) => r.observacoes ?? [])
      });
      continue;
    }

    const af = afastDoDia(isoKey, afasts);
    if (af && !isAfastParcial(af)) {
      result.push({
        data: dataStr,
        diaSemana: NOMES[dow],
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: 0,
        status: "AFASTAMENTO",
        obs: TIPO_AFAST_LABEL[af.tipo] ?? "Afastamento justificado"
      });
      continue;
    }
    const atestadoParcial = af && isAfastParcial(af) ? af : null;
    const dayRegs = byDay[isoKey] ?? [];
    // Fim de semana sem registros: Sem Expediente (aparece na view do RH sempre)
    if (fimDeSemana && dayRegs.length === 0) {
      result.push({
        data: dataStr,
        diaSemana: NOMES[dow],
        entrada: null,
        inicioIntervalo: null,
        fimIntervalo: null,
        saida: null,
        horasMin: 0,
        jornadaMin: 0,
        status: "FOLGA",
        obs: nomeFeriado ? `Sem Expediente — Feriado: ${nomeFeriado}` : "Sem Expediente"
      });
      continue;
    }
    if (!fimDeSemana && dayRegs.length === 0) {
      if (feriadoDia) {
        const jornadaBase = jornadaMinDia(isoKey, jornada);
        const jornadaMandatoria = feriadoDia.marcoHorario
          ? calcJornadaParcial(
              feriadoDia.marcoHorario,
              feriadoDia.marcoLado,
              jornadaBase,
              jornada.horaEntrada ?? "08:00",
              jornada.horaSaida ?? "17:00"
            )
          : 0;
        result.push({
          data: dataStr,
          diaSemana: NOMES[dow],
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          horasMin: 0,
          jornadaMin: jornadaMandatoria,
          status: jornadaMandatoria > 0 ? "FALTA" : "AFASTAMENTO",
          obs: feriadoDia.marcoHorario
            ? `${feriadoDia.nome} (${feriadoDia.marcoLado === "ANTES" ? "até" : "após"} ${feriadoDia.marcoHorario})`
            : `Feriado: ${feriadoDia.nome}`
        });
      } else if (atestadoParcial) {
        const jornadaMandatoria = calcJornadaAtestadoParcial(
          atestadoParcial.horarioInicio!,
          atestadoParcial.horarioFim!,
          jornadaMinDia(isoKey, jornada),
          jornada.horaEntrada ?? "08:00",
          jornada.horaSaida ?? "17:00",
          {
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
          }
        );
        result.push({
          data: dataStr,
          diaSemana: NOMES[dow],
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          horasMin: 0,
          jornadaMin: jornadaMandatoria,
          status: jornadaMandatoria > 0 ? "FALTA" : "AFASTAMENTO",
          obs: labelParcialAfast(
            atestadoParcial.tipo,
            atestadoParcial.horarioInicio!,
            atestadoParcial.horarioFim!
          ),
          atestadoParcial: true,
          atestadoParcialHorario: `${atestadoParcial.horarioInicio}–${atestadoParcial.horarioFim}`,
          semIntervalo: true,
          motivoSemIntervalo: "ATESTADO_PARCIAL",
          turno: "ATESTADO_PARCIAL",
          saidaNaoAplicavel: atestadoDispensaSaida(
            atestadoParcial.horarioInicio!,
            atestadoParcial.horarioFim!,
            jornada
          )
        });
      } else {
        result.push({
          data: dataStr,
          diaSemana: NOMES[dow],
          entrada: null,
          inicioIntervalo: null,
          fimIntervalo: null,
          saida: null,
          horasMin: 0,
          jornadaMin: jornadaMinDia(isoKey, jornada),
          status: "FALTA",
          obs: "Ausência não registrada"
        });
      }
      continue;
    }
    const get = (t: string) => dayRegs.find((r) => r.tipo === t);
    const eR = get("ENTRADA"),
      iiR = get("INICIO_INTERVALO"),
      fiR = get("FIM_INTERVALO"),
      sR = get("SAIDA");
    const atestadoMatutino =
      !!atestadoParcial && atestadoEhMatutinoH(atestadoParcial.horarioFim!, jornada);
    const prepAtestado = atestadoParcial
      ? prepararRegsAtestadoH({
          registros: dayRegs.map((r) => ({
            tipo: r.tipo,
            minuto: toMinH(fmtHoraH(r.dataHora))
          })),
          hi: atestadoParcial.horarioInicio!,
          hf: atestadoParcial.horarioFim!,
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          jornada,
          fecharVespertinoNoMarco: dt.toDateString() !== hoje.toDateString()
        })
      : null;
    const semAlmocoDia =
      atestadoMatutino ||
      !!(eR?.observacoes ?? []).some((o) => o.tipo === "TURNO_SEM_INTERVALO") ||
      (!!atestadoParcial &&
        !(prepAtestado
          ? prepAtestado.registros.some((r) => r.tipo === "INICIO_INTERVALO")
          : dayRegs.some((r) => r.tipo === "INICIO_INTERVALO"))) ||
      !!prepAtestado?.semAlmoco;
    const dayRegsHoras = semAlmocoDia
      ? normalizarRegsSemAlmocoH(
          atestadoParcial
            ? dayRegs.filter((r) => {
                const m = toMinH(fmtHoraH(r.dataHora));
                const hi = toMinH(atestadoParcial.horarioInicio!);
                const hf = toMinH(atestadoParcial.horarioFim!);
                return m < hi || m > hf;
              })
            : dayRegs
        )
      : atestadoParcial
        ? dayRegs.filter((r) => {
            const m = toMinH(fmtHoraH(r.dataHora));
            const hi = toMinH(atestadoParcial.horarioInicio!);
            const hf = toMinH(atestadoParcial.horarioFim!);
            return m < hi || m > hf;
          })
        : dayRegs;
    const eRh = dayRegs.find((r) => r.tipo === "ENTRADA");
    const iiDisplay = dayRegs.find((r) => r.tipo === "INICIO_INTERVALO");
    const fiDisplay = dayRegs.find((r) => r.tipo === "FIM_INTERVALO");
    const sDisplay = dayRegs.find((r) => r.tipo === "SAIDA");
    const entrada = eRh ? fmtHoraH(eRh.dataHora) : eR ? fmtHoraH(eR.dataHora) : null;
    const inicioIntervalo = iiDisplay ? fmtHoraH(iiDisplay.dataHora) : null;
    const fimIntervalo = fiDisplay ? fmtHoraH(fiDisplay.dataHora) : null;
    const saida = sDisplay ? fmtHoraH(sDisplay.dataHora) : null;
    const isHoje = dt.toDateString() === hoje.toDateString();
    let horasMin = 0,
      status: StatusDia,
      obs: string | undefined;
    /* Mesma regra de /ponto/historico (historicoTransform):
       — entrada+saída: soma completa
       — hoje sem saída: soma trechos fechados + aberto até agora
       — com intervalo e sem saída: só trechos fechados (retorno aberto ignorado)
       — só entrada em dia passado: 0h (falta) */
    const exigirIntervaloDia = exigirIntervalo && !semAlmocoDia;
    const calcOptsH = {
      exigirIntervalo: exigirIntervaloDia,
      almocoMinMin: jornada.almocoMinMin ?? 60,
      almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
      almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
    };
    const dispensaSaida =
      !!atestadoParcial &&
      atestadoDispensaSaida(atestadoParcial.horarioInicio!, atestadoParcial.horarioFim!, jornada);
    if (prepAtestado) {
      horasMin = calcHorasTrabalhadasMinutos(prepAtestado.registros, {
        exigirIntervalo: calcOptsH.exigirIntervalo,
        almocoMinMin: calcOptsH.almocoMinMin,
        almocoPodeIniciarA: calcOptsH.almocoPodeIniciarA,
        almocoPodeIniciarAte: calcOptsH.almocoPodeIniciarAte,
        agoraMin: isHoje ? hoje.getHours() * 60 + hoje.getMinutes() : undefined
      });
      if (!entrada) status = "PENDENTE";
      else if (dispensaSaida) status = isHoje ? "PENDENTE" : "OK";
      else if (saida) status = "OK";
      else if (isHoje) status = "PENDENTE";
      else status = "FALTA";
      if (!obs) {
        obs = labelParcialAfast(
          atestadoParcial!.tipo,
          atestadoParcial!.horarioInicio!,
          atestadoParcial!.horarioFim!
        );
      }
    } else if (entrada && saida) {
      horasMin = calcHorasH(dayRegsHoras, undefined, calcOptsH);
      status = "OK";
    } else if (entrada && isHoje) {
      horasMin = calcHorasH(dayRegsHoras, hoje.getHours() * 60 + hoje.getMinutes(), calcOptsH);
      status = "PENDENTE";
    } else if (entrada && inicioIntervalo) {
      horasMin = calcHorasH(dayRegsHoras, undefined, calcOptsH);
      status = "PENDENTE";
    } else if (entrada) {
      horasMin = 0;
      status = "FALTA";
      obs = "Apenas entrada registrada — dia considerado falta";
    } else {
      status = "PENDENTE";
    }
    horasMin = Math.max(0, horasMin);
    // Multiplicador para fins de semana e feriados
    let jornadaMin = jornadaMinDia(isoKey, jornada);
    if (atestadoParcial && prepAtestado && !fimDeSemana) {
      const jornadaRef = calcJornadaAtestadoParcial(
        atestadoParcial.horarioInicio!,
        atestadoParcial.horarioFim!,
        jornadaMin,
        jornada.horaEntrada ?? "08:00",
        jornada.horaSaida ?? "17:00",
        {
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
        }
      );
      if (status === "FALTA" && horasMin === 0) {
        jornadaMin = jornadaRef;
      } else {
        const saldoExp = saldoAtestadoExpedienteH({
          hi: atestadoParcial.horarioInicio!,
          hf: atestadoParcial.horarioFim!,
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          fimTrabalhoMin: prepAtestado.fimTrabalhoMin,
          jornada
        });
        jornadaMin = Math.max(0, horasMin - saldoExp);
      }
      if (!obs) {
        obs = labelParcialAfast(
          atestadoParcial.tipo,
          atestadoParcial.horarioInicio!,
          atestadoParcial.horarioFim!
        );
      }
    } else if (fimDeSemana || feriadoDia) {
      if (feriadoDia?.marcoHorario && !fimDeSemana) {
        jornadaMin = calcJornadaParcial(
          feriadoDia.marcoHorario,
          feriadoDia.marcoLado,
          jornadaMin,
          jornada.horaEntrada ?? "08:00",
          jornada.horaSaida ?? "17:00"
        );
        if (!obs)
          obs = `${feriadoDia.nome} (${feriadoDia.marcoLado === "ANTES" ? "até" : "após"} ${feriadoDia.marcoHorario})`;
      } else {
        const pct = feriadoDia ? feriadoPct : dow === 6 ? sabadoPct : domingoPct;
        jornadaMin = Math.round(horasMin * (1 - pct / 100));
        const tipo = feriadoDia ? `Feriado: ${feriadoDia.nome}` : dow === 6 ? "Sábado" : "Domingo";
        if (!obs) obs = `${tipo} — banco de horas: ${pct}%`;
      }
    }
    const pausas: { inicio: string; fim: string | null }[] = [];
    let aberta: string | null = null;
    for (const r of dayRegs) {
      if (r.tipo === "INTERROMPER_EXPEDIENTE") {
        aberta = fmtHoraH(r.dataHora);
      } else if (r.tipo === "REINICIAR_EXPEDIENTE") {
        pausas.push({ inicio: aberta ?? "—", fim: fmtHoraH(r.dataHora) });
        aberta = null;
      }
    }
    if (aberta) pausas.push({ inicio: aberta, fim: null });
    const observacoes = dayRegs.flatMap((r) => r.observacoes ?? []);
    const obsTurno = (eR?.observacoes ?? []).find((o) => o.tipo === "TURNO_SEM_INTERVALO");
    const bloquearIntervalo = !!atestadoParcial || !!obsTurno || semAlmocoDia;
    const almocoCurtoDetect = !bloquearIntervalo
      ? analisarAlmocoCurto(
          dayRegs.map((r) => ({
            tipo: r.tipo,
            minuto: toMinH(fmtHoraH(r.dataHora))
          })),
          {
            almocoMinMin: jornada.almocoMinMin ?? 60,
            exigirIntervalo: exigirIntervalo && !semAlmocoDia
          }
        )
      : null;
    const fmtMinH = (min: number) => {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };
    result.push({
      data: dataStr,
      diaSemana: NOMES[dow],
      entrada,
      inicioIntervalo,
      fimIntervalo,
      saida,
      pausas: pausas.length ? pausas : undefined,
      horasMin,
      jornadaMin,
      status,
      obs,
      observacoes: observacoes.length ? observacoes : undefined,
      entradaEditada: !!eR?.ajustado,
      inicioIntervaloEditado: !!iiDisplay?.ajustado || !!iiR?.ajustado,
      fimIntervaloEditado: !!fiDisplay?.ajustado || !!fiR?.ajustado,
      saidaEditada: !!sDisplay?.ajustado || !!sR?.ajustado,
      semIntervalo: bloquearIntervalo,
      turno: obsTurno?.turno ?? (atestadoParcial ? "ATESTADO_PARCIAL" : undefined),
      motivoSemIntervalo: atestadoParcial ? "ATESTADO_PARCIAL" : obsTurno?.motivo,
      janelaAlmoco: obsTurno?.janelaAlmoco,
      atestadoParcial: !!atestadoParcial,
      atestadoParcialHorario: atestadoParcial
        ? `${atestadoParcial.horarioInicio}–${atestadoParcial.horarioFim}`
        : undefined,
      saidaNaoAplicavel: dispensaSaida && !saida,
      almocoCurto: almocoCurtoDetect
        ? {
            inicio: fmtMinH(almocoCurtoDetect.inicioMin),
            fimRegistrado: fmtMinH(almocoCurtoDetect.fimRegistradoMin),
            fimReferencia: fmtMinH(almocoCurtoDetect.fimReferenciaMin),
            minimoMin: almocoCurtoDetect.minimoMin
          }
        : undefined
    });
  }
  return result;
}

/* Sub-components do histórico */
function StatusPillH({
  status,
  obs,
  atestadoParcial,
  atestadoParcialHorario
}: {
  status: StatusDia;
  obs?: string;
  atestadoParcial?: boolean;
  atestadoParcialHorario?: string;
}) {
  if (atestadoParcial) {
    const label = badgeLabelParcialH(obs);
    return (
      <span
        className="badge badge-blue"
        title={obs ?? `${label}${atestadoParcialHorario ? ` ${atestadoParcialHorario}` : ""}`}
      >
        {label}
      </span>
    );
  }
  /* Dias futuros: sem badge — o dia ainda não ocorreu. */
  if (status === "FUTURO") return null;

  const map: Record<StatusDia, { label: string; cls: string }> = {
    OK: { label: "OK", cls: "badge-green" },
    FALTA: { label: "Falta", cls: "badge-red" },
    PENDENTE: { label: "Pendente", cls: "badge-amber" },
    AFASTAMENTO: { label: "Afastamento", cls: "badge-blue" },
    FERIADO: { label: "Feriado", cls: "badge-gray" },
    FUTURO: { label: "", cls: "badge-gray" },
    FOLGA: { label: "Sem Expediente", cls: "badge-gray" },
    ISENTO: { label: "Isento — Assessor/Gerente", cls: "badge-blue" }
  };
  const { label, cls } = map[status] ?? { label: status, cls: "badge-gray" };
  const titulo = obs ?? undefined;
  return (
    <span className={`badge ${cls}`} title={titulo}>
      {status === "ISENTO"
        ? "Isento — Assessor/Gerente"
        : status === "AFASTAMENTO" && obs
          ? obs
          : status === "FOLGA" && obs && obs !== "Sem Expediente" && obs !== "Folga"
            ? obs
            : label}
    </span>
  );
}
function HoraCellH({
  hora,
  editado,
  turnoSemIntervalo,
  almocoCurto
}: {
  hora: string | null;
  editado?: boolean;
  turnoSemIntervalo?: { turno?: string };
  almocoCurto?: DiaHist["almocoCurto"];
}) {
  if (!hora) return <span style={{ color: "var(--ink-500)" }}>—</span>;
  const tituloTurno =
    turnoSemIntervalo?.turno === "NOTURNO"
      ? "Turno noturno — jornada sem intervalo"
      : turnoSemIntervalo?.turno === "VESPERTINO"
        ? "Turno vespertino — jornada sem intervalo"
        : turnoSemIntervalo
          ? "Jornada sem intervalo de almoço"
          : undefined;
  const tituloAlmoco = almocoCurto
    ? `Almoço: horário de referência = ${almocoCurto.minimoMin} min a partir de ${almocoCurto.inicio}. Registrado retorno às ${almocoCurto.fimRegistrado}; cálculo retoma às ${almocoCurto.fimReferencia}.`
    : undefined;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        display: "inline-flex",
        alignItems: "center",
        gap: 3
      }}
    >
      {hora}
      {turnoSemIntervalo && (
        <span title={tituloTurno} style={{ display: "inline-flex", lineHeight: 0 }}>
          <CheckCircleIcon size={11} style={{ color: "var(--green)", flexShrink: 0 }} />
        </span>
      )}
      {almocoCurto && (
        <span
          title={tituloAlmoco}
          role="img"
          aria-label={tituloAlmoco}
          style={{ display: "inline-flex", lineHeight: 0, color: "#B45309", cursor: "help" }}
        >
          <CoffeeIcon size={12} style={{ flexShrink: 0 }} />
        </span>
      )}
      {editado && <Edit2Icon size={11} style={{ color: "#1e40af", opacity: 0.85 }} />}
    </span>
  );
}

function IntervaloNaoAplicavelCellH({
  turno,
  motivo,
  janelaAlmoco,
  onClick
}: {
  turno?: string;
  motivo?: string;
  janelaAlmoco?: string;
  onClick?: () => void;
}) {
  const janela = janelaAlmoco ?? "janela de almoço";
  let title: string;
  if (motivo === "ATESTADO_PARCIAL" || turno === "ATESTADO_PARCIAL") {
    title =
      "Intervalo de almoço não aplicável — atestado médico parcial (matutino ou vespertino). " +
      "A dedução de 1h não é aplicada quando o almoço não foi registrado.";
  } else if (motivo === "ATESTADO_PARCIAL_SAIDA") {
    title =
      "Saída não aplicável — atestado médico parcial no período da tarde. " +
      "O expediente encerra com o atestado; correção de ponto não é exigida.";
  } else {
    const nomeTurno =
      turno === "NOTURNO" ? "noturno" : turno === "VESPERTINO" ? "vespertino" : "atípico";
    title =
      motivo === "DURANTE_JANELA"
        ? `Intervalo de almoço não aplicável — entrada no turno ${nomeTurno} durante a janela vigente (${janela}).`
        : `Intervalo de almoço não aplicável — entrada no turno ${nomeTurno} após a janela de almoço (${janela}).`;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 7px",
        borderRadius: "var(--radius-full)",
        border: "1px solid rgba(47,125,79,0.35)",
        background: "rgba(47,125,79,0.10)",
        color: "var(--green)",
        fontSize: 10,
        fontWeight: 600,
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
        lineHeight: 1.3,
        whiteSpace: "nowrap"
      }}
    >
      <CheckCircleIcon size={11} style={{ flexShrink: 0 }} />
      Não aplicável
    </button>
  );
}
function HorasCellH({ min, status }: { min: number; status: StatusDia }) {
  if (
    status === "FUTURO" ||
    status === "FOLGA" ||
    status === "FALTA" ||
    status === "AFASTAMENTO" ||
    status === "ISENTO"
  )
    return <span style={{ color: "var(--ink-500)" }}>—</span>;
  return (
    <span style={{ fontFamily: "var(--font-mono)" }}>
      {Math.floor(min / 60)}h{String(min % 60).padStart(2, "0")}
    </span>
  );
}
function SaldoCellH({
  trabMin,
  jornadaMin,
  status
}: {
  trabMin: number;
  jornadaMin: number;
  status: StatusDia;
}) {
  if (status === "FUTURO" || status === "FOLGA" || status === "AFASTAMENTO" || status === "ISENTO")
    return <span style={{ color: "var(--ink-500)" }}>—</span>;
  if (status === "FALTA") {
    const h = Math.floor(jornadaMin / 60);
    const m = jornadaMin % 60;
    return (
      <span style={{ color: "var(--red)" }}>
        −{h}h{String(m).padStart(2, "0")}
      </span>
    );
  }
  const s = trabMin - jornadaMin;
  return (
    <span
      style={{
        color: s >= 0 ? "var(--green)" : "var(--red)",
        fontFamily: "var(--font-mono)",
        fontWeight: 500
      }}
    >
      {s >= 0 ? "+" : "−"}
      {Math.floor(Math.abs(s) / 60)}h{String(Math.abs(s) % 60).padStart(2, "0")}
    </span>
  );
}
function PausaCellH({ pausas }: { pausas?: { inicio: string; fim: string | null }[] }) {
  if (!pausas?.length) return <span style={{ color: "var(--ink-500)" }}>—</span>;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 2
      }}
    >
      {pausas.map((p, i) => (
        <span key={i}>
          {p.inicio}–{p.fim ?? "…"}
        </span>
      ))}
    </span>
  );
}
function ModalObsH({
  dia,
  observacoes,
  onClose
}: {
  dia: string;
  observacoes: { data: string; texto: string }[];
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(122,30,38,0.10)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Observações do dia</p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>{dia}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "var(--ink-500)"
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {observacoes.map((o, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                background: "rgba(37,99,235,0.05)",
                border: "1px solid rgba(37,99,235,0.12)",
                borderRadius: "var(--radius-md)"
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-800)", lineHeight: 1.5 }}>
                {textoObsLeg(o.texto)}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-400)" }}>
                Registrado em {fmtObsDt(o.data)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function BotaoObsH({
  observacoes,
  onClick
}: {
  observacoes: { data: string; texto: string }[];
  onClick: () => void;
}) {
  if (!observacoes.length) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Ver observações"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        padding: 0,
        border: "none",
        borderRadius: "50%",
        background: "transparent",
        color: "var(--ink-400)",
        cursor: "pointer",
        flexShrink: 0
      }}
    >
      <InfoIcon size={13} />
    </button>
  );
}
function PopupMesAnoH({
  mes,
  ano,
  onSelect,
  onClose
}: {
  mes: number;
  ano: number;
  onSelect: (m: number, a: number) => void;
  onClose: () => void;
}) {
  const hoje = new Date();
  const [anoLocal, setAnoLocal] = useState(ano);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 500,
        background: "white",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        border: "1px solid rgba(122,30,38,0.12)",
        padding: "14px 16px",
        minWidth: 240
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12
        }}
      >
        <button
          onClick={() => setAnoLocal((a) => a - 1)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            color: "#6B0F1A",
            fontSize: 16
          }}
        >
          ‹
        </button>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: 16,
            color: "var(--burgundy-700)"
          }}
        >
          {anoLocal}
        </span>
        <button
          onClick={() => setAnoLocal((a) => Math.min(a + 1, hoje.getFullYear()))}
          disabled={anoLocal >= hoje.getFullYear()}
          style={{
            background: "none",
            border: "none",
            cursor: anoLocal >= hoje.getFullYear() ? "default" : "pointer",
            padding: "4px 8px",
            color: anoLocal >= hoje.getFullYear() ? "#ccc" : "#6B0F1A",
            fontSize: 16
          }}
        >
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
        {MESES.map((nome, i) => {
          const m = i + 1,
            isFut = anoLocal === hoje.getFullYear() && m > hoje.getMonth() + 1,
            isSel = m === mes && anoLocal === ano;
          return (
            <button
              key={m}
              disabled={isFut}
              onClick={() => {
                onSelect(m, anoLocal);
                onClose();
              }}
              style={{
                padding: "6px 4px",
                borderRadius: 6,
                border: "none",
                cursor: isFut ? "default" : "pointer",
                fontSize: 11.5,
                fontWeight: isSel ? 700 : 400,
                background: isSel ? "var(--burgundy-700)" : "transparent",
                color: isSel ? "white" : isFut ? "#ccc" : "#334155"
              }}
            >
              {nome.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Modal de correção de ponto pelo RH */
interface EditDayState {
  dia: DiaHist;
  isoKey: string; // YYYY-MM-DD
  regsNoDia: ApiRegHist[];
}

function ModalCorrecaoRH({
  state,
  funcionarioId,
  token,
  onClose,
  onEnviada
}: {
  state: EditDayState;
  funcionarioId: string;
  token: string;
  onClose: () => void;
  onEnviada: () => void;
}) {
  const { dia, isoKey, regsNoDia } = state;

  const getH = (tipo: string) => regsNoDia.find((r) => r.tipo === tipo);
  const fmtAtual = (tipo: string) => {
    const r = getH(tipo);
    return r ? fmtHoraH(r.dataHora) : "";
  };

  const [entrada, setEntrada] = useState(fmtAtual("ENTRADA"));
  const [inicioIntervalo, setInicioIntervalo] = useState(fmtAtual("INICIO_INTERVALO"));
  const [fimIntervalo, setFimIntervalo] = useState(fmtAtual("FIM_INTERVALO"));
  const [saida, setSaida] = useState(fmtAtual("SAIDA"));
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit() {
    if (!justificativa.trim()) {
      setErro("A justificativa é obrigatória.");
      return;
    }

    const pares: Array<[string, string, string]> = [
      ["ENTRADA", entrada, fmtAtual("ENTRADA")],
      ["INICIO_INTERVALO", inicioIntervalo, fmtAtual("INICIO_INTERVALO")],
      ["FIM_INTERVALO", fimIntervalo, fmtAtual("FIM_INTERVALO")],
      ["SAIDA", saida, fmtAtual("SAIDA")]
    ];

    const correcoes: Array<{
      acao: "CORRIGIR" | "INCLUIR" | "EXCLUIR";
      tipoRegistro: string;
      horario: string;
      registroId?: string;
      horarioOriginal?: string;
    }> = [];

    for (const [tipo, novo, atual] of pares) {
      const reg = getH(tipo);
      if (novo && novo !== atual) {
        correcoes.push(
          reg
            ? {
                acao: "CORRIGIR",
                tipoRegistro: tipo,
                horario: novo,
                registroId: reg.id,
                horarioOriginal: atual
              }
            : { acao: "INCLUIR", tipoRegistro: tipo, horario: novo }
        );
      } else if (!novo && atual && reg) {
        correcoes.push({ acao: "EXCLUIR", tipoRegistro: tipo, horario: "", registroId: reg.id });
      }
    }

    if (correcoes.length === 0) {
      setErro("Nenhuma alteração detectada.");
      return;
    }

    setEnviando(true);
    setErro("");
    try {
      // data de referência: meio-dia do dia em questão no horário de Brasília
      const dataReferencia = new Date(`${isoKey}T12:00:00-03:00`).toISOString();
      await api.post(
        `/auditoria/rh/funcionarios/${funcionarioId}/correcao-ponto`,
        { dataReferencia, justificativa, correcoes },
        token
      );
      onEnviada();
    } catch (e) {
      setErro((e as Error).message || "Erro ao enviar solicitação.");
    } finally {
      setEnviando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    padding: "7px 10px",
    border: "1px solid rgba(122,30,38,0.14)",
    borderRadius: "var(--radius-md)",
    width: "100%",
    boxSizing: "border-box"
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11.5,
    fontWeight: 600,
    color: "var(--ink-500)",
    display: "block",
    marginBottom: 3
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !enviando && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 500,
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "rgba(122,30,38,0.05)",
            borderBottom: "1px solid rgba(122,30,38,0.10)",
            padding: "18px 22px"
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              color: "var(--burgundy-700)",
              fontFamily: "var(--font-display)"
            }}
          >
            Corrigir Registros de Ponto
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
            {dia.diaSemana}, {dia.data}
          </p>
        </div>

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Aviso fluxo */}
          <div
            style={{
              background: "rgba(37,99,235,0.06)",
              border: "1px solid rgba(37,99,235,0.18)",
              borderRadius: "var(--radius-md)",
              padding: "10px 13px",
              fontSize: 12.5,
              color: "#1e40af",
              lineHeight: 1.5
            }}
          >
            ℹ️ Esta correção será enviada ao <strong>Gerente de RH</strong> para aprovação. O
            histórico só será alterado após aprovação.
          </div>

          {/* Campos de horário */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(
              [
                ["Entrada", entrada, setEntrada, "ENTRADA"],
                ["Início Intervalo", inicioIntervalo, setInicioIntervalo, "INICIO_INTERVALO"],
                ["Fim Intervalo", fimIntervalo, setFimIntervalo, "FIM_INTERVALO"],
                ["Saída", saida, setSaida, "SAIDA"]
              ] as const
            ).map(([lbl, val, setter, tipo]) => {
              const original = fmtAtual(tipo);
              const mudou = val !== original;
              return (
                <div key={lbl}>
                  <label style={labelStyle}>
                    {lbl}
                    {original && (
                      <span style={{ fontWeight: 400, color: "var(--ink-400)", marginLeft: 6 }}>
                        (atual: {original})
                      </span>
                    )}
                  </label>
                  <input
                    type="time"
                    value={val}
                    onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                    style={{
                      ...inputStyle,
                      borderColor: mudou ? "rgba(37,99,235,0.50)" : "rgba(122,30,38,0.14)"
                    }}
                  />
                  {mudou && original && (
                    <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#1e40af" }}>
                      Corrigir: {original} → {val || "excluir"}
                    </p>
                  )}
                  {mudou && !original && val && (
                    <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#2f7d4f" }}>
                      Incluir registro
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Justificativa */}
          <div>
            <label style={{ ...labelStyle, color: "var(--ink-700)" }}>
              Justificativa <span style={{ color: "var(--red)" }}>*</span>
            </label>
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo da correção…"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid rgba(122,30,38,0.14)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box"
              }}
            />
          </div>

          {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>⚠️ {erro}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={enviando}
              style={{
                padding: "9px 18px",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                cursor: enviando ? "not-allowed" : "pointer",
                fontSize: 13,
                color: "var(--ink-600)"
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={enviando}
              style={{
                padding: "9px 22px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: enviando ? "#9ca3af" : "var(--burgundy-600)",
                color: "#fff",
                cursor: enviando ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700
              }}
            >
              {enviando ? "Enviando…" : "Enviar para aprovação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabHistoricoFunc({ funcionarioId, token }: { funcionarioId: string; token: string }) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [dias, setDias] = useState<DiaHist[]>([]);
  const [rawPorDia, setRawPorDia] = useState<Record<string, ApiRegHist[]>>({});
  const [periodoLocked, setPeriodoLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalObs, setModalObs] = useState<{
    dia: string;
    observacoes: { data: string; texto: string }[];
  } | null>(null);
  const [modalEdit, setModalEdit] = useState<EditDayState | null>(null);
  const [feedbackEnviada, setFeedbackEnviada] = useState(false);
  const [popupMes, setPopupMes] = useState(false);
  const mesNavRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setFeedbackEnviada(false);
    try {
      const [regsRaw, afastsRaw, assinData, feriadosRaw, cfgRaw] = await Promise.all([
        api.get<{
          registros: ApiRegHist[];
          categoria?: string | null;
          jornada?: JornadaHistorico;
          periodosSemObrigacao?: Array<{ inicio: string; fim: string | null }>;
        }>(`/auditoria/funcionarios/${funcionarioId}/registros?mes=${mes}&ano=${ano}`, token),
        api.get<{ afastamentos: ApiAfast[] }>(
          `/auditoria/afastamentos?funcionarioId=${funcionarioId}&limit=200`,
          token
        ),
        api
          .get<{
            data: { status: string }[];
          }>(
            `/auditoria/assinaturas?funcionarioId=${funcionarioId}&mes=${mes}&ano=${ano}&limit=1`,
            token
          )
          .catch(() => null),
        api
          .get<
            { data: ApiFeriadoH[] } | ApiFeriadoH[]
          >(`/api-publica/v1/feriados?ano=${ano}&mes=${mes}`, token)
          .catch(() => null),
        api
          .get<{
            bancoHorasSabadoPct?: number;
            bancoHorasDomingoPct?: number;
            bancoHorasFeriadoPct?: number;
          }>(`/api-publica/v1/configuracoes`, token)
          .catch(() => null)
      ]);
      const regs = regsRaw?.registros ?? [];
      const jornada = regsRaw?.jornada ?? JORNADA_PADRAO_AUD;
      const periodosSemObrigacao = regsRaw?.periodosSemObrigacao ?? [];
      const exigirIntervalo =
        regsRaw?.categoria !== "ESTAGIARIO" && regsRaw?.categoria !== "MENOR_APRENDIZ";
      const afasts = (afastsRaw as { afastamentos: ApiAfast[] })?.afastamentos ?? [];
      const feriados: ApiFeriadoH[] = Array.isArray(feriadosRaw)
        ? feriadosRaw
        : ((feriadosRaw as { data?: ApiFeriadoH[] })?.data ?? []);
      const sabadoPct =
        (cfgRaw as { bancoHorasSabadoPct?: number } | null)?.bancoHorasSabadoPct ?? 100;
      const domingoPct =
        (cfgRaw as { bancoHorasDomingoPct?: number } | null)?.bancoHorasDomingoPct ?? 200;
      const feriadoPct =
        (cfgRaw as { bancoHorasFeriadoPct?: number } | null)?.bancoHorasFeriadoPct ?? 200;

      // índice bruto por data para o modal de edição
      const byDay: Record<string, ApiRegHist[]> = {};
      for (const r of regs) {
        const k = dtKeyH(r.dataHora);
        (byDay[k] ??= []).push(r);
      }
      setRawPorDia(byDay);

      setDias(
        buildHistorico(
          regs,
          afasts,
          mes,
          ano,
          feriados,
          sabadoPct,
          domingoPct,
          feriadoPct,
          jornada,
          periodosSemObrigacao,
          exigirIntervalo
        )
      );

      // Bloqueia edição se o período estiver concluído (assinado pelos dois)
      const assinResp = assinData as { assinaturas?: { status: string }[] } | null;
      const assinaturas = assinResp?.assinaturas ?? [];
      setPeriodoLocked(assinaturas.some((a) => a.status === "CONCLUIDA"));
    } catch {
      setDias(buildHistorico([], [], mes, ano));
    } finally {
      setLoading(false);
    }
  }, [funcionarioId, token, mes, ano]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function navMes(dir: -1 | 1) {
    let nm = mes + dir,
      na = ano;
    if (nm < 1) {
      nm = 12;
      na--;
    }
    if (nm > 12) {
      nm = 1;
      na++;
    }
    setMes(nm);
    setAno(na);
  }

  function abrirEdicao(r: DiaHist, isoKey: string) {
    setModalEdit({ dia: r, isoKey, regsNoDia: rawPorDia[isoKey] ?? [] });
  }

  const nomeMes = new Date(ano, mes - 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  const totalTrab = dias
    .filter((r) => r.status === "OK" || r.status === "PENDENTE")
    .reduce((s, r) => s + r.horasMin, 0);
  const totalOK = dias.filter((r) => r.status === "OK").length;
  const totalFaltas = dias.filter((r) => r.status === "FALTA").length;
  const totalAfasts = dias.filter((r) => r.status === "AFASTAMENTO").length;
  const totalUteis = dias.filter(
    (r) =>
      r.status !== "FUTURO" &&
      r.status !== "FOLGA" &&
      r.status !== "AFASTAMENTO" &&
      r.status !== "ISENTO"
  ).length;
  const totalJornadaMin = dias
    .filter(
      (r) =>
        r.status !== "FUTURO" &&
        r.status !== "FOLGA" &&
        r.status !== "AFASTAMENTO" &&
        r.status !== "ISENTO"
    )
    .reduce((s, r) => s + r.jornadaMin, 0);
  const mesAtual = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {modalObs && (
        <ModalObsH
          dia={modalObs.dia}
          observacoes={modalObs.observacoes}
          onClose={() => setModalObs(null)}
        />
      )}
      {modalEdit && (
        <ModalCorrecaoRH
          state={modalEdit}
          funcionarioId={funcionarioId}
          token={token}
          onClose={() => setModalEdit(null)}
          onEnviada={() => {
            setModalEdit(null);
            setFeedbackEnviada(true);
            carregar();
          }}
        />
      )}

      {/* Feedback pós-envio */}
      {feedbackEnviada && (
        <div
          style={{
            background: "#d1fae5",
            border: "1px solid #6ee7b7",
            borderRadius: "var(--radius-md)",
            padding: "10px 16px",
            fontSize: 13,
            color: "#065f46",
            fontWeight: 500
          }}
        >
          ✅ Solicitação de correção enviada ao Gerente de RH para aprovação.
        </div>
      )}

      {/* Aviso período bloqueado */}
      {periodoLocked && (
        <div
          style={{
            background: "rgba(122,30,38,0.06)",
            border: "1px solid rgba(122,30,38,0.20)",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            fontSize: 12.5,
            color: "var(--burgundy-700)"
          }}
        >
          🔒 Este período já foi assinado pelo funcionário e pelo gestor. Correções não são
          permitidas.
        </div>
      )}

      {/* Navegação de mês */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn-icon"
          onClick={() => navMes(-1)}
          style={{ background: "white", border: "1px solid rgba(122,30,38,0.12)", flexShrink: 0 }}
        >
          <ArrowLeftIcon size={16} />
        </button>
        <div
          ref={mesNavRef}
          style={{ position: "relative", flex: 1, textAlign: "center", minWidth: 120 }}
        >
          <button
            onClick={() => setPopupMes((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 8px",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: 18,
              color: "var(--burgundy-600)",
              textTransform: "capitalize",
              borderRadius: 6
            }}
          >
            {nomeMes} <ChevronDownIcon size={14} style={{ opacity: 0.5, marginTop: 2 }} />
          </button>
          {popupMes && (
            <PopupMesAnoH
              mes={mes}
              ano={ano}
              onSelect={(m, a) => {
                setMes(m);
                setAno(a);
              }}
              onClose={() => setPopupMes(false)}
            />
          )}
        </div>
        <button
          className="btn-icon"
          onClick={() => navMes(1)}
          disabled={mesAtual}
          style={{
            background: "white",
            border: "1px solid rgba(122,30,38,0.12)",
            flexShrink: 0,
            opacity: mesAtual ? 0.4 : 1
          }}
        >
          <ArrowRightIcon size={16} />
        </button>
        <button
          onClick={carregar}
          style={{
            background: "white",
            border: "1px solid rgba(122,30,38,0.12)",
            borderRadius: "var(--radius-md)",
            padding: "6px 10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--ink-600)"
          }}
        >
          <RefreshCwIcon size={13} />
        </button>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="badge badge-green">{totalOK} dias OK</span>
          {totalFaltas > 0 && (
            <span className="badge badge-red">
              {totalFaltas} falta{totalFaltas !== 1 ? "s" : ""}
            </span>
          )}
          {totalAfasts > 0 && (
            <span className="badge badge-blue">
              {totalAfasts} afastamento{totalAfasts !== 1 ? "s" : ""}
            </span>
          )}
          <span className="badge badge-gray">
            {Math.floor(totalTrab / 60)}h{String(totalTrab % 60).padStart(2, "0")} trabalhadas
          </span>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div
          style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando histórico…
        </div>
      ) : (
        <div className="card-flat" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table-cfo" style={{ minWidth: 860, tableLayout: "auto" }}>
              <thead>
                <tr>
                  {[
                    "Data",
                    "Dia",
                    "Entrada",
                    "Início Interv.",
                    "Fim Interv.",
                    "Saída",
                    "Pausa",
                    "Horas",
                    "Saldo",
                    "Status",
                    "Ações"
                  ].map((h) => (
                    <th
                      key={h}
                      style={
                        h === "Status" || h === "Ações"
                          ? { width: "1%", whiteSpace: "nowrap", paddingLeft: 10, paddingRight: 10 }
                          : undefined
                      }
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dias.map((r, i) => {
                  const isHoje =
                    r.data ===
                    `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
                  const isoKey = (() => {
                    const [d, m, a] = r.data.split("/");
                    return `${a}-${m}-${d}`;
                  })();
                  const podeEditar =
                    !periodoLocked &&
                    r.status !== "FUTURO" &&
                    r.status !== "AFASTAMENTO" &&
                    r.status !== "ISENTO";
                  return (
                    <tr
                      key={i}
                      style={{
                        background: isHoje ? "rgba(122,30,38,0.03)" : undefined,
                        opacity: r.status === "FUTURO" ? 0.5 : 1
                      }}
                    >
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                        {r.data}
                        {isHoje && (
                          <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 9 }}>
                            hoje
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--ink-500)", fontSize: 13 }}>{r.diaSemana}</td>
                      <td>
                        <HoraCellH
                          hora={r.entrada}
                          editado={r.entradaEditada}
                          turnoSemIntervalo={r.semIntervalo ? { turno: r.turno } : undefined}
                        />
                      </td>
                      <td>
                        {r.inicioIntervalo ? (
                          <HoraCellH hora={r.inicioIntervalo} editado={r.inicioIntervaloEditado} />
                        ) : r.semIntervalo ? (
                          <IntervaloNaoAplicavelCellH
                            turno={r.turno}
                            motivo={r.motivoSemIntervalo}
                            janelaAlmoco={r.janelaAlmoco}
                            onClick={
                              r.observacoes?.length
                                ? () =>
                                    setModalObs({
                                      dia: `${r.diaSemana}, ${r.data}`,
                                      observacoes: r.observacoes ?? []
                                    })
                                : undefined
                            }
                          />
                        ) : (
                          <HoraCellH hora={r.inicioIntervalo} editado={r.inicioIntervaloEditado} />
                        )}
                      </td>
                      <td>
                        {r.fimIntervalo ? (
                          <HoraCellH
                            hora={r.fimIntervalo}
                            editado={r.fimIntervaloEditado}
                            almocoCurto={r.almocoCurto}
                          />
                        ) : r.semIntervalo || r.atestadoParcial ? (
                          <IntervaloNaoAplicavelCellH
                            turno={r.turno}
                            motivo={r.motivoSemIntervalo}
                            janelaAlmoco={r.janelaAlmoco}
                            onClick={
                              r.observacoes?.length
                                ? () =>
                                    setModalObs({
                                      dia: `${r.diaSemana}, ${r.data}`,
                                      observacoes: r.observacoes ?? []
                                    })
                                : undefined
                            }
                          />
                        ) : (
                          <HoraCellH hora={r.fimIntervalo} editado={r.fimIntervaloEditado} />
                        )}
                      </td>
                      <td>
                        {r.saida ? (
                          <HoraCellH hora={r.saida} editado={r.saidaEditada} />
                        ) : r.saidaNaoAplicavel ? (
                          <IntervaloNaoAplicavelCellH
                            turno="ATESTADO_PARCIAL"
                            motivo="ATESTADO_PARCIAL_SAIDA"
                            onClick={
                              r.observacoes?.length
                                ? () =>
                                    setModalObs({
                                      dia: `${r.diaSemana}, ${r.data}`,
                                      observacoes: r.observacoes ?? []
                                    })
                                : undefined
                            }
                          />
                        ) : (
                          <HoraCellH hora={r.saida} editado={r.saidaEditada} />
                        )}
                      </td>
                      <td>
                        <PausaCellH pausas={r.pausas} />
                      </td>
                      <td>
                        <HorasCellH min={r.horasMin} status={r.status} />
                      </td>
                      <td>
                        <SaldoCellH
                          trabMin={r.horasMin}
                          jornadaMin={r.jornadaMin}
                          status={r.status}
                        />
                      </td>
                      <td
                        style={{
                          width: "1%",
                          whiteSpace: "nowrap",
                          paddingLeft: 10,
                          paddingRight: 10
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <StatusPillH
                            status={r.status}
                            obs={r.obs}
                            atestadoParcial={r.atestadoParcial}
                            atestadoParcialHorario={r.atestadoParcialHorario}
                          />
                          <BotaoObsH
                            observacoes={r.observacoes ?? []}
                            onClick={() =>
                              setModalObs({
                                dia: `${r.diaSemana}, ${r.data}`,
                                observacoes: r.observacoes ?? []
                              })
                            }
                          />
                        </span>
                      </td>
                      <td
                        style={{
                          width: "1%",
                          whiteSpace: "nowrap",
                          paddingLeft: 10,
                          paddingRight: 10
                        }}
                      >
                        <button
                          onClick={() => podeEditar && abrirEdicao(r, isoKey)}
                          disabled={!podeEditar}
                          title={
                            periodoLocked
                              ? "Período assinado — edição bloqueada"
                              : !podeEditar
                                ? "Não editável"
                                : "Corrigir registros deste dia"
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "4px 9px",
                            border: "1px solid rgba(122,30,38,0.22)",
                            borderRadius: "var(--radius-md)",
                            background: podeEditar ? "#fff" : "transparent",
                            color: podeEditar ? "var(--burgundy-600)" : "var(--ink-300)",
                            cursor: podeEditar ? "pointer" : "not-allowed",
                            fontSize: 11,
                            fontWeight: 600
                          }}
                        >
                          <Edit2Icon size={11} />
                          {periodoLocked ? "🔒" : "Corrigir"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {dias.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      style={{ textAlign: "center", padding: 40, color: "var(--ink-500)" }}
                    >
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
              {totalUteis > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(122,30,38,0.10)" }}>
                    <td
                      colSpan={7}
                      style={{
                        padding: "12px 14px",
                        fontWeight: 600,
                        fontSize: 12,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)"
                      }}
                    >
                      Total do período
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {Math.floor(totalTrab / 60)}h{String(totalTrab % 60).padStart(2, "0")}
                    </td>
                    <td>
                      <SaldoCellH trabMin={totalTrab} jornadaMin={totalJornadaMin} status="OK" />
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <InfoIcon size={13} style={{ color: "var(--ink-500)" }} />
        {[
          { cls: "badge-green", l: "Jornada completa" },
          { cls: "badge-amber", l: "Pendente (saída não registrada)" },
          { cls: "badge-red", l: "Falta" },
          { cls: "badge-blue", l: "Afastamento / Atestado médico parcial" },
          { cls: "badge-gray", l: "Feriado ou sem expediente" }
        ].map((item) => (
          <span
            key={item.l}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11.5,
              color: "var(--ink-500)"
            }}
          >
            <span className={`badge ${item.cls}`} style={{ padding: "1px 6px", fontSize: 9 }}>
              &nbsp;
            </span>
            {item.l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Painel de Férias do funcionário (sub-aba) ─── */
function PainelFerias({
  saldo,
  historico,
  onRecarregar
}: {
  saldo: SaldoFerias | null;
  historico: Solicitacao[];
  onRecarregar: () => void;
}) {
  const statusBadge: Record<string, { label: string; cls: string }> = {
    PENDENTE: { label: "Aguardando Gestor", cls: "badge-amber" },
    AGUARDANDO_RH: { label: "Aguardando RH", cls: "badge-blue" },
    AGUARDANDO_DOCUMENTO_FUNCIONARIO: { label: "Aguard. doc. funcionário", cls: "badge-amber" },
    APROVADA: { label: "Aprovada", cls: "badge-green" },
    REJEITADA_GESTOR: { label: "Rej. Gestor", cls: "badge-red" },
    REJEITADA_RH: { label: "Rej. RH", cls: "badge-red" },
    REJEITADA: { label: "Rejeitada", cls: "badge-red" },
    CANCELADA: { label: "Cancelada", cls: "badge-gray" }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Saldo */}
      {saldo ? (
        <div
          style={{
            background: saldo.obrigatorio ? "rgba(200,57,63,0.06)" : "rgba(47,125,79,0.06)",
            border: `1px solid ${saldo.obrigatorio ? "rgba(200,57,63,0.22)" : "rgba(47,125,79,0.22)"}`,
            borderRadius: "var(--radius-lg)",
            padding: "16px 20px"
          }}
        >
          {saldo.obrigatorio && (
            <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--red)", margin: "0 0 10px" }}>
              ⚠️ Período de gozo obrigatório — férias devem ser tiradas antes do fim do ciclo.
            </p>
          )}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {[
              [
                "Dias disponíveis",
                saldo.diasDisponiveis,
                saldo.diasDisponiveis > 0 ? "#2f7d4f" : "var(--ink-500)"
              ],
              ["Já gozados", saldo.diasGozo, "var(--ink-700)"],
              ["Já vendidos", saldo.diasVendidos, "var(--ink-700)"],
              ["Total vencido", saldo.totalVencido, "var(--ink-700)"],
              ["Ciclos vencidos", saldo.ciclosVencidos, "var(--ink-700)"]
            ].map(([l, v, c]) => (
              <div key={String(l)}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--ink-400)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    margin: 0
                  }}
                >
                  {l}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 22,
                    fontWeight: 700,
                    color: String(c),
                    margin: 0
                  }}
                >
                  {v}
                </p>
              </div>
            ))}
          </div>
          {(saldo.ciclos?.length ?? 0) > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "10px 0 0" }}>
              Ciclo(s):{" "}
              {(saldo.ciclos ?? [])
                .map(
                  (c) =>
                    `${new Date(c.inicio).toLocaleDateString("pt-BR")} – ${new Date(c.fim).toLocaleDateString("pt-BR")}`
                )
                .join(" | ")}
              {saldo.dataAdmissao
                ? ` · Admissão: ${new Date(saldo.dataAdmissao).toLocaleDateString("pt-BR")}`
                : ""}
            </p>
          )}
        </div>
      ) : (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(247,196,55,0.08)",
            border: "1px solid rgba(247,196,55,0.25)",
            borderRadius: "var(--radius-md)",
            fontSize: 12.5,
            color: "#8a6a00"
          }}
        >
          Data de admissão não cadastrada. O saldo de férias não pode ser calculado.
        </div>
      )}

      {/* Histórico */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--ink-500)",
            textTransform: "uppercase",
            letterSpacing: "0.06em"
          }}
        >
          Histórico de solicitações de férias ({historico?.length ?? 0})
        </p>
        <button
          onClick={onRecarregar}
          style={{
            background: "none",
            border: "1px solid rgba(122,30,38,0.18)",
            borderRadius: "var(--radius-md)",
            padding: "5px 10px",
            fontSize: 11,
            cursor: "pointer",
            color: "var(--ink-600)",
            display: "flex",
            alignItems: "center",
            gap: 5
          }}
        >
          <RefreshCwIcon size={11} /> Atualizar
        </button>
      </div>

      {(historico?.length ?? 0) === 0 ? (
        <p
          style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "var(--ink-400)" }}
        >
          Nenhuma solicitação de férias registrada.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(historico ?? []).map((s) => {
            const bd = statusBadge[s.status] ?? { label: s.status, cls: "badge-gray" };
            const meta = s.metadados as Record<string, unknown> | null;
            const periodos = Array.isArray(meta?.periodos)
              ? (meta!.periodos as Array<{ dataInicio: string; dataFim: string; dias: number }>)
              : null;
            const diasGozo = periodos?.reduce((acc, p) => acc + p.dias, 0) ?? 0;
            const diasVenda = Number(meta?.diasVendidos ?? 0);
            return (
              <div
                key={s.id}
                style={{
                  background: "#fff",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid rgba(47,125,79,0.14)",
                  padding: "14px 18px",
                  display: "flex",
                  gap: 16,
                  alignItems: "flex-start",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: 6
                    }}
                  >
                    <span className={`badge ${bd.cls}`}>{bd.label}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
                      Criada: {fmtDate(s.createdAt)}
                    </span>
                    {diasGozo > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--ink-600)",
                          background: "rgba(47,125,79,0.08)",
                          borderRadius: 4,
                          padding: "1px 7px",
                          fontWeight: 600
                        }}
                      >
                        {diasGozo}d gozo{diasVenda > 0 ? ` + ${diasVenda}d venda` : ""}
                      </span>
                    )}
                  </div>
                  <FeriasDetalheBlock meta={meta} />
                  {/* Folha e retorno */}
                  {(s.guiaMedicoUrl || s.documentoRetornoUrl) && (
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        alignItems: "flex-start"
                      }}
                    >
                      {s.guiaMedicoUrl && (
                        <LinkDocumentoAnexado
                          href={s.guiaMedicoUrl}
                          label="Ver documento — Folha de pagamento de férias"
                          variant="folha"
                          style={{ marginTop: 0 }}
                        />
                      )}
                      {s.documentoRetornoUrl && (
                        <LinkDocumentoAnexado
                          href={s.documentoRetornoUrl}
                          label="Ver documento — Folha assinada"
                          variant="retorno"
                          style={{ marginTop: 0 }}
                        />
                      )}
                    </div>
                  )}
                  {s.rhObservacao && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 11.5,
                        color: "#065f46",
                        fontStyle: "italic"
                      }}
                    >
                      RH: {s.rhObservacao}
                    </p>
                  )}
                  {s.descricao && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 11.5,
                        color: "var(--ink-500)",
                        fontStyle: "italic"
                      }}
                    >
                      "{s.descricao}"
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Tabela de documentos enviados ao RH (detalhe do funcionário) ─── */
function TabelaDocumentosRh({
  documentos,
  funcionarioId,
  token,
  isSuperAdmin = false,
  onExcluido
}: {
  documentos: DocumentoRhEnvio[];
  funcionarioId: string;
  token: string;
  isSuperAdmin?: boolean;
  onExcluido?: () => void;
}) {
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function excluirDocumento(doc: DocumentoRhEnvio) {
    if (doc.origem === "SOLICITACAO") {
      setErro("Documentos vinculados a solicitações não podem ser excluídos por aqui.");
      return;
    }
    const nome = doc.nomeArquivo ?? doc.descricao;
    if (
      !window.confirm(
        `Excluir permanentemente o documento "${nome}"?\n\nEsta ação não pode ser desfeita.`
      )
    ) {
      return;
    }

    setExcluindoId(doc.id);
    setErro(null);
    try {
      await api.delete(`/auditoria/funcionarios/${funcionarioId}/documentos-rh/${doc.id}`, token);
      onExcluido?.();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível excluir o documento.");
    } finally {
      setExcluindoId(null);
    }
  }

  if (!documentos.length) {
    return (
      <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
        Nenhum documento enviado ao RH.
      </p>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <p
        style={{
          margin: 0,
          padding: "12px 14px 0",
          fontSize: 12,
          color: "var(--ink-500)",
          lineHeight: 1.45
        }}
      >
        Inclui envios por solicitação (todos os status) e o histórico anterior de envio direto.
      </p>
      {erro && (
        <p style={{ margin: 0, padding: "10px 14px", fontSize: 12, color: "var(--red)" }}>{erro}</p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="table-cfo" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Data / Hora</th>
              <th>Descrição</th>
              <th>Origem</th>
              <th>Status</th>
              <th>Arquivo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((doc) => {
              const isSolicitacao = doc.origem === "SOLICITACAO";
              const bd = doc.status ? statusSolBadge(doc.status) : null;
              return (
                <tr key={`${doc.origem ?? "LEGADO"}-${doc.id}`}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(doc.createdAt)}</td>
                  <td>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--ink-900)" }}>
                        {doc.descricao}
                      </p>
                      {doc.rhObservacao && (
                        <p
                          style={{
                            margin: "4px 0 0",
                            fontSize: 11.5,
                            color: "#065f46",
                            fontStyle: "italic"
                          }}
                        >
                          RH: {doc.rhObservacao}
                        </p>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        background: isSolicitacao
                          ? "rgba(37,99,235,0.10)"
                          : "rgba(109,110,113,0.12)",
                        color: isSolicitacao ? "#1e40af" : "var(--ink-600)"
                      }}
                    >
                      {isSolicitacao ? "Solicitação" : "Envio direto"}
                    </span>
                  </td>
                  <td>
                    {bd ? (
                      <Badge label={bd.label} bg={bd.bg} color={bd.color} />
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--ink-400)" }}>—</span>
                    )}
                  </td>
                  <td style={{ color: "var(--ink-500)", fontSize: 12 }}>
                    {doc.nomeArquivo ??
                      (doc.mimeType?.includes("pdf") ? "documento.pdf" : "documento")}
                  </td>
                  <td>
                    <div
                      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
                    >
                      {doc.arquivoUrl ? (
                        <LinkDocumentoAnexado
                          href={doc.arquivoUrl}
                          nomeArquivo={doc.nomeArquivo}
                          variant="rh"
                          style={{ marginTop: 0, fontSize: 12.5, padding: "6px 12px" }}
                        />
                      ) : (
                        "—"
                      )}
                      {isSuperAdmin && !isSolicitacao && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ gap: 5, color: "var(--red)" }}
                          disabled={excluindoId === doc.id}
                          onClick={() => excluirDocumento(doc)}
                          title="Excluir documento (Super Admin)"
                        >
                          <Trash2Icon size={13} />
                          {excluindoId === doc.id ? "Excluindo…" : "Excluir"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Tabela de afastamentos reutilizável ─── */
function TabelaAfastamentos({
  afastamentos,
  loading = false
}: {
  afastamentos: Afastamento[];
  loading?: boolean;
}) {
  if (loading) return <Loading />;
  if (!afastamentos.length)
    return (
      <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
        Nenhum afastamento encontrado.
      </p>
    );

  const corTipo: Record<string, string> = {
    FERIAS: "#2f7d4f",
    LICENCA_MEDICA: "#2563eb",
    ATESTADO: "#7c3aed",
    LICENCA_MATERNIDADE: "#db2777",
    LICENCA_PATERNIDADE: "#0891b2",
    FALTA_JUSTIFICADA: "#c67f00",
    FALTA_INJUSTIFICADA: "#c8393f",
    ABONO: "#6b7280"
  };

  return (
    <div>
      {afastamentos.map((a) => {
        const cor = corTipo[a.tipo] ?? "#6b7280";
        const inicio = new Date(a.dataInicio);
        const fim = new Date(a.dataFim);
        const dias = Math.ceil((fim.getTime() - inicio.getTime()) / 86400000) + 1;
        const hoje = new Date();
        const ativo = inicio <= hoje && fim >= hoje;
        return (
          <div
            key={a.id}
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(122,30,38,0.04)",
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              flexWrap: "wrap"
            }}
          >
            <div
              style={{
                width: 4,
                borderRadius: 4,
                background: cor,
                alignSelf: "stretch",
                minHeight: 40,
                flexShrink: 0
              }}
            />
            <FuncAvatar
              name={a.funcionario.user.name}
              fotoUrl={a.funcionario.fotoPerfilUrl}
              size={38}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: cor }}>
                  {tipoAfastamentoLabel(a.tipo)}
                </span>
                {ativo && <Badge label="Ativo" bg="rgba(47,125,79,0.12)" color="#2f7d4f" />}
                <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                  {fmtDate(a.dataInicio)} → {fmtDate(a.dataFim)} ({dias} dia{dias !== 1 ? "s" : ""})
                </span>
              </div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink-900)",
                  margin: "4px 0 0"
                }}
              >
                {a.funcionario.user.name}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--ink-400)",
                  margin: "1px 0 0",
                  fontFamily: "var(--font-mono)"
                }}
              >
                {a.funcionario.matricula}
                {a.funcionario.gerencia ? ` · ${a.funcionario.gerencia.nome}` : ""}
              </p>
              {a.justificativa && (
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-600)",
                    margin: "6px 0 0",
                    fontStyle: "italic"
                  }}
                >
                  {a.justificativa}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BANCO DE HORAS — saldo + detalhamento por mês
═══════════════════════════════════════════════ */

function BancoHorasDiasTabela({ dados }: { dados: BancoHorasFuncionarioDetalhe }) {
  const [mesAtivo, setMesAtivo] = React.useState<string>(() => {
    if (!dados.dias.length) return "";
    return dados.dias[dados.dias.length - 1].data.slice(0, 7);
  });

  const fmtMes = (yyyyMM: string) => {
    const [year, month] = yyyyMM.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric"
    });
  };

  const mesesDisponiveis = [...new Set(dados.dias.map((d) => d.data.slice(0, 7)))].sort();
  const idxAtivo = mesesDisponiveis.indexOf(mesAtivo);
  const podeAnterior = idxAtivo > 0;
  const podePosterior = idxAtivo < mesesDisponiveis.length - 1;

  const diasMes = dados.dias.filter((d) => d.data.slice(0, 7) === mesAtivo);
  const saldoAnterior =
    idxAtivo > 0
      ? (dados.dias.filter((d) => d.data.slice(0, 7) === mesesDisponiveis[idxAtivo - 1]).at(-1)
          ?.saldoAcumuladoMinutos ?? 0)
      : 0;

  const totalTrabalhado = diasMes.reduce((s, d) => s + d.horasTrabalhadasMinutos, 0);
  const totalEsperado = diasMes.reduce((s, d) => s + d.jornadaEsperadaMinutos, 0);
  const saldoMes = diasMes.reduce((s, d) => s + d.saldoDiaMinutos, 0);
  const saldoFinalMes = diasMes.at(-1)?.saldoAcumuladoMinutos ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Resumo do ciclo */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: "8px 0" }}>
        <div>
          <p
            style={{
              fontSize: 10,
              color: "var(--ink-400)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.10em"
            }}
          >
            Saldo Atual
          </p>
          <p
            style={{
              fontSize: 18,
              fontWeight: 700,
              margin: 0,
              color: dados.saldoAtualMinutos >= 0 ? "#2f7d4f" : "#c8393f"
            }}
          >
            {dados.saldoFormatado}
          </p>
        </div>
        <div>
          <p
            style={{
              fontSize: 10,
              color: "var(--ink-400)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.10em"
            }}
          >
            Ciclo desde
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "var(--ink-900)" }}>
            {dados.cicloInicio ? fmtDataCurta(dados.cicloInicio) : "início dos registros"}
          </p>
        </div>
        <div>
          <p
            style={{
              fontSize: 10,
              color: "var(--ink-400)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.10em"
            }}
          >
            Próxima Zeragem
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "var(--ink-900)" }}>
            {dados.proximaZeragem ? fmtDataCurta(dados.proximaZeragem) : "não configurada"}
          </p>
        </div>
        <div>
          <p
            style={{
              fontSize: 10,
              color: "var(--ink-400)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.10em"
            }}
          >
            Limite
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "var(--ink-900)" }}>
            ±{toHM(dados.limiteMinutos)}
          </p>
        </div>
      </div>

      {dados.dias.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", padding: 16 }}>
          Nenhum registro no ciclo atual.
        </p>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.08)",
            overflow: "hidden"
          }}
        >
          {/* Navegação mês */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderBottom: "1px solid rgba(122,30,38,0.07)"
            }}
          >
            <button
              onClick={() => setMesAtivo(mesesDisponiveis[idxAtivo - 1])}
              disabled={!podeAnterior}
              style={{ ...btnStyle(false, !podeAnterior), width: 28, height: 28 }}
            >
              <ArrowLeftIcon size={13} />
            </button>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 14,
                color: "var(--burgundy-600)",
                textTransform: "capitalize",
                flex: 1,
                textAlign: "center",
                margin: 0
              }}
            >
              {mesAtivo ? fmtMes(mesAtivo) : "—"}
            </p>
            <button
              onClick={() => setMesAtivo(mesesDisponiveis[idxAtivo + 1])}
              disabled={!podePosterior}
              style={{ ...btnStyle(false, !podePosterior), width: 28, height: 28 }}
            >
              <ArrowLeftIcon size={13} style={{ transform: "rotate(180deg)" }} />
            </button>
            <div style={{ marginLeft: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                Trab.: <strong style={{ color: "var(--ink-900)" }}>{toHM(totalTrabalhado)}</strong>
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                Saldo:{" "}
                <strong style={{ color: saldoMes >= 0 ? "#2f7d4f" : "#c8393f" }}>
                  {toHM(saldoMes)}
                </strong>
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                Acum.:{" "}
                <strong style={{ color: saldoFinalMes >= 0 ? "#2f7d4f" : "#c8393f" }}>
                  {toHM(saldoFinalMes)}
                </strong>
              </span>
            </div>
          </div>

          {/* Saldo transportado */}
          {idxAtivo > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 14px",
                background: "rgba(122,30,38,0.02)",
                borderBottom: "1px dashed rgba(122,30,38,0.10)"
              }}
            >
              <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
                Saldo transportado ({fmtMes(mesesDisponiveis[idxAtivo - 1])})
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: saldoAnterior >= 0 ? "#2f7d4f" : "#c8393f"
                }}
              >
                {toHM(saldoAnterior)}
              </span>
            </div>
          )}

          {/* Tabela */}
          <div style={{ overflowX: "auto" }}>
            <table className="table-cfo" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Trabalhado</th>
                  <th>Esperado</th>
                  <th>Saldo do Dia</th>
                  <th>Saldo Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {diasMes.map((d) => {
                  const neutro = !!d.observacao;
                  return (
                    <tr
                      key={d.data}
                      style={neutro ? { background: "rgba(247,196,55,0.06)" } : undefined}
                    >
                      <td style={{ textTransform: "capitalize" }}>
                        {fmtDataCurta(d.data)}
                        {d.observacao && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#8a6a00",
                              background: "rgba(247,196,55,0.18)",
                              padding: "1px 5px",
                              borderRadius: 3
                            }}
                          >
                            {d.observacao}
                          </span>
                        )}
                      </td>
                      <td>{toHM(d.horasTrabalhadasMinutos)}</td>
                      <td>{neutro ? "—" : toHM(d.jornadaEsperadaMinutos)}</td>
                      <td
                        style={{
                          color: neutro
                            ? "var(--ink-500)"
                            : d.saldoDiaMinutos >= 0
                              ? "#2f7d4f"
                              : "#c8393f"
                        }}
                      >
                        {neutro ? "—" : toHM(d.saldoDiaMinutos)}
                      </td>
                      <td
                        style={{
                          color: d.saldoAcumuladoMinutos >= 0 ? "#2f7d4f" : "#c8393f",
                          fontWeight: 600
                        }}
                      >
                        {toHM(d.saldoAcumuladoMinutos)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(122,30,38,0.10)" }}>
                  <td
                    style={{
                      padding: "8px 14px",
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-500)"
                    }}
                  >
                    Total do mês
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    {toHM(totalTrabalhado)}
                  </td>
                  <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    {toHM(totalEsperado)}
                  </td>
                  <td
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: saldoMes >= 0 ? "#2f7d4f" : "#c8393f"
                    }}
                  >
                    {toHM(saldoMes)}
                  </td>
                  <td
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      color: saldoFinalMes >= 0 ? "#2f7d4f" : "#c8393f"
                    }}
                  >
                    {toHM(saldoFinalMes)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBancoHorasGeral({ token }: { token: string }) {
  const [itens, setItens] = useState<BancoHorasItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<BancoHorasFuncionarioDetalhe | null>(null);
  const [detalheLoading, setDetalheLoading] = useState(false);

  const limit = 30;

  const carregar = useCallback(
    async (pg = 1) => {
      setLoading(true);
      setErro(null);
      try {
        const params = new URLSearchParams({ page: String(pg), limit: String(limit) });
        if (busca) params.set("busca", busca);
        if (statusFiltro) params.set("status", statusFiltro);
        const data = await api.get<{ total: number; itens: BancoHorasItem[] }>(
          `/auditoria/banco-horas?${params}`,
          token
        );
        setItens(data?.itens ?? []);
        setTotal(data?.total ?? 0);
        setPage(pg);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token, busca, statusFiltro]
  );

  useEffect(() => {
    carregar(1);
  }, [carregar]);

  function exportar() {
    exportCSV(
      itens.map((i) => ({
        Funcionario: i.funcionario.nome,
        Matricula: i.funcionario.matricula,
        Gerencia: i.gerencia?.nome ?? "",
        CicloDesde: i.cicloInicio ? fmtDataCurta(i.cicloInicio) : "",
        ProximaZeragem: i.proximaZeragem ? fmtDataCurta(i.proximaZeragem) : "",
        SaldoAtual: i.saldoFormatado,
        Limite: toHM(i.limiteMinutos),
        Status: i.saldoAtualMinutos >= 0 ? "Positivo" : "Negativo",
        ExcedeLimite: i.excedeLimite ? "Sim" : "Não"
      })),
      "banco_horas.csv"
    );
  }

  async function toggleDetalhe(funcionarioId: string) {
    if (expandido === funcionarioId) {
      setExpandido(null);
      setDetalhe(null);
      return;
    }
    setExpandido(funcionarioId);
    setDetalhe(null);
    setDetalheLoading(true);
    try {
      const data = await api.get<BancoHorasFuncionarioDetalhe>(
        `/auditoria/funcionarios/${funcionarioId}/banco-horas`,
        token
      );
      setDetalhe(data);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setDetalheLoading(false);
    }
  }

  const COLS = "2fr 0.8fr 1fr 1fr 100px 90px 110px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FiltrosBox>
        <div style={{ flex: "1 1 200px" }}>
          <InputField
            label="Buscar"
            value={busca}
            onChange={setBusca}
            placeholder="Nome ou matrícula…"
          />
        </div>
        <SelectField
          label="Status"
          value={statusFiltro}
          onChange={setStatusFiltro}
          options={[
            { value: "", label: "Todos" },
            { value: "POSITIVO", label: "Positivo" },
            { value: "NEGATIVO", label: "Negativo" },
            { value: "EXCEDIDO", label: "Excedido" }
          ]}
        />
        <BtnBuscar onClick={() => carregar(1)} />
        <BtnCSV onClick={exportar} />
      </FiltrosBox>

      {erro && <ErroBox msg={erro} />}

      <CardTabela>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            padding: "10px 16px",
            background: "var(--cream-50)",
            borderBottom: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          {[
            "Funcionário",
            "Gerência",
            "Ciclo desde",
            "Próx. Zeragem",
            "Saldo Atual",
            "Limite",
            ""
          ].map((c) => (
            <span
              key={c}
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--ink-500)"
              }}
            >
              {c}
            </span>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : itens.length === 0 ? (
          <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
            Nenhum funcionário encontrado.
          </p>
        ) : (
          itens.map((i) => (
            <React.Fragment key={i.funcionario.id}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS,
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(122,30,38,0.04)",
                  alignItems: "center"
                }}
              >
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
                    {i.funcionario.nome}
                  </p>
                  <p
                    style={{
                      fontSize: 10.5,
                      color: "var(--ink-400)",
                      margin: 0,
                      fontFamily: "var(--font-mono)"
                    }}
                  >
                    {i.funcionario.matricula}
                  </p>
                </div>
                <span style={{ fontSize: 11, color: "var(--ink-600)" }}>
                  {i.gerencia?.nome ?? "—"}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-600)" }}>
                  {i.cicloInicio ? fmtDataCurta(i.cicloInicio) : "—"}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-600)" }}>
                  {i.proximaZeragem ? fmtDataCurta(i.proximaZeragem) : "—"}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: i.saldoAtualMinutos >= 0 ? "#2f7d4f" : "#c8393f"
                  }}
                >
                  {i.saldoFormatado}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-600)" }}>
                  {toHM(i.limiteMinutos)}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {i.excedeLimite && (
                    <Badge label="Excede" bg="rgba(247,196,55,0.15)" color="#8a6a00" />
                  )}
                  <button
                    onClick={() => toggleDetalhe(i.funcionario.id)}
                    style={{
                      padding: "4px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(122,30,38,0.20)",
                      background: "transparent",
                      color: "var(--burgundy-600)",
                      cursor: "pointer",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {expandido === i.funcionario.id ? "Ocultar" : "Ver dias"}
                  </button>
                </div>
              </div>
              {expandido === i.funcionario.id && (
                <div style={{ padding: "8px 16px 16px", background: "var(--cream-50)" }}>
                  {detalheLoading ? (
                    <Loading />
                  ) : detalhe ? (
                    <BancoHorasDiasTabela dados={detalhe} />
                  ) : null}
                </div>
              )}
            </React.Fragment>
          ))
        )}

        <Pagination page={page} total={total} limit={limit} onChange={(p) => carregar(p)} />
      </CardTabela>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ABA PERÍODOS
═══════════════════════════════════════════════ */

function TabPeriodos({ token }: { token: string }) {
  const [subTab, setSubTab] = useState<"saldo" | "fechamento">("saldo");
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [statusFiltro, setStatusFiltro] = useState("");
  const [modalPeriodo, setModalPeriodo] = useState<{
    p: Periodo;
    acao: "FECHADO" | "APROVADO";
  } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const limit = 30;

  const carregar = useCallback(
    async (pg = 1) => {
      setLoading(true);
      setErro(null);
      try {
        const params = new URLSearchParams({ page: String(pg), limit: String(limit) });
        if (mes) params.set("mes", mes);
        if (ano) params.set("ano", ano);
        if (statusFiltro) params.set("status", statusFiltro);
        const data = await api.get<{ total: number; periodos: Periodo[] }>(
          `/auditoria/periodos?${params}`,
          token
        );
        setPeriodos(data?.periodos ?? []);
        setTotal(data?.total ?? 0);
        setPage(pg);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token, mes, ano, statusFiltro]
  );

  useEffect(() => {
    if (subTab === "fechamento") carregar(1);
  }, [carregar, subTab]);

  async function confirmarStatus() {
    if (!modalPeriodo) return;
    setSalvando(true);
    try {
      await api.put(
        `/auditoria/periodos/${modalPeriodo.p.id}/status`,
        { status: modalPeriodo.acao },
        token
      );
      setModalPeriodo(null);
      carregar(page);
    } finally {
      setSalvando(false);
    }
  }

  function exportar() {
    exportCSV(
      periodos.map((p) => ({
        Funcionario: p.funcionario.user.name,
        Matricula: p.funcionario.matricula,
        Gerencia: p.funcionario.gerencia?.nome ?? "",
        Mes: p.mes,
        Ano: p.ano,
        DiasTrabalhados: p.diasTrabalhados,
        HorasTrabalhadas: p.horasTrabalhadasFormatado,
        HorasExtras: p.horasExtrasFormatado,
        HorasFalta: p.horasFaltaFormatado,
        Status: p.status,
        FechadoEm: p.fechadoEm ? fmtDate(p.fechadoEm) : "",
        AprovadoPor: p.aprovadoPor ?? ""
      })),
      `periodos_${mes}_${ano}.csv`
    );
  }

  const anos = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Sub-abas */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid rgba(122,30,38,0.08)" }}>
        {(
          [
            { id: "saldo", label: "Saldo (Banco de Horas)" },
            { id: "fechamento", label: "Fechamento de Períodos" }
          ] as const
        ).map((a) => (
          <button
            key={a.id}
            onClick={() => setSubTab(a.id)}
            style={{
              padding: "7px 16px",
              borderRadius: "var(--radius-md) var(--radius-md) 0 0",
              border: "none",
              background: subTab === a.id ? "var(--burgundy-600)" : "transparent",
              color: subTab === a.id ? "#fff" : "var(--ink-500)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {subTab === "saldo" ? (
        <TabBancoHorasGeral token={token} />
      ) : (
        <>
          <FiltrosBox>
            <SelectField
              label="Mês"
              value={mes}
              onChange={setMes}
              options={[
                { value: "", label: "Todos" },
                ...MESES.map((m, i) => ({ value: String(i + 1), label: m }))
              ]}
            />
            <SelectField
              label="Ano"
              value={ano}
              onChange={setAno}
              options={[
                { value: "", label: "Todos" },
                ...anos.map((a) => ({ value: a, label: a }))
              ]}
            />
            <SelectField
              label="Status"
              value={statusFiltro}
              onChange={setStatusFiltro}
              options={[
                { value: "", label: "Todos" },
                { value: "ABERTO", label: "Aberto" },
                { value: "FECHADO", label: "Fechado" },
                { value: "APROVADO", label: "Aprovado" }
              ]}
            />
            <BtnBuscar onClick={() => carregar(1)} />
            <BtnCSV onClick={exportar} />
          </FiltrosBox>

          {erro && <ErroBox msg={erro} />}

          <CardTabela>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 80px 80px 80px 80px 100px 100px",
                padding: "10px 16px",
                background: "var(--cream-50)",
                borderBottom: "1px solid rgba(122,30,38,0.08)"
              }}
            >
              {[
                "Funcionário",
                "Gerência",
                "Dias",
                "Trabalhado",
                "Extras",
                "Falta",
                "Status",
                ""
              ].map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--ink-500)"
                  }}
                >
                  {c}
                </span>
              ))}
            </div>

            {loading ? (
              <Loading />
            ) : periodos.length === 0 ? (
              <p
                style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}
              >
                Nenhum período encontrado.
              </p>
            ) : (
              periodos.map((p) => {
                const sb = statusPeriodoBadge(p.status);
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 80px 80px 80px 80px 100px 100px",
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(122,30,38,0.04)",
                      alignItems: "center"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <FuncAvatar
                        name={p.funcionario.user.name}
                        fotoUrl={p.funcionario.fotoPerfilUrl}
                        size={30}
                      />
                      <div>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--ink-900)",
                            margin: 0
                          }}
                        >
                          {p.funcionario.user.name}
                        </p>
                        <p
                          style={{
                            fontSize: 10.5,
                            color: "var(--ink-400)",
                            margin: 0,
                            fontFamily: "var(--font-mono)"
                          }}
                        >
                          {p.funcionario.matricula}
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--ink-600)" }}>
                      {p.funcionario.gerencia?.nome ?? "—"}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{p.diasTrabalhados}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-900)" }}>
                      {p.horasTrabalhadasFormatado}
                    </span>
                    <span style={{ fontSize: 12, color: "#2f7d4f", fontWeight: 600 }}>
                      {p.horasExtrasFormatado}
                    </span>
                    <span style={{ fontSize: 12, color: "#c8393f", fontWeight: 600 }}>
                      {p.horasFaltaFormatado}
                    </span>
                    <Badge label={sb.label} bg={sb.bg} color={sb.color} />
                    <div style={{ display: "flex", gap: 4 }}>
                      {p.status === "ABERTO" && (
                        <button
                          onClick={() => setModalPeriodo({ p, acao: "FECHADO" })}
                          style={{
                            padding: "4px 8px",
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid rgba(122,30,38,0.20)",
                            background: "transparent",
                            color: "var(--burgundy-600)",
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                          }}
                        >
                          Fechar
                        </button>
                      )}
                      {p.status === "FECHADO" && (
                        <button
                          onClick={() => setModalPeriodo({ p, acao: "APROVADO" })}
                          style={{
                            padding: "4px 8px",
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: "var(--radius-sm)",
                            border: "none",
                            background: "rgba(47,125,79,0.12)",
                            color: "#2f7d4f",
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                          }}
                        >
                          Aprovar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <Pagination page={page} total={total} limit={limit} onChange={(p) => carregar(p)} />
          </CardTabela>

          {/* Modal confirmação */}
          {modalPeriodo && (
            <Modal
              title={modalPeriodo.acao === "FECHADO" ? "Fechar período" : "Aprovar período"}
              subtitle={`${MESES[modalPeriodo.p.mes - 1]}/${modalPeriodo.p.ano} · ${modalPeriodo.p.funcionario.user.name}`}
              onClose={() => setModalPeriodo(null)}
            >
              <p
                style={{ fontSize: 13, color: "var(--ink-600)", marginBottom: 20, lineHeight: 1.6 }}
              >
                {modalPeriodo.acao === "FECHADO"
                  ? "Fechar este período impedirá novos registros de ponto para o mês. Confirma?"
                  : "Aprovar o período confirma as horas trabalhadas para folha de pagamento. Confirma?"}
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setModalPeriodo(null)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.15)",
                    background: "transparent",
                    color: "var(--ink-500)",
                    fontSize: 13,
                    cursor: "pointer"
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={confirmarStatus}
                  disabled={salvando}
                  style={{ padding: "9px 20px", fontSize: 13, opacity: salvando ? 0.7 : 1 }}
                >
                  {salvando ? "Salvando…" : "Confirmar"}
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ABA LOGS
═══════════════════════════════════════════════ */

/* Configuração visual dos métodos HTTP */
const METHOD_CFG: Record<string, { bg: string; color: string }> = {
  GET: { bg: "rgba(107,114,128,0.10)", color: "#4b5563" },
  POST: { bg: "rgba(47,125,79,0.12)", color: "#2f7d4f" },
  PUT: { bg: "rgba(37,99,235,0.12)", color: "#2563eb" },
  PATCH: { bg: "rgba(198,127,0,0.12)", color: "#c67f00" },
  DELETE: { bg: "rgba(200,57,63,0.10)", color: "#c8393f" }
};

function statusBadge(code: number | null) {
  if (code == null) return null;
  const ok = code < 400;
  const warn = code >= 400 && code < 500;
  const bg = ok ? "rgba(47,125,79,0.10)" : warn ? "rgba(198,127,0,0.12)" : "rgba(200,57,63,0.10)";
  const clr = ok ? "#2f7d4f" : warn ? "#c67f00" : "#c8393f";
  return { bg, color: clr, label: String(code) };
}

function MethodBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const c = METHOD_CFG[method] ?? { bg: "rgba(107,114,128,0.10)", color: "#4b5563" };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.06em",
        color: c.color,
        background: c.bg,
        padding: "2px 6px",
        borderRadius: "var(--radius-sm)",
        whiteSpace: "nowrap",
        fontFamily: "var(--font-mono)"
      }}
    >
      {method}
    </span>
  );
}

function TabLogs({ token }: { token: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [metodoFiltro, setMetodoFiltro] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(hoje.toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(hoje.toISOString().slice(0, 10));

  const limit = 50;

  const carregar = useCallback(
    async (p = 1) => {
      setLoading(true);
      setErro(null);
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(limit) });
        if (busca) params.set("action", busca);
        if (dataInicio) params.set("dataInicio", dataInicio);
        if (dataFim) params.set("dataFim", dataFim);
        const data = await api.get<{ total: number; logs: AuditLog[] }>(
          `/auditoria/logs?${params}`,
          token
        );
        const lista = data?.logs ?? [];
        const filtrados = metodoFiltro ? lista.filter((l) => l.method === metodoFiltro) : lista;
        setLogs(filtrados);
        setTotal(data?.total ?? 0);
        setPage(p);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [token, busca, dataInicio, dataFim, metodoFiltro]
  );

  useEffect(() => {
    carregar(1);
  }, [carregar]);

  function exportar() {
    exportCSV(
      logs.map((l) => {
        const info = getEndpointInfo(l.action);
        return {
          Data: fmtDateTime(l.createdAt),
          Metodo: l.method ?? "",
          Endpoint: l.path ?? l.action,
          Categoria: info?.categoria ?? "",
          Descricao: info?.desc ?? "",
          Status: l.statusCode ?? "",
          DuracaoMs: l.durationMs ?? "",
          NomeUsuario: l.nomeUsuario ?? "",
          Login: l.username ?? l.actorUserId ?? "sistema",
          Email: l.emailUsuario ?? "",
          IP: l.ipAddress ?? "",
          UserAgent: l.userAgent ?? ""
        };
      }),
      `logs_${dataInicio}_${dataFim}.csv`
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filtros */}
      <FiltrosBox>
        <InputField
          label="Endpoint / ação"
          value={busca}
          onChange={setBusca}
          placeholder="ex: /ponto, /auditoria…"
        />
        <SelectField
          label="Método"
          value={metodoFiltro}
          onChange={setMetodoFiltro}
          options={[
            { value: "", label: "Todos" },
            { value: "GET", label: "GET" },
            { value: "POST", label: "POST" },
            { value: "PUT", label: "PUT" },
            { value: "PATCH", label: "PATCH" },
            { value: "DELETE", label: "DELETE" }
          ]}
        />
        <InputField label="Data início" type="date" value={dataInicio} onChange={setDataInicio} />
        <InputField label="Data fim" type="date" value={dataFim} onChange={setDataFim} />
        <BtnBuscar onClick={() => carregar(1)} />
        <BtnCSV onClick={exportar} />
      </FiltrosBox>

      {erro && <ErroBox msg={erro} />}

      <CardTabela>
        {/* Cabeçalho da tabela */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 50px 1fr 160px 70px 70px 130px",
            padding: "9px 16px",
            background: "var(--cream-50)",
            borderBottom: "1px solid rgba(122,30,38,0.08)",
            gap: 8
          }}
        >
          {[
            "Método",
            "Status",
            "Endpoint / Descrição",
            "Usuário",
            "Duração",
            "IP",
            "Data/Hora"
          ].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                color: "var(--ink-500)"
              }}
            >
              {h}
            </span>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : logs.length === 0 ? (
          <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
            Nenhum log encontrado para o período.
          </p>
        ) : (
          logs.map((l) => {
            const sb = statusBadge(l.statusCode);
            const isOpen = expandido === l.id;
            const payloadStr = l.payload ? JSON.stringify(l.payload, null, 2) : null;
            const endpointInfo = getEndpointInfo(l.action);
            const catCor = endpointInfo
              ? (CATEGORIA_COR[endpointInfo.categoria] ?? CATEGORIA_COR["Autenticação"])
              : null;

            return (
              <div key={l.id} style={{ borderBottom: "1px solid rgba(122,30,38,0.04)" }}>
                {/* Linha principal */}
                <button
                  onClick={() => setExpandido(isOpen ? null : l.id)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "80px 50px 1fr 160px 70px 70px 130px",
                    padding: "10px 16px",
                    background: isOpen ? "rgba(122,30,38,0.025)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    gap: 8,
                    alignItems: "center",
                    transition: "background 120ms"
                  }}
                >
                  {/* Método */}
                  <MethodBadge method={l.method} />

                  {/* Status */}
                  {sb ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: sb.color,
                        background: sb.bg,
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        textAlign: "center",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      {sb.label}
                    </span>
                  ) : (
                    <span />
                  )}

                  {/* Endpoint + descrição */}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--ink-700)",
                          fontFamily: "var(--font-mono)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 260
                        }}
                      >
                        {l.path ?? l.action}
                      </span>
                      {catCor && endpointInfo && (
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            color: catCor.color,
                            background: catCor.bg,
                            padding: "1px 6px",
                            borderRadius: "var(--radius-full)",
                            whiteSpace: "nowrap",
                            letterSpacing: "0.04em"
                          }}
                        >
                          {endpointInfo.categoria}
                        </span>
                      )}
                    </div>
                    {endpointInfo && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "var(--ink-500)",
                          margin: "2px 0 0",
                          lineHeight: 1.3,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {endpointInfo.desc}
                      </p>
                    )}
                  </div>

                  {/* Usuário — nome + login */}
                  <div style={{ minWidth: 0 }}>
                    {l.nomeUsuario ? (
                      <>
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--ink-800)",
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {l.nomeUsuario}
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: "var(--ink-400)",
                            margin: 0,
                            fontFamily: "var(--font-mono)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {l.username ?? l.actorUserId ?? ""}
                        </p>
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: l.username ? "var(--ink-600)" : "var(--ink-300)",
                          fontStyle: l.username ? "normal" : "italic",
                          fontFamily: l.username ? "var(--font-mono)" : "var(--font-body)"
                        }}
                      >
                        {l.username ?? "anônimo"}
                      </span>
                    )}
                  </div>

                  {/* Duração */}
                  {l.durationMs != null ? (
                    <span
                      style={{
                        fontSize: 11,
                        color:
                          l.durationMs > 3000
                            ? "#c8393f"
                            : l.durationMs > 1000
                              ? "#c67f00"
                              : "var(--ink-500)",
                        fontFamily: "var(--font-mono)",
                        textAlign: "right"
                      }}
                    >
                      {l.durationMs}ms
                    </span>
                  ) : (
                    <span />
                  )}

                  {/* IP */}
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--ink-400)",
                      fontFamily: "var(--font-mono)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {l.ipAddress ?? "—"}
                  </span>

                  {/* Data */}
                  <span style={{ fontSize: 10.5, color: "var(--ink-400)", whiteSpace: "nowrap" }}>
                    {fmtDateTime(l.createdAt)}
                  </span>
                </button>

                {/* Linha expandida — payload */}
                {isOpen && (
                  <div
                    style={{
                      padding: "10px 16px 14px 16px",
                      background: "rgba(122,30,38,0.02)",
                      borderTop: "1px solid rgba(122,30,38,0.05)",
                      display: "flex",
                      gap: 24,
                      flexWrap: "wrap"
                    }}
                  >
                    {/* User agent */}
                    {l.userAgent && (
                      <div style={{ minWidth: 200, flex: 1 }}>
                        <p
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--ink-400)",
                            textTransform: "uppercase",
                            letterSpacing: "0.10em",
                            margin: "0 0 4px"
                          }}
                        >
                          User-Agent
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: "var(--ink-500)",
                            margin: 0,
                            wordBreak: "break-all"
                          }}
                        >
                          {l.userAgent}
                        </p>
                      </div>
                    )}

                    {/* Payload */}
                    {payloadStr && (
                      <div style={{ flex: 2, minWidth: 280 }}>
                        <p
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--ink-400)",
                            textTransform: "uppercase",
                            letterSpacing: "0.10em",
                            margin: "0 0 4px"
                          }}
                        >
                          Payload
                        </p>
                        <pre
                          style={{
                            fontSize: 10.5,
                            color: "var(--ink-700)",
                            background: "rgba(122,30,38,0.04)",
                            padding: "8px 10px",
                            borderRadius: "var(--radius-md)",
                            margin: 0,
                            overflowX: "auto",
                            maxHeight: 180,
                            overflowY: "auto",
                            fontFamily: "var(--font-mono)",
                            lineHeight: 1.6
                          }}
                        >
                          {payloadStr}
                        </pre>
                      </div>
                    )}

                    {!payloadStr && !l.userAgent && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--ink-400)",
                          fontStyle: "italic",
                          margin: 0
                        }}
                      >
                        Sem payload registrado.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <Pagination page={page} total={total} limit={limit} onChange={(p) => carregar(p)} />
      </CardTabela>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   HELPERS DE LAYOUT
═══════════════════════════════════════════════ */

function Loading() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--ink-400)", fontSize: 13 }}>
      Carregando…
    </div>
  );
}

function ErroBox({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "rgba(200,57,63,0.07)",
        border: "1px solid rgba(200,57,63,0.20)",
        borderRadius: "var(--radius-md)",
        fontSize: 13,
        color: "var(--red)",
        display: "flex",
        gap: 8,
        alignItems: "flex-start"
      }}
    >
      <AlertCircleIcon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{msg}</span>
    </div>
  );
}

function FiltrosBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "flex-end"
      }}
    >
      {children}
    </div>
  );
}

function CardTabela({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        overflow: "hidden"
      }}
    >
      {children}
    </div>
  );
}

function BtnBuscar({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn btn-primary"
      onClick={onClick}
      style={{
        padding: "7px 16px",
        fontSize: 12,
        alignSelf: "flex-end",
        display: "flex",
        alignItems: "center",
        gap: 6
      }}
    >
      <SearchIcon size={13} /> Buscar
    </button>
  );
}

function BtnCSV({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        fontSize: 12,
        alignSelf: "flex-end",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(122,30,38,0.20)",
        background: "transparent",
        color: "var(--burgundy-600)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6
      }}
    >
      <DownloadIcon size={13} /> CSV
    </button>
  );
}

/* ═══════════════════════════════════════════════
   TAB VALIDAÇÕES
═══════════════════════════════════════════════ */

type StatusAssinatura = "PENDENTE_FUNCIONARIO" | "PENDENTE_GESTOR" | "CONCLUIDA" | "DISPENSADA";

interface AssinaturaRH {
  id: string;
  status: StatusAssinatura;
  bancoHorasSaldoTotalMinutos: number;
  assinadoFuncionarioEm: string | null;
  assinadoFuncionarioIp: string | null;
  assinadoGestorEm: string | null;
  assinadoGestorIp: string | null;
  assinadoGestorNome: string | null;
  criadoEm: string;
  periodo: {
    mes: number;
    ano: number;
    funcionario: {
      id: string;
      matricula: string | null;
      user: { name: string };
      gerencia: { nome: string; sigla: string } | null;
    };
  };
}

interface ResultadoCodigoAssinatura {
  tipo: "QUADRO_MENSAL" | "CIENCIA_ATESTADO";
  papel: "FUNCIONARIO" | "GESTOR" | "CIENCIA_GESTOR";
  codigo: string;
  id: string;
  funcionarioNome: string;
  matricula: string | null;
  gerenciaNome: string | null;
  assinadoEm: string | null;
  signatarioNome: string | null;
  periodo?: { mes: number; ano: number };
  status?: string;
  documentoUrl?: string | null;
}

const PAPEL_CODIGO_LABEL: Record<ResultadoCodigoAssinatura["papel"], string> = {
  FUNCIONARIO: "Assinatura do funcionário (quadro mensal)",
  GESTOR: "Assinatura do gestor (quadro mensal)",
  CIENCIA_GESTOR: "Ciência do gestor (atestado)"
};

function fmtBH(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}m`;
}

const STATUS_ASSIN_LABEL: Record<StatusAssinatura, { label: string; cls: string }> = {
  PENDENTE_FUNCIONARIO: { label: "Aguard. func.", cls: "badge-amber" },
  PENDENTE_GESTOR: { label: "Aguard. gest.", cls: "badge-blue" },
  CONCLUIDA: { label: "Concluída", cls: "badge-green" },
  DISPENSADA: { label: "Dispensada", cls: "badge-gray" }
};

const TH_VALID = {
  fontSize: 9.5,
  padding: "8px 6px",
  whiteSpace: "normal" as const,
  lineHeight: 1.25,
  letterSpacing: "0.04em"
};

const TD_VALID = {
  padding: "8px 6px",
  fontSize: 11.5,
  verticalAlign: "middle" as const
};

const TD_ELLIPSIS = {
  ...TD_VALID,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
  maxWidth: 0
};

function TabValidacoes({ token }: { token: string }) {
  const agora = new Date();
  const [gerencias, setGerencias] = useState<{ id: string; nome: string; sigla: string }[]>([]);
  const [assinaturas, setAssinaturas] = useState<AssinaturaRH[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [loading, setLoading] = useState(true);
  const [gerenciaId, setGerenciaId] = useState("");
  const [mes, setMes] = useState(agora.getMonth() === 0 ? 12 : agora.getMonth());
  const [ano, setAno] = useState(
    agora.getMonth() === 0 ? agora.getFullYear() - 1 : agora.getFullYear()
  );
  const [status, setStatus] = useState("");
  const [codigoInput, setCodigoInput] = useState("");
  const [codigoBusca, setCodigoBusca] = useState("");
  const [resultadosCodigo, setResultadosCodigo] = useState<ResultadoCodigoAssinatura[] | null>(
    null
  );
  const [erroCodigo, setErroCodigo] = useState("");
  const [gerandoMes, setGerandoMes] = useState(false);
  const [msgGerar, setMsgGerar] = useState("");

  const buscandoPorCodigo = codigoBusca.trim().length > 0;

  const carregar = useCallback(() => {
    if (buscandoPorCodigo) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (gerenciaId) p.set("gerenciaId", gerenciaId);
    if (mes) p.set("mes", String(mes));
    if (ano) p.set("ano", String(ano));
    if (status) p.set("status", status);
    p.set("page", String(page));
    p.set("limit", String(limit));
    api
      .get<{ total: number; assinaturas: AssinaturaRH[] }>(`/auditoria/assinaturas?${p}`, token)
      .then((d) => {
        setAssinaturas(d?.assinaturas ?? []);
        setTotal(d?.total ?? 0);
      })
      .catch(() => setAssinaturas([]))
      .finally(() => setLoading(false));
  }, [token, gerenciaId, mes, ano, status, page, buscandoPorCodigo]);

  const buscarPorCodigo = useCallback(
    (codigo: string) => {
      const c = codigo.trim();
      if (!c) {
        setCodigoBusca("");
        setResultadosCodigo(null);
        setErroCodigo("");
        return;
      }
      setLoading(true);
      setErroCodigo("");
      setCodigoBusca(c);
      api
        .get<{ total: number; encontrados: ResultadoCodigoAssinatura[] }>(
          `/auditoria/assinaturas/verificar?codigo=${encodeURIComponent(c)}`,
          token
        )
        .then((d) => {
          setResultadosCodigo(d?.encontrados ?? []);
        })
        .catch((e: unknown) => {
          setResultadosCodigo([]);
          setErroCodigo((e as Error)?.message ?? "Erro ao buscar código.");
        })
        .finally(() => setLoading(false));
    },
    [token]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    api
      .get<{ id: string; nome: string; sigla: string }[]>("/ponto/gestao/gerencias", token)
      .then(setGerencias)
      .catch(() => setGerencias([]));
  }, [token]);

  async function gerarSolicitacoes() {
    setGerandoMes(true);
    setMsgGerar("");
    try {
      const r = await api.post<{ criadas: number; ignoradas: number }>(
        "/auditoria/assinaturas/gerar-mes",
        { mes, ano },
        token
      );
      setMsgGerar(`${r.criadas} assinaturas criadas, ${r.ignoradas} já existiam.`);
      carregar();
    } catch (e) {
      setMsgGerar("Erro: " + ((e as Error).message ?? "desconhecido"));
    } finally {
      setGerandoMes(false);
    }
  }

  function baixarPdf(id: string, matricula: string, m: number, a: number) {
    const filename = `quadro-${matricula}-${String(m).padStart(2, "0")}-${a}.pdf`;
    api
      .download(`/auditoria/assinaturas/${id}/pdf`, filename, token)
      .catch((e: unknown) =>
        alert("Erro ao baixar PDF: " + ((e as Error)?.message ?? "desconhecido"))
      );
  }

  function limparBuscaCodigo() {
    setCodigoInput("");
    setCodigoBusca("");
    setResultadosCodigo(null);
    setErroCodigo("");
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Busca por código da assinatura digital */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "flex-end",
          padding: "12px 14px",
          background: "rgba(122,30,38,0.04)",
          border: "1px solid rgba(122,30,38,0.12)",
          borderRadius: "var(--radius-md)"
        }}
      >
        <div style={{ flex: "1 1 280px", minWidth: 220 }}>
          <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 4 }}>
            Código da assinatura digital
          </p>
          <input
            type="text"
            value={codigoInput}
            onChange={(e) => setCodigoInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") buscarPorCodigo(codigoInput);
            }}
            placeholder="Cole o SHA-256 do PDF (quadro mensal ou ciência de atestado)"
            style={{
              width: "100%",
              padding: "7px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              boxSizing: "border-box"
            }}
          />
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => buscarPorCodigo(codigoInput)}
          style={{ gap: 5 }}
        >
          <SearchIcon size={13} /> Buscar código
        </button>
        {buscandoPorCodigo && (
          <button className="btn btn-ghost btn-sm" onClick={limparBuscaCodigo} style={{ gap: 5 }}>
            Limpar
          </button>
        )}
      </div>

      {/* Filtros da listagem mensal */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "flex-end",
          opacity: buscandoPorCodigo ? 0.45 : 1,
          pointerEvents: buscandoPorCodigo ? "none" : "auto"
        }}
      >
        <div>
          <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 4 }}>Mês</p>
          <select
            value={mes}
            onChange={(e) => {
              setMes(Number(e.target.value));
              setPage(1);
            }}
            style={{
              padding: "7px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: "var(--radius-md)",
              fontSize: 13
            }}
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 4 }}>Ano</p>
          <select
            value={ano}
            onChange={(e) => {
              setAno(Number(e.target.value));
              setPage(1);
            }}
            style={{
              padding: "7px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: "var(--radius-md)",
              fontSize: 13
            }}
          >
            {[agora.getFullYear() - 1, agora.getFullYear()].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 4 }}>Departamento</p>
          <select
            value={gerenciaId}
            onChange={(e) => {
              setGerenciaId(e.target.value);
              setPage(1);
            }}
            style={{
              padding: "7px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: "var(--radius-md)",
              fontSize: 13
            }}
          >
            <option value="">Todos</option>
            {gerencias.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 4 }}>Status</p>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            style={{
              padding: "7px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: "var(--radius-md)",
              fontSize: 13
            }}
          >
            <option value="">Todos</option>
            <option value="PENDENTE_FUNCIONARIO">Aguardando funcionário</option>
            <option value="PENDENTE_GESTOR">Aguardando gestor</option>
            <option value="CONCLUIDA">Concluídas</option>
          </select>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={carregar} style={{ gap: 5 }}>
            <RefreshCwIcon size={13} /> Atualizar
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={gerarSolicitacoes}
            disabled={gerandoMes}
            style={{
              gap: 5,
              background: "var(--burgundy-700)",
              borderColor: "var(--burgundy-700)"
            }}
          >
            <Edit2Icon size={13} />
            {gerandoMes ? "Gerando…" : `Gerar Assinaturas ${String(mes).padStart(2, "0")}/${ano}`}
          </button>
        </div>
      </div>

      {msgGerar && (
        <div
          style={{
            background: msgGerar.startsWith("Erro") ? "#fee2e2" : "#d1fae5",
            color: msgGerar.startsWith("Erro") ? "#7a1e26" : "#065f46",
            border: `1px solid ${msgGerar.startsWith("Erro") ? "#fca5a5" : "#6ee7b7"}`,
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13
          }}
        >
          {msgGerar}
        </div>
      )}

      {erroCodigo && (
        <div
          style={{
            background: "#fee2e2",
            color: "#7a1e26",
            border: "1px solid #fca5a5",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13
          }}
        >
          {erroCodigo}
        </div>
      )}

      {/* Resultados da busca por código */}
      {buscandoPorCodigo ? (
        loading ? (
          <p style={{ textAlign: "center", padding: 40, color: "var(--ink-400)" }}>
            Verificando código…
          </p>
        ) : !resultadosCodigo?.length ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--ink-400)" }}>
            <p style={{ fontSize: 14 }}>Nenhuma assinatura encontrada para este código.</p>
            <p style={{ fontSize: 12, marginTop: 6 }}>
              Confira se o código foi copiado corretamente do PDF (quadro mensal ou selo de ciência
              do atestado).
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--ink-600)", margin: 0 }}>
              {resultadosCodigo.length} resultado
              {resultadosCodigo.length !== 1 ? "s" : ""} para o código informado
            </p>
            {resultadosCodigo.map((r) => (
              <div
                key={`${r.tipo}-${r.id}-${r.papel}`}
                className="card-flat"
                style={{
                  padding: "14px 16px",
                  borderLeft: `3px solid ${r.tipo === "CIENCIA_ATESTADO" ? "#7c3aed" : "var(--burgundy-600)"}`
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-start"
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--ink-400)"
                      }}
                    >
                      {PAPEL_CODIGO_LABEL[r.papel]}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 600 }}>
                      {r.funcionarioNome}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-500)" }}>
                      Matr. {r.matricula ?? "—"}
                      {r.gerenciaNome ? ` · ${r.gerenciaNome}` : ""}
                      {r.periodo
                        ? ` · ${String(r.periodo.mes).padStart(2, "0")}/${r.periodo.ano}`
                        : ""}
                      {r.status ? ` · ${r.status}` : ""}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-500)" }}>
                      Signatário: {r.signatarioNome ?? "—"}
                      {r.assinadoEm ? ` · ${new Date(r.assinadoEm).toLocaleString("pt-BR")}` : ""}
                    </p>
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                        letterSpacing: "0.04em"
                      }}
                    >
                      {r.codigo}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {r.tipo === "QUADRO_MENSAL" && r.periodo && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Baixar PDF do quadro"
                        onClick={() =>
                          baixarPdf(r.id, r.matricula ?? r.id, r.periodo!.mes, r.periodo!.ano)
                        }
                        style={{ gap: 5 }}
                      >
                        <DownloadIcon size={14} /> PDF
                      </button>
                    )}
                    {r.tipo === "CIENCIA_ATESTADO" && r.documentoUrl && (
                      <LinkDocumentoAnexado
                        href={r.documentoUrl}
                        label="Ver documento — Atestado"
                        variant="funcionario"
                        style={{ marginTop: 0, fontSize: 12.5, padding: "6px 12px" }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <p style={{ textAlign: "center", padding: 40, color: "var(--ink-400)" }}>
          Carregando validações…
        </p>
      ) : assinaturas.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ink-400)" }}>
          <p style={{ fontSize: 14 }}>
            Nenhuma assinatura encontrada para os filtros selecionados.
          </p>
          <p style={{ fontSize: 12, marginTop: 6 }}>
            Use o botão "Gerar Assinaturas" para criar solicitações para o mês selecionado.
          </p>
        </div>
      ) : (
        <div className="card-flat" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table-cfo" style={{ width: "100%", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "17%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={TH_VALID}>Funcionário</th>
                <th style={TH_VALID}>Matr.</th>
                <th style={TH_VALID}>Depto.</th>
                <th style={TH_VALID}>Mês</th>
                <th style={TH_VALID}>BH total</th>
                <th style={TH_VALID}>Assin. func.</th>
                <th style={TH_VALID}>Assin. gest.</th>
                <th style={TH_VALID}>Status</th>
                <th style={{ ...TH_VALID, textAlign: "center" }}>PDF</th>
              </tr>
            </thead>
            <tbody>
              {assinaturas.map((a) => {
                const sl = STATUS_ASSIN_LABEL[a.status];
                const nome = a.periodo.funcionario.user.name;
                const matricula = a.periodo.funcionario.matricula ?? "—";
                const depto = a.periodo.funcionario.gerencia?.nome ?? "—";
                const gestorTitulo = a.assinadoGestorEm
                  ? `${fmtDataAssinatura(a.assinadoGestorEm)}${a.assinadoGestorNome ? ` — ${a.assinadoGestorNome}` : ""}`
                  : "";
                return (
                  <tr key={a.id}>
                    <td style={{ ...TD_VALID, fontWeight: 600 }} title={nome}>
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {nome}
                      </span>
                    </td>
                    <td
                      style={{ ...TD_ELLIPSIS, fontFamily: "var(--font-mono)" }}
                      title={matricula}
                    >
                      {matricula}
                    </td>
                    <td style={TD_ELLIPSIS} title={depto}>
                      {depto}
                    </td>
                    <td
                      style={{ ...TD_VALID, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}
                    >
                      {String(a.periodo.mes).padStart(2, "0")}/{a.periodo.ano}
                    </td>
                    <td
                      style={{
                        ...TD_VALID,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        color: a.bancoHorasSaldoTotalMinutos >= 0 ? "#15803D" : "#B91C1C"
                      }}
                    >
                      {fmtBH(a.bancoHorasSaldoTotalMinutos)}
                    </td>
                    <td style={{ ...TD_VALID, whiteSpace: "nowrap" }}>
                      {a.assinadoFuncionarioEm ? (
                        <span
                          style={{ color: "#15803D" }}
                          title={new Date(a.assinadoFuncionarioEm).toLocaleString("pt-BR")}
                        >
                          ✓ {fmtDataAssinatura(a.assinadoFuncionarioEm)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-400)" }}>—</span>
                      )}
                    </td>
                    <td style={TD_VALID} title={gestorTitulo}>
                      {a.assinadoGestorEm ? (
                        <span
                          style={{
                            color: "#15803D",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          ✓ {fmtDataAssinatura(a.assinadoGestorEm)}
                          {a.assinadoGestorNome ? ` (${a.assinadoGestorNome})` : ""}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-400)" }}>—</span>
                      )}
                    </td>
                    <td style={TD_VALID}>
                      <span
                        className={`badge ${sl.cls}`}
                        style={{ fontSize: 10, padding: "2px 6px", whiteSpace: "nowrap" }}
                      >
                        {sl.label}
                      </span>
                    </td>
                    <td style={{ ...TD_VALID, textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Baixar PDF"
                        onClick={() =>
                          baixarPdf(
                            a.id,
                            a.periodo.funcionario.matricula ?? a.id,
                            a.periodo.mes,
                            a.periodo.ano
                          )
                        }
                        style={{ padding: "4px 6px", minWidth: 0 }}
                      >
                        <DownloadIcon size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {!buscandoPorCodigo && totalPages > 1 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 16,
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: "var(--ink-500)" }}>
            {page} / {totalPages}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Próxima →
          </button>
        </div>
      )}

      {!buscandoPorCodigo && (
        <p style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 12 }}>
          Total: {total} registro{total !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */

const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart2Icon size={14} /> },
  { id: "funcionarios", label: "Funcionários", icon: <UsersIcon size={14} /> },
  { id: "registros", label: "Registros", icon: <ClockIcon size={14} /> },
  { id: "solicitacoes", label: "Solicitações", icon: <InboxIcon size={14} /> },
  { id: "afastamentos", label: "Afastamentos", icon: <CalendarIcon size={14} /> },
  { id: "periodos", label: "Banco de Horas", icon: <TrendingUpIcon size={14} /> },
  { id: "logs", label: "Logs", icon: <ShieldCheckIcon size={14} /> },
  { id: "validacoes", label: "Validações", icon: <CheckCircleIcon size={14} /> }
];

export function AuditoriaPage() {
  const { user, token, hasRole } = useAuth();
  const [aba, setAba] = useState<Aba>("dashboard");
  const [funcionariosStatusPonto, setFuncionariosStatusPonto] = useState<
    "" | "presente" | "ausente"
  >("");

  const tk = token();
  const isRH =
    !!user?.isSuperAdmin ||
    hasRole("RH_AUDITORIA") ||
    hasRole("ponto-admin") ||
    hasRole("PONTO_ADMIN");

  const isPontoAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");

  const temAcesso = isRH || hasRole("gestor") || hasRole("GESTOR_APROVACAO");

  function abrirFuncionarios(statusPonto?: "presente" | "ausente") {
    setFuncionariosStatusPonto(statusPonto ?? "");
    setAba("funcionarios");
  }

  if (!temAcesso) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <ShieldCheckIcon
          size={40}
          style={{ color: "var(--burgundy-600)", margin: "0 auto 12px", display: "block" }}
        />
        <p style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-700)", margin: 0 }}>
          Acesso restrito
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6 }}>
          Esta área é exclusiva para auditores, gestores e administradores.
        </p>
      </div>
    );
  }

  if (!tk) {
    return <Loading />;
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          RH / Compliance
        </p>
        <h1
          style={{
            fontSize: "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            lineHeight: 1.1,
            margin: 0
          }}
        >
          Auditoria de <em>Frequência</em>
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4, marginBottom: 0 }}>
          Consulte registros, históricos, solicitações, afastamentos e períodos de todos os
          funcionários. Exporte qualquer dado em CSV.
        </p>
      </div>

      {/* Abas */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 20,
          borderBottom: "2px solid rgba(122,30,38,0.08)",
          overflowX: "auto",
          paddingBottom: 0
        }}
      >
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              if (a.id !== "funcionarios") setFuncionariosStatusPonto("");
              setAba(a.id);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--radius-md) var(--radius-md) 0 0",
              border: "none",
              background: aba === a.id ? "var(--burgundy-600)" : "transparent",
              color: aba === a.id ? "#fff" : "var(--ink-500)",
              fontWeight: 600,
              fontSize: 12.5,
              cursor: "pointer",
              transition: "all 150ms",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {aba === "dashboard" && <TabDashboard token={tk} onAbrirFuncionarios={abrirFuncionarios} />}
      {aba === "funcionarios" && (
        <TabFuncionarios
          key={`func-${funcionariosStatusPonto || "todos"}`}
          token={tk}
          initialStatusPonto={funcionariosStatusPonto}
          isSuperAdmin={!!user?.isSuperAdmin}
        />
      )}
      {aba === "registros" && <TabRegistros token={tk} />}
      {aba === "solicitacoes" && <TabSolicitacoes token={tk} isPontoAdmin={isPontoAdmin} />}
      {aba === "afastamentos" && <TabAfastamentos token={tk} />}
      {aba === "periodos" && <TabPeriodos token={tk} />}
      {aba === "logs" && <TabLogs token={tk} />}
      {aba === "validacoes" && <TabValidacoes token={tk} />}
    </div>
  );
}
