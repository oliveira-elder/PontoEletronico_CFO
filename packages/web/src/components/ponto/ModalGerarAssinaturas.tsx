import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../hooks/useApi";
import { XIcon, SearchIcon } from "../icons";
import { CAT, type Categoria } from "../../pages/ponto/gestaoShared";

type Situacao = "APTO" | "JA_POSSUI" | "NAO_APTO";

interface Elegibilidade {
  funcionarioId: string;
  nome: string;
  matricula: string | null;
  categoria: string;
  gerenciaId: string | null;
  gerencia: string | null;
  situacao: Situacao;
  motivo: string | null;
  aviso: string | null;
}

interface Previa {
  mes: number;
  ano: number;
  mesEncerrado: boolean;
  funcionarios: Elegibilidade[];
}

const SITUACAO: Record<Situacao, { label: string; cor: string; bg: string }> = {
  APTO: { label: "Apto", cor: "#065f46", bg: "#d1fae5" },
  JA_POSSUI: { label: "Já possui", cor: "#1e40af", bg: "#dbeafe" },
  NAO_APTO: { label: "Não apto", cor: "#7a1e26", bg: "#fee2e2" }
};

const CRITERIOS = [
  "O mês precisa estar encerrado.",
  "Funcionário ativo, admitido até o fim do mês.",
  "Com primeiro acesso ao sistema até o fim do mês (antes disso a folha fica vazia).",
  "Com obrigação de registro de ponto em ao menos um dia do mês (isentos — Comissionado, Chefe, Assessor — ficam de fora).",
  "Não cedido a outro órgão durante o mês inteiro.",
  "Folha com dias em Falta/Pendente continua apta: o funcionário precisa regularizar antes de assinar."
];

/**
 * Prévia da geração manual das assinaturas do quadro mensal: mostra cada funcionário ativo
 * como apto ou não (com o motivo), permite filtrar e escolher quem recebe a assinatura.
 */
