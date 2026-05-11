import React, { useState, useEffect } from "react";
import { PlusIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon } from "../../components/icons";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";

type TipoSolicitacao = "CORRECAO_PONTO" | "ATESTADO" | "FERIAS" | "LICENCA" | "ABONO";
type StatusSolicitacao = "PENDENTE" | "APROVADA" | "REJEITADA";

interface Solicitacao {
  id: string;
  tipo: string;
  dataReferencia: string;
  descricao: string;
  status: StatusSolicitacao;
  observacaoGestor?: string;
  resolvidoEm?: string;
  createdAt: string;
}

const TIPO_LABEL: Record<TipoSolicitacao, string> = {
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

function StatusIcon({ status }: { status: StatusSolicitacao }) {
  if (status === "APROVADA") return <CheckCircleIcon size={16} style={{ color: "var(--green)" }} />;
  if (status === "REJEITADA") return <XCircleIcon size={16} style={{ color: "var(--red)" }} />;
  return <AlertCircleIcon size={16} style={{ color: "#8a6a00" }} />;
}

function StatusBadge({ status }: { status: StatusSolicitacao }) {
  const cls = { PENDENTE: "badge-amber", APROVADA: "badge-green", REJEITADA: "badge-red" }[status];
  const lbl = { PENDENTE: "Pendente", APROVADA: "Aprovada", REJEITADA: "Rejeitada" }[status];
  return <span className={`badge ${cls}`}>{lbl}</span>;
}

/* ─── Modal nova solicitação ─── */
function NovaModal({
  token: tk,
  onClose,
  onCriada
}: {
  token: string | undefined;
  onClose: () => void;
  onCriada: (s: Solicitacao) => void;
}) {
  const [tipo, setTipo] = useState<TipoSolicitacao>("CORRECAO_PONTO");
  const [data, setData] = useState("");
  const [desc, setDesc] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  async function handleEnviar() {
    if (!data || !desc) return;
    setEnviando(true);
    setErro("");
    try {
      const nova = await api.post<Solicitacao>(
        "/ponto/solicitacoes",
        {
          tipo,
          dataReferencia: new Date(data + "T12:00:00").toISOString(),
          descricao: desc
        },
        tk
      );
      onCriada(nova);
      setOk(true);
      setTimeout(onClose, 1500);
    } catch (e: unknown) {
      setErro((e as Error).message ?? "Falha ao enviar solicitação.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,5,6,0.55)",
        zIndex: 200,
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
          padding: 28,
          boxShadow: "0 24px 64px -16px rgba(10,5,6,0.30)"
        }}
      >
        {ok ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircleIcon size={40} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>Solicitação enviada!</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                Nova Solicitação
              </p>
              <h2 style={{ fontSize: 20, fontFamily: "var(--font-display)" }}>
                Abrir <em>Solicitação</em>
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="input-label">Tipo de solicitação</label>
                <select
                  className="input"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoSolicitacao)}
                >
                  {Object.entries(TIPO_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Data de referência</label>
                <input
                  type="date"
                  className="input"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Descrição / justificativa</label>
                <textarea
                  className="input"
                  rows={4}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Descreva o motivo com detalhes…"
                  style={{ resize: "vertical" }}
                />
              </div>
              {erro && <p style={{ fontSize: 12.5, color: "var(--red)" }}>⚠️ {erro}</p>}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={handleEnviar}
                disabled={enviando || !data || !desc}
              >
                {enviando ? "Enviando…" : "Enviar solicitação"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Page ─── */
export function SolicitacoesPage() {
  const { token } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [filtro, setFiltro] = useState<StatusSolicitacao | "TODAS">("TODAS");

  useEffect(() => {
    const tk = token();
    if (!tk) {
      setLoading(false);
      return;
    }
    api
      .get<Solicitacao[]>("/ponto/solicitacoes", tk)
      .then((data) => setSolicitacoes(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const exibir =
    filtro === "TODAS" ? solicitacoes : solicitacoes.filter((s) => s.status === filtro);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {modalAberto && (
        <NovaModal
          token={token()}
          onClose={() => setModalAberto(false)}
          onCriada={(nova) => setSolicitacoes((prev) => [nova, ...prev])}
        />
      )}

      {/* Cabeçalho */}
      <div style={{ marginBottom: 24 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Ponto Eletrônico
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Solicitações e <em>Justificativas</em>
          </h1>
          <button className="btn btn-primary btn-sm" onClick={() => setModalAberto(true)}>
            <PlusIcon size={15} /> Nova solicitação
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["TODAS", "PENDENTE", "APROVADA", "REJEITADA"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: "6px 14px",
              borderRadius: "var(--radius-full)",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              border:
                filtro === f ? "1.5px solid var(--burgundy-600)" : "1px solid rgba(122,30,38,0.18)",
              background: filtro === f ? "var(--burgundy-600)" : "white",
              color: filtro === f ? "white" : "var(--ink-700)",
              transition: "all 180ms ease"
            }}
          >
            {f === "TODAS" ? "Todas" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div
          style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-500)", fontSize: 14 }}
        >
          Carregando solicitações…
        </div>
      )}

      {/* Lista */}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {exibir.length === 0 && (
            <div
              className="card-flat"
              style={{ textAlign: "center", padding: "36px 16px", color: "var(--ink-500)" }}
            >
              <AlertCircleIcon size={28} style={{ margin: "0 auto 8px" }} />
              <p>
                {solicitacoes.length === 0
                  ? "Nenhuma solicitação aberta."
                  : "Nenhuma solicitação encontrada para o filtro."}
              </p>
            </div>
          )}

          {exibir.map((s) => (
            <div
              key={s.id}
              className="card-flat"
              style={{
                borderLeft: `3px solid ${s.status === "APROVADA" ? "var(--green)" : s.status === "REJEITADA" ? "var(--red)" : "var(--amber)"}`
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 10
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusIcon status={s.status} />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
                      {TIPO_LABEL[s.tipo as TipoSolicitacao] ?? s.tipo}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>
                      Ref: {fmtDate(s.dataReferencia)} · Aberta em {fmtDateTime(s.createdAt)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: "var(--ink-700)",
                  lineHeight: 1.6,
                  marginBottom: s.observacaoGestor ? 10 : 0
                }}
              >
                {s.descricao}
              </p>

              {s.observacaoGestor && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "var(--cream-50)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.08)"
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-500)",
                      marginBottom: 4
                    }}
                  >
                    Resposta do gestor{s.resolvidoEm ? ` · ${fmtDateTime(s.resolvidoEm)}` : ""}
                  </p>
                  <p style={{ fontSize: 13, color: "var(--ink-700)" }}>{s.observacaoGestor}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
