import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../hooks/useApi";
import { ConteudoSecao, type DadosVista } from "./ConteudoSecao";
import { DocumentacaoImpressao } from "./DocumentacaoImpressao";
import "./documentacao.css";
import type { AutoriaDoc, ResultadoBusca, RevisaoDoc, SecaoConteudo, SecaoIndice } from "./tipos";

const CHAVE_VISTO = "doc-tecnica-visto";
const BOTAO: React.CSSProperties = {
  border: "1px solid #ced4da",
  background: "#fff",
  borderRadius: 6,
  padding: "6px 12px",
  cursor: "pointer",
  fontSize: 13,
  color: "#343a40"
};

function lerVistos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_VISTO) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function gravarVisto(id: string, hash: string | null) {
  if (!hash) return;
  try {
    localStorage.setItem(CHAVE_VISTO, JSON.stringify({ ...lerVistos(), [id]: hash }));
  } catch {
    /* armazenamento indisponível: o selo "atualizada" simplesmente não persiste */
  }
}

/** Leitor da documentação: índice em árvore, busca, conteúdo, "nesta página", impressão e exportação. */
export function DocumentacaoLeitor({
  autoria,
  revisoes,
  emitidoPor,
  onIndiceCarregado
}: {
  autoria: AutoriaDoc | null;
  revisoes: RevisaoDoc[];
  emitidoPor: string;
  onIndiceCarregado: () => void;
}) {
  const [indice, setIndice] = useState<SecaoIndice[]>([]);
  const [atual, setAtual] = useState<string>("");
  const [secao, setSecao] = useState<SecaoConteudo | null>(null);
  const [dados, setDados] = useState<DadosVista | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);
  const [imprimindo, setImprimindo] = useState(false);
  const [recolhido, setRecolhido] = useState(true);
  const [vistos, setVistos] = useState<Record<string, string>>(lerVistos);
  const cacheDados = useRef(new Map<string, DadosVista>());
  const inputBusca = useRef<HTMLInputElement>(null);
  const principal = useRef<HTMLElement>(null);

  /* Índice (a chamada também confere se o código mudou e gera a revisão automática). */
  useEffect(() => {
    api
      .get<{ secoes: SecaoIndice[] }>("/logs/documentacao/indice")
      .then((r) => {
        setIndice(r.secoes);
        setAtual((a) => a || r.secoes[0]?.id || "");
        onIndiceCarregado();
      })
      .catch((e: Error) => setErro(e.message));
  }, []);

  /* Atalho "/" foca a busca. */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.key === "/" && alvo && !/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) {
        e.preventDefault();
        inputBusca.current?.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  /* Carrega a seção escolhida (e a parte gerada, quando houver). */
  useEffect(() => {
    if (!atual) return;
    let ativo = true;
    setSecao(null);
    setDados(undefined);
    setErro(null);
    (async () => {
      try {
        const s = await api.get<SecaoConteudo>(`/logs/documentacao/secao/${atual}`);
        if (!ativo) return;
        setSecao(s);
        requestAnimationFrame(() => {
          const el = principal.current;
          if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
        });
        gravarVisto(s.id, s.hash);
        setVistos(lerVistos());
        if (s.gerada) {
          let d = cacheDados.current.get(s.gerada);
          if (!d) {
            d = await api.get<DadosVista>(`/logs/documentacao/gerado/${s.gerada}`);
            cacheDados.current.set(s.gerada, d);
          }
          if (ativo) setDados(d);
        }
      } catch (e) {
        if (ativo) setErro((e as Error).message);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [atual]);

  /* Busca com atraso. */
  useEffect(() => {
    if (busca.trim().length < 2) {
      setResultados(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<{ resultados: ResultadoBusca[] }>(
          `/logs/documentacao/busca?q=${encodeURIComponent(busca.trim())}`
        )
        .then((r) => setResultados(r.resultados))
        .catch(() => setResultados([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const grupos = useMemo(() => {
    const m = new Map<string, SecaoIndice[]>();
    for (const s of indice) m.set(s.grupo, [...(m.get(s.grupo) ?? []), s]);
    return [...m.entries()];
  }, [indice]);

  const abrir = useCallback((id: string, ancora?: string | null) => {
    setAtual(id);
    setFoco(ancora ?? null);
    setResultados(null);
    setBusca("");
    setRecolhido(true);
  }, []);

  const baixar = async (rota: string, nome: string) => {
    try {
      await api.download(`/logs/documentacao/${rota}`, nome);
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div
        className="doc-nao-imprimir"
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
          position: "relative"
        }}
      >
        <button
          type="button"
          className="doc-indice-toggle"
          style={BOTAO}
          onClick={() => setRecolhido((v) => !v)}
        >
          ☰ Índice
        </button>
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <input
            ref={inputBusca}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar em textos, endpoints, tabelas e campos…  ( / )"
            style={{ ...BOTAO, width: "100%", boxSizing: "border-box", cursor: "text" }}
          />
          {resultados && (
            <div
              style={{
                position: "absolute",
                zIndex: 50,
                top: "100%",
                left: 0,
                right: 0,
                background: "#fff",
                border: "1px solid #ced4da",
                borderRadius: 8,
                maxHeight: 360,
                overflow: "auto",
                boxShadow: "0 6px 18px rgba(0,0,0,.12)"
              }}
            >
              {resultados.length === 0 && (
                <div style={{ padding: 10, color: "#6c757d" }}>Nada encontrado.</div>
              )}
              {resultados.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => abrir(r.secao, r.ancora)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "#fff",
                    padding: "7px 10px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f1f3f5"
                  }}
                >
                  <span style={{ fontSize: 11, color: "#6c757d", textTransform: "uppercase" }}>
                    {r.tipo}
                  </span>{" "}
                  <b style={{ fontSize: 13 }}>{r.titulo}</b>
                  <div style={{ fontSize: 12, color: "#6c757d" }}>{r.trecho}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          style={BOTAO}
          disabled={!autoria || imprimindo}
          onClick={() => setImprimindo(true)}
        >
          {imprimindo ? "Preparando…" : "Imprimir / PDF"}
        </button>
        <button
          type="button"
          style={BOTAO}
          onClick={() => void baixar("exportar.md", "documentacao-tecnica.md")}
        >
          Baixar Markdown
        </button>
        <button
          type="button"
          style={BOTAO}
          onClick={() => void baixar("exportar.zip", "documentacao-tecnica.zip")}
        >
          Baixar ZIP
        </button>
      </div>

      <div className="doc-layout">
        <nav
          className={`doc-indice doc-nao-imprimir${recolhido ? " recolhido" : ""}`}
          aria-label="Índice da documentação"
        >
          {grupos.map(([grupo, itens]) => (
            <div key={grupo} style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "#6c757d",
                  padding: "2px 8px"
                }}
              >
                {grupo}
              </div>
              {itens.map((s) => {
                const nova = s.hash && vistos[s.id] && vistos[s.id] !== s.hash;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`doc-indice-item${s.id === atual ? " ativo" : ""}`}
                    onClick={() => abrir(s.id)}
                  >
                    <span style={{ flex: 1 }}>{s.titulo}</span>
                    {s.gerada && (
                      <span title="Gerada do código" style={{ fontSize: 10, color: "#198754" }}>
                        ●
                      </span>
                    )}
                    {nova && (
                      <span
                        style={{
                          fontSize: 10,
                          background: "#fd7e14",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "0 6px"
                        }}
                      >
                        atualizada
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "#6c757d", padding: "4px 8px" }}>
            ● = gerada do código a cada acesso
          </div>
        </nav>

        <main ref={principal} style={{ minWidth: 0, minHeight: "85vh" }}>
          {erro && (
            <div
              style={{
                background: "#fff5f5",
                color: "#842029",
                padding: 10,
                borderRadius: 6,
                marginBottom: 10
              }}
            >
              {erro}
            </div>
          )}
          {!secao && !erro && <p style={{ color: "#6c757d" }}>Carregando…</p>}
          {secao && (
            <article>
              <div style={{ fontSize: 12.5, color: "#6c757d" }}>{secao.grupo}</div>
              <h2 style={{ margin: "2px 0 10px" }}>{secao.titulo}</h2>
              <ConteudoSecao secao={secao} dados={dados} foco={foco} />
            </article>
          )}
        </main>
      </div>

      {imprimindo && autoria && (
        <DocumentacaoImpressao
          indice={indice}
          autoria={autoria}
          revisoes={revisoes}
          emitidoPor={emitidoPor}
          onConcluir={() => setImprimindo(false)}
          onErro={(m) => {
            setErro(m);
            setImprimindo(false);
          }}
        />
      )}
    </div>
  );
}
