import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../hooks/useApi";
import { TextoTermo } from "./TextoTermo";
import {
  ClipboardListIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon
} from "../icons";

type Status = "RASCUNHO" | "PUBLICADO" | "SUBSTITUIDO";

interface Linha {
  id: string;
  versao: number;
  titulo: string;
  status: Status;
  resumoAlteracoes: string | null;
  criadoPorNome: string | null;
  publicadoPorNome: string | null;
  publicadoEm: string | null;
  createdAt: string;
  aceites: number;
  derivadaDaVersao: number | null;
}

interface Detalhe {
  id: string;
  versao: number;
  titulo: string;
  conteudo: string;
  status: Status;
  resumoAlteracoes: string | null;
  anterior: { id: string; versao: number; conteudo: string } | null;
}

interface Aceites {
  versao: number;
  aceites: Array<{
    nome: string;
    matricula: string | null;
    aceitoEm: string;
    ip: string;
    codigo: string;
  }>;
  pendentes: Array<{ nome: string; matricula: string | null }>;
}

const SIT: Record<Status, { rotulo: string; cor: string; fundo: string }> = {
  RASCUNHO: { rotulo: "Rascunho", cor: "#92400E", fundo: "#FEF3C7" },
  PUBLICADO: { rotulo: "Vigente", cor: "#166534", fundo: "#DCFCE7" },
  SUBSTITUIDO: { rotulo: "Substituída", cor: "#4B5563", fundo: "#F3F4F6" }
};

const BOTAO: React.CSSProperties = { width: "100%", justifyContent: "center", gap: 5 };

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

/** Diferença por linhas (LCS): "=" igual, "+" incluída, "-" removida. */
function diffLinhas(a: string, b: string): Array<{ t: "=" | "+" | "-"; l: string }> {
  const x = a.split(/\r?\n/);
  const y = b.split(/\r?\n/);
  const m = x.length;
  const n = y.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ t: "=" | "+" | "-"; l: string }> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (x[i] === y[j]) {
      out.push({ t: "=", l: x[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: "-", l: x[i++] });
    else out.push({ t: "+", l: y[j++] });
  }
  while (i < m) out.push({ t: "-", l: x[i++] });
  while (j < n) out.push({ t: "+", l: y[j++] });
  return out;
}

