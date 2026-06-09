import React, { useState, useEffect, useCallback } from "react";
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
  ChevronDownIcon
} from "../../components/icons";
import { LogTimelineGestor, SolicitacaoResumo, textoResumo } from "./solicitacaoUi";

/* ═══════════════════════════════════════════════
   TIPOS
═══════════════════════════════════════════════ */

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
  } | null;
  ultimoRegistro: { tipo: string; dataHora: string; origem: string } | null;
  periodo: PeriodoRaw | null;
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
    user: { name: string; email: string };
    gerencia: { nome: string; sigla: string } | null;
  };
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
    user: { name: string; email: string };
    gerencia: { nome: string; sigla: string } | null;
  };
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
  | "logs";

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
    SAIDA: "Saída"
  };
  return map[tipo] ?? tipo;
}

function tipoPontoCor(tipo: string) {
  const map: Record<string, string> = {
    ENTRADA: "#2f7d4f",
    SAIDA: "#c8393f",
    INICIO_INTERVALO: "#c67f00",
    FIM_INTERVALO: "#2563eb"
  };
  return map[tipo] ?? "#6b7280";
}

function statusSolBadge(status: string) {
  if (status === "PENDENTE")
    return { bg: "rgba(198,127,0,0.12)", color: "#c67f00", label: "Aguardando Gestor" };
  if (status === "AGUARDANDO_RH")
    return { bg: "rgba(37,99,235,0.12)", color: "#2563eb", label: "Aguardando RH" };
  if (status === "APROVADA")
    return { bg: "rgba(47,125,79,0.12)", color: "#2f7d4f", label: "Aprovada pelo RH" };
  if (status === "REJEITADA_GESTOR")
    return { bg: "rgba(200,57,63,0.10)", color: "#c8393f", label: "Rejeitada pelo Gestor" };
  if (status === "REJEITADA_RH")
    return { bg: "rgba(200,57,63,0.10)", color: "#c8393f", label: "Rejeitada pelo RH" };
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

function StatCard({
  label,
  value,
  sub,
  color,
  icon
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0
      }}
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
      <span
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: color ?? "var(--ink-900)",
          lineHeight: 1,
          fontFamily: "var(--font-display)"
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}>{sub}</span>}
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
        whiteSpace: "nowrap"
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

