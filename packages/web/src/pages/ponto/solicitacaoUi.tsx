import React, { useState } from "react";
import { CheckCircleIcon, XCircleIcon, UserIcon } from "../../components/icons";

/* ─── Tipos compartilhados ─── */

export interface SolicitacaoResumo {
  id: string;
  tipo: string;
  status?: string;
  dataReferencia: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  descricao: string;
  metadados?: Record<string, unknown> | null;
  createdAt: string;
  gestorObservacao?: string | null;
  gestorResolvidoEm?: string | null;
  gestorUser?: { name: string } | null;
  funcionario: {
    matricula?: string | null;
    fotoPerfilUrl?: string | null;
    user: { name: string; email?: string; emailReal?: string | null };
    gerencia?: { sigla: string; nome?: string } | null;
  };
}

const TIPO_LABEL: Record<string, string> = {
  CORRECAO_PONTO: "Correção de Ponto",
  ATESTADO: "Atestado Médico",
  FERIAS: "Férias",
  LICENCA: "Licença",
  ABONO: "Abono de Falta"
};

const TIPO_PONTO: Record<string, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Início de Intervalo",
  FIM_INTERVALO: "Fim de Intervalo",
  SAIDA: "Saída"
};

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return iso;
  }
}

function diffDias(inicio: string, fim: string): number {
  try {
    const d1 = new Date(inicio);
    const d2 = new Date(fim);
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1);
  } catch {
    return 1;
  }
}

export function textoResumo(s: SolicitacaoResumo): string {
  const nome = s.funcionario.user.name;
  const meta = s.metadados;

  switch (s.tipo) {
    case "CORRECAO_PONTO": {
      if (!meta) return `${nome} solicita correção de ponto.`;
      const acao = (meta.acao as string) === "INCLUIR" ? "inclusão" : "alteração";
      const tipoPonto =
        TIPO_PONTO[(meta.tipoRegistro as string) ?? ""] ?? (meta.tipoRegistro as string);
      if (meta.acao === "INCLUIR") {
        return `${nome} solicita a ${acao} de registro de ponto: ${tipoPonto} às ${meta.horarioSolicitado as string} em ${fmtDate(s.dataReferencia)}.`;
      }
      const de = meta.horarioOriginal ? `de ${meta.horarioOriginal as string} ` : "";
      return `${nome} solicita a ${acao} do registro de ${tipoPonto} ${de}para ${meta.horarioSolicitado as string} em ${fmtDate(s.dataReferencia)}.`;
    }
    case "ATESTADO": {
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 1;
      const periodo =
        meta?.horarioInicio && meta?.horarioFim
          ? ` (${meta.horarioInicio as string}–${meta.horarioFim as string})`
          : "";
      if (inicio === fim) {
        return `${nome} solicita o registro de atestado médico em ${inicio}${periodo}.`;
      }
      return `${nome} solicita o registro de atestado médico de ${inicio} a ${fim}${periodo} — ${dias} dia${dias !== 1 ? "s" : ""}.`;
    }
    case "FERIAS": {
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 0;
      const periodo = meta?.periodoNumero ? ` (${meta.periodoNumero as number}º período)` : "";
      const venda =
        meta?.diasVenda && (meta.diasVenda as number) > 0
          ? `, vendendo ${meta.diasVenda as number} dia${(meta.diasVenda as number) !== 1 ? "s" : ""}`
          : "";
      return `${nome} solicita férias de ${inicio} a ${fim} — ${dias} dia${dias !== 1 ? "s" : ""} corridos${periodo}${venda}.`;
    }
    case "LICENCA": {
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      if (inicio === fim) return `${nome} solicita licença em ${inicio}.`;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 0;
      return `${nome} solicita licença de ${inicio} a ${fim} — ${dias} dia${dias !== 1 ? "s" : ""}.`;
    }
    case "ABONO": {
      const inicio = s.dataInicio ? fmtDate(s.dataInicio) : fmtDate(s.dataReferencia);
      const fim = s.dataFim ? fmtDate(s.dataFim) : inicio;
      const tipoAbono =
        (meta?.tipoAbono as string) === "FUTURO" ? "abono de dia futuro" : "abono de falta";
      if (inicio === fim) return `${nome} solicita ${tipoAbono} em ${inicio}.`;
      const dias = s.dataInicio && s.dataFim ? diffDias(s.dataInicio, s.dataFim) : 0;
      return `${nome} solicita ${tipoAbono} de ${inicio} a ${fim} — ${dias} dia${dias !== 1 ? "s" : ""}.`;
    }
    default:
      return `${nome} abriu uma solicitação de ${TIPO_LABEL[s.tipo] ?? s.tipo}.`;
  }
}

