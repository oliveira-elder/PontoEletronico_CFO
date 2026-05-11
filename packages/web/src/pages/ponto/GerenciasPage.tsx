import React, { useState, useEffect } from "react";
import { api } from "../../hooks/useApi";
import { Link } from "react-router-dom";
import {
  BuildingIcon,
  PlusIcon,
  Edit2Icon,
  Trash2Icon,
  XIcon,
  UsersIcon,
  ArrowLeftIcon,
  SearchIcon
} from "../../components/icons";

/* ─── Types ─── */
interface Gerencia {
  id: string;
  nome: string;
  sigla: string;
  responsavel: string;
  descricao: string;
  totalFuncs: number;
  ativa: boolean;
  _count?: { funcionarios: number };
}

const FORM_VAZIO = { nome: "", sigla: "", responsavel: "", descricao: "", ativa: true };

/* ─── Card de gerência ─── */
function GerenciaCard({
  g,
  onEdit,
  onDelete
}: {
  g: Gerencia;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: `1px solid rgba(122,30,38,${g.ativa ? "0.10" : "0.05"})`,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        opacity: g.ativa ? 1 : 0.65,
        transition: "box-shadow 160ms"
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(122,30,38,0.08)")
      }
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "none")}
    >
      {/* Cabeçalho do card */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Sigla */}
          <div
            style={{
              background: "rgba(122,30,38,0.08)",
              borderRadius: "var(--radius-md)",
              padding: "8px 10px",
              flexShrink: 0
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--burgundy-600)",
                letterSpacing: "0.05em"
              }}
            >
              {g.sigla}
            </span>
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)", lineHeight: 1.2 }}>
              {g.nome}
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>{g.responsavel}</p>
          </div>
        </div>
        {/* Status */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: g.ativa ? "var(--green)" : "var(--gray-cfo)",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 4
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: g.ativa ? "var(--green)" : "var(--gray-cfo)",
              display: "inline-block"
            }}
          />
          {g.ativa ? "Ativa" : "Inativa"}
        </span>
      </div>

      {/* Descrição */}
      <p style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.6 }}>{g.descricao}</p>

      {/* Footer do card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid rgba(122,30,38,0.06)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "var(--ink-700)",
            fontSize: 12.5
          }}
        >
          <UsersIcon size={14} />
          <span>
            <strong style={{ fontWeight: 600 }}>{g.totalFuncs}</strong> funcionário
            {g.totalFuncs !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            title="Editar"
            onClick={onEdit}
            style={{
              padding: 6,
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--ink-700)",
              display: "flex",
              alignItems: "center"
            }}
          >
            <Edit2Icon size={14} />
          </button>
          <button
            title="Excluir"
            onClick={onDelete}
            style={{
              padding: 6,
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(200,57,63,0.20)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--red)",
              display: "flex",
              alignItems: "center"
            }}
          >
            <Trash2Icon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Página ─── */
export function GerenciasPage() {
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState<"novo" | "editar" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Gerencia[]>("/ponto/gestao/gerencias")
      .then((data) =>
        setGerencias((data ?? []).map((g) => ({ ...g, totalFuncs: g._count?.funcionarios ?? 0 })))
      )
      .catch(() => {});
  }, []);

  const lista = gerencias.filter((g) => {
    const q = busca.toLowerCase();
    return (
      !q ||
      g.nome.toLowerCase().includes(q) ||
      g.sigla.toLowerCase().includes(q) ||
      g.responsavel.toLowerCase().includes(q)
    );
  });

  const totalFuncs = gerencias.reduce((a, g) => a + g.totalFuncs, 0);
  const ativas = gerencias.filter((g) => g.ativa).length;

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setPainel("novo");
  }

  function abrirEditar(g: Gerencia) {
    setForm({
      nome: g.nome,
      sigla: g.sigla,
      responsavel: g.responsavel,
      descricao: g.descricao,
      ativa: g.ativa
    });
    setEditandoId(g.id);
    setPainel("editar");
  }

  async function salvar() {
    if (!form.nome || !form.sigla) return;
    if (painel === "novo") {
      const nova = await api.post<Gerencia>("/ponto/gestao/gerencias", form);
      setGerencias((prev) => [...prev, { ...nova, totalFuncs: 0 }]);
    } else if (editandoId) {
      const atualizada = await api.put<Gerencia>(`/ponto/gestao/gerencias/${editandoId}`, form);
      setGerencias((prev) =>
        prev.map((g) => (g.id === editandoId ? { ...atualizada, totalFuncs: g.totalFuncs } : g))
      );
    }
    setPainel(null);
  }

  async function excluir(id: string) {
    await api.delete(`/ponto/gestao/gerencias/${id}`);
    setGerencias((prev) => prev.filter((g) => g.id !== id));
    setConfirmDelete(null);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      {/* ── Navegação de volta ── */}
      <Link
        to="/ponto/gestao"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--burgundy-600)",
          textDecoration: "none",
          fontWeight: 500,
          marginBottom: 20
        }}
      >
        <ArrowLeftIcon size={15} />
        Voltar para Gestão de Funcionários
      </Link>

      {/* ── Cabeçalho ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            Administração
          </p>
          <h1
            style={{
              fontSize: "clamp(22px,3vw,28px)",
              fontFamily: "var(--font-display)",
              lineHeight: 1.1
            }}
          >
            Gerências <em>& Setores</em>
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-500)",
              marginTop: 6,
              maxWidth: 500,
              lineHeight: 1.6
            }}
          >
            Configure os setores da instituição. Cada gerência agrupa funcionários e define a
            estrutura organizacional do CFO.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={abrirNovo}
          style={{ gap: 8, alignSelf: "flex-start" }}
        >
          <PlusIcon size={16} />
          Nova Gerência
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { valor: gerencias.length, label: "Total de gerências", cor: "var(--burgundy-600)" },
          { valor: ativas, label: "Gerências ativas", cor: "var(--green)" },
          { valor: totalFuncs, label: "Funcionários totais", cor: "var(--blue-ink)" }
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "#fff",
              borderRadius: "var(--radius-lg)",
              border: "1px solid rgba(122,30,38,0.08)",
              padding: "16px 20px",
              minWidth: 120
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 28,
                color: s.cor,
                lineHeight: 1,
                marginBottom: 4
              }}
            >
              {s.valor}
            </p>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ink-500)"
              }}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Busca ── */}
      <div style={{ position: "relative", marginBottom: 20, maxWidth: 360 }}>
        <SearchIcon
          size={15}
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--ink-500)",
            pointerEvents: "none"
          }}
        />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, sigla ou responsável…"
          style={{
            width: "100%",
            padding: "9px 12px 9px 36px",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(122,30,38,0.14)",
            background: "#fff",
            fontSize: 13,
            fontFamily: "var(--font-body)",
            outline: "none",
            boxSizing: "border-box"
          }}
        />
      </div>

      {/* ── Grid de cards ── */}
      {lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-500)" }}>
          <BuildingIcon
            size={40}
            style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }}
          />
          <p style={{ fontSize: 14 }}>Nenhuma gerência encontrada.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))",
            gap: 16
          }}
        >
          {lista.map((g) => (
            <GerenciaCard
              key={g.id}
              g={g}
              onEdit={() => abrirEditar(g)}
              onDelete={() => setConfirmDelete(g.id)}
            />
          ))}
        </div>
      )}

      {/* ── Drawer — Novo / Editar ── */}
      {painel && (
        <>
          <div
            onClick={() => setPainel(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.35)", zIndex: 40 }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 420,
              maxWidth: "100vw",
              background: "#fff",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-8px 0 40px rgba(10,5,6,0.14)"
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid rgba(122,30,38,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0
              }}
            >
              <div>
                <p className="eyebrow" style={{ marginBottom: 2 }}>
                  {painel === "novo" ? "Cadastro" : "Edição"}
                </p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    fontSize: 20,
                    color: "var(--burgundy-600)",
                    fontWeight: 400
                  }}
                >
                  {painel === "novo" ? "Nova Gerência" : "Editar Gerência"}
                </h2>
              </div>
              <button
                onClick={() => setPainel(null)}
                style={{
                  padding: 8,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--ink-500)"
                }}
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Campos */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              {(
                [
                  { key: "nome", label: "Nome da Gerência *", placeholder: "Ex: Recursos Humanos" },
                  { key: "sigla", label: "Sigla *", placeholder: "Ex: GERH" },
                  {
                    key: "responsavel",
                    label: "Responsável",
                    placeholder: "Ex: Dr. João da Silva"
                  },
                  {
                    key: "descricao",
                    label: "Descrição",
                    placeholder: "Atribuições desta gerência…"
                  }
                ] as { key: keyof typeof form; label: string; placeholder: string }[]
              ).map(({ key, label, placeholder }) => (
                <div key={key} style={{ marginBottom: 18 }}>
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: 6
                    }}
                  >
                    {label}
                  </label>
                  {key === "descricao" ? (
                    <textarea
                      value={String(form[key])}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "#fff",
                        fontSize: 13.5,
                        fontFamily: "var(--font-body)",
                        outline: "none",
                        boxSizing: "border-box",
                        resize: "vertical"
                      }}
                    />
                  ) : (
                    <input
                      value={String(form[key])}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid rgba(122,30,38,0.14)",
                        background: "#fff",
                        fontSize: 13.5,
                        fontFamily: "var(--font-body)",
                        outline: "none",
                        boxSizing: "border-box"
                      }}
                    />
                  )}
                </div>
              ))}

              {/* Situação */}
              <div style={{ marginBottom: 18 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 6
                  }}
                >
                  Situação
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setForm((f) => ({ ...f, ativa: v }))}
                      style={{
                        flex: 1,
                        padding: "9px",
                        borderRadius: "var(--radius-md)",
                        border: `2px solid ${form.ativa === v ? (v ? "var(--green)" : "var(--red)") : "rgba(122,30,38,0.12)"}`,
                        background:
                          form.ativa === v
                            ? v
                              ? "rgba(47,125,79,0.08)"
                              : "rgba(200,57,63,0.06)"
                            : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        color:
                          form.ativa === v ? (v ? "var(--green)" : "var(--red)") : "var(--ink-500)",
                        transition: "all 140ms"
                      }}
                    >
                      {v ? "● Ativa" : "○ Inativa"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid rgba(122,30,38,0.08)",
                display: "flex",
                gap: 10,
                flexShrink: 0
              }}
            >
              <button className="btn btn-ghost" onClick={() => setPainel(null)} style={{ flex: 1 }}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={salvar}
                disabled={!form.nome || !form.sigla}
                style={{ flex: 2, opacity: !form.nome || !form.sigla ? 0.5 : 1 }}
              >
                {painel === "novo" ? "Criar Gerência" : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal de confirmação de exclusão ── */}
      {confirmDelete && (
        <>
          <div
            onClick={() => setConfirmDelete(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.40)", zIndex: 60 }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "#fff",
              borderRadius: "var(--radius-xl)",
              padding: 28,
              width: 340,
              zIndex: 70,
              boxShadow: "0 20px 60px rgba(10,5,6,0.20)"
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 20,
                color: "var(--burgundy-600)",
                marginBottom: 8
              }}
            >
              Confirmar exclusão
            </h3>
            <p
              style={{ fontSize: 13.5, color: "var(--ink-700)", marginBottom: 20, lineHeight: 1.6 }}
            >
              Ao excluir uma gerência, os funcionários vinculados perderão essa associação. Esta
              ação não pode ser desfeita.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => excluir(confirmDelete!)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "var(--red)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer"
                }}
              >
                Excluir
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
