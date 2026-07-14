import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import { PlayIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon } from "../../components/icons";

interface PendenciaStart {
  id: string;
  mesReferencia: string;
  status: string;
  etapa: "GERTI" | "RH";
  solicitadoPor: { name: string; email: string };
  observacaoSolicitante: string | null;
  createdAt: string;
}

/**
 * Card de aprovação do Start do sistema com dupla confirmação.
 * Visível apenas para o responsável GERTI ou RH com pendência.
 */
export function StartSistemaAprovacaoCard() {
  const [itens, setItens] = useState<PendenciaStart[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    item: PendenciaStart;
    acao: "APROVAR" | "REJEITAR";
    passo: 1 | 2;
  } | null>(null);
  const [obs, setObs] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const data = await api.get<PendenciaStart[]>("/sistema/start/pendencias");
      setItens(Array.isArray(data) ? data : []);
    } catch {
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (loading || itens.length === 0) return null;

  async function executar() {
    if (!modal) return;
    if (modal.passo === 1) {
      setModal({ ...modal, passo: 2 });
      return;
    }
    if (confirmText.trim().toUpperCase() !== "CONFIRMAR") {
      setErro("Digite CONFIRMAR para concluir a dupla confirmação.");
      return;
    }
    setBusy(true);
    setErro("");
    try {
      const path =
        modal.acao === "REJEITAR"
          ? `/sistema/start/${modal.item.id}/rejeitar`
          : modal.item.etapa === "GERTI"
            ? `/sistema/start/${modal.item.id}/aprovar-gerti`
            : `/sistema/start/${modal.item.id}/aprovar-rh`;
      await api.post(path, { observacao: obs || undefined });
      setMsg(
        modal.acao === "APROVAR"
          ? modal.item.etapa === "RH"
            ? "Start executado. Sistema em produção."
            : "Aprovado. Encaminhado para o responsável de RH."
          : "Solicitação de Start rejeitada."
      );
      setModal(null);
      setObs("");
      setConfirmText("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {msg && (
        <div
          style={{
            background: "#d1fae5",
            color: "#065f46",
            border: "1px solid #6ee7b7",
            borderRadius: "var(--radius-md)",
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: 13
          }}
        >
          {msg}
        </div>
      )}
      {itens.map((item) => (
        <div
          key={item.id}
          style={{
            border: "1px solid #f59e0b",
            background: "rgba(245,158,11,0.08)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
            marginBottom: 12
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <PlayIcon size={18} />
            <strong style={{ fontSize: 15 }}>Start do Sistema — sua aprovação</strong>
          </div>
          <p style={{ fontSize: 13, marginBottom: 4 }}>
            Mês de go-live: <strong>{item.mesReferencia}</strong> · Etapa:{" "}
            <strong>{item.etapa}</strong>
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 12 }}>
            Solicitante: {item.solicitadoPor.name}
            {item.observacaoSolicitante ? ` — ${item.observacaoSolicitante}` : ""}
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-600)", marginBottom: 12 }}>
            Ao aprovar (RH): zera banco de horas de todos e restringe histórico de teste a Super
            Admin. Configurações e usuários são preservados.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setModal({ item, acao: "APROVAR", passo: 1 });
                setObs("");
                setConfirmText("");
                setErro("");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: "#065f46",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              <CheckCircleIcon size={14} />
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => {
                setModal({ item, acao: "REJEITAR", passo: 1 });
                setObs("");
                setConfirmText("");
                setErro("");
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                background: "#fff",
                color: "#7a1e26",
                border: "1px solid #fca5a5",
                borderRadius: "var(--radius-md)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              <XCircleIcon size={14} />
              Rejeitar
            </button>
          </div>
        </div>
      ))}

      {modal && (
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
          onClick={() => !busy && setModal(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "var(--radius-lg)",
              padding: 24,
              maxWidth: 440,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              {modal.passo === 1 ? "Confirmar decisão" : "Dupla confirmação"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--ink-600)", marginBottom: 12 }}>
              {modal.acao === "APROVAR" ? "Aprovar" : "Rejeitar"} Start para{" "}
              <strong>{modal.item.mesReferencia}</strong> (etapa {modal.item.etapa}).
            </p>
            {modal.passo === 1 ? (
              <>
                <label
                  style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 12 }}
                >
                  Observação (opcional)
                  <textarea
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    rows={3}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 4,
                      padding: 10,
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(0,0,0,0.15)",
                      fontSize: 13
                    }}
                  />
                </label>
                <p style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 14 }}>
                  No próximo passo você precisará digitar <strong>CONFIRMAR</strong> para concluir.
                </p>
              </>
            ) : (
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 12 }}>
                Digite CONFIRMAR para finalizar
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 4,
                    padding: 10,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(0,0,0,0.15)",
                    fontSize: 13,
                    fontFamily: "monospace"
                  }}
                />
              </label>
            )}
            {erro && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  color: "#7a1e26",
                  fontSize: 12,
                  marginBottom: 10
                }}
              >
                <AlertCircleIcon size={14} />
                {erro}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 13
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void executar()}
                style={{
                  padding: "8px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: modal.acao === "APROVAR" ? "#065f46" : "#7a1e26",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                  fontSize: 13
                }}
              >
                {busy
                  ? "Aguarde…"
                  : modal.passo === 1
                    ? "Continuar"
                    : modal.acao === "APROVAR"
                      ? "Confirmar definitivamente"
                      : "Rejeitar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
