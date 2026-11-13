import React, { useState } from "react";
import { api } from "../../hooks/useApi";

/** RH prorroga o prazo de assinatura de um documento de férias (Aviso ou Recibo). */
export function ProrrogarPrazoFeriasModal({
  rotulo,
  url,
  ordem,
  prazoAtual,
  onClose,
  onSalvo
}: {
  rotulo: string;
  /** Ex.: `/auditoria/rh/solicitacoes/ID/ferias/documentos/AVISO/prazo`. */
  url: string;
  /** 2º/3º período: número da rodada; omitido no 1º. */
  ordem?: number;
  /** Prazo vigente (AAAA-MM-DD). */
  prazoAtual: string;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [novoPrazo, setNovoPrazo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!novoPrazo) return setErro("Informe a nova data limite.");
    if (novoPrazo <= prazoAtual) return setErro("A nova data deve ser posterior ao prazo atual.");
    if (motivo.trim().length < 5) return setErro("Informe o motivo (mínimo 5 caracteres).");
    setSalvando(true);
    setErro("");
    try {
      await api.patch(url, { novoPrazo, motivo: motivo.trim(), ordem });
      onSalvo();
    } catch (e) {
      setErro((e as Error).message || "Não foi possível prorrogar o prazo.");
    } finally {
      setSalvando(false);
    }
  }

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
      onClick={(e) => e.target === e.currentTarget && !salvando && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 440,
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }}
      >
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#2f7d4f" }}>
          ⏱ Prorrogar prazo — {rotulo}
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-600)" }}>
          Prazo atual: <strong>{prazoAtual.split("-").reverse().join("/")}</strong>. A nova data
          vale só para este documento e o funcionário é avisado.
        </p>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          Nova data limite
          <input
            type="date"
            value={novoPrazo}
            min={prazoAtual}
            onChange={(e) => setNovoPrazo(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(122,30,38,0.14)",
              borderRadius: "var(--radius-md)",
              fontSize: 13
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
          Motivo
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: funcionário em viagem, assinatura prorrogada pela chefia"
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(122,30,38,0.14)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              resize: "vertical"
            }}
          />
        </label>
        {erro && <p style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{erro}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" disabled={salvando} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={salvando}
            onClick={() => void salvar()}
          >
            {salvando ? "Salvando…" : "Prorrogar prazo"}
          </button>
        </div>
      </div>
    </div>
  );
}
