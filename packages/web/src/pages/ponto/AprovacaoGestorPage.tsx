import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import {
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
  SearchIcon,
  RefreshCwIcon,
  UsersIcon,
  UserIcon,
  DownloadIcon,
  InfoIcon
} from "../../components/icons";
import {
  FeriasDetalheBlock,
  LinkDocumentoAnexado,
  LogTimelineGestorHistorico,
  ModalDecisaoRH,
  ModalEnviarGuia,
  ModalEnviarFolhaFerias,
  SolicitacaoCardRH,
  textoResumo,
  type SolicitacaoResumo
} from "./solicitacaoUi";
import { MSG_SOLICITACAO_APENAS_INFORMATIVA } from "../../utils/categoriaPonto";

/* ══════════════════════════════════════════
   TIPOS
══════════════════════════════════════════ */

type StatusSolicitacao =
  | "PENDENTE"
  | "AGUARDANDO_RH"
  | "AGUARDANDO_DOCUMENTO_FUNCIONARIO"
  | "AGUARDANDO_GESTOR_RH"
  | "APROVADA"
  | "REJEITADA"
  | "REJEITADA_GESTOR"
  | "REJEITADA_RH";

interface Solicitacao {
  id: string;
  tipo: string;
  dataReferencia: string;
  dataInicio: string | null;
  dataFim: string | null;
  metadados: Record<string, unknown> | null;
  descricao: string;
  status: StatusSolicitacao;
  observacaoGestor: string | null;
  gestorObservacao: string | null;
  gestorResolvidoEm: string | null;
  gestorUser?: { name: string } | null;
  rhObservacao: string | null;
  rhResolvidoEm: string | null;
  guiaMedicoUrl?: string | null;
  guiaMedicoEnviadaEm?: string | null;
  guiaMedicoObservacao?: string | null;
  documentoRetornoUrl?: string | null;
  documentoRetornoEm?: string | null;
  createdAt: string;
  apenasInformativo?: boolean;
  funcionario: {
    id: string;
    matricula: string | null;
    cargo: string;
    fotoPerfilUrl: string | null;
    user: { name: string; email: string; emailReal?: string | null };
    gerencia: { nome: string; sigla: string } | null;
  };
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */

const TIPO_LABEL: Record<string, string> = {
  CORRECAO_PONTO: "Correção de Ponto",
  ATESTADO: "Atestado Médico",
  FERIAS: "Férias",
  LICENCA: "Licença",
  ABONO: "Abono de Falta"
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function Avatar({ name, fotoUrl }: { name: string; fotoUrl?: string | null }) {
  const baseStyle: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
    border: "2px solid rgba(122,30,38,0.15)"
  };

  if (fotoUrl) {
    return (
      <div style={baseStyle}>
        <img
          src={fotoUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => {
            // Fallback para ícone se a imagem falhar
            const parent = (e.currentTarget as HTMLImageElement).parentElement;
            if (parent) {
              parent.innerHTML = "";
              parent.style.background = "var(--cream-100)";
              parent.style.display = "flex";
              parent.style.alignItems = "center";
              parent.style.justifyContent = "center";
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...baseStyle,
        background: "var(--cream-100)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <UserIcon size={22} style={{ color: "var(--ink-400)" }} />
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const label = TIPO_LABEL[tipo] ?? tipo;
  const colorMap: Record<string, string> = {
    CORRECAO_PONTO: "#1e40af",
    ATESTADO: "#7c3aed",
    FERIAS: "#065f46",
    LICENCA: "#92400e",
    ABONO: "#374151"
  };
  const bg = colorMap[tipo] ?? "#374151";
  return (
    <span
      style={{
        background: `${bg}18`,
        color: bg,
        border: `1px solid ${bg}40`,
        borderRadius: 5,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: StatusSolicitacao }) {
  const map: Record<StatusSolicitacao, { label: string; cls: string }> = {
    PENDENTE: { label: "Aguardando Gestor", cls: "badge-amber" },
    AGUARDANDO_RH: { label: "Aprovado pelo Gestor", cls: "badge-blue" },
    AGUARDANDO_DOCUMENTO_FUNCIONARIO: {
      label: "Aguardando Doc. Funcionário",
      cls: "badge-amber"
    },
    AGUARDANDO_GESTOR_RH: { label: "Aguardando Gerente de RH", cls: "badge-amber" },
    APROVADA: { label: "Aprovada pelo RH", cls: "badge-green" },
    REJEITADA: { label: "Rejeitada", cls: "badge-red" },
    REJEITADA_GESTOR: { label: "Rejeitada pelo Gestor", cls: "badge-red" },
    REJEITADA_RH: { label: "Rejeitada pelo RH", cls: "badge-red" }
  };
  const { label, cls } = map[status] ?? { label: status, cls: "badge-amber" };
  return <span className={`badge ${cls}`}>{label}</span>;
}

/* ══════════════════════════════════════════
   POPUP DE CONFIRMAÇÃO DE DECISÃO
══════════════════════════════════════════ */

function ModalDecisao({
  solicitacao,
  decisao,
  resumo,
  onConfirm,
  onClose,
  loading
}: {
  solicitacao: Solicitacao;
  decisao: "APROVAR" | "REJEITAR";
  resumo: string;
  onConfirm: (observacao: string) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [obs, setObs] = useState("");

  const isAprovar = decisao === "APROVAR";
  const corAcao = isAprovar ? "#16a34a" : "#dc2626";
  const corAcaoClaro = isAprovar ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.06)";
  const corBorda = isAprovar ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)";
  const emoji = isAprovar ? "✅" : "❌";
  const titulo = isAprovar ? "Confirmar Aprovação" : "Confirmar Rejeição";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
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
        {/* ── Cabeçalho colorido ── */}
        <div
          style={{
            background: corAcaoClaro,
            borderBottom: `1px solid ${corBorda}`,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14
          }}
        >
          <span style={{ fontSize: 32, lineHeight: 1 }}>{emoji}</span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: corAcao,
                fontFamily: "var(--font-display)"
              }}
            >
              {titulo}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
              {TIPO_LABEL[solicitacao.tipo] ?? solicitacao.tipo} ·{" "}
              <strong>{solicitacao.funcionario.user.name}</strong>
            </p>
          </div>
        </div>

        {/* ── Corpo ── */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Resumo da solicitação */}
          <div
            style={{
              background: "var(--cream-50)",
              border: "1px solid rgba(122,30,38,0.10)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px"
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--ink-400)"
              }}
            >
              Solicitação
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-800)", lineHeight: 1.5 }}>
              {resumo}
            </p>
            {solicitacao.tipo === "FERIAS" && <FeriasDetalheBlock meta={solicitacao.metadados} />}
            {solicitacao.descricao && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  color: "var(--ink-500)",
                  fontStyle: "italic",
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                  paddingTop: 8
                }}
              >
                Justificativa: "{solicitacao.descricao}"
              </p>
            )}
          </div>

