import React from "react";
import { CheckCircleIcon } from "../../icons";
import type { Estado } from "../tipos";

/** "Ponto Eletrônico" + título com a parte em itálico (<em>), como nas páginas reais. */
export function Cabecalho({
  eyebrow = "Ponto Eletrônico",
  antes,
  em,
  direita,
  sub
}: {
  eyebrow?: string;
  antes: string;
  em?: string;
  direita?: React.ReactNode;
  sub?: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>
        {eyebrow}
      </p>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <h1 style={{ fontSize: 28, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
          {antes} {em && <em>{em}</em>}
        </h1>
        {direita && <div style={{ display: "flex", gap: 8 }}>{direita}</div>}
      </div>
      {sub && <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

/** Campo de texto no estilo `.input` do sistema (mostra o valor digitado e o cursor de digitação). */
export function Campo({
  id,
  e,
  rotulo,
  obrigatorio,
  placeholder,
  data,
  area,
  larg
}: {
  id: string;
  e: Estado;
  rotulo?: string;
  obrigatorio?: boolean;
  placeholder?: string;
  data?: boolean;
  area?: boolean;
  larg?: number | string;
}) {
  const v = e[id];
  const texto = typeof v === "string" ? v : "";
  return (
    <div style={{ width: larg }}>
      {rotulo && (
        <label style={rotuloEstilo}>
          {rotulo} {obrigatorio && <span style={{ color: "var(--red)" }}>*</span>}
        </label>
      )}
      <div
        className="input"
        data-alvo={id}
        style={{
          width: "100%",
          minHeight: area ? 74 : 38,
          display: "flex",
          alignItems: area ? "flex-start" : "center",
          justifyContent: "space-between",
          padding: "9px 11px",
          fontSize: 13,
          background: "#fff",
          border: "1px solid rgba(122,30,38,0.14)",
          borderRadius: "var(--radius-md)"
        }}
      >
        <span
          className={e.__digitando === id ? "mk-caret" : undefined}
          style={{ color: texto ? "var(--ink-900)" : "var(--ink-500)" }}
        >
          {texto || placeholder || (data ? "dd/mm/aaaa" : "")}
        </span>
        {data && <span style={{ color: "var(--ink-500)", fontSize: 12 }}>📅</span>}
      </div>
    </div>
  );
}

export const rotuloEstilo: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-700)",
  marginBottom: 4
};

/** Lista suspensa (select) com a opção escolhida; abre durante a animação. */
export function Selecao({
  id,
  e,
  rotulo,
  vazio,
  opcoes,
  obrigatorio
}: {
  id: string;
  e: Estado;
  rotulo?: string;
  vazio: string;
  opcoes: string[];
  obrigatorio?: boolean;
}) {
  const v = e[id];
  return (
    <div style={{ position: "relative" }}>
      {rotulo && (
        <label style={rotuloEstilo}>
          {rotulo} {obrigatorio && <span style={{ color: "var(--red)" }}>*</span>}
        </label>
      )}
      <div
        className="input"
        data-alvo={id}
        style={{
          width: "100%",
          minHeight: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 11px",
          fontSize: 13,
          background: "#fff",
          border: "1px solid rgba(122,30,38,0.14)",
          borderRadius: "var(--radius-md)"
        }}
      >
        <span style={{ color: typeof v === "string" && v ? "var(--ink-900)" : "var(--ink-500)" }}>
          {typeof v === "string" && v ? v : vazio}
        </span>
        <span style={{ fontSize: 10, color: "var(--ink-500)" }}>▾</span>
      </div>
      {e.__aberto === id && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 60,
            background: "#fff",
            border: "1px solid rgba(122,30,38,0.18)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 24px rgba(10,5,6,0.18)",
            marginTop: 2,
            maxHeight: 220,
            overflow: "hidden"
          }}
        >
          {opcoes.map((o) => (
            <div key={o} data-alvo={`${id}::${o}`} style={{ padding: "8px 11px", fontSize: 13 }}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Botão de anexo (📎) no estilo do formulário real. */
export function BotaoAnexo({ id, texto }: { id: string; texto: string }) {
  return (
    <span
      data-alvo={id}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        border: "1px solid rgba(122,30,38,0.22)",
        borderRadius: "var(--radius-md)",
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--burgundy-600)",
        background: "#fff"
      }}
    >
      {texto}
    </span>
  );
}

/** Janela sobre a página (fundo escurecido), como os modais do sistema. */
export function Janela({
  titulo,
  voltar,
  largura = 560,
  children,
  cabecalho
}: {
  titulo?: string;
  voltar?: boolean;
  largura?: number;
  children: React.ReactNode;
  cabecalho?: React.ReactNode;
}) {
  return (
    <div className="mk-sombra">
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: largura,
          boxShadow: "0 24px 64px -16px rgba(10,5,6,0.30)",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {cabecalho ?? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 28px 16px",
              borderBottom: "1px solid rgba(122,30,38,0.08)"
            }}
          >
            <div>
              {voltar && (
                <span
                  data-alvo="btn-voltar"
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--ink-500)",
                    marginBottom: 4
                  }}
                >
                  ← Voltar
                </span>
              )}
              <h2 style={{ fontSize: 19, fontFamily: "var(--font-display)" }}>{titulo}</h2>
            </div>
            <span style={{ fontSize: 20, color: "var(--ink-500)" }}>✕</span>
          </div>
        )}
        <div style={{ padding: "16px 28px 28px" }}>{children}</div>
      </div>
    </div>
  );
}

export function SucessoJanela({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mk-sombra">
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: 560,
          textAlign: "center",
          padding: "52px 28px"
        }}
      >
        <CheckCircleIcon size={40} style={{ color: "var(--green)", margin: "0 auto 12px" }} />
        <p style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{titulo}</p>
        <p style={{ fontSize: 13, color: "var(--ink-500)" }}>{texto}</p>
      </div>
    </div>
  );
}

/** Caixa informativa colorida (aviso, dica, alerta). */
export function Caixa({
  tom,
  children,
  id
}: {
  tom: "azul" | "verde" | "ambar" | "vermelho" | "vinho";
  children: React.ReactNode;
  id?: string;
}) {
  const t = {
    azul: ["rgba(37,99,235,0.06)", "rgba(37,99,235,0.18)", "#1e40af"],
    verde: ["rgba(22,128,61,0.06)", "rgba(22,128,61,0.25)", "#166534"],
    ambar: ["#FEF3C7", "#F59E0B", "#92400E"],
    vermelho: ["rgba(200,57,63,0.06)", "rgba(200,57,63,0.25)", "var(--red)"],
    vinho: ["rgba(122,30,38,0.04)", "rgba(122,30,38,0.25)", "var(--burgundy-600)"]
  }[tom];
  return (
    <div
      data-alvo={id}
      style={{
        padding: "10px 12px",
        background: t[0],
        border: `1px solid ${t[1]}`,
        borderRadius: "var(--radius-md)",
        fontSize: 12.5,
        color: t[2],
        lineHeight: 1.55
      }}
    >
      {children}
    </div>
  );
}