export function ModalGerarAssinaturas({
  mes,
  ano,
  token,
  gerencias,
  onClose,
  onGerado
}: {
  mes: number;
  ano: number;
  token: string;
  gerencias: { id: string; nome: string; sigla: string }[];
  onClose: () => void;
  onGerado: (mensagem: string) => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [gerenciaId, setGerenciaId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [situacao, setSituacao] = useState<Situacao | "">("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);
  const [verCriterios, setVerCriterios] = useState(false);

  const mesLabel = `${String(mes).padStart(2, "0")}/${ano}`;

  useEffect(() => {
    api
      .get<Previa>(`/auditoria/assinaturas/previa-mes?mes=${mes}&ano=${ano}`, token)
      .then((p) => {
        setPrevia(p);
        /* Por padrão, todos os aptos já vêm selecionados. */
        setSelecionados(
          new Set(p.funcionarios.filter((f) => f.situacao === "APTO").map((f) => f.funcionarioId))
        );
      })
      .catch((e) => setErro((e as Error).message || "Erro ao carregar a prévia."));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mes, ano, token]);

  const lista = previa?.funcionarios ?? [];
  const contagem = useMemo(() => {
    const c: Record<Situacao, number> = { APTO: 0, JA_POSSUI: 0, NAO_APTO: 0 };
    for (const f of lista) c[f.situacao]++;
    return c;
  }, [lista]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(
      (f) =>
        (!q || f.nome.toLowerCase().includes(q) || (f.matricula ?? "").includes(q)) &&
        (!gerenciaId || f.gerenciaId === gerenciaId) &&
        (!categoria || f.categoria === categoria) &&
        (!situacao || f.situacao === situacao)
    );
  }, [lista, busca, gerenciaId, categoria, situacao]);

  const aptosFiltrados = filtrados.filter((f) => f.situacao === "APTO");
  const todosFiltradosMarcados =
    aptosFiltrados.length > 0 && aptosFiltrados.every((f) => selecionados.has(f.funcionarioId));

  function alternar(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function alternarFiltrados() {
    setSelecionados((s) => {
      const n = new Set(s);
      for (const f of aptosFiltrados) {
        if (todosFiltradosMarcados) n.delete(f.funcionarioId);
        else n.add(f.funcionarioId);
      }
      return n;
    });
  }

  async function gerar() {
    if (!selecionados.size) return;
    setGerando(true);
    setErro("");
    try {
      const r = await api.post<{ criadas: number; ignoradas: number; naoAptos: number }>(
        "/auditoria/assinaturas/gerar-mes",
        { mes, ano, funcionarioIds: [...selecionados] },
        token
      );
      onGerado(
        `${r.criadas} assinatura${r.criadas !== 1 ? "s" : ""} gerada${r.criadas !== 1 ? "s" : ""} para ${mesLabel}` +
          (r.ignoradas ? ` · ${r.ignoradas} já existia${r.ignoradas !== 1 ? "m" : ""}` : "") +
          (r.naoAptos ? ` · ${r.naoAptos} fora dos critérios` : "") +
          "."
      );
    } catch (e) {
      setErro((e as Error).message || "Erro ao gerar assinaturas.");
      setGerando(false);
    }
  }

  const campo: React.CSSProperties = {
    padding: "7px 10px",
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: "var(--radius-md)",
    fontSize: 13,
    background: "#fff"
  };
  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--ink-500)",
    padding: "8px 10px",
    position: "sticky",
    top: 0,
    background: "var(--cream-50)",
    zIndex: 1
  };
  const td: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 13,
    borderTop: "1px solid rgba(122,30,38,0.06)",
    verticalAlign: "top"
  };

  return (
    <>
      <div
        onClick={() => !gerando && onClose()}
        style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.45)", zIndex: 100 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gerar-assinaturas-titulo"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(980px, calc(100vw - 32px))",
          maxHeight: "92dvh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          zIndex: 101,
          boxShadow: "0 24px 80px rgba(10,5,6,0.28)",
          overflow: "hidden"
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(122,30,38,0.08)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: "var(--gold-500)",
                margin: "0 0 2px"
              }}
            >
              Assinatura do quadro mensal
            </p>
            <h2
              id="gerar-assinaturas-titulo"
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 19,
                color: "var(--burgundy-600)",
                fontWeight: 400,
                margin: 0
              }}
            >
              Gerar assinaturas — {mesLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              padding: 6,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--ink-500)",
              alignSelf: "flex-start"
            }}
          >
            <XIcon size={18} />
          </button>
        </div>

        <div
          style={{
            padding: "14px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            borderBottom: "1px solid rgba(122,30,38,0.08)"
          }}
        >
          {previa && !previa.mesEncerrado && (
            <p
              role="alert"
              style={{
                margin: 0,
                padding: "9px 12px",
                borderRadius: "var(--radius-md)",
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#7a1e26",
                fontSize: 13
              }}
            >
              {mesLabel} ainda não foi encerrado. As assinaturas só podem ser geradas depois do fim
              do mês.
            </p>
          )}

          {/* Resumo — clicável como filtro */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {(Object.keys(SITUACAO) as Situacao[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSituacao((atual) => (atual === s ? "" : s))}
                style={{
                  padding: "5px 11px",
                  borderRadius: 999,
                  border: `1.5px solid ${situacao === s ? SITUACAO[s].cor : "transparent"}`,
                  background: SITUACAO[s].bg,
                  color: SITUACAO[s].cor,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                {SITUACAO[s].label}: {previa ? contagem[s] : "…"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setVerCriterios((v) => !v)}
              style={{
                marginLeft: "auto",
                border: "none",
                background: "transparent",
                color: "var(--burgundy-600)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline"
              }}
            >
              {verCriterios ? "Ocultar critérios" : "Ver critérios de aptidão"}
            </button>
          </div>
          {verCriterios && (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12.5,
                color: "var(--ink-600)",
                lineHeight: 1.6
              }}
            >
              {CRITERIOS.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}

          {/* Filtros */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 220px" }}>
              <SearchIcon
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--ink-400)"
                }}
              />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou matrícula"
                style={{ ...campo, width: "100%", paddingLeft: 30, boxSizing: "border-box" }}
              />
            </div>
            <select
              value={gerenciaId}
              onChange={(e) => setGerenciaId(e.target.value)}
              style={{ ...campo, flex: "1 1 180px" }}
            >
              <option value="">Todos os departamentos</option>
              {gerencias.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              style={{ ...campo, flex: "0 1 170px" }}
            >
              <option value="">Todas as categorias</option>
              {(Object.keys(CAT) as Categoria[]).map((c) => (
                <option key={c} value={c}>
                  {CAT[c].label}
                </option>
              ))}
            </select>
            <select
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as Situacao | "")}
              style={{ ...campo, flex: "0 1 150px" }}
            >
              <option value="">Todas as situações</option>
              <option value="APTO">Aptos</option>
              <option value="NAO_APTO">Não aptos</option>
              <option value="JA_POSSUI">Já possuem</option>
            </select>
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: "1 1 auto", minHeight: 160, overflowY: "auto" }}>
          {!previa && !erro ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>
              Avaliando funcionários…
            </p>
          ) : filtrados.length === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>
              Nenhum funcionário com esses filtros.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 36 }}>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os aptos filtrados"
                      checked={todosFiltradosMarcados}
                      disabled={aptosFiltrados.length === 0 || !previa?.mesEncerrado}
                      onChange={alternarFiltrados}
                      style={{ accentColor: "var(--burgundy-600)" }}
                    />
                  </th>
                  <th style={th}>Funcionário</th>
                  <th style={th}>Matr.</th>
                  <th style={th}>Depto.</th>
                  <th style={th}>Categoria</th>
                  <th style={th}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((f) => {
                  const apto = f.situacao === "APTO";
                  const sit = SITUACAO[f.situacao];
                  return (
                    <tr
                      key={f.funcionarioId}
                      style={{ background: apto ? undefined : "rgba(0,0,0,0.015)" }}
                    >
                      <td style={td}>
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${f.nome}`}
                          checked={apto && selecionados.has(f.funcionarioId)}
                          disabled={!apto || !previa?.mesEncerrado}
                          onChange={() => alternar(f.funcionarioId)}
                          style={{ accentColor: "var(--burgundy-600)" }}
                        />
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: "var(--ink-900)" }}>{f.nome}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)" }}>
                        {f.matricula ?? "—"}
                      </td>
                      <td style={td}>{f.gerencia ?? "—"}</td>
                      <td style={td}>{CAT[f.categoria as Categoria]?.label ?? f.categoria}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: sit.bg,
                            color: sit.cor,
                            fontSize: 11.5,
                            fontWeight: 700
                          }}
                        >
                          {sit.label}
                        </span>
                        {(f.motivo || f.aviso) && (
                          <div
                            style={{
                              fontSize: 12,
                              color: f.motivo ? "var(--ink-600)" : "#8a6a00",
                              marginTop: 3,
                              lineHeight: 1.4
                            }}
                          >
                            {f.motivo ?? `⚠ ${f.aviso}`}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Rodapé */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid rgba(122,30,38,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            background: "var(--cream-50)"
          }}
        >
          <span style={{ fontSize: 13, color: "var(--ink-600)", flex: "1 1 200px" }}>
            {erro ? (
              <span style={{ color: "var(--red)" }}>{erro}</span>
            ) : (
              <>
                <strong>{selecionados.size}</strong> selecionado
                {selecionados.size !== 1 ? "s" : ""} de {contagem.APTO} apto
                {contagem.APTO !== 1 ? "s" : ""}
              </>
            )}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void gerar()}
            disabled={gerando || !selecionados.size || !previa?.mesEncerrado}
            style={{
              background: "var(--burgundy-700)",
              borderColor: "var(--burgundy-700)",
              opacity: gerando || !selecionados.size || !previa?.mesEncerrado ? 0.55 : 1
            }}
          >
            {gerando
              ? "Gerando…"
              : `Gerar ${selecionados.size} assinatura${selecionados.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}