function TabDashboard({ token }: { token: string }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<Dashboard>("/auditoria/dashboard", token)
      .then(setData)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  const carregarLogs = useCallback(
    async (page: number) => {
      setLogsLoading(true);
      try {
        const res = await api.get<{ total: number; logs: AuditLog[] }>(
          `/auditoria/logs?page=${page}&limit=${LOGS_LIMIT}`,
          token
        );
        setLogs(res?.logs ?? []);
        setLogsTotal(res?.total ?? 0);
        setLogsPage(page);
      } finally {
        setLogsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    carregarLogs(1);
  }, [carregarLogs]);

  if (loading) return <Loading />;
  if (erro) return <ErroBox msg={erro} />;
  if (!data) return null;

  const maxEntradas = Math.max(...data.registrosPorDia.map((d) => d.entradas), 1);

  const uc = data.usoCanal;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
        />
        <StatCard
          label="Trabalhando agora"
          value={data.trabalhando}
          sub="no expediente"
          color="#2f7d4f"
          icon={<ClockIcon size={16} />}
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
          {/* Cabeçalho do card */}
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

          {/* Total */}
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

          {/* Barra de proporção */}
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
              <div
                style={{
                  width: `${uc.pctMobile}%`,
                  background: "#7c3aed",
                  transition: "width 500ms"
                }}
              />
            )}
            {uc.pctDesktop > 0 && (
              <div
                style={{
                  width: `${uc.pctDesktop}%`,
                  background: "#2f7d4f",
                  transition: "width 500ms"
                }}
              />
            )}
          </div>

          {/* Legenda lado a lado */}
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "Mobile", value: uc.mobile, pct: uc.pctMobile, color: "#7c3aed" },
              { label: "Desktop", value: uc.desktop, pct: uc.pctDesktop, color: "#2f7d4f" }
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
                <span style={{ fontSize: 11, color: "var(--ink-600)", whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--ink-900)",
                    marginLeft: "auto",
                    whiteSpace: "nowrap"
                  }}
                >
                  {item.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico + origens */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        {/* Mini gráfico de barras — entradas/dia */}
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
              marginBottom: 16
            }}
          >
            Entradas nos últimos 7 dias
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              height: 80
            }}
          >
            {data.registrosPorDia.map((d) => {
              const pct = maxEntradas > 0 ? (d.entradas / maxEntradas) * 100 : 0;
              const dt = new Date(d.data + "T12:00:00");
              const dayName = dt.toLocaleDateString("pt-BR", { weekday: "short" });
              return (
                <div
                  key={d.data}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4
                  }}
                >
                  <span style={{ fontSize: 10, color: "var(--ink-600)", fontWeight: 600 }}>
                    {d.entradas}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(pct, 4)}%`,
                      background:
                        d.data === new Date().toISOString().slice(0, 10)
                          ? "var(--burgundy-600)"
                          : "var(--burgundy-200)",
                      borderRadius: "3px 3px 0 0",
                      transition: "height 300ms",
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

        {/* Origens dos registros de hoje */}
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
            Logs de auditoria
          </p>
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

function TabFuncionarios({ token }: { token: string }) {
  const [lista, setLista] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [selecionado, setSelecionado] = useState<Funcionario | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ mes, ano });
      if (busca) params.set("busca", busca);
      if (filtroAtivo !== "") params.set("ativo", filtroAtivo);
      const data = await api.get<Funcionario[]>(`/auditoria/funcionarios?${params}`, token);
      setLista(data ?? []);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, busca, filtroAtivo, mes, ano]);

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
        Status: f.ativo ? "Ativo" : "Inativo",
        HorasTrabalhadas: f.periodoFormatado?.horasTrabalhadas ?? "",
        HorasExtras: f.periodoFormatado?.horasExtras ?? "",
        HorasFalta: f.periodoFormatado?.horasFalta ?? "",
        PeriodoStatus: f.periodoFormatado?.status ?? "",
        SolicitacoesPendentes: f.solicitacoesPendentes
      })),
      `funcionarios_${mes}_${ano}.csv`
    );
  }

  if (selecionado) {
    return (
      <DetalhesFuncionario
        funcionario={selecionado}
        token={token}
        onBack={() => setSelecionado(null)}
      />
    );
  }

  const anos = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

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
          label="Status"
          value={filtroAtivo}
          onChange={setFiltroAtivo}
          options={[
            { value: "", label: "Todos" },
            { value: "true", label: "Ativos" },
            { value: "false", label: "Inativos" }
          ]}
        />
        <SelectField
          label="Mês"
          value={mes}
          onChange={setMes}
          options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
        />
        <SelectField
          label="Ano"
          value={ano}
          onChange={setAno}
          options={anos.map((a) => ({ value: a, label: a }))}
        />
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
            gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 80px",
            padding: "10px 16px",
            background: "var(--cream-50)",
            borderBottom: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          {[
            "Funcionário",
            "Cargo / Gerência",
            "Horas trab.",
            "Extras / Falta",
            "Sol. pend.",
            ""
          ].map((c) => (
            <span
              key={c}
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
            const sb = statusPeriodoBadge(f.periodoFormatado?.status ?? "ABERTO");
            return (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 80px",
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(122,30,38,0.04)",
                  alignItems: "center"
                }}
              >
                {/* Funcionário */}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
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
                {/* Cargo */}
                <div>
                  <p style={{ fontSize: 12, color: "var(--ink-700)", margin: 0 }}>{f.cargo}</p>
                  <p style={{ fontSize: 11, color: "var(--ink-400)", margin: "1px 0 0" }}>
                    {f.gerencia?.sigla ?? "—"}
                  </p>
                </div>
                {/* Horas trab. */}
                <div>
                  {f.periodoFormatado ? (
                    <>
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--ink-900)",
                          margin: 0
                        }}
                      >
                        {f.periodoFormatado.horasTrabalhadas}
                      </p>
                      <Badge label={sb.label} bg={sb.bg} color={sb.color} />
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--ink-400)", fontStyle: "italic" }}>
                      sem período
                    </span>
                  )}
                </div>
                {/* Extras / Falta */}
                <div>
                  {f.periodoFormatado ? (
                    <>
                      <p style={{ fontSize: 11, color: "#2f7d4f", margin: 0 }}>
                        +{f.periodoFormatado.horasExtras}
                      </p>
                      <p style={{ fontSize: 11, color: "#c8393f", margin: "1px 0 0" }}>
                        -{f.periodoFormatado.horasFalta}
                      </p>
                    </>
                  ) : (
                    <span>—</span>
                  )}
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
                    <span style={{ fontSize: 11, color: "var(--ink-400)" }}>—</span>
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
  onBack
}: {
  funcionario: Funcionario;
  token: string;
  onBack: () => void;
}) {
  const [subAba, setSubAba] = useState<"registros" | "periodos" | "solicitacoes" | "afastamentos">(
    "registros"
  );
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [relatorio, setRelatorio] = useState<Record<string, unknown> | null>(null);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [afastamentos, setAfastamentos] = useState<Afastamento[]>([]);
  const [loading, setLoading] = useState(false);

  const carregarRegistros = useCallback(async () => {
    setLoading(true);
    try {
      const [regs, rel] = await Promise.all([
        api.get<Registro[]>(
          `/auditoria/funcionarios/${funcionario.id}/registros?mes=${mes}&ano=${ano}`,
          token
        ),
        api.get<Record<string, unknown>>(
          `/auditoria/funcionarios/${funcionario.id}/relatorio?mes=${mes}&ano=${ano}`,
          token
        )
      ]);
      setRegistros(regs ?? []);
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

  useEffect(() => {
    if (subAba === "registros") carregarRegistros();
    else if (subAba === "solicitacoes") carregarSolicitacoes();
    else if (subAba === "afastamentos") carregarAfastamentos();
  }, [subAba, carregarRegistros, carregarSolicitacoes, carregarAfastamentos]);

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
            {funcionario.matricula} · {funcionario.cargo}
            {funcionario.gerencia ? ` · ${funcionario.gerencia.nome}` : ""}
          </p>
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
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid rgba(122,30,38,0.08)" }}>
        {(
          [
            { id: "registros", label: "Registros de Ponto" },
            { id: "solicitacoes", label: "Solicitações" },
            { id: "afastamentos", label: "Afastamentos" }
          ] as const
        ).map((a) => (
          <button
            key={a.id}
            onClick={() => setSubAba(a.id)}
            style={{
              padding: "7px 16px",
              borderRadius: "var(--radius-md) var(--radius-md) 0 0",
              border: "none",
              background: subAba === a.id ? "var(--burgundy-600)" : "transparent",
              color: subAba === a.id ? "#fff" : "var(--ink-500)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            {a.label}
          </button>
        ))}
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
      ) : subAba === "solicitacoes" ? (
        <TabelaSolicitacoes solicitacoes={solicitacoes} />
      ) : (
        <TabelaAfastamentos afastamentos={afastamentos} />
      )}
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

  /* Cálculo de horas do dia */
  let minutos = 0;
  let entrada: Date | null = null;
  for (const r of regs) {
    const ts = new Date(r.dataHora);
    if (r.tipo === "ENTRADA") {
      entrada = ts;
    } else if ((r.tipo === "INICIO_INTERVALO" || r.tipo === "SAIDA") && entrada) {
      minutos += Math.round((ts.getTime() - entrada.getTime()) / 60000);
      entrada = null;
    } else if (r.tipo === "FIM_INTERVALO") {
      entrada = ts;
    }
  }
  if (entrada) minutos += Math.round((Date.now() - entrada.getTime()) / 60000);
  const horasStr = `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}m`;

  /* Status do dia */
  const tipos = regs.map((r) => r.tipo);
  const temSaida = tipos.includes("SAIDA");
  const temEntrada = tipos.includes("ENTRADA");
  const status = !temEntrada
    ? { label: "Sem registros", cor: "#c8393f", bg: "rgba(200,57,63,0.08)", borda: "#c8393f" }
    : temSaida
      ? { label: "Jornada completa", cor: "#2f7d4f", bg: "rgba(47,125,79,0.08)", borda: "#2f7d4f" }
      : { label: "Jornada aberta", cor: "#c67f00", bg: "rgba(198,127,0,0.08)", borda: "#c67f00" };

  const temFotos = regs.some((r) => r.fotoUrl);

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
        {/* Data */}
        <div style={{ flex: 1, minWidth: 0 }}>
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

        {/* Horas */}
        {minutos > 0 && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "var(--ink-900)",
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap"
            }}
          >
            {horasStr}
          </span>
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

        {/* Status badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: status.cor,
            background: status.bg,
            padding: "3px 10px",
            borderRadius: "var(--radius-full)",
            whiteSpace: "nowrap"
          }}
        >
          {status.label}
        </span>

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
        Gerencia: r.funcionario.gerencia?.sigla ?? "",
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
            { value: "SAIDA", label: "Saída" }
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
                {r.funcionario.gerencia ? ` · ${r.funcionario.gerencia.sigla}` : ""}
              </p>
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

function TabSolicitacoes({ token }: { token: string }) {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] = useState("PENDENTE");
  const [tipoFiltro, setTipoFiltro] = useState("");

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
      `solicitacoes_${statusFiltro}.csv`
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FiltrosBox>
        <SelectField
          label="Status"
          value={statusFiltro}
          onChange={setStatusFiltro}
          options={[
            { value: "", label: "Todos" },
            { value: "PENDENTE", label: "Aguardando Gestor" },
            { value: "AGUARDANDO_RH", label: "Aguardando RH" },
            { value: "APROVADA", label: "Aprovadas pelo RH" },
            { value: "REJEITADA_GESTOR", label: "Rejeitadas pelo Gestor" },
            { value: "REJEITADA_RH", label: "Rejeitadas pelo RH" },
            { value: "REJEITADA", label: "Rejeitadas (legado)" }
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
            { value: "ABONO", label: "Abono" }
          ]}
        />
        <BtnBuscar onClick={() => carregar(1)} />
        <BtnCSV onClick={exportar} />
      </FiltrosBox>

      {erro && <ErroBox msg={erro} />}

      <CardTabela>
        <TabelaSolicitacoes solicitacoes={loading ? [] : solicitacoes} loading={loading} />
        <Pagination page={page} total={total} limit={limit} onChange={(p) => carregar(p)} />
      </CardTabela>
    </div>
  );
}

/* ─── Tabela de solicitações reutilizável (somente consulta) ─── */
function TabelaSolicitacoes({
  solicitacoes,
  loading = false
}: {
  solicitacoes: Solicitacao[];
  loading?: boolean;
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
        return (
          <div
            key={s.id}
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(122,30,38,0.04)",
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
                background: "var(--burgundy-600)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0
              }}
            >
              {s.funcionario.user.name[0].toUpperCase()}
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
                {s.funcionario.gerencia ? ` · ${s.funcionario.gerencia.sigla}` : ""}
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge
                  label={s.tipo.replace(/_/g, " ")}
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
              {s.status === "AGUARDANDO_RH" && <LogTimelineGestor s={s} />}
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
                {a.funcionario.gerencia ? ` · ${a.funcionario.gerencia.sigla}` : ""}
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
   ABA PERÍODOS
═══════════════════════════════════════════════ */

function TabPeriodos({ token }: { token: string }) {
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
    carregar(1);
  }, [carregar]);

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
        Gerencia: p.funcionario.gerencia?.sigla ?? "",
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
          options={[{ value: "", label: "Todos" }, ...anos.map((a) => ({ value: a, label: a }))]}
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
          {["Funcionário", "Gerência", "Dias", "Trabalhado", "Extras", "Falta", "Status", ""].map(
            (c) => (
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
            )
          )}
        </div>

        {loading ? (
          <Loading />
        ) : periodos.length === 0 ? (
          <p style={{ padding: 32, textAlign: "center", fontSize: 13, color: "var(--ink-400)" }}>
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
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
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
                <span style={{ fontSize: 11, color: "var(--ink-600)" }}>
                  {p.funcionario.gerencia?.sigla ?? "—"}
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
          <p style={{ fontSize: 13, color: "var(--ink-600)", marginBottom: 20, lineHeight: 1.6 }}>
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
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */

const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart2Icon size={14} /> },
  { id: "funcionarios", label: "Funcionários", icon: <UsersIcon size={14} /> },
  { id: "registros", label: "Registros", icon: <ClockIcon size={14} /> },
  { id: "solicitacoes", label: "Solicitações", icon: <InboxIcon size={14} /> },
  { id: "afastamentos", label: "Afastamentos", icon: <CalendarIcon size={14} /> },
  { id: "periodos", label: "Períodos", icon: <BarChart2Icon size={14} /> },
  { id: "logs", label: "Logs", icon: <ShieldCheckIcon size={14} /> }
];

export function AuditoriaPage() {
  const { user, token, hasRole } = useAuth();
  const [aba, setAba] = useState<Aba>("dashboard");

  const tk = token();
  const isRH =
    !!user?.isSuperAdmin ||
    hasRole("RH_AUDITORIA") ||
    hasRole("ponto-admin") ||
    hasRole("PONTO_ADMIN");

  const temAcesso = isRH || hasRole("gestor") || hasRole("GESTOR_APROVACAO");

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
            onClick={() => setAba(a.id)}
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
      {aba === "dashboard" && <TabDashboard token={tk} />}
      {aba === "funcionarios" && <TabFuncionarios token={tk} />}
      {aba === "registros" && <TabRegistros token={tk} />}
      {aba === "solicitacoes" && <TabSolicitacoes token={tk} />}
      {aba === "afastamentos" && <TabAfastamentos token={tk} />}
      {aba === "periodos" && <TabPeriodos token={tk} />}
      {aba === "logs" && <TabLogs token={tk} />}
    </div>
  );
}
