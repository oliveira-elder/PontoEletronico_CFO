import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { AnimacaoPasso } from "../../components/manual/AnimacaoPasso";
import { CAPITULOS } from "../../components/manual/conteudo";
import { ROTEIROS } from "../../components/manual/roteiros";
import type { Capitulo, Perfil, Tarefa } from "../../components/manual/tipos";
import "../../components/manual/manual.css";

const SELO: Record<Perfil, { texto: string; cor: string } | null> = {
  todos: null,
  gestor: { texto: "Chefes", cor: "#0d6efd" },
  rh: { texto: "RH", cor: "#7a1e26" },
  superadmin: { texto: "Super Admin", cor: "#6f42c1" }
};

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Manual do usuário: liberado a todos; capítulos por perfil conforme o acesso de cada um. */
export function ManualUsuarioPage() {
  const { user, hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState("");

  const isSuper = !!user?.isSuperAdmin;
  const isAdmin = isSuper || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  const isRh = isAdmin || hasRole("RH_AUDITORIA");
  const isGestor =
    isRh || hasRole("gestor") || hasRole("GESTOR_APROVACAO") || !!user?.funcionario?.isManager;

  const capitulos = useMemo<Capitulo[]>(() => {
    const pode = (p: Perfil) =>
      p === "todos" ||
      (p === "gestor" && isGestor) ||
      (p === "rh" && isRh) ||
      (p === "superadmin" && isSuper);
    return CAPITULOS.filter((c) => pode(c.perfil)).map((c) => ({
      ...c,
      tarefas: c.tarefas.filter((t) => pode(t.perfil))
    }));
  }, [isSuper, isRh, isGestor]);
  const todas = useMemo(
    () => capitulos.flatMap((c) => c.tarefas.map((t) => ({ c, t }))),
    [capitulos]
  );

  /* Tarefa escolhida: ?tarefa=id, ou ?ajuda=/rota (botão "?" do topo). */
  const ajuda = params.get("ajuda");
  const porAjuda = useMemo(() => {
    if (!ajuda) return null;
    return (
      todas
        .filter(({ t }) => t.rota && (ajuda === t.rota || ajuda.startsWith(`${t.rota}/`)))
        .sort((a, b) => (b.t.rota?.length ?? 0) - (a.t.rota?.length ?? 0))[0]?.t.id ?? null
    );
  }, [ajuda, todas]);
  const escolhida = params.get("tarefa") ?? porAjuda ?? todas[0]?.t.id;
  const atual = todas.find(({ t }) => t.id === escolhida) ?? todas[0];

  useEffect(() => {
    document.title = "Manual do usuário";
  }, []);

  const resultados = useMemo(() => {
    const q = norm(busca.trim());
    if (q.length < 2) return null;
    return todas.filter(({ c, t }) =>
      norm(
        `${c.titulo} ${t.titulo} ${t.resumo} ${t.palavras ?? ""} ${t.passos.join(" ")}`
      ).includes(q)
    );
  }, [busca, todas]);

  const abrir = (id: string) => {
    setParams({ tarefa: id });
    setBusca("");
  };

  const imprimir = () => {
    document.body.classList.add("mn-imprimindo");
    const fim = () => {
      document.body.classList.remove("mn-imprimindo");
      window.removeEventListener("afterprint", fim);
    };
    window.addEventListener("afterprint", fim);
    window.print();
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 4px" }}>Manual do usuário</h2>
      <p style={{ margin: "0 0 12px", color: "#6c757d", fontSize: 14 }}>
        Guias passo a passo com animações. Os capítulos mostrados correspondem ao seu acesso.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no manual (ex.: atestado, esqueci de bater, férias)…"
          style={{
            flex: "1 1 320px",
            padding: "8px 11px",
            border: "1px solid #ced4da",
            borderRadius: 8,
            fontSize: 14
          }}
        />
        <button
          type="button"
          onClick={imprimir}
          style={{
            border: "1px solid #ced4da",
            background: "#fff",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer"
          }}
        >
          Imprimir / PDF
        </button>
      </div>

      <div className="mn-layout">
        <nav aria-label="Índice do manual">
          {resultados ? (
            <div>
              <div className="mn-indice-cap">Resultados ({resultados.length})</div>
              {resultados.length === 0 && (
                <div style={{ padding: 8, color: "#6c757d" }}>Nada encontrado.</div>
              )}
              {resultados.map(({ c, t }) => (
                <button key={t.id} type="button" className="mn-item" onClick={() => abrir(t.id)}>
                  <span style={{ flex: 1 }}>
                    {t.titulo}
                    <small style={{ display: "block", color: "#6c757d" }}>{c.titulo}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            capitulos.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <div className="mn-indice-cap">{c.titulo}</div>
                {c.tarefas.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`mn-item${t.id === atual?.t.id ? " ativo" : ""}`}
                    onClick={() => abrir(t.id)}
                  >
                    <span style={{ flex: 1 }}>{t.titulo}</span>
                    {t.roteiro && (
                      <span title="Tem animação" style={{ color: "#fd7e14", fontSize: 11 }}>
                        ▶
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>

        <main style={{ minWidth: 0, minHeight: "80vh" }}>
          {atual && (
            <TarefaView c={atual.c} t={atual.t} onVer={abrir} todas={todas.map((x) => x.t)} />
          )}
        </main>
      </div>

      <ManualImpressao capitulos={capitulos} />
    </div>
  );
}

function TarefaView({
  c,
  t,
  onVer,
  todas
}: {
  c: Capitulo;
  t: Tarefa;
  onVer: (id: string) => void;
  todas: Tarefa[];
}) {
  const selo = SELO[t.perfil];
  const roteiro = t.roteiro ? ROTEIROS[t.roteiro] : undefined;
  return (
    <article className="mn-bloco">
      <div style={{ fontSize: 12.5, color: "#6c757d" }}>{c.titulo}</div>
      <h2 style={{ margin: "2px 0 6px" }}>
        {t.titulo}{" "}
        {selo && (
          <span className="mn-selo" style={{ background: selo.cor, verticalAlign: "middle" }}>
            {selo.texto}
          </span>
        )}
      </h2>
      <p style={{ fontSize: 15, margin: "0 0 6px" }}>{t.resumo}</p>

      {t.antes && t.antes.length > 0 && (
        <>
          <h3>Antes de começar</h3>
          <ul>
            {t.antes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}

      {roteiro && (
        <>
          <h3>Veja como se faz</h3>
          <AnimacaoPasso key={roteiro.id} roteiro={roteiro} />
          <p style={{ fontSize: 12.5, color: "#6c757d", margin: 0 }}>
            A tela acima é uma demonstração com dados fictícios: nada é enviado de verdade.
          </p>
        </>
      )}

      <h3>Passo a passo</h3>
      <ol>
        {t.passos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>

      {t.resultado && (
        <>
          <h3>O que você deve ver</h3>
          <p>{t.resultado}</p>
        </>
      )}

      {t.problemas && t.problemas.length > 0 && (
        <>
          <h3>Problemas comuns</h3>
          {t.problemas.map((p) => (
            <div key={p.problema} className="mn-prob">
              <b>{p.problema}</b> {p.solucao}
            </div>
          ))}
        </>
      )}

      {t.ver && t.ver.length > 0 && (
        <>
          <h3>Veja também</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {t.ver.map((v) => {
              const alvo = todas.find((x) => x.titulo.toLowerCase().includes(v.toLowerCase()));
              return alvo ? (
                <button
                  key={v}
                  type="button"
                  className="mn-item"
                  style={{ width: "auto", border: "1px solid #dee2e6" }}
                  onClick={() => onVer(alvo.id)}
                >
                  {alvo.titulo}
                </button>
              ) : null;
            })}
          </div>
        </>
      )}
    </article>
  );
}

/** Versão para impressão: todos os capítulos do perfil, com a lista dos passos (sem controles). */
function ManualImpressao({ capitulos }: { capitulos: Capitulo[] }) {
  return createPortal(
    <div id="mn-print-root">
      <h1>Manual do usuário — Sistema de Ponto Eletrônico (CFO)</h1>
      {capitulos.map((c) => (
        <section key={c.id}>
          <h2>{c.titulo}</h2>
          {c.tarefas.map((t) => (
            <div key={t.id} style={{ breakInside: "avoid" }}>
              <h3>{t.titulo}</h3>
              <p>{t.resumo}</p>
              <ol>
                {t.passos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>,
    document.body
  );
}