export function Avatar({ name, fotoUrl }: { name: string; fotoUrl?: string | null }) {
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

export function TipoBadge({ tipo }: { tipo: string }) {
  const label = TIPO_LABEL[tipo] ?? tipo.replace(/_/g, " ");
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

export function LogTimelineGestorHistorico({
  s
}: {
  s: SolicitacaoResumo & {
    status?: string;
    rhObservacao?: string | null;
    rhResolvidoEm?: string | null;
    observacaoGestor?: string | null;
  };
}) {
  const gestorNome = s.gestorUser?.name ?? "Gestor";
  const gestorRejeitou = s.status === "REJEITADA_GESTOR";
  const gestorObs = s.gestorObservacao ?? s.observacaoGestor;
  const gestorData = s.gestorResolvidoEm;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginTop: 10,
        padding: "10px 12px",
        background: "rgba(122,30,38,0.04)",
        border: "1px solid rgba(122,30,38,0.12)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-400)"
        }}
      >
        Etapa do gestor
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
          📤 <strong>Enviada</strong> em {fmtDateTime(s.createdAt)}
        </p>
        {gestorData ? (
          <p
            style={{
              margin: 0,
              fontSize: 11.5,
              color: gestorRejeitou ? "#dc2626" : "#16a34a",
              lineHeight: 1.45
            }}
          >
            {gestorRejeitou ? "❌" : "✅"} <strong>Gestor {gestorNome}</strong>{" "}
            {gestorRejeitou ? "rejeitou" : "aprovou"} em {fmtDateTime(gestorData)}
            {gestorObs ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{gestorObs}"
              </span>
            ) : null}
          </p>
        ) : gestorObs ? (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-600)", lineHeight: 1.45 }}>
            💬 <strong>Gestor {gestorNome}</strong>: "{gestorObs}"
          </p>
        ) : null}
        {!gestorRejeitou && s.status === "AGUARDANDO_RH" && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#7c3aed" }}>
            ⏳ <strong>Encaminhada ao RH</strong> — aguardando análise final
          </p>
        )}
        {!gestorRejeitou && s.status === "APROVADA" && s.rhResolvidoEm && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#16a34a", lineHeight: 1.45 }}>
            ✅ <strong>RH aprovou</strong> em {fmtDateTime(s.rhResolvidoEm)}
            {s.rhObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.rhObservacao}"
              </span>
            ) : null}
          </p>
        )}
        {!gestorRejeitou && s.status === "REJEITADA_RH" && s.rhResolvidoEm && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#dc2626", lineHeight: 1.45 }}>
            ❌ <strong>RH rejeitou</strong> em {fmtDateTime(s.rhResolvidoEm)}
            {s.rhObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.rhObservacao}"
              </span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

export function LogTimelineGestor({ s }: { s: SolicitacaoResumo }) {
  const gestorNome = s.gestorUser?.name ?? "Gestor";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginTop: 8,
        padding: "10px 12px",
        background: "rgba(37,99,235,0.04)",
        border: "1px solid rgba(37,99,235,0.12)",
        borderRadius: "var(--radius-md)"
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--ink-400)"
        }}
      >
        Histórico
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-500)" }}>
          📤 <strong>Enviada</strong> em {fmtDateTime(s.createdAt)}
        </p>
        {s.gestorResolvidoEm && (
          <p style={{ margin: 0, fontSize: 11.5, color: "#2563eb", lineHeight: 1.45 }}>
            ✅ <strong>Gestor {gestorNome}</strong> aprovou em {fmtDateTime(s.gestorResolvidoEm)}
            {s.gestorObservacao ? (
              <span
                style={{
                  display: "block",
                  marginTop: 3,
                  fontStyle: "italic",
                  color: "var(--ink-600)",
                  paddingLeft: 18
                }}
              >
                "{s.gestorObservacao}"
              </span>
            ) : null}
          </p>
        )}
        <p style={{ margin: 0, fontSize: 11.5, color: "#7c3aed" }}>
          ⏳ <strong>Aguardando análise do RH</strong>
        </p>
      </div>
    </div>
  );
}

