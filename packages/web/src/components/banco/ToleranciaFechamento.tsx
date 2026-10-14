import React, { useEffect, useState } from "react";
import { api } from "../../hooks/useApi";

const inputStyle: React.CSSProperties = {
  width: 100,
  padding: "7px 10px",
  border: "1px solid rgba(122,30,38,0.14)",
  borderRadius: "var(--radius-md)",
  fontSize: 14,
  fontFamily: "var(--font-mono)",
  boxSizing: "border-box"
};

/** Só dígitos, sem negativo e sem zero à esquerda. */
const soNumero = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/**
 * Configurações → Períodos: tolerância GLOBAL do fechamento do banco de horas (dias após a
 * data-marco). Vale para todos; o RH pode definir uma tolerância individual na ficha do
 * funcionário (Gestão), que sobrepõe esta.
 */
export function ToleranciaFechamentoGlobal({ podeEditar }: { podeEditar: boolean }) {
  const [valor, setValor] = useState("0");
  const [salvo, setSalvo] = useState("0");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api
      .get<{ dias: number }>("/ponto/config/banco-horas/tolerancia-fechamento")
      .then((r) => {
        setValor(String(r?.dias ?? 0));
        setSalvo(String(r?.dias ?? 0));
      })
      .catch(() => undefined);
  }, []);

  async function salvar() {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api.put<{ dias: number }>("/ponto/config/banco-horas/tolerancia-fechamento", {
        dias: valor
      });
      setSalvo(String(r.dias));
      setMsg({ ok: true, texto: "Tolerância salva." });
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message || "Não foi possível salvar." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ink-500)",
          marginBottom: 10,
          letterSpacing: "0.05em",
          textTransform: "uppercase"
        }}
      >
        Tolerância do fechamento (todos os funcionários)
      </p>
      <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 10, lineHeight: 1.6 }}>
        Quantidade de dias <strong>depois da data marco</strong> em que o banco de horas é de fato
        fechado (zerado). Vale para todos os funcionários como padrão; o RH pode definir uma
        tolerância diferente para um funcionário na ficha dele, em Gestão.{" "}
        <strong>0 = fecha na própria data marco.</strong>
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          style={inputStyle}
          inputMode="numeric"
          value={valor}
          disabled={!podeEditar}
          onChange={(e) => setValor(soNumero(e.target.value))}
          aria-label="Tolerância do fechamento em dias"
        />
        <span style={{ fontSize: 13, color: "var(--ink-500)" }}>dia(s)</span>
        {podeEditar && (
          <button
            className="btn btn-primary btn-sm"
            disabled={ocupado || valor === salvo || valor === ""}
            onClick={() => void salvar()}
          >
            {ocupado ? "Salvando…" : "Salvar tolerância"}
          </button>
        )}
        {msg && (
          <span style={{ fontSize: 12.5, color: msg.ok ? "var(--green)" : "var(--red)" }}>
            {msg.ok ? "✓ " : "⚠ "}
            {msg.texto}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Gestão → ficha do funcionário: tolerância INDIVIDUAL do fechamento (RH). Vazio = usa a
 * global; um número (inclusive maior que a global) vale só para este funcionário.
 */
export function ToleranciaFechamentoFuncionario({
  funcionarioId,
  somenteLeitura
}: {
  funcionarioId: string;
  somenteLeitura: boolean;
}) {
  const [valor, setValor] = useState("");
  const [salvo, setSalvo] = useState("");
  const [globalDias, setGlobalDias] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api
      .get<{ individualDias: number | null; globalDias: number }>(
        `/ponto/gestao/funcionarios/${funcionarioId}/banco-horas/tolerancia-fechamento`
      )
      .then((r) => {
        const v = r.individualDias === null ? "" : String(r.individualDias);
        setValor(v);
        setSalvo(v);
        setGlobalDias(r.globalDias);
      })
      .catch(() => undefined);
  }, [funcionarioId]);

  async function salvar() {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api.put<{ individualDias: number | null; globalDias: number }>(
        `/ponto/gestao/funcionarios/${funcionarioId}/banco-horas/tolerancia-fechamento`,
        { dias: valor === "" ? null : valor }
      );
      const v = r.individualDias === null ? "" : String(r.individualDias);
      setValor(v);
      setSalvo(v);
      setMsg({ ok: true, texto: "Tolerância individual salva." });
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message || "Não foi possível salvar." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        border: "1px solid rgba(122,30,38,0.12)",
        borderRadius: "var(--radius-md)",
        background: "var(--cream-50)"
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--burgundy-600)" }}>
        Tolerância do fechamento do banco de horas
      </p>
      <p style={{ margin: "4px 0 8px", fontSize: 12, color: "var(--ink-500)", lineHeight: 1.5 }}>
        Quantos dias depois da data marco o banco deste funcionário é fechado. Deixe em branco para
        usar a tolerância geral ({globalDias} dia{globalDias === 1 ? "" : "s"}, em Configurações →
        Períodos). Pode ser maior que a geral; só vale para este funcionário.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          style={inputStyle}
          inputMode="numeric"
          placeholder={`${globalDias} (geral)`}
          value={valor}
          disabled={somenteLeitura}
          onChange={(e) => setValor(soNumero(e.target.value))}
          aria-label="Tolerância individual em dias"
        />
        <span style={{ fontSize: 13, color: "var(--ink-500)" }}>dia(s)</span>
        {!somenteLeitura && (
          <button
            className="btn btn-primary btn-sm"
            disabled={ocupado || valor === salvo}
            onClick={() => void salvar()}
          >
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        )}
        {msg && (
          <span style={{ fontSize: 12.5, color: msg.ok ? "var(--green)" : "var(--red)" }}>
            {msg.ok ? "✓ " : "⚠ "}
            {msg.texto}
          </span>
        )}
      </div>
    </div>
  );
}
