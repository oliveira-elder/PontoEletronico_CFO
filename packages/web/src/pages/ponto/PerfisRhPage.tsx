import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";
import { ArrowLeftIcon, SearchIcon } from "../../components/icons";
import { ABAS_RH, type AbaRh, type PaginaRh } from "../../utils/recursosRh";

interface FuncionarioRh {
  id: string;
  nome: string;
  matricula: string | null;
  isManager: boolean;
  gerencia: string | null;
  recursos: string[];
  atualizadoEm: string | null;
}

const PAGINAS: { chave: PaginaRh; rotulo: string }[] = [
  { chave: "dashboard", rotulo: "Dashboard" },
  { chave: "gestao", rotulo: "Gestão" },
  { chave: "requisicoes", rotulo: "Requisições do RH" },
  { chave: "auditoria", rotulo: "Auditoria" },
  { chave: "configuracoes", rotulo: "Configurações" }
];

const resumo = (recursos: Set<string>) => {
  const abas = ABAS_RH.filter((a) => recursos.has(a.chave)).length;
  const funcoes = ABAS_RH.flatMap((a) =>
    recursos.has(a.chave) ? a.funcoes.filter((f) => recursos.has(f.chave)) : []
  ).length;
  return { abas, funcoes };
};

/**
 * Perfis do RH: o Gerente de RH (PONTO_ADMIN) e o super admin definem, para cada
 * funcionário do RH, quais abas (Ver) e quais funções de cada aba ele pode usar nas
 * páginas Dashboard, Gestão, Requisições do RH, Auditoria e Configurações.
 */