          {/* Pergunta de confirmação */}
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink-900)",
              textAlign: "center"
            }}
          >
            {isAprovar
              ? "Você confirma a aprovação desta solicitação?"
              : "Você confirma a rejeição desta solicitação?"}
          </p>
          {isAprovar && (
            <p
              style={{
                margin: "-8px 0 0",
                fontSize: 12,
                color: "var(--ink-500)",
                textAlign: "center"
              }}
            >
              Após aprovação, a solicitação será encaminhada ao RH para análise final.
            </p>
          )}

          {/* Observação */}
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)"
              }}
            >
              {isAprovar ? "Observação para o RH (opcional)" : "Motivo da rejeição (obrigatório)"}
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder={
                isAprovar
                  ? "Deixe uma observação para o analista de RH, se necessário..."
                  : "Informe o motivo da rejeição ao funcionário..."
              }
              rows={3}
              autoFocus
              style={{
                width: "100%",
                border: `1px solid ${obs.trim() || isAprovar ? "rgba(0,0,0,0.15)" : "rgba(220,38,38,0.40)"}`,
                borderRadius: "var(--radius-md)",
                padding: "9px 11px",
                fontSize: 13,
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none"
              }}
            />
            {!isAprovar && !obs.trim() && (
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#dc2626" }}>
                O motivo da rejeição é obrigatório.
              </p>
            )}
          </div>

          {/* Botões */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                padding: "10px 20px",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink-600)"
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(obs)}
              disabled={loading || (!isAprovar && !obs.trim())}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: loading || (!isAprovar && !obs.trim()) ? "#9ca3af" : corAcao,
                color: "#fff",
                cursor: loading || (!isAprovar && !obs.trim()) ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 7,
                transition: "background 150ms"
              }}
            >
              {loading ? (
                <>⏳ Processando...</>
              ) : isAprovar ? (
                <>✅ Sim, aprovar</>
              ) : (
                <>❌ Sim, rejeitar</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CARD DE SOLICITAÇÃO
══════════════════════════════════════════ */

function SolicitacaoCard({
  s,
  mostrarAcoes,
  onDecidir
}: {
  s: Solicitacao;
  mostrarAcoes: boolean;
  onDecidir: (s: Solicitacao, decisao: "APROVAR" | "REJEITAR") => void;
}) {
  const email = s.funcionario.user.emailReal || s.funcionario.user.email;
  const resumo = textoResumo(s);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "16px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start"
      }}
    >
      <Avatar name={s.funcionario.user.name} fotoUrl={s.funcionario.fotoPerfilUrl} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ── Identidade do funcionário ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 6
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>
            {s.funcionario.user.name}
          </span>
          {s.funcionario.matricula && (
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
              mat. {s.funcionario.matricula}
            </span>
          )}
          {s.funcionario.gerencia && (
            <span
              style={{
                background: "rgba(122,30,38,0.07)",
                color: "var(--burgundy-600)",
                borderRadius: 4,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 600
              }}
            >
              {s.funcionario.gerencia.nome}
            </span>
          )}
          <StatusBadge status={s.status} />
          {s.apenasInformativo && (
            <span
              title={MSG_SOLICITACAO_APENAS_INFORMATIVA}
              aria-label={MSG_SOLICITACAO_APENAS_INFORMATIVA}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(37,99,235,0.08)",
                color: "#1e40af",
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "help"
              }}
            >
              <InfoIcon size={12} />
              Informativo
            </span>
          )}
        </div>

        {/* ── Texto principal explicativo ── */}
        <p
          style={{
            margin: "0 0 6px",
            fontSize: 13.5,
            color: "var(--ink-800)",
            lineHeight: 1.5,
            fontWeight: 500
          }}
        >
          {resumo}
        </p>

        {/* ── Log discreto (tipo + datas) ── */}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: s.descricao ? 6 : 0
          }}
        >
          <TipoBadge tipo={s.tipo} />
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Ref.: {fmtDate(s.dataReferencia)}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Enviado em {fmtDateTime(s.createdAt)}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>•</span>
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{email}</span>
        </div>

        {s.tipo === "FERIAS" && <FeriasDetalheBlock meta={s.metadados} />}

        {/* ── Justificativa do funcionário (secundária) ── */}
        {s.descricao && (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "var(--ink-600)",
              lineHeight: 1.5,
              borderLeft: "3px solid rgba(122,30,38,0.12)",
              paddingLeft: 10,
              fontStyle: "italic"
            }}
          >
            "{s.descricao}"
          </p>
        )}

        {s.tipo === "ATESTADO" && typeof s.metadados?.documentoUrl === "string" && (
          <LinkDocumentoAnexado href={s.metadados.documentoUrl as string} />
        )}

        {!mostrarAcoes && (s.gestorResolvidoEm || s.gestorObservacao || s.observacaoGestor) && (
          <LogTimelineGestorHistorico s={s} />
        )}
      </div>

      {/* ── Botões de ação ── */}
      {mostrarAcoes && s.status === "PENDENTE" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onDecidir(s, "APROVAR")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "#16a34a",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600
            }}
          >
            <CheckCircleIcon size={14} /> Aprovar
          </button>
          <button
            onClick={() => onDecidir(s, "REJEITAR")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--red)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600
            }}
          >
            <XCircleIcon size={14} /> Rejeitar
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════ */

type EtapaAprovacao = "gestor" | "rh" | "assinaturas" | "correcoes_rh";