export function SolicitacaoCardRH({
  s,
  mostrarAcoes = true,
  onDecidir
}: {
  s: SolicitacaoResumo;
  mostrarAcoes?: boolean;
  onDecidir: (s: SolicitacaoResumo, decisao: "APROVAR" | "REJEITAR") => void;
}) {
  const email = s.funcionario.user.emailReal || s.funcionario.user.email;
  const resumo = textoResumo(s);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(37,99,235,0.15)",
        padding: "16px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start"
      }}
    >
      <Avatar name={s.funcionario.user.name} fotoUrl={s.funcionario.fotoPerfilUrl} />

      <div style={{ flex: 1, minWidth: 0 }}>
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
              {s.funcionario.gerencia.sigla}
            </span>
          )}
          <span
            className={`badge ${
              s.status === "APROVADA"
                ? "badge-green"
                : s.status === "REJEITADA_RH"
                  ? "badge-red"
                  : "badge-blue"
            }`}
          >
            {s.status === "APROVADA"
              ? "Aprovada pelo RH"
              : s.status === "REJEITADA_RH"
                ? "Rejeitada pelo RH"
                : "Aguardando RH"}
          </span>
        </div>

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

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 8
          }}
        >
          <TipoBadge tipo={s.tipo} />
          <span style={{ fontSize: 11, color: "var(--ink-400)" }}>
            Ref.: {fmtDate(s.dataReferencia)}
          </span>
          {email && (
            <>
              <span style={{ fontSize: 11, color: "var(--ink-400)" }}>•</span>
              <span style={{ fontSize: 11, color: "var(--ink-400)" }}>{email}</span>
            </>
          )}
        </div>

        <LogTimelineGestor s={s} />

        {s.descricao && (
          <p
            style={{
              margin: "8px 0 0",
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
      </div>

      {mostrarAcoes && (
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
            <CheckCircleIcon size={14} /> Aprovar (RH)
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
            <XCircleIcon size={14} /> Rejeitar (RH)
          </button>
        </div>
      )}
    </div>
  );
}

export function ModalDecisaoRH({
  solicitacao,
  decisao,
  resumo,
  onConfirm,
  onClose,
  loading,
  erro
}: {
  solicitacao: SolicitacaoResumo;
  decisao: "APROVAR" | "REJEITAR";
  resumo: string;
  onConfirm: (observacao: string) => void;
  onClose: () => void;
  loading: boolean;
  erro?: string;
}) {
  const [obs, setObs] = useState("");

  const isAprovar = decisao === "APROVAR";
  const corAcao = isAprovar ? "#16a34a" : "#dc2626";
  const corAcaoClaro = isAprovar ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.06)";
  const corBorda = isAprovar ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)";
  const emoji = isAprovar ? "✅" : "❌";
  const titulo = isAprovar ? "Confirmar Aprovação Final (RH)" : "Confirmar Rejeição (RH)";

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
          maxWidth: 520,
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
          overflow: "hidden"
        }}
      >
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

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
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

          <LogTimelineGestor s={solicitacao} />

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
              ? "Você confirma a aprovação final desta solicitação?"
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
              A aprovação será definitiva e a alteração será aplicada ao ponto do funcionário.
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
              {isAprovar ? "Observação (opcional)" : "Motivo da rejeição (obrigatório)"}
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder={
                isAprovar
                  ? "Deixe uma observação registrada na solicitação, se necessário..."
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
                gap: 7
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