function baixarCsv(nome: string, linhas: string[][]) {
  const csv = linhas
    .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** Configurações → Termos de uso: versões (histórico), edição como nova versão, publicação e aceites. */
export function ConfigTermosUso() {
  const [lista, setLista] = useState<{ termos: Linha[]; totalUsuarios: number } | null>(null);
  const [aberto, setAberto] = useState<Detalhe | null>(null);
  const [modo, setModo] = useState<"ver" | "editar" | "comparar" | "aceites">("ver");
  const [rascunho, setRascunho] = useState({ titulo: "", conteudo: "", resumo: "" });
  const [aceites, setAceites] = useState<Aceites | null>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api
      .get<{ termos: Linha[]; totalUsuarios: number }>("/ponto/config/termos-uso")
      .then(setLista)
      .catch((e) => setMsg(`⚠ ${(e as Error).message}`));
  }, []);
  useEffect(carregar, [carregar]);

  async function abrir(id: string, m: typeof modo) {
    setMsg("");
    const d = await api.get<Detalhe>(`/ponto/config/termos-uso/${id}`);
    setAberto(d);
    setModo(m);
    setRascunho({ titulo: d.titulo, conteudo: d.conteudo, resumo: d.resumoAlteracoes ?? "" });
    if (m === "aceites")
      setAceites(await api.get<Aceites>(`/ponto/config/termos-uso/${id}/aceites`));
  }

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    setMsg("");
    try {
      await fn();
      setMsg(`✓ ${ok}`);
      carregar();
    } catch (e) {
      setMsg(`⚠ ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  }

  const novo = (usarModelo: boolean) =>
    executar(async () => {
      const r = await api.post<{ id: string }>("/ponto/config/termos-uso", { usarModelo });
      await abrir(r.id, "editar");
    }, "Novo termo criado em rascunho.");

  const editar = (id: string) =>
    executar(async () => {
      const r = await api.post<{ id: string }>(`/ponto/config/termos-uso/${id}/editar`, {});
      await abrir(r.id, "editar");
    }, "Nova versão criada em rascunho a partir da selecionada (a original foi mantida).");

  const salvar = () =>
    aberto &&
    executar(
      () =>
        api.patch(`/ponto/config/termos-uso/${aberto.id}`, {
          titulo: rascunho.titulo,
          conteudo: rascunho.conteudo,
          resumoAlteracoes: rascunho.resumo
        }),
      "Rascunho salvo."
    );

  const publicar = () => {
    if (!aberto) return;
    if (
      !window.confirm(
        `Publicar a versão ${aberto.versao}? Ela passa a valer e TODOS os usuários precisarão aceitar novamente.`
      )
    )
      return;
    void executar(async () => {
      await api.patch(`/ponto/config/termos-uso/${aberto.id}`, {
        titulo: rascunho.titulo,
        conteudo: rascunho.conteudo,
        resumoAlteracoes: rascunho.resumo
      });
      await api.post(`/ponto/config/termos-uso/${aberto.id}/publicar`, {
        resumoAlteracoes: rascunho.resumo
      });
      setAberto(null);
    }, "Versão publicada. Os usuários verão o aceite no próximo acesso.");
  };

  const excluir = (l: Linha) => {
    if (!window.confirm(`Excluir o rascunho da versão ${l.versao}?`)) return;
    void executar(async () => {
      await api.delete(`/ponto/config/termos-uso/${l.id}`);
      if (aberto?.id === l.id) setAberto(null);
    }, "Rascunho excluído.");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 0, lineHeight: 1.6 }}>
        Cada usuário aceita os Termos de Uso uma vez por versão, com nome e matrícula. Editar um
        termo publicado cria uma <strong>nova versão</strong> (a original fica no histórico); ao
        publicar, todos precisam aceitar de novo. Enquanto o aceite estiver pendente, o sistema fica
        bloqueado, mas o registro de ponto continua liberado.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={ocupado}
          onClick={() => void novo(true)}
        >
          <PlusIcon size={13} /> Novo termo (a partir do modelo)
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={ocupado}
          onClick={() => void novo(false)}
        >
          <PlusIcon size={13} /> Novo termo em branco
        </button>
        {msg && <span style={{ fontSize: 12.5, alignSelf: "center" }}>{msg}</span>}
      </div>

      {lista && (
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-500)" }}>
                {["Versão", "Título", "Situação", "Publicada em", "Aceites", "Origem", ""].map(
                  (h) => (
                    <th key={h} style={{ padding: "6px 8px", borderBottom: "1px solid #eee" }}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {lista.termos.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                  <td style={{ padding: "7px 8px", fontWeight: 700 }}>v{l.versao}</td>
                  <td style={{ padding: "7px 8px", minWidth: 160 }}>{l.titulo}</td>
                  <td style={{ padding: "7px 8px" }}>
                    <span
                      style={{
                        background: SIT[l.status].fundo,
                        color: SIT[l.status].cor,
                        borderRadius: 999,
                        padding: "2px 9px",
                        fontWeight: 700,
                        fontSize: 11.5
                      }}
                    >
                      {SIT[l.status].rotulo}
                    </span>
                  </td>
                  <td style={{ padding: "7px 8px" }}>
                    {fmt(l.publicadoEm)}
                    {l.publicadoPorNome ? ` · ${l.publicadoPorNome}` : ""}
                  </td>
                  <td style={{ padding: "7px 8px" }}>
                    {l.status === "RASCUNHO" ? "—" : `${l.aceites} de ${lista.totalUsuarios}`}
                  </td>
                  <td style={{ padding: "7px 8px", color: "var(--ink-500)" }}>
                    {l.derivadaDaVersao ? `editada da v${l.derivadaDaVersao}` : "novo termo"}
                  </td>
                  <td style={{ padding: "7px 8px", width: 1 }}>
                    {/* Ações em grade 2 × 2, botões do mesmo tamanho */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 118px)",
                        gap: 4,
                        justifyContent: "end"
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={BOTAO}
                        onClick={() => void abrir(l.id, "ver")}
                      >
                        <SearchIcon size={13} /> Ver
                      </button>
                      {l.status === "RASCUNHO" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={BOTAO}
                          onClick={() => void abrir(l.id, "editar")}
                        >
                          <PencilIcon size={13} /> Editar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={BOTAO}
                          title="Cria uma nova versão a partir desta; a original é mantida no histórico"
                          onClick={() => void editar(l.id)}
                        >
                          <CopyIcon size={13} /> Nova versão
                        </button>
                      )}
                      {l.status === "RASCUNHO" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={BOTAO}
                          onClick={() => excluir(l)}
                        >
                          <Trash2Icon size={13} /> Excluir
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={BOTAO}
                          onClick={() => void abrir(l.id, "aceites")}
                        >
                          <UsersIcon size={13} /> Aceites
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={BOTAO}
                        onClick={() => void abrir(l.id, "comparar")}
                      >
                        <ClipboardListIcon size={13} /> Comparar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <div
          style={{
            marginTop: 16,
            border: "1px solid rgba(122,30,38,0.15)",
            borderRadius: 10,
            padding: 14,
            background: "#fff"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <strong style={{ flex: 1 }}>
              v{aberto.versao} · {aberto.titulo}{" "}
              <span style={{ fontWeight: 400, color: "var(--ink-500)" }}>
                ({SIT[aberto.status].rotulo})
              </span>
            </strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberto(null)}>
              Fechar
            </button>
          </div>

          {modo === "ver" && (
            <div style={{ maxHeight: 520, overflow: "auto", padding: "4px 8px" }}>
              <TextoTermo conteudo={aberto.conteudo} />
            </div>
          )}

          {modo === "editar" && aberto.status === "RASCUNHO" && (
            <>
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  fontSize: 12,
                  marginBottom: 8
                }}
              >
                <span style={{ fontWeight: 700 }}>Título</span>
                <input
                  value={rascunho.titulo}
                  onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
                  style={{
                    padding: "7px 9px",
                    border: "1px solid rgba(122,30,38,0.2)",
                    borderRadius: 8
                  }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
                  <span style={{ fontWeight: 700 }}>
                    Texto (# título, ## seção, - item, **negrito**)
                  </span>
                  <textarea
                    value={rascunho.conteudo}
                    onChange={(e) => setRascunho({ ...rascunho, conteudo: e.target.value })}
                    rows={24}
                    style={{
                      padding: 10,
                      border: "1px solid rgba(122,30,38,0.2)",
                      borderRadius: 8,
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      resize: "vertical"
                    }}
                  />
                </label>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>Pré-visualização</span>
                  <div
                    style={{
                      maxHeight: 470,
                      overflow: "auto",
                      border: "1px solid #eee",
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 3
                    }}
                  >
                    <TextoTermo conteudo={rascunho.conteudo} />
                  </div>
                </div>
              </div>
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  fontSize: 12,
                  marginTop: 10
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  Resumo das alterações (obrigatório para publicar uma atualização)
                </span>
                <input
                  value={rascunho.resumo}
                  onChange={(e) => setRascunho({ ...rascunho, resumo: e.target.value })}
                  placeholder="Ex.: inclui o item 14 sobre o comprovante de ponto"
                  style={{
                    padding: "7px 9px",
                    border: "1px solid rgba(122,30,38,0.2)",
                    borderRadius: 8
                  }}
                />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={ocupado}
                  onClick={() => void salvar()}
                >
                  Salvar rascunho
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={ocupado}
                  onClick={publicar}
                >
                  Publicar esta versão
                </button>
              </div>
            </>
          )}

          {modo === "comparar" &&
            (aberto.anterior ? (
              <div
                style={{
                  maxHeight: 520,
                  overflow: "auto",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12.5,
                    color: "var(--ink-500)",
                    marginTop: 0
                  }}
                >
                  Comparação com a v{aberto.anterior.versao}:{" "}
                  <span style={{ color: "#166534" }}>+ incluído</span> ·{" "}
                  <span style={{ color: "#991B1B" }}>− removido</span>
                </p>
                {diffLinhas(aberto.anterior.conteudo, aberto.conteudo).map((d, i) => (
                  <div
                    key={i}
                    style={{
                      whiteSpace: "pre-wrap",
                      padding: "1px 6px",
                      background: d.t === "+" ? "#F0FDF4" : d.t === "-" ? "#FEF2F2" : undefined,
                      color: d.t === "+" ? "#166534" : d.t === "-" ? "#991B1B" : "var(--ink-600)",
                      textDecoration: d.t === "-" ? "line-through" : undefined
                    }}
                  >
                    {d.t === "=" ? "  " : d.t === "+" ? "+ " : "− "}
                    {d.l || " "}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
                Não há versão anterior para comparar.
              </p>
            ))}

          {modo === "aceites" && aceites && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>
                  <strong>{aceites.aceites.length}</strong> aceite(s) ·{" "}
                  <strong>{aceites.pendentes.length}</strong> pendente(s)
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    baixarCsv(`aceites-termos-v${aceites.versao}.csv`, [
                      ["Situação", "Nome", "Matrícula", "Aceito em", "IP", "Código"],
                      ...aceites.aceites.map((a) => [
                        "Aceito",
                        a.nome,
                        a.matricula ?? "",
                        fmt(a.aceitoEm),
                        a.ip,
                        a.codigo
                      ]),
                      ...aceites.pendentes.map((p) => [
                        "Pendente",
                        p.nome,
                        p.matricula ?? "",
                        "",
                        "",
                        ""
                      ])
                    ])
                  }
                >
                  ⬇ Exportar CSV
                </button>
              </div>
              <div style={{ maxHeight: 420, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--ink-500)" }}>
                      {["Nome", "Matrícula", "Aceito em", "IP", "Código"].map((h) => (
                        <th key={h} style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aceites.aceites.map((a) => (
                      <tr key={a.codigo} style={{ borderBottom: "1px solid #f4f4f4" }}>
                        <td style={{ padding: "5px 8px" }}>{a.nome}</td>
                        <td style={{ padding: "5px 8px" }}>{a.matricula ?? "—"}</td>
                        <td style={{ padding: "5px 8px" }}>{fmt(a.aceitoEm)}</td>
                        <td style={{ padding: "5px 8px" }}>{a.ip}</td>
                        <td
                          style={{
                            padding: "5px 8px",
                            fontFamily: "var(--font-mono)",
                            fontSize: 11
                          }}
                        >
                          {a.codigo}
                        </td>
                      </tr>
                    ))}
                    {aceites.pendentes.map((p, i) => (
                      <tr
                        key={`p-${i}`}
                        style={{ borderBottom: "1px solid #f4f4f4", color: "#92400E" }}
                      >
                        <td style={{ padding: "5px 8px" }}>{p.nome}</td>
                        <td style={{ padding: "5px 8px" }}>{p.matricula ?? "—"}</td>
                        <td style={{ padding: "5px 8px" }} colSpan={3}>
                          pendente
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