/* ── Tipos de Assinatura ── */
type StatusAssinatura = "PENDENTE_FUNCIONARIO" | "PENDENTE_GESTOR" | "CONCLUIDA" | "DISPENSADA";
interface AssinaturaQuadro {
  id: string;
  status: StatusAssinatura;
  bancoHorasSaldoTotalMinutos: number;
  assinadoFuncionarioEm: string | null;
  assinadoGestorEm: string | null;
  assinadoGestorNome: string | null;
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

const MESES_PT = [
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

function fmtBH(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, "0")}min`;
}

export function AprovacaoGestorPage() {
  const { user, hasRole, token } = useAuth();

  // PROVISÓRIO: isManager via campo do Funcionario dá acesso enquanto responsavelUserId não está configurado
  const isManagerProvisorio = !!user?.funcionario?.isManager;
  const isGestorArea =
    !!user?.isSuperAdmin ||
    hasRole("gestor") ||
    hasRole("GESTOR_APROVACAO") ||
    hasRole("ponto-admin") ||
    hasRole("PONTO_ADMIN") ||
    isManagerProvisorio;
  const isRH =
    !!user?.isSuperAdmin ||
    hasRole("RH_AUDITORIA") ||
    hasRole("ponto-admin") ||
    hasRole("PONTO_ADMIN");
  const isPontoAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  const temAcesso = isGestorArea || isRH;

  const [etapa, setEtapa] = useState<EtapaAprovacao>(isRH && !isGestorArea ? "rh" : "gestor");
  const [aba, setAba] = useState<"pendentes" | "historico">("pendentes");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [page, setPage] = useState(1);

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const [equipeCount, setEquipeCount] = useState<number | null>(null);
  const [statsGestor, setStatsGestor] = useState({ pendentes: 0, aprovadas: 0, rejeitadas: 0 });
  const [statsRH, setStatsRH] = useState({ pendentes: 0, aprovadas: 0, rejeitadas: 0 });
  const [statsAdmin, setStatsAdmin] = useState({ pendentes: 0 });

  // Modal de decisão — Gerente de RH (correções criadas pelo RH)
  const [modalAdminSol, setModalAdminSol] = useState<Solicitacao | null>(null);
  const [modalAdminDecisao, setModalAdminDecisao] = useState<"APROVAR" | "REJEITAR">("APROVAR");
  const [, setModalAdminObs] = useState("");
  const [modalAdminErro, setModalAdminErro] = useState("");

  // Assinaturas de Quadro
  const [assinaturas, setAssinaturas] = useState<AssinaturaQuadro[]>([]);
  const [loadingAssin, setLoadingAssin] = useState(false);
  const [assinandoId, setAssinandoId] = useState<string | null>(null);
  const [modalAssin, setModalAssin] = useState<AssinaturaQuadro | null>(null);
  const [erroAssin, setErroAssin] = useState("");
  const [filtroAssinStatus, setFiltroAssinStatus] = useState("PENDENTE_GESTOR");

  // Modal de decisão — gestor
  const [modalSol, setModalSol] = useState<Solicitacao | null>(null);
  const [modalDecisao, setModalDecisao] = useState<"APROVAR" | "REJEITAR">("APROVAR");
  const [modalLoading, setModalLoading] = useState(false);
  // Modal de decisão — RH
  const [modalRhSol, setModalRhSol] = useState<Solicitacao | null>(null);
  const [modalRhDecisao, setModalRhDecisao] = useState<"APROVAR" | "REJEITAR">("APROVAR");
  const [modalRhErro, setModalRhErro] = useState("");
  // Modal de envio de guia médica — RH
  const [modalGuiaSol, setModalGuiaSol] = useState<Solicitacao | null>(null);
  const [modalGuiaErro, setModalGuiaErro] = useState("");
  // Modal de envio de folha de férias — RH
  const [modalFolhaSol, setModalFolhaSol] = useState<Solicitacao | null>(null);
  const [modalFolhaErro, setModalFolhaErro] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const limit = 20;

  const carregarEquipe = useCallback(async () => {
    if (!isGestorArea) return;
    try {
      const data = await api.get<{ id: string }[]>("/auditoria/gestao/equipe");
      setEquipeCount(data.length);
    } catch {
      /* opcional */
    }
  }, [isGestorArea]);

  const carregarStats = useCallback(async () => {
    try {
      if (isGestorArea) {
        const [pend, aprov, rejGestor] = await Promise.all([
          api.get<{ total: number }>("/auditoria/gestao/solicitacoes?status=PENDENTE&limit=1"),
          api.get<{ total: number }>(
            "/auditoria/gestao/solicitacoes?status=AGUARDANDO_RH,APROVADA,REJEITADA_RH&limit=1"
          ),
          api.get<{ total: number }>(
            "/auditoria/gestao/solicitacoes?status=REJEITADA_GESTOR&limit=1"
          )
        ]);
        setStatsGestor({
          pendentes: pend.total,
          aprovadas: aprov.total,
          rejeitadas: rejGestor.total ?? 0
        });
      }
      if (isRH) {
        const [pendRh, aprovRh, rejRh] = await Promise.all([
          api.get<{ total: number }>(
            "/auditoria/solicitacoes?status=AGUARDANDO_RH,AGUARDANDO_DOCUMENTO_FUNCIONARIO&limit=1"
          ),
          api.get<{ total: number }>("/auditoria/solicitacoes?status=APROVADA&limit=1"),
          api.get<{ total: number }>("/auditoria/solicitacoes?status=REJEITADA_RH&limit=1")
        ]);
        setStatsRH({
          pendentes: pendRh.total,
          aprovadas: aprovRh.total,
          rejeitadas: rejRh.total
        });
      }
      if (isPontoAdmin) {
        const pendAdmin = await api
          .get<{ total: number }>("/auditoria/solicitacoes?status=AGUARDANDO_GESTOR_RH&limit=1")
          .catch(() => ({ total: 0 }));
        setStatsAdmin({ pendentes: pendAdmin.total });
      }
    } catch {
      /* opcional */
    }
  }, [isGestorArea, isRH]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      if (tipo) params.set("tipo", tipo);

      if (etapa === "gestor") {
        const statusMap = {
          pendentes: "PENDENTE",
          historico: "HISTORICO_GESTOR"
        };
        params.set("status", statusMap[aba]);
        const data = await api.get<{ total: number; solicitacoes: Solicitacao[] }>(
          `/auditoria/gestao/solicitacoes?${params}`
        );
        setSolicitacoes(data.solicitacoes ?? []);
        setTotal(data.total ?? 0);
      } else if (etapa === "correcoes_rh") {
        const statusMap = {
          pendentes: "AGUARDANDO_GESTOR_RH",
          historico: "APROVADA,REJEITADA_RH"
        };
        params.set("status", statusMap[aba]);
        params.set("tipo", "CORRECAO_PONTO");
        const data = await api.get<{ total: number; solicitacoes: Solicitacao[] }>(
          `/auditoria/solicitacoes?${params}`
        );
        setSolicitacoes(data.solicitacoes ?? []);
        setTotal(data.total ?? 0);
      } else {
        const statusMap = {
          pendentes: "AGUARDANDO_RH,AGUARDANDO_DOCUMENTO_FUNCIONARIO",
          historico: "APROVADA,REJEITADA_RH"
        };
        params.set("status", statusMap[aba]);
        const data = await api.get<{ total: number; solicitacoes: Solicitacao[] }>(
          `/auditoria/solicitacoes?${params}`
        );
        setSolicitacoes(data.solicitacoes ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      setErro("Erro ao carregar solicitações.");
    } finally {
      setLoading(false);
    }
  }, [aba, page, tipo, etapa]);

  useEffect(() => {
    if (isRH && !isGestorArea) setEtapa("rh");
  }, [isRH, isGestorArea]);

  useEffect(() => {
    void carregarEquipe();
    void carregarStats();
  }, [carregarEquipe, carregarStats]);

  useEffect(() => {
    setPage(1);
  }, [aba, tipo, etapa]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function abrirModal(s: Solicitacao, decisao: "APROVAR" | "REJEITAR") {
    setModalSol(s);
    setModalDecisao(decisao);
    setFeedbackMsg("");
  }

  async function confirmarDecisao(observacao: string) {
    if (!modalSol) return;
    setModalLoading(true);
    try {
      await api.patch(`/auditoria/gestao/solicitacoes/${modalSol.id}`, {
        decisao: modalDecisao,
        observacao
      });
      setModalSol(null);
      setFeedbackMsg(
        modalDecisao === "APROVAR"
          ? "Solicitação aprovada e encaminhada ao RH."
          : "Solicitação rejeitada."
      );
      await Promise.all([carregar(), carregarStats()]);
    } catch {
      setFeedbackMsg("Erro ao processar decisão. Tente novamente.");
    } finally {
      setModalLoading(false);
    }
  }

  function abrirModalRH(s: SolicitacaoResumo, decisao: "APROVAR" | "REJEITAR") {
    setModalRhSol(s as Solicitacao);
    setModalRhDecisao(decisao);
    setModalRhErro("");
    setFeedbackMsg("");
  }

  async function confirmarDecisaoRH(observacao: string) {
    if (!modalRhSol) return;
    setModalLoading(true);
    setModalRhErro("");
    try {
      await api.patch(`/auditoria/rh/solicitacoes/${modalRhSol.id}`, {
        decisao: modalRhDecisao,
        observacao
      });
      setModalRhSol(null);
      setFeedbackMsg(
        modalRhDecisao === "APROVAR"
          ? "Solicitação aprovada definitivamente pelo RH."
          : "Solicitação rejeitada pelo RH."
      );
      await Promise.all([carregar(), carregarStats()]);
    } catch (e) {
      setModalRhErro((e as Error).message || "Erro ao processar decisão. Tente novamente.");
    } finally {
      setModalLoading(false);
    }
  }

  function abrirModalGuia(s: SolicitacaoResumo) {
    setModalGuiaSol(s as Solicitacao);
    setModalGuiaErro("");
    setFeedbackMsg("");
  }

  function abrirModalFolha(s: SolicitacaoResumo) {
    setModalFolhaSol(s as Solicitacao);
    setModalFolhaErro("");
    setFeedbackMsg("");
  }

  async function confirmarEnviarFolha(folhaBase64: string, observacao: string) {
    if (!modalFolhaSol) return;
    setModalLoading(true);
    setModalFolhaErro("");
    try {
      await api.patch(`/auditoria/rh/solicitacoes/${modalFolhaSol.id}/enviar-folha-ferias`, {
        folhaBase64,
        observacao
      });
      setModalFolhaSol(null);
      setFeedbackMsg("Folha de férias enviada ao funcionário para assinatura.");
      await Promise.all([carregar(), carregarStats()]);
    } catch (e) {
      setModalFolhaErro((e as Error).message || "Erro ao enviar folha. Tente novamente.");
    } finally {
      setModalLoading(false);
    }
  }

  async function confirmarEnviarGuia(guiaMedicoBase64: string, observacao: string) {
    if (!modalGuiaSol) return;
    setModalLoading(true);
    setModalGuiaErro("");
    try {
      await api.patch(`/auditoria/rh/solicitacoes/${modalGuiaSol.id}/enviar-guia`, {
        guiaMedicoBase64,
        observacao
      });
      setModalGuiaSol(null);
      setFeedbackMsg("Guia médica enviada ao funcionário.");
      await Promise.all([carregar(), carregarStats()]);
    } catch (e) {
      setModalGuiaErro((e as Error).message || "Erro ao enviar guia médica. Tente novamente.");
    } finally {
      setModalLoading(false);
    }
  }

  /* ── Assinaturas: carrega quando entra na aba ── */
  useEffect(() => {
    if (etapa !== "assinaturas") return;
    setLoadingAssin(true);
    const param = filtroAssinStatus ? `?status=${filtroAssinStatus}` : "";
    api
      .get<AssinaturaQuadro[]>(`/auditoria/gestao/assinaturas${param}`)
      .then((data) => setAssinaturas(data ?? []))
      .catch(() => setAssinaturas([]))
      .finally(() => setLoadingAssin(false));
  }, [etapa, filtroAssinStatus]);

  async function confirmarAssinarGestor() {
    if (!modalAssin) return;
    setAssinandoId(modalAssin.id);
    setErroAssin("");
    try {
      await api.post(`/auditoria/gestao/assinaturas/${modalAssin.id}/assinar`, {});
      setModalAssin(null);
      const data = await api.get<AssinaturaQuadro[]>(
        `/auditoria/gestao/assinaturas${filtroAssinStatus ? `?status=${filtroAssinStatus}` : ""}`
      );
      setAssinaturas(data ?? []);
      setFeedbackMsg("Quadro assinado com sucesso.");
    } catch (e) {
      setErroAssin((e as Error).message || "Erro ao assinar. Tente novamente.");
    } finally {
      setAssinandoId(null);
    }
  }

  async function confirmarAdmin(observacao: string) {
    if (!modalAdminSol) return;
    setModalLoading(true);
    setModalAdminErro("");
    try {
      await api.patch(`/auditoria/admin/correcoes-rh/${modalAdminSol.id}`, {
        decisao: modalAdminDecisao,
        observacao
      });
      setModalAdminSol(null);
      setFeedbackMsg(
        modalAdminDecisao === "APROVAR"
          ? "Correção aprovada e aplicada no histórico do funcionário."
          : "Correção rejeitada."
      );
      await Promise.all([carregar(), carregarStats()]);
    } catch (e) {
      setModalAdminErro((e as Error).message || "Erro ao processar decisão.");
    } finally {
      setModalLoading(false);
    }
  }

  const solicitacoesFiltradas = busca
    ? solicitacoes.filter(
        (s) =>
          s.funcionario.user.name.toLowerCase().includes(busca.toLowerCase()) ||
          (s.funcionario.matricula ?? "").toLowerCase().includes(busca.toLowerCase())
      )
    : solicitacoes;

  const totalPages = Math.ceil(total / limit);

  if (!temAcesso) {
    return (
      <div style={{ padding: 32, maxWidth: 480 }}>
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: "var(--radius-lg)",
            padding: "20px 24px"
          }}
        >
          <AlertCircleIcon size={20} style={{ color: "#856404", marginBottom: 8 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>Acesso restrito</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#856404" }}>
            Esta página é exclusiva para gestores de área, RH e administradores.
          </p>
        </div>
      </div>
    );
  }

  const stats = etapa === "gestor" ? statsGestor : statsRH;
  const mostrarEtapaGestor = isGestorArea;
  const mostrarEtapaRH = isRH;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 0 40px" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <p
          className="eyebrow"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--burgundy-600)",
            margin: "0 0 4px"
          }}
        >
          Gestão
        </p>
        <h1
          style={{
            fontSize: "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            margin: 0,
            fontWeight: 700
          }}
        >
          Aprovações
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
          {etapa === "gestor"
            ? "Etapa do gestor de área — aprovação inicial da equipe."
            : etapa === "rh"
              ? "Etapa do RH — aprovação final de todas as solicitações."
              : etapa === "correcoes_rh"
                ? "Correções de ponto criadas pelo RH — aprovação exclusiva do Gerente de RH."
                : "Assine os quadros mensais de ponto da sua equipe."}
        </p>
      </div>

      {/* ── Etapas (Gestor / RH / Assinaturas) ── */}
      {(mostrarEtapaGestor || mostrarEtapaRH) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            ...(mostrarEtapaGestor
              ? [{ id: "gestor" as const, label: "Gestor de Área", count: statsGestor.pendentes }]
              : []),
            ...(mostrarEtapaRH
              ? [{ id: "rh" as const, label: "RH", count: statsRH.pendentes }]
              : []),
            ...(mostrarEtapaGestor
              ? [{ id: "assinaturas" as const, label: "Assinaturas de Quadro", count: 0 }]
              : []),
            ...(isPontoAdmin
              ? [
                  {
                    id: "correcoes_rh" as const,
                    label: "✏️ Correções de Ponto",
                    count: statsAdmin.pendentes
                  }
                ]
              : [])
          ].map((e) => (
            <button
              key={e.id}
              onClick={() => {
                setEtapa(e.id);
                setAba("pendentes");
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "var(--radius-full)",
                border:
                  etapa === e.id
                    ? "2px solid var(--burgundy-600)"
                    : "1px solid rgba(122,30,38,0.18)",
                background: etapa === e.id ? "var(--burgundy-600)" : "#fff",
                color: etapa === e.id ? "#fff" : "var(--ink-700)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {e.label}
              {e.count > 0 ? ` (${e.count})` : ""}
            </button>
          ))}
        </div>
      )}

      {/* ── Aba Assinaturas de Quadro ── */}
      {etapa === "assinaturas" && (
        <div>
          {/* Modal de confirmação de assinatura do gestor */}
          {modalAssin && (
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
              onClick={() => setModalAssin(null)}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: 12,
                  padding: "28px 28px 24px",
                  maxWidth: 440,
                  width: "100%",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.18)"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 17,
                    marginBottom: 4,
                    color: "var(--burgundy-700)"
                  }}
                >
                  Assinar Quadro do Funcionário
                </h2>
                <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16 }}>
                  {modalAssin.periodo.funcionario.user.name} —{" "}
                  {MESES_PT[(modalAssin.periodo.mes ?? 1) - 1]}/{modalAssin.periodo.ano}
                </p>
                <div
                  style={{
                    background: "#f9fafb",
                    borderRadius: 8,
                    padding: "12px 14px",
                    marginBottom: 16,
                    display: "flex",
                    gap: 20
                  }}
                >
                  <div>
                    <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 1 }}>
                      Matrícula
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 700 }}>
                      {modalAssin.periodo.funcionario.matricula ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "var(--ink-400)", marginBottom: 1 }}>
                      Banco de horas (total)
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: modalAssin.bancoHorasSaldoTotalMinutos >= 0 ? "#15803D" : "#B91C1C",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      {fmtBH(modalAssin.bancoHorasSaldoTotalMinutos)}
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-600)",
                    marginBottom: 20,
                    lineHeight: 1.6
                  }}
                >
                  Confirmo que revisei e estou de acordo com os registros de ponto do funcionário
                  para este período.
                </p>
                {erroAssin && (
                  <p style={{ color: "#b91c1c", fontSize: 12, marginBottom: 12 }}>{erroAssin}</p>
                )}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setModalAssin(null)}
                    disabled={!!assinandoId}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={confirmarAssinarGestor}
                    disabled={!!assinandoId}
                    style={{
                      background: "var(--burgundy-700)",
                      borderColor: "var(--burgundy-700)"
                    }}
                  >
                    {assinandoId ? "Assinando…" : "✍ Assinar Quadro"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filtro */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { v: "PENDENTE_GESTOR", l: "Aguardando minha assinatura" },
              { v: "PENDENTE_FUNCIONARIO", l: "Aguardando funcionário" },
              { v: "CONCLUIDA", l: "Concluídas" },
              { v: "", l: "Todas" }
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setFiltroAssinStatus(v)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "var(--radius-full)",
                  border:
                    filtroAssinStatus === v
                      ? "2px solid var(--burgundy-600)"
                      : "1px solid rgba(122,30,38,0.18)",
                  background: filtroAssinStatus === v ? "var(--burgundy-50, #fdf2f3)" : "#fff",
                  color: filtroAssinStatus === v ? "var(--burgundy-700)" : "var(--ink-600)",
                  fontSize: 12,
                  fontWeight: filtroAssinStatus === v ? 700 : 500,
                  cursor: "pointer"
                }}
              >
                {l}
              </button>
            ))}
          </div>

          {loadingAssin ? (
            <p style={{ textAlign: "center", padding: 40, color: "var(--ink-400)", fontSize: 13 }}>
              Carregando assinaturas…
            </p>
          ) : assinaturas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--ink-400)" }}>
              <p style={{ fontSize: 14 }}>Nenhuma assinatura encontrada.</p>
            </div>
          ) : (
            <div className="card-flat" style={{ padding: 0, overflow: "hidden" }}>
              <table className="table-cfo" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Matrícula</th>
                    <th>Departamento</th>
                    <th>Mês/Ano</th>
                    <th>Banco de Horas (total)</th>
                    <th>Assinatura Func.</th>
                    <th>Status</th>
                    <th style={{ width: "1%", whiteSpace: "nowrap" }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {assinaturas.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.periodo.funcionario.user.name}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {a.periodo.funcionario.matricula ?? "—"}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {a.periodo.funcionario.gerencia?.nome ?? "—"}
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>
                        {String(a.periodo.mes).padStart(2, "0")}/{a.periodo.ano}
                      </td>
                      <td
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          color: a.bancoHorasSaldoTotalMinutos >= 0 ? "#15803D" : "#B91C1C"
                        }}
                      >
                        {fmtBH(a.bancoHorasSaldoTotalMinutos)}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--ink-500)" }}>
                        {a.assinadoFuncionarioEm
                          ? new Date(a.assinadoFuncionarioEm).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td>
                        {a.status === "PENDENTE_FUNCIONARIO" && (
                          <span className="badge badge-amber">Aguard. funcionário</span>
                        )}
                        {a.status === "PENDENTE_GESTOR" && (
                          <span className="badge badge-blue">Aguard. gestor</span>
                        )}
                        {a.status === "CONCLUIDA" && (
                          <span className="badge badge-green">Concluída</span>
                        )}
                        {a.status === "DISPENSADA" && (
                          <span className="badge badge-gray">Dispensada</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {a.status === "PENDENTE_GESTOR" && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setModalAssin(a);
                                setErroAssin("");
                              }}
                              style={{
                                gap: 5,
                                fontSize: 12,
                                background: "var(--burgundy-700)",
                                borderColor: "var(--burgundy-700)"
                              }}
                            >
                              ✍ Assinar
                            </button>
                          )}
                          {(a.status === "PENDENTE_GESTOR" || a.status === "CONCLUIDA") && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ gap: 4, fontSize: 12 }}
                              title="Baixar PDF do quadro"
                              onClick={() => {
                                const matricula = a.periodo.funcionario.matricula ?? a.id;
                                const filename = `quadro-${matricula}-${String(a.periodo.mes).padStart(2, "0")}-${a.periodo.ano}.pdf`;
                                api
                                  .download(`/auditoria/assinaturas/${a.id}/pdf`, filename, token())
                                  .catch((e: unknown) =>
                                    alert(
                                      "Erro ao baixar PDF: " +
                                        ((e as Error)?.message ?? "desconhecido")
                                    )
                                  );
                              }}
                            >
                              <DownloadIcon size={12} /> PDF
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Stat Cards ── */}
      {etapa !== "assinaturas" && etapa !== "correcoes_rh" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: 14,
            marginBottom: 28
          }}
        >
          {(etapa === "gestor"
            ? [
                {
                  label: "Aguardando minha aprovação",
                  val: stats.pendentes,
                  color: "#92400e",
                  bg: "#fef3c7"
                },
                {
                  label: "Aprovadas por mim (encam. ao RH)",
                  val: stats.aprovadas,
                  color: "#065f46",
                  bg: "#d1fae5"
                },
                {
                  label: "Rejeitadas por mim",
                  val: stats.rejeitadas,
                  color: "#7a1e26",
                  bg: "#fee2e2"
                },
                {
                  label: "Funcionários na equipe",
                  val: equipeCount ?? "–",
                  color: "#1e3a5f",
                  bg: "#dbeafe"
                }
              ]
            : [
                {
                  label: "Aguardando aprovação do RH",
                  val: stats.pendentes,
                  color: "#1e40af",
                  bg: "#dbeafe"
                },
                {
                  label: "Aprovadas pelo RH",
                  val: stats.aprovadas,
                  color: "#065f46",
                  bg: "#d1fae5"
                },
                {
                  label: "Rejeitadas pelo RH",
                  val: stats.rejeitadas,
                  color: "#7a1e26",
                  bg: "#fee2e2"
                }
              ]
          ).map((c) => (
            <div
              key={c.label}
              style={{
                background: "#fff",
                borderRadius: "var(--radius-lg)",
                border: "1px solid rgba(122,30,38,0.08)",
                padding: "14px 18px"
              }}
            >
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 11,
                  color: "var(--ink-500)",
                  fontWeight: 600,
                  lineHeight: 1.3
                }}
              >
                {c.label}
              </p>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  fontFamily: "var(--font-display)",
                  background: c.bg,
                  color: c.color,
                  borderRadius: "var(--radius-md)",
                  padding: "2px 10px"
                }}
              >
                {c.val}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Feedback ── */}
      {feedbackMsg && (
        <div
          style={{
            background: feedbackMsg.startsWith("Erro") ? "#fee2e2" : "#d1fae5",
            color: feedbackMsg.startsWith("Erro") ? "#7a1e26" : "#065f46",
            border: `1px solid ${feedbackMsg.startsWith("Erro") ? "#fca5a5" : "#6ee7b7"}`,
            borderRadius: "var(--radius-md)",
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 500
          }}
        >
          {feedbackMsg}
        </div>
      )}

      {/* ── Abas ── */}
      {etapa !== "assinaturas" && etapa !== "correcoes_rh" && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            borderBottom: "1px solid rgba(122,30,38,0.1)",
            paddingBottom: 0
          }}
        >
          {(["pendentes", "historico"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              style={{
                padding: "9px 18px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: aba === a ? 700 : 500,
                color: aba === a ? "var(--burgundy-600)" : "var(--ink-500)",
                borderBottom: aba === a ? "2px solid var(--burgundy-600)" : "2px solid transparent",
                marginBottom: -1
              }}
            >
              {a === "pendentes"
                ? `Aguardando Aprovação${stats.pendentes > 0 ? ` (${stats.pendentes})` : ""}`
                : etapa === "rh"
                  ? "Histórico do RH"
                  : "Histórico"}
            </button>
          ))}
        </div>
      )}

      {/* ── Filtros e Lista ── */}
      {etapa !== "assinaturas" && etapa !== "correcoes_rh" && (
        <>
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 20,
              flexWrap: "wrap",
              alignItems: "center"
            }}
          >
            <div style={{ position: "relative", flex: "1 1 220px" }}>
              <SearchIcon
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-500)"
                }}
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou matrícula..."
                style={{
                  width: "100%",
                  paddingLeft: 30,
                  paddingRight: 10,
                  paddingTop: 8,
                  paddingBottom: 8,
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  boxSizing: "border-box"
                }}
              />
            </div>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                background: "#fff"
              }}
            >
              <option value="">Todos os tipos</option>
              {Object.entries(TIPO_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                void carregar();
                void carregarStats();
              }}
              title="Atualizar"
              style={{
                padding: "8px 12px",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13
              }}
            >
              <RefreshCwIcon size={14} /> Atualizar
            </button>
          </div>

          {/* ── Lista ── */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-500)" }}>
              Carregando solicitações...
            </div>
          ) : erro ? (
            <div
              style={{
                background: "#fee2e2",
                borderRadius: "var(--radius-md)",
                padding: "16px 20px",
                color: "#7a1e26"
              }}
            >
              {erro}
            </div>
          ) : solicitacoesFiltradas.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 20px",
                background: "#fff",
                borderRadius: "var(--radius-lg)",
                border: "1px solid rgba(122,30,38,0.08)"
              }}
            >
              {aba === "pendentes" ? (
                <>
                  <CheckCircleIcon size={36} style={{ color: "#16a34a", marginBottom: 12 }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--ink-700)" }}>
                    {etapa === "rh"
                      ? "Nenhuma solicitação aguardando aprovação do RH."
                      : "Nenhuma solicitação aguardando aprovação."}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                    {etapa === "rh"
                      ? "Solicitações aprovadas pelos gestores aparecerão aqui para análise final."
                      : "Quando os membros da sua equipe enviarem solicitações, elas aparecerão aqui."}
                  </p>
                </>
              ) : (
                <>
                  <UsersIcon size={36} style={{ color: "var(--ink-400)", marginBottom: 12 }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--ink-700)" }}>
                    Nenhum registro no histórico.
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-500)" }}>
                    {etapa === "rh"
                      ? "Solicitações já decididas pelo RH aparecerão aqui."
                      : "As solicitações que você aprovar ou rejeitar aparecerão aqui após a decisão."}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {solicitacoesFiltradas.map((s) =>
                etapa === "rh" ? (
                  <SolicitacaoCardRH
                    key={s.id}
                    s={s}
                    mostrarAcoes={aba === "pendentes"}
                    onDecidir={abrirModalRH}
                    onEnviarGuia={abrirModalGuia}
                    onEnviarFolhaFerias={abrirModalFolha}
                  />
                ) : (
                  <SolicitacaoCard
                    key={s.id}
                    s={s}
                    mostrarAcoes={aba === "pendentes"}
                    onDecidir={abrirModal}
                  />
                )
              )}
            </div>
          )}

          {/* ── Paginação ── */}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: "6px 14px",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: "var(--radius-md)",
                  background: "#fff",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  fontSize: 13
                }}
              >
                ← Anterior
              </button>
              <span style={{ padding: "6px 14px", fontSize: 13, color: "var(--ink-500)" }}>
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "6px 14px",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: "var(--radius-md)",
                  background: "#fff",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  fontSize: 13
                }}
              >
                Próxima →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Lista de Correções de Ponto (Gerente de RH) ── */}
      {etapa === "correcoes_rh" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Abas pendentes / histórico */}
          <div
            style={{
              display: "flex",
              gap: 4,
              borderBottom: "1px solid rgba(122,30,38,0.10)",
              marginBottom: 4
            }}
          >
            {(["pendentes", "historico"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAba(a)}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: aba === a ? 700 : 500,
                  color: aba === a ? "var(--burgundy-600)" : "var(--ink-500)",
                  borderBottom:
                    aba === a ? "2px solid var(--burgundy-600)" : "2px solid transparent",
                  marginBottom: -1
                }}
              >
                {a === "pendentes"
                  ? `Aguardando aprovação${statsAdmin.pendentes > 0 ? ` (${statsAdmin.pendentes})` : ""}`
                  : "Histórico"}
              </button>
            ))}
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-500)" }}>
              Carregando…
            </div>
          ) : solicitacoesFiltradas.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "48px 20px",
                background: "#fff",
                borderRadius: "var(--radius-lg)",
                border: "1px solid rgba(122,30,38,0.08)"
              }}
            >
              <CheckCircleIcon size={36} style={{ color: "#16a34a", marginBottom: 12 }} />
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "var(--ink-700)" }}>
                {aba === "pendentes"
                  ? "Nenhuma correção aguardando aprovação."
                  : "Nenhum registro no histórico."}
              </p>
            </div>
          ) : (
            solicitacoesFiltradas.map((s) => (
              <CardCorrecaoRH
                key={s.id}
                s={s}
                mostrarAcoes={aba === "pendentes"}
                onAprovar={() => {
                  setModalAdminSol(s);
                  setModalAdminDecisao("APROVAR");
                  setModalAdminObs("");
                  setModalAdminErro("");
                  setFeedbackMsg("");
                }}
                onRejeitar={() => {
                  setModalAdminSol(s);
                  setModalAdminDecisao("REJEITAR");
                  setModalAdminObs("");
                  setModalAdminErro("");
                  setFeedbackMsg("");
                }}
              />
            ))
          )}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: "6px 14px",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: "var(--radius-md)",
                  background: "#fff",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  fontSize: 13
                }}
              >
                ← Anterior
              </button>
              <span style={{ padding: "6px 14px", fontSize: 13, color: "var(--ink-500)" }}>
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "6px 14px",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: "var(--radius-md)",
                  background: "#fff",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  fontSize: 13
                }}
              >
                Próxima →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Popup de confirmação — gestor ── */}
      {modalSol && (
        <ModalDecisao
          solicitacao={modalSol}
          decisao={modalDecisao}
          resumo={textoResumo(modalSol)}
          onConfirm={confirmarDecisao}
          onClose={() => setModalSol(null)}
          loading={modalLoading}
        />
      )}

      {/* ── Popup de confirmação — RH ── */}
      {modalRhSol && (
        <ModalDecisaoRH
          solicitacao={modalRhSol}
          decisao={modalRhDecisao}
          resumo={textoResumo(modalRhSol)}
          onConfirm={confirmarDecisaoRH}
          onClose={() => setModalRhSol(null)}
          loading={modalLoading}
          erro={modalRhErro}
        />
      )}

      {/* ── Popup de envio de guia médica — RH ── */}
      {modalGuiaSol && (
        <ModalEnviarGuia
          solicitacao={modalGuiaSol}
          resumo={textoResumo(modalGuiaSol)}
          onConfirm={confirmarEnviarGuia}
          onClose={() => setModalGuiaSol(null)}
          loading={modalLoading}
          erro={modalGuiaErro}
        />
      )}

      {/* ── Popup de envio de folha de férias — RH ── */}
      {modalFolhaSol && (
        <ModalEnviarFolhaFerias
          solicitacao={modalFolhaSol}
          onConfirm={confirmarEnviarFolha}
          onClose={() => setModalFolhaSol(null)}
          loading={modalLoading}
          erro={modalFolhaErro}
        />
      )}

      {/* ── Modal aprovação Gerente de RH (correções de ponto criadas pelo RH) ── */}
      {modalAdminSol && (
        <ModalDecisaoAdmin
          solicitacao={modalAdminSol}
          decisao={modalAdminDecisao}
          onConfirm={confirmarAdmin}
          onClose={() => setModalAdminSol(null)}
          loading={modalLoading}
          erro={modalAdminErro}
          setErro={setModalAdminErro}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   CARD DE CORREÇÃO DE PONTO (etapa admin)
══════════════════════════════════════════ */

function CardCorrecaoRH({
  s,
  mostrarAcoes,
  onAprovar,
  onRejeitar
}: {
  s: Solicitacao;
  mostrarAcoes: boolean;
  onAprovar: () => void;
  onRejeitar: () => void;
}) {
  const meta = s.metadados as Record<string, unknown> | null;
  const correcoesDia = Array.isArray(meta?.correcoesDia)
    ? (meta!.correcoesDia as Array<{
        acao: string;
        tipoRegistro: string;
        horario: string;
        horarioOriginal?: string;
      }>)
    : [];
  const criadoPor = (meta?.criadoPorNome as string) ?? "RH";
  const isAguardando = s.status === "AGUARDANDO_GESTOR_RH";

  const statusBg = isAguardando
    ? "rgba(122,30,38,0.06)"
    : s.status === "APROVADA"
      ? "rgba(47,125,79,0.06)"
      : "rgba(200,57,63,0.06)";
  const statusColor = isAguardando ? "#7a1e26" : s.status === "APROVADA" ? "#2f7d4f" : "#c8393f";
  const statusLabel = isAguardando
    ? "Aguardando Gerente de RH"
    : s.status === "APROVADA"
      ? "Aprovada"
      : "Rejeitada";

  const fmtDt = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.12)",
        borderLeft: isAguardando ? "4px solid #7a1e26" : "4px solid transparent",
        padding: "16px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start"
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: s.funcionario.fotoPerfilUrl ? "transparent" : "var(--burgundy-600)",
          border: s.funcionario.fotoPerfilUrl ? "2px solid var(--burgundy-600)" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          flexShrink: 0,
          overflow: "hidden"
        }}
      >
        {s.funcionario.fotoPerfilUrl ? (
          <img
            src={s.funcionario.fotoPerfilUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          s.funcionario.user.name[0].toUpperCase()
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Nome + status */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 6
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-900)" }}>
            {s.funcionario.user.name}
          </span>
          {s.funcionario.matricula && (
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
              mat. {s.funcionario.matricula}
            </span>
          )}
          {s.funcionario.gerencia && (
            <span
              style={{
                background: "rgba(122,30,38,0.07)",
                color: "var(--burgundy-600)",
                borderRadius: 4,
                padding: "1px 7px",
                fontSize: 11,
                fontWeight: 600
              }}
            >
              {s.funcionario.gerencia.nome}
            </span>
          )}
          <span
            style={{
              background: statusBg,
              color: statusColor,
              borderRadius: 4,
              padding: "2px 9px",
              fontSize: 11,
              fontWeight: 700
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Dia a corrigir */}
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--ink-700)", fontWeight: 500 }}>
          Dia a corrigir:{" "}
          <strong style={{ fontFamily: "var(--font-mono)" }}>{fmtDt(s.dataReferencia)}</strong>
          {" · "}Criada em {fmtDt(s.createdAt)} por <strong>{criadoPor}</strong>
        </p>

        {/* Correções propostas */}
        {correcoesDia.length > 0 && (
          <div
            style={{
              background: "rgba(122,30,38,0.04)",
              border: "1px solid rgba(122,30,38,0.10)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              marginBottom: 8
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
              Alterações propostas
            </p>
            {correcoesDia.map((c, i) => {
              const tipoLabel: Record<string, string> = {
                ENTRADA: "Entrada",
                INICIO_INTERVALO: "Início Intervalo",
                FIM_INTERVALO: "Fim Intervalo",
                SAIDA: "Saída"
              };
              return (
                <p key={i} style={{ margin: "0 0 3px", fontSize: 13, color: "var(--ink-800)" }}>
                  {c.acao === "CORRIGIR" ? "✏️" : c.acao === "INCLUIR" ? "➕" : "🗑️"}{" "}
                  <strong>{tipoLabel[c.tipoRegistro] ?? c.tipoRegistro}</strong>
                  {c.acao === "CORRIGIR" && c.horarioOriginal && (
                    <span style={{ color: "var(--ink-500)", marginLeft: 4 }}>
                      {c.horarioOriginal}
                    </span>
                  )}
                  {c.acao === "CORRIGIR" && (
                    <span style={{ margin: "0 4px", color: "var(--ink-400)" }}>→</span>
                  )}
                  {(c.acao === "CORRIGIR" || c.acao === "INCLUIR") && (
                    <strong style={{ fontFamily: "var(--font-mono)", color: "#2f7d4f" }}>
                      {c.horario}
                    </strong>
                  )}
                  {c.acao === "EXCLUIR" && (
                    <span style={{ color: "#c8393f", marginLeft: 4 }}>(excluir)</span>
                  )}
                </p>
              );
            })}
          </div>
        )}

        {/* Justificativa */}
        {s.descricao && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-600)", fontStyle: "italic" }}>
            Justificativa: "{s.descricao}"
          </p>
        )}
        {s.rhObservacao && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: s.status === "APROVADA" ? "#065f46" : "#7a1e26",
              fontStyle: "italic"
            }}
          >
            {s.status === "APROVADA" ? "✅" : "❌"} {s.rhObservacao}
          </p>
        )}
      </div>

      {/* Ações */}
      {mostrarAcoes && isAguardando && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onAprovar}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "8px 16px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "#2f7d4f",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            ✅ Aprovar
          </button>
          <button
            onClick={onRejeitar}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "8px 16px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "#c8393f",
              color: "#fff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            ❌ Rejeitar
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MODAL DE DECISÃO — GERENTE DE RH
══════════════════════════════════════════ */

function ModalDecisaoAdmin({
  solicitacao,
  decisao,
  onConfirm,
  onClose,
  loading,
  erro,
  setErro
}: {
  solicitacao: Solicitacao;
  decisao: "APROVAR" | "REJEITAR";
  onConfirm: (obs: string) => void;
  onClose: () => void;
  loading: boolean;
  erro: string;
  setErro: (e: string) => void;
}) {
  const [obs, setObs] = useState("");
  const isAprovar = decisao === "APROVAR";
  const cor = isAprovar ? "#2f7d4f" : "#c8393f";
  const corBg = isAprovar ? "rgba(47,125,79,0.07)" : "rgba(200,57,63,0.07)";

  const meta = solicitacao.metadados as Record<string, unknown> | null;
  const correcoesDia = Array.isArray(meta?.correcoesDia)
    ? (meta!.correcoesDia as Array<{
        acao: string;
        tipoRegistro: string;
        horario: string;
        horarioOriginal?: string;
      }>)
    : [];

  function handleConfirm() {
    if (!isAprovar && !obs.trim()) {
      setErro("O motivo da rejeição é obrigatório.");
      return;
    }
    onConfirm(obs);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            background: corBg,
            borderBottom: `1px solid ${cor}33`,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14
          }}
        >
          <span style={{ fontSize: 30, lineHeight: 1 }}>{isAprovar ? "✅" : "❌"}</span>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: cor,
                fontFamily: "var(--font-display)"
              }}
            >
              {isAprovar ? "Aprovar Correção de Ponto" : "Rejeitar Correção de Ponto"}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-500)" }}>
              {solicitacao.funcionario.user.name} ·{" "}
              {new Date(solicitacao.dataReferencia).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Resumo das correções */}
          {isAprovar && correcoesDia.length > 0 && (
            <div
              style={{
                background: "rgba(122,30,38,0.04)",
                border: "1px solid rgba(122,30,38,0.10)",
                borderRadius: "var(--radius-md)",
                padding: "10px 14px"
              }}
            >
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--ink-400)",
                  textTransform: "uppercase"
                }}
              >
                Alterações que serão aplicadas
              </p>
              {correcoesDia.map((c, i) => {
                const tipoLabel: Record<string, string> = {
                  ENTRADA: "Entrada",
                  INICIO_INTERVALO: "Início Intervalo",
                  FIM_INTERVALO: "Fim Intervalo",
                  SAIDA: "Saída"
                };
                return (
                  <p key={i} style={{ margin: "0 0 3px", fontSize: 13 }}>
                    {c.acao === "CORRIGIR" ? "✏️" : c.acao === "INCLUIR" ? "➕" : "🗑️"}{" "}
                    <strong>{tipoLabel[c.tipoRegistro] ?? c.tipoRegistro}</strong>
                    {c.acao === "CORRIGIR" && c.horarioOriginal && (
                      <span style={{ color: "var(--ink-500)", margin: "0 4px" }}>
                        {c.horarioOriginal} →
                      </span>
                    )}
                    {(c.acao === "CORRIGIR" || c.acao === "INCLUIR") && (
                      <strong
                        style={{ fontFamily: "var(--font-mono)", color: "#2f7d4f", marginLeft: 4 }}
                      >
                        {c.horario}
                      </strong>
                    )}
                  </p>
                );
              })}
            </div>
          )}

          {isAprovar && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-700)", lineHeight: 1.6 }}>
              Os registros serão alterados e marcados como <strong>modificados pelo RH</strong>.
              Esta ação não pode ser desfeita.
            </p>
          )}

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-700)"
              }}
            >
              {isAprovar ? (
                "Observação (opcional)"
              ) : (
                <>
                  Motivo da rejeição <span style={{ color: "var(--red)" }}>*</span>
                </>
              )}
            </label>
            <textarea
              value={obs}
              onChange={(e) => {
                setObs(e.target.value);
                setErro("");
              }}
              rows={3}
              placeholder={
                isAprovar ? "Observação para o RH..." : "Informe o motivo da rejeição..."
              }
              style={{
                width: "100%",
                padding: "9px 11px",
                border: `1px solid ${!isAprovar && !obs.trim() && erro ? "rgba(200,57,63,0.5)" : "rgba(122,30,38,0.14)"}`,
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
              disabled={loading}
              style={{
                padding: "10px 20px",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13,
                color: "var(--ink-600)"
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: "var(--radius-md)",
                background: loading ? "#9ca3af" : cor,
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700
              }}
            >
              {loading ? "Processando…" : isAprovar ? "Confirmar aprovação" : "Confirmar rejeição"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