export function PerfisRhPage() {
  const { user, hasRole } = useAuth();
  const podeGerir = !!user?.isSuperAdmin || hasRole("PONTO_ADMIN") || hasRole("ponto-admin");

  const [lista, setLista] = useState<FuncionarioRh[] | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [copiarDe, setCopiarDe] = useState("");
  const [aplicarA, setAplicarA] = useState<Set<string>>(new Set());
  const [mostrarAplicar, setMostrarAplicar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get<FuncionarioRh[]>("/ponto/perfis-rh/funcionarios");
      setLista(r ?? []);
    } catch (e) {
      setErro((e as Error).message || "Não foi possível carregar os funcionários do RH.");
    }
  }, []);

  useEffect(() => {
    if (podeGerir) void carregar();
  }, [podeGerir, carregar]);

  const selecionado = lista?.find((f) => f.id === selecionadoId) ?? null;

  useEffect(() => {
    setRascunho(new Set(selecionado?.recursos ?? []));
    setMsg("");
    setCopiarDe("");
    setAplicarA(new Set());
    setMostrarAplicar(false);
  }, [selecionadoId, lista]);

  const alterado = useMemo(() => {
    const orig = new Set(selecionado?.recursos ?? []);
    if (orig.size !== rascunho.size) return true;
    for (const r of rascunho) if (!orig.has(r)) return true;
    return false;
  }, [rascunho, selecionado]);

  if (!podeGerir) return <Navigate to="/ponto" replace />;

  const filtrados = (lista ?? []).filter((f) => {
    const q = busca.trim().toLowerCase();
    return !q || f.nome.toLowerCase().includes(q) || (f.matricula ?? "").includes(q);
  });

  const alternar = (chave: string, ligado: boolean) =>
    setRascunho((s) => {
      const n = new Set(s);
      if (ligado) n.add(chave);
      else n.delete(chave);
      return n;
    });

  /* Ver da aba: ao desligar, as funções da aba também saem. */
  const alternarAba = (aba: AbaRh, ligado: boolean) =>
    setRascunho((s) => {
      const n = new Set(s);
      if (ligado) n.add(aba.chave);
      else {
        n.delete(aba.chave);
        aba.funcoes.forEach((f) => n.delete(f.chave));
      }
      return n;
    });

  /* Master Editar: liga/desliga todas as funções da aba (exige Visualizar). */
  const alternarFuncoesAba = (aba: AbaRh, ligado: boolean) =>
    setRascunho((s) => {
      const n = new Set(s);
      if (ligado) {
        n.add(aba.chave);
        aba.funcoes.forEach((f) => n.add(f.chave));
      } else {
        aba.funcoes.forEach((f) => n.delete(f.chave));
      }
      return n;
    });

  const atalhoPagina = (pagina: PaginaRh, modo: "nada" | "ver" | "tudo") =>
    setRascunho((s) => {
      const n = new Set(s);
      for (const aba of ABAS_RH.filter((a) => a.pagina === pagina)) {
        n.delete(aba.chave);
        aba.funcoes.forEach((f) => n.delete(f.chave));
        if (modo !== "nada") n.add(aba.chave);
        if (modo === "tudo") aba.funcoes.forEach((f) => n.add(f.chave));
      }
      return n;
    });

  async function salvar() {
    if (!selecionado) return;
    setSalvando(true);
    setMsg("");
    try {
      await api.put(`/ponto/perfis-rh/funcionarios/${selecionado.id}`, {
        recursos: [...rascunho]
      });
      setMsg("✓ Perfil salvo.");
      await carregar();
    } catch (e) {
      setMsg("Erro: " + ((e as Error).message || "não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  }

  function aplicarCopia() {
    const origem = lista?.find((f) => f.id === copiarDe);
    if (!origem) return;
    setRascunho(new Set(origem.recursos));
    setMsg(`Perfil de ${origem.nome} copiado — confira e salve.`);
  }

  async function aplicarAVarios() {
    if (!selecionado || !aplicarA.size) return;
    if (alterado) {
      setMsg("Salve o perfil atual antes de aplicá-lo a outras pessoas.");
      return;
    }
    setSalvando(true);
    setMsg("");
    try {
      const r = await api.post<{ copiados: number }>("/ponto/perfis-rh/copiar", {
        origemId: selecionado.id,
        destinoIds: [...aplicarA]
      });
      setMsg(`✓ Perfil aplicado a ${r?.copiados ?? aplicarA.size} pessoa(s).`);
      setMostrarAplicar(false);
      setAplicarA(new Set());
      await carregar();
    } catch (e) {
      setMsg("Erro: " + ((e as Error).message || "não foi possível aplicar."));
    } finally {
      setSalvando(false);
    }
  }

  const btnAtalho: React.CSSProperties = {
    padding: "3px 9px",
    borderRadius: 999,
    border: "1px solid rgba(122,30,38,0.18)",
    background: "#fff",
    color: "var(--ink-600)",
    fontSize: 11.5,
    fontWeight: 600,
    cursor: "pointer"
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          to="/ponto/gestao"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            color: "var(--ink-500)",
            textDecoration: "none",
            marginBottom: 8
          }}
        >
          <ArrowLeftIcon size={13} /> Gestão de Funcionários
        </Link>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Administração · Gerente de RH
        </p>
        <h1
          style={{
            fontSize: "clamp(22px,3vw,28px)",
            fontFamily: "var(--font-display)",
            lineHeight: 1.1,
            margin: 0
          }}
        >
          Perfis do <em>RH</em>
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)", margin: "6px 0 0", lineHeight: 1.55 }}>
          Defina, para cada funcionário do RH, quais abas ele pode ver e quais funções pode usar no
          Dashboard, Gestão, Requisições do RH, Auditoria e Configurações.
        </p>
      </div>

      <p
        role="note"
        style={{
          margin: "0 0 16px",
          padding: "9px 12px",
          borderRadius: "var(--radius-md)",
          background: "rgba(247,196,55,0.12)",
          border: "1px solid rgba(247,196,55,0.45)",
          color: "#6b5200",
          fontSize: 12.5
        }}
      >
        <strong>Atenção:</strong> funcionários do RH sem perfil configurado não têm acesso a estas
        páginas. O Gerente de RH e o super administrador sempre têm acesso total.
      </p>

      {erro && <p style={{ color: "var(--red)", fontSize: 13 }}>{erro}</p>}

      <div className="perfis-rh-grid" style={{ display: "grid", gap: 16 }}>
        <style>{`
          .perfis-rh-grid { grid-template-columns: 300px minmax(0, 1fr); }
          @media (max-width: 820px) { .perfis-rh-grid { grid-template-columns: 1fr; } }
        `}</style>

        {/* Lista de funcionários do RH */}
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: 12,
            alignSelf: "start"
          }}
        >
          <div style={{ position: "relative", marginBottom: 10 }}>
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
              placeholder="Buscar funcionário do RH"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 10px 8px 30px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 13
              }}
            />
          </div>
          {lista === null ? (
            <p style={{ fontSize: 13, color: "var(--ink-500)", padding: 8 }}>Carregando…</p>
          ) : filtrados.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-500)", padding: 8 }}>
              Nenhum funcionário do RH encontrado.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filtrados.map((f) => {
                const r = resumo(new Set(f.recursos));
                const ativo = f.id === selecionadoId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelecionadoId(f.id)}
                    style={{
                      textAlign: "left",
                      padding: "9px 10px",
                      borderRadius: "var(--radius-md)",
                      border: `1px solid ${ativo ? "var(--burgundy-600)" : "transparent"}`,
                      background: ativo ? "rgba(122,30,38,0.05)" : "transparent",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-900)" }}>
                      {f.nome}
                      {f.isManager && (
                        <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 500 }}>
                          {" "}
                          · chefe
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 2 }}>
                      Matr. {f.matricula ?? "—"} ·{" "}
                      {r.abas === 0 ? (
                        <span style={{ color: "var(--red)" }}>sem acesso</span>
                      ) : (
                        `${r.abas} aba${r.abas !== 1 ? "s" : ""} · ${r.funcoes} função${r.funcoes !== 1 ? "ões" : ""}`
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Permissões */}
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.08)",
            padding: 16,
            minWidth: 0
          }}
        >
          {!selecionado ? (
            <p style={{ fontSize: 13, color: "var(--ink-500)", textAlign: "center", padding: 32 }}>
              Selecione um funcionário do RH para configurar o perfil.
            </p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 14
                }}
              >
                <div>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
                    {selecionado.nome}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "2px 0 0" }}>
                    {(() => {
                      const r = resumo(rascunho);
                      return `${r.abas} aba${r.abas !== 1 ? "s" : ""} e ${r.funcoes} função${r.funcoes !== 1 ? "ões" : ""} liberadas`;
                    })()}
                    {alterado && " · alterações não salvas"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={copiarDe}
                    onChange={(e) => setCopiarDe(e.target.value)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(0,0,0,0.12)",
                      fontSize: 12.5
                    }}
                  >
                    <option value="">Copiar perfil de…</option>
                    {(lista ?? [])
                      .filter((f) => f.id !== selecionado.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!copiarDe}
                    onClick={aplicarCopia}
                  >
                    Copiar
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setMostrarAplicar((v) => !v)}
                  >
                    Aplicar a vários
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={salvando || !alterado}
                    onClick={() => void salvar()}
                  >
                    {salvando ? "Salvando…" : "Salvar perfil"}
                  </button>
                </div>
              </div>

              {mostrarAplicar && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: 12,
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(122,30,38,0.12)",
                    background: "var(--cream-50)"
                  }}
                >
                  <p style={{ fontSize: 12.5, margin: "0 0 8px", color: "var(--ink-700)" }}>
                    Aplicar o perfil <strong>salvo</strong> de {selecionado.nome} a:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                    {(lista ?? [])
                      .filter((f) => f.id !== selecionado.id)
                      .map((f) => (
                        <label
                          key={f.id}
                          style={{ fontSize: 13, display: "flex", gap: 6, cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={aplicarA.has(f.id)}
                            onChange={(e) =>
                              setAplicarA((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(f.id);
                                else n.delete(f.id);
                                return n;
                              })
                            }
                            style={{ accentColor: "var(--burgundy-600)" }}
                          />
                          {f.nome}
                        </label>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 10 }}
                    disabled={salvando || !aplicarA.size}
                    onClick={() => void aplicarAVarios()}
                  >
                    Aplicar a {aplicarA.size} pessoa{aplicarA.size !== 1 ? "s" : ""}
                  </button>
                </div>
              )}

              {msg && (
                <p
                  style={{
                    fontSize: 12.5,
                    margin: "0 0 12px",
                    color: msg.startsWith("Erro") ? "var(--red)" : "var(--green)"
                  }}
                >
                  {msg}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {PAGINAS.map((pg) => (
                  <section
                    key={pg.chave}
                    style={{
                      border: "1px solid rgba(122,30,38,0.10)",
                      borderRadius: "var(--radius-md)",
                      overflow: "hidden"
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                        padding: "9px 12px",
                        background: "var(--cream-50)",
                        borderBottom: "1px solid rgba(122,30,38,0.08)"
                      }}
                    >
                      <strong style={{ fontSize: 13.5, color: "var(--burgundy-600)" }}>
                        {pg.rotulo}
                      </strong>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          style={btnAtalho}
                          onClick={() => atalhoPagina(pg.chave, "nada")}
                        >
                          Nada
                        </button>
                        <button
                          type="button"
                          style={btnAtalho}
                          onClick={() => atalhoPagina(pg.chave, "ver")}
                        >
                          Só visualizar
                        </button>
                        <button
                          type="button"
                          style={btnAtalho}
                          onClick={() => atalhoPagina(pg.chave, "tudo")}
                        >
                          Tudo
                        </button>
                      </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 13
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              background: "rgba(122,30,38,0.03)",
                              borderBottom: "1px solid rgba(122,30,38,0.08)"
                            }}
                          >
                            <th
                              style={{
                                textAlign: "left",
                                padding: "8px 12px",
                                fontWeight: 600,
                                color: "var(--ink-600)",
                                fontSize: 11.5
                              }}
                            >
                              Funcionalidade
                            </th>
                            <th
                              style={{
                                textAlign: "center",
                                padding: "8px 10px",
                                fontWeight: 600,
                                color: "var(--ink-600)",
                                fontSize: 11.5,
                                width: 88
                              }}
                            >
                              Visualizar
                            </th>
                            <th
                              style={{
                                textAlign: "center",
                                padding: "8px 10px",
                                fontWeight: 600,
                                color: "var(--ink-600)",
                                fontSize: 11.5,
                                width: 72
                              }}
                            >
                              Editar
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ABAS_RH.filter((a) => a.pagina === pg.chave).map((aba) => {
                            const ver = rascunho.has(aba.chave);
                            const temFuncoes = aba.funcoes.length > 0;
                            const todasFuncoes =
                              temFuncoes && aba.funcoes.every((f) => rascunho.has(f.chave));
                            const algumasFuncoes =
                              temFuncoes &&
                              !todasFuncoes &&
                              aba.funcoes.some((f) => rascunho.has(f.chave));

                            return (
                              <React.Fragment key={aba.chave}>
                                <tr
                                  style={{
                                    borderTop: "1px solid rgba(122,30,38,0.06)"
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: "9px 12px",
                                      fontWeight: 600,
                                      color: "var(--ink-900)",
                                      verticalAlign: "middle"
                                    }}
                                  >
                                    {aba.rotulo}
                                  </td>
                                  <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                                    <input
                                      type="checkbox"
                                      checked={ver}
                                      onChange={(e) => alternarAba(aba, e.target.checked)}
                                      aria-label={`Visualizar ${aba.rotulo}`}
                                      style={{
                                        width: 16,
                                        height: 16,
                                        accentColor: "var(--burgundy-600)",
                                        cursor: "pointer"
                                      }}
                                    />
                                  </td>
                                  <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                                    {temFuncoes ? (
                                      <input
                                        type="checkbox"
                                        checked={ver && todasFuncoes}
                                        ref={(el) => {
                                          if (el) el.indeterminate = ver && algumasFuncoes;
                                        }}
                                        disabled={!ver}
                                        onChange={(e) => alternarFuncoesAba(aba, e.target.checked)}
                                        aria-label={`Editar todas em ${aba.rotulo}`}
                                        style={{
                                          width: 16,
                                          height: 16,
                                          accentColor: "var(--burgundy-600)",
                                          cursor: ver ? "pointer" : "not-allowed",
                                          opacity: ver ? 1 : 0.45
                                        }}
                                      />
                                    ) : (
                                      <span
                                        style={{
                                          color: "var(--ink-400)",
                                          fontSize: 12,
                                          userSelect: "none"
                                        }}
                                      >
                                        —
                                      </span>
                                    )}
                                  </td>
                                </tr>
                                {aba.funcoes.map((fn) => (
                                  <tr
                                    key={fn.chave}
                                    style={{
                                      borderTop: "1px solid rgba(122,30,38,0.04)",
                                      opacity: ver ? 1 : 0.45
                                    }}
                                  >
                                    <td
                                      style={{
                                        padding: "7px 12px 7px 28px",
                                        verticalAlign: "middle",
                                        color: "var(--ink-800)"
                                      }}
                                    >
                                      <span style={{ fontWeight: 600 }}>{fn.rotulo}</span>
                                      <span style={{ color: "var(--ink-500)", fontWeight: 400 }}>
                                        {" "}
                                        — {fn.descricao}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "center", verticalAlign: "middle" }} />
                                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                                      <input
                                        type="checkbox"
                                        disabled={!ver}
                                        checked={ver && rascunho.has(fn.chave)}
                                        onChange={(e) => alternar(fn.chave, e.target.checked)}
                                        aria-label={`Editar ${fn.rotulo}`}
                                        style={{
                                          width: 15,
                                          height: 15,
                                          accentColor: "var(--burgundy-600)",
                                          cursor: ver ? "pointer" : "not-allowed"
                                        }}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
