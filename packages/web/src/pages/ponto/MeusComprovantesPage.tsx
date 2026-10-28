import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ComprovanteModal } from "../../components/comprovante/ComprovanteModal";
import { useComprovantes, type ComprovanteItem } from "../../hooks/useComprovantes";
import { FileTextIcon } from "../../components/icons";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";

type Janela = "48h" | "mes" | "periodo";

const hojeIso = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

const CAMPO_DATA: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid rgba(122,30,38,0.2)",
  borderRadius: 8,
  fontSize: 12.5
};

/** Meus comprovantes: acesso a cada comprovante e extração das últimas 48 horas (art. 80, II e III). */
export function MeusComprovantesPage() {
  const { token } = useAuth();
  const hoje = new Date();
  const [janela, setJanela] = useState<Janela>("48h");
  /* Período livre: datas digitadas e as aplicadas na pesquisa (botão Pesquisar). */
  const [dataIni, setDataIni] = useState(hojeIso());
  const [dataFim, setDataFim] = useState(hojeIso());
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null);
  const [erroPeriodo, setErroPeriodo] = useState("");
  const { itens, carregando, erro } = useComprovantes(
    janela === "48h"
      ? { horas: 48 }
      : janela === "periodo" && periodo
        ? periodo
        : { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() }
  );

  function pesquisarPeriodo() {
    setErroPeriodo("");
    if (!dataIni || !dataFim) return setErroPeriodo("Informe a data inicial e a final.");
    if (dataIni > dataFim) return setErroPeriodo("A data inicial deve ser anterior à final.");
    if ((Date.parse(dataFim) - Date.parse(dataIni)) / 86_400_000 > 366) {
      return setErroPeriodo("O período máximo é de 1 ano.");
    }
    setPeriodo({ inicio: dataIni, fim: dataFim });
    setJanela("periodo");
  }
  const [aberto, setAberto] = useState<ComprovanteItem | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [msg, setMsg] = useState("");

  async function baixar48h() {
    setBaixando(true);
    setMsg("");
    try {
      await api.download(
        "/ponto/comprovantes/ultimas-48h",
        "Comprovantes-ultimas-48h.zip",
        token() ?? undefined
      );
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setBaixando(false);
    }
  }

  const porDia = new Map<string, ComprovanteItem[]>();
  for (const it of itens) porDia.set(it.data, [...(porDia.get(it.data) ?? []), it]);

  return (
    <div style={{ maxWidth: "var(--largura-pagina)", margin: "0 auto", width: "100%" }}>
      <p className="eyebrow" style={{ marginBottom: 6 }}>
        Registro de ponto
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(22px,3vw,30px)",
          lineHeight: 1.1
        }}
      >
        Meus <em>comprovantes</em>
      </h1>
      <p style={{ color: "var(--ink-500)", fontSize: 14, margin: "6px 0 18px" }}>
        Cada marcação gera um Comprovante de Registro de Ponto do Trabalhador, disponível logo após
        o registro (Portaria MTP nº 671/2021, arts. 79 e 80).
      </p>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 14,
          alignItems: "center"
        }}
      >
        {(["48h", "mes"] as const).map((j) => (
          <button
            key={j}
            type="button"
            className={`btn btn-sm ${janela === j ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setJanela(j)}
          >
            {j === "48h" ? "Últimas 48 horas" : "Este mês"}
          </button>
        ))}
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--ink-600)" }}>
            De{" "}
            <input
              type="date"
              value={dataIni}
              max={hojeIso()}
              onChange={(e) => setDataIni(e.target.value)}
              style={CAMPO_DATA}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--ink-600)" }}>
            até{" "}
            <input
              type="date"
              value={dataFim}
              max={hojeIso()}
              onChange={(e) => setDataFim(e.target.value)}
              style={CAMPO_DATA}
            />
          </label>
          <button
            type="button"
            className={`btn btn-sm ${janela === "periodo" ? "btn-primary" : "btn-ghost"}`}
            onClick={pesquisarPeriodo}
          >
            Pesquisar
          </button>
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={baixando}
          onClick={() => void baixar48h()}
        >
          {baixando ? "Gerando…" : "⬇ Baixar as últimas 48 horas (ZIP)"}
        </button>
      </div>
      {erroPeriodo && (
        <p style={{ fontSize: 13, marginBottom: 10, color: "#991B1B" }}>⚠ {erroPeriodo}</p>
      )}
      {msg && <p style={{ fontSize: 13, marginBottom: 10 }}>{msg}</p>}

      {carregando && <p style={{ fontSize: 13, color: "var(--ink-500)" }}>Carregando…</p>}
      {erro && <p style={{ fontSize: 13, color: "#991B1B" }}>⚠ {erro}</p>}
      {!carregando && !erro && itens.length === 0 && (
        <div
          className="card-flat"
          style={{ textAlign: "center", color: "var(--ink-500)", fontSize: 14 }}
        >
          Nenhuma marcação neste período.
          <div style={{ marginTop: 10 }}>
            <Link to="/ponto/registrar" className="btn btn-primary btn-sm">
              Bater ponto
            </Link>
          </div>
        </div>
      )}

      {[...porDia.entries()].map(([data, lista]) => (
        <div key={data} style={{ marginBottom: 16 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--ink-500)",
              margin: "0 0 8px"
            }}
          >
            {data} · {lista[0].diaSemana}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lista.map((c) => (
              <button
                key={c.nsr}
                type="button"
                onClick={() => setAberto(c)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  background: "#fff",
                  border: "1px solid rgba(122,30,38,0.10)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%"
                }}
              >
                <FileTextIcon size={18} style={{ color: "var(--burgundy-600)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{c.rotulo}</strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11.5,
                      color: "var(--ink-500)",
                      fontFamily: "var(--font-mono)"
                    }}
                  >
                    NSR {String(c.nsr).padStart(9, "0")}
                    {c.homologacao ? " · homologação" : ""}
                  </span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600 }}>
                  {c.hora}
                </span>
                <span style={{ fontSize: 12, color: "var(--burgundy-600)", fontWeight: 600 }}>
                  Abrir
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {aberto && (
        <ComprovanteModal
          nsr={aberto.nsr}
          rotulo={`${aberto.rotulo} ${aberto.hora}`}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}
