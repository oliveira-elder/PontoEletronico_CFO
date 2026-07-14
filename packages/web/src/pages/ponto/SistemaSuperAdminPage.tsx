import React, { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { CrownIcon, PlayIcon, AlertCircleIcon, CheckCircleIcon } from "../../components/icons";

/* ── Types ── */

interface SuperAdminNativo {
  fonte: "env";
  username: string;
  userId: string | null;
  name: string | null;
  email: string | null;
}

interface SuperAdminConcedido {
  fonte: "db";
  id: string;
  userId: string;
  name: string;
  email: string;
  gerencia: string | null;
  concedidoPor: string;
  createdAt: string;
}

interface CandidatoGerti {
  userId: string;
  name: string;
  email: string;
  matricula: string | null;
  cargo: string;
  gerencia: string | null;
}

interface StartSolicitacao {
  id: string;
  mesReferencia: string;
  status: string;
  solicitadoPor: { id: string; name: string; email: string };
  observacaoSolicitante: string | null;
  createdAt: string;
  executadoEm: string | null;
}

interface StartStatus {
  dataInicioProducao: string | null;
  pendente: StartSolicitacao | null;
  historico: StartSolicitacao[];
}

const STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_GERTI: "Aguardando GERTI",
  AGUARDANDO_RH: "Aguardando RH",
  REJEITADA_GERTI: "Rejeitada (GERTI)",
  REJEITADA_RH: "Rejeitada (RH)",
  EXECUTADO: "Executado",
  CANCELADA: "Cancelada"
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function mesAtualYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ── Page ── */

export function SistemaSuperAdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"sa" | "start">("sa");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);

  const [nativos, setNativos] = useState<SuperAdminNativo[]>([]);
  const [concedidos, setConcedidos] = useState<SuperAdminConcedido[]>([]);
  const [candidatos, setCandidatos] = useState<CandidatoGerti[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busySa, setBusySa] = useState(false);

  const [start, setStart] = useState<StartStatus | null>(null);
  const [mesRef, setMesRef] = useState(mesAtualYYYYMM());
  const [obsStart, setObsStart] = useState("");
  const [busyStart, setBusyStart] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const [sa, cand, st] = await Promise.all([
        api.get<{ nativos: SuperAdminNativo[]; concedidos: SuperAdminConcedido[] }>(
          "/sistema/super-admins"
        ),
        api.get<CandidatoGerti[]>("/sistema/candidatos-gerti"),
        api.get<StartStatus>("/sistema/start")
      ]);
      setNativos(sa.nativos);
      setConcedidos(sa.concedidos);
      setCandidatos(cand);
      setStart(st);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!user?.isSuperAdmin) {
    return <Navigate to="/ponto" replace />;
  }

  async function conceder() {
    if (!selectedUserId) return;
    setBusySa(true);
    setErro("");
    setOk("");
    try {
      await api.post("/sistema/super-admins", { userId: selectedUserId });
      setOk("Super Administrador concedido. Gerente GERTI e responsável de RH foram notificados.");
      setSelectedUserId("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao conceder.");
    } finally {
      setBusySa(false);
    }
  }

  async function revogar(userId: string, name: string) {
    if (!window.confirm(`Revogar Super Admin de ${name}?`)) return;
    setBusySa(true);
    setErro("");
    setOk("");
    try {
      await api.delete(`/sistema/super-admins/${userId}`);
      setOk("Concessão revogada.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao revogar.");
    } finally {
      setBusySa(false);
    }
  }

  async function solicitarStart() {
    if (!mesRef) return;
    if (
      !window.confirm(
        `Solicitar Start para ${mesRef}?\n\nApós aprovações da GERTI e do RH, o banco de horas será zerado e o histórico de teste ficará restrito a Super Administradores.`
      )
    ) {
      return;
    }
    setBusyStart(true);
    setErro("");
    setOk("");
    try {
      await api.post("/sistema/start", {
        mesReferencia: mesRef,
        observacao: obsStart || undefined
      });
      setOk("Solicitação de Start enviada para aprovação do gerente da GERTI.");
      setObsStart("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao solicitar Start.");
    } finally {
      setBusyStart(false);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          fontWeight: 800,
          color: "var(--burgundy-800)",
          marginBottom: 6
        }}
      >
        Configuração de Sistema
      </h1>
      <p style={{ color: "var(--ink-500)", fontSize: 14, marginBottom: 20 }}>
        Super Administradores e Start de produção — acesso exclusivo de Super Admin.
      </p>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          borderBottom: "1px solid rgba(122,30,38,0.12)"
        }}
      >
        {(
          [
            { id: "sa" as const, label: "Super Administradores", icon: <CrownIcon size={16} /> },
            { id: "start" as const, label: "Start do Sistema", icon: <PlayIcon size={16} /> }
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--burgundy-600)" : "var(--ink-500)",
              borderBottom:
                tab === t.id ? "2px solid var(--burgundy-600)" : "2px solid transparent",
              marginBottom: -1,
              fontSize: 13
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {erro && (
        <div
          style={{
            background: "#fee2e2",
            color: "#7a1e26",
            border: "1px solid #fca5a5",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
            display: "flex",
            gap: 8,
            alignItems: "center"
          }}
        >
          <AlertCircleIcon size={16} />
          {erro}
        </div>
      )}
      {ok && (
        <div
          style={{
            background: "#d1fae5",
            color: "#065f46",
            border: "1px solid #6ee7b7",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
            display: "flex",
            gap: 8,
            alignItems: "center"
          }}
        >
          <CheckCircleIcon size={16} />
          {ok}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--ink-400)" }}>Carregando…</p>
      ) : tab === "sa" ? (
        <section>
          <div
            style={{
              background: "var(--surface-1, #fff)",
              border: "1px solid rgba(122,30,38,0.1)",
              borderRadius: "var(--radius-lg)",
              padding: 20,
              marginBottom: 20
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Conceder permissão</h2>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14 }}>
              Apenas usuários ativos da GERTI. O gerente da GERTI e o responsável de RH serão
              notificados por e-mail e no sistema.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 240,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.2)",
                  fontSize: 13
                }}
              >
                <option value="">Selecione um usuário GERTI…</option>
                {candidatos.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.name} — {c.email}
                    {c.matricula ? ` (${c.matricula})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedUserId || busySa}
                onClick={() => void conceder()}
                className="btn-primary"
                style={{
                  padding: "10px 18px",
                  background: "var(--burgundy-700)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontWeight: 600,
                  cursor: selectedUserId && !busySa ? "pointer" : "not-allowed",
                  opacity: selectedUserId && !busySa ? 1 : 0.6
                }}
              >
                Conceder Super Admin
              </button>
            </div>
            {candidatos.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--ink-400)", marginTop: 10 }}>
                Nenhum candidato GERTI disponível (já são Super Admin ou não há usuários GERTI
                ativos).
              </p>
            )}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Nativos (env)</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {nativos.map((n) => (
              <div
                key={n.username}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.1)",
                  background: "rgba(138,106,0,0.04)"
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {n.name ?? n.username}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#8a6a00",
                        background: "#fef3c7",
                        padding: "2px 8px",
                        borderRadius: 999
                      }}
                    >
                      nativo
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    {n.email ?? n.username}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Concedidos (banco)</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {concedidos.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--ink-400)" }}>Nenhuma concessão ativa.</p>
            )}
            {concedidos.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.1)"
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    {c.email}
                    {c.gerencia ? ` · ${c.gerencia}` : ""} · por {c.concedidoPor} em{" "}
                    {fmtDate(c.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busySa}
                  onClick={() => void revogar(c.userId, c.name)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid #fca5a5",
                    background: "#fff",
                    color: "#7a1e26",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Revogar
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section>
          <div
            style={{
              background: start?.dataInicioProducao ? "rgba(6,95,70,0.06)" : "rgba(138,106,0,0.06)",
              border: `1px solid ${start?.dataInicioProducao ? "#6ee7b7" : "#fcd34d"}`,
              borderRadius: "var(--radius-lg)",
              padding: 16,
              marginBottom: 20
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
              {start?.dataInicioProducao ? "Sistema em produção" : "Fase de teste"}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-600)" }}>
              {start?.dataInicioProducao
                ? `Go-live desde ${start.dataInicioProducao}. Histórico anterior só é visível para Super Admin.`
                : "Ainda não houve Start. Banco de horas e histórico seguem a partir do primeiro login de cada usuário."}
            </div>
          </div>

          {start?.pendente ? (
            <div
              style={{
                border: "1px solid rgba(122,30,38,0.15)",
                borderRadius: "var(--radius-lg)",
                padding: 20,
                marginBottom: 20
              }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                Solicitação em andamento
              </h2>
              <p style={{ fontSize: 13, marginBottom: 4 }}>
                Mês: <strong>{start.pendente.mesReferencia}</strong>
              </p>
              <p style={{ fontSize: 13, marginBottom: 4 }}>
                Status:{" "}
                <strong>{STATUS_LABEL[start.pendente.status] ?? start.pendente.status}</strong>
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
                Solicitante: {start.pendente.solicitadoPor.name} ·{" "}
                {fmtDate(start.pendente.createdAt)}
              </p>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid rgba(122,30,38,0.1)",
                borderRadius: "var(--radius-lg)",
                padding: 20,
                marginBottom: 20
              }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Solicitar Start</h2>
              <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 14 }}>
                Define o mês de go-live. Após aprovação do gerente da GERTI e do responsável de RH
                (dupla confirmação), zera o banco de horas (marco global) e restringe o histórico de
                teste. Configurações e usuários são preservados.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Mês de referência
                  <input
                    type="month"
                    value={mesRef}
                    onChange={(e) => setMesRef(e.target.value)}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 4,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.2)",
                      fontSize: 13
                    }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Observação (opcional)
                  <textarea
                    value={obsStart}
                    onChange={(e) => setObsStart(e.target.value)}
                    rows={3}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 4,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.2)",
                      fontSize: 13,
                      resize: "vertical"
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={busyStart || !mesRef}
                  onClick={() => void solicitarStart()}
                  style={{
                    padding: "10px 18px",
                    background: "var(--burgundy-700)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontWeight: 600,
                    cursor: busyStart ? "not-allowed" : "pointer",
                    opacity: busyStart ? 0.6 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    width: "fit-content"
                  }}
                >
                  <PlayIcon size={16} />
                  Solicitar Start
                </button>
              </div>
            </div>
          )}

          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            Histórico de solicitações
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(start?.historico ?? []).length === 0 && (
              <p style={{ fontSize: 13, color: "var(--ink-400)" }}>Nenhuma solicitação ainda.</p>
            )}
            {(start?.historico ?? []).map((h) => (
              <div
                key={h.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(122,30,38,0.1)",
                  fontSize: 13
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {h.mesReferencia} — {STATUS_LABEL[h.status] ?? h.status}
                </div>
                <div style={{ color: "var(--ink-500)", fontSize: 12 }}>
                  {h.solicitadoPor.name} · {fmtDate(h.createdAt)}
                  {h.executadoEm ? ` · executado ${fmtDate(h.executadoEm)}` : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
