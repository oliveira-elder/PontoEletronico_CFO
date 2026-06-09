import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import {
  UsersIcon,
  SearchIcon,
  Edit2Icon,
  Trash2Icon,
  XIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  XCircleIcon
} from "../../components/icons";

/* ─── Types ─── */
type Categoria = "ESTAGIARIO" | "CONCURSADO" | "ASSESSOR";

interface Gerencia {
  id: string;
  nome: string;
  sigla: string;
}
interface Funcionario {
  id: string;
  matricula: string | null;
  email: string;
  cargo: string;
  categoria: Categoria;
  gerenciaId: string;
  ativo: boolean;
  section?: string | null;
  isManager?: boolean;
  user: { id: string; name: string; email: string; emailReal: string | null };
  gerencia?: { id: string; nome: string; sigla: string } | null;
}

const SSO_FAKE_SUFFIXES = ["@sso.local", "@pending.local"];

function resolveEmail(u: { email: string; emailReal: string | null }): string {
  if (u.emailReal) return u.emailReal;
  for (const suffix of SSO_FAKE_SUFFIXES) {
    if (u.email.endsWith(suffix)) {
      return u.email.replace(suffix, "@cfo.org.br");
    }
  }
  return u.email;
}

/* ─── Config de categoria ─── */
const CAT: Record<Categoria, { label: string; cor: string; bg: string; icon: React.ElementType }> =
  {
    ESTAGIARIO: {
      label: "Estagiário",
      cor: "var(--blue-ink)",
      bg: "rgba(30,74,122,0.08)",
      icon: GraduationCapIcon
    },
    CONCURSADO: {
      label: "Concursado",
      cor: "var(--green)",
      bg: "rgba(47,125,79,0.08)",
      icon: ShieldCheckIcon
    },
    ASSESSOR: {
      label: "Assessor",
      cor: "#8a6a00",
      bg: "rgba(247,196,55,0.12)",
      icon: BriefcaseIcon
    }
  };

/* ─── Form vazio ─── */
const FORM_VAZIO = {
  nome: "",
  matricula: "",
  email: "",
  cpf: "",
  cargo: "",
  categoria: "CONCURSADO" as Categoria,
  gerenciaId: "",
  ativo: true
};

/* ─── Stat Card ─── */
function Stat({ valor, label, cor }: { valor: number; label: string; cor: string }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid rgba(122,30,38,0.08)",
        padding: "16px 20px",
        minWidth: 110
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          fontSize: 28,
          color: cor,
          lineHeight: 1,
          marginBottom: 4
        }}
      >
        {valor}
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
        {label}
      </p>
    </div>
  );
}

/* ─── Badge Categoria ─── */
function CategoriaBadge({ cat }: { cat: Categoria }) {
  const c = CAT[cat];
  const Icon = c.icon;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: "var(--radius-full)",
        background: c.bg,
        color: c.cor,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap"
      }}
    >
      <Icon size={12} />
      {c.label}
    </span>
  );
}

interface SyncStatus {
  id: string;
  source: string;
  status: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  createdAt: string;
}

/* ─── Página ─── */
export function GestaoPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  const isRH = isAdmin || hasRole("RH_AUDITORIA");
  const podeToggleAtivo = isRH;

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | "">("");
  const [filtroGerencia, setFiltroGerencia] = useState("");
  const [painel, setPainel] = useState<"novo" | "editar" | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const carregarSyncStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await api.get<SyncStatus>("/admin/extensions/sync/status");
      setSyncStatus(data);
    } catch {
      /* opcional */
    }
  }, [isAdmin]);

  useEffect(() => {
    void carregarSyncStatus();
    Promise.all([
      api.get<Funcionario[]>("/ponto/gestao/funcionarios"),
      api.get<(Gerencia & { _count: { funcionarios: number } })[]>("/ponto/gestao/gerencias")
    ])
      .then(([funcs, gers]) => {
        setFuncionarios(funcs ?? []);
        setGerencias(gers ?? []);
      })
      .catch(() => {});
  }, [carregarSyncStatus]);

  async function sincronizarExtensions() {
    setSyncLoading(true);
    setSyncMsg("");
    try {
      const res = await api.post<{
        total: number;
        created: number;
        updated: number;
        skipped: number;
        errors: number;
      }>("/admin/extensions/sync", {});
      setSyncMsg(
        `Sync concluído: ${res.updated} atualizados, ${res.created} gerências criadas, ${res.skipped} ignorados.`
      );
      await carregarSyncStatus();
      const funcs = await api.get<Funcionario[]>("/ponto/gestao/funcionarios");
      setFuncionarios(funcs ?? []);
    } catch {
      setSyncMsg("Erro ao sincronizar com a API de ramais.");
    } finally {
      setSyncLoading(false);
    }
  }

  /* Filtro */
  const lista = funcionarios.filter((f) => {
    const q = busca.toLowerCase();
    const matchBusca =
      !q ||
      (f.user?.name ?? "").toLowerCase().includes(q) ||
      (f.matricula ?? "").includes(q) ||
      (f.user?.email ?? "").toLowerCase().includes(q);
    const matchCat = !filtroCategoria || f.categoria === filtroCategoria;
    const matchGer = !filtroGerencia || f.gerenciaId === filtroGerencia;
    return matchBusca && matchCat && matchGer;
  });

  function abrirEditar(f: Funcionario) {
    setForm({
      nome: f.user?.name ?? "",
      matricula: f.matricula ?? "",
      email: f.user?.email ?? "",
      cpf: "",
      cargo: f.cargo,
      categoria: f.categoria,
      gerenciaId: f.gerenciaId,
      ativo: f.ativo
    });
    setEditandoId(f.id);
    setPainel("editar");
  }

  async function salvar() {
    if (!form.nome || !form.matricula || !form.gerenciaId) return;
    if (painel === "novo") {
      const novo = await api.post<Funcionario>("/ponto/gestao/funcionarios", form);
      setFuncionarios((prev) => [...prev, novo]);
    } else if (editandoId) {
      const atualizado = await api.put<Funcionario>(
        `/ponto/gestao/funcionarios/${editandoId}`,
        form
      );
      setFuncionarios((prev) => prev.map((f) => (f.id === editandoId ? atualizado! : f)));
    }
    setPainel(null);
  }

  async function excluir(id: string) {
    await api.delete(`/ponto/gestao/funcionarios/${id}`);
    setFuncionarios((prev) => prev.filter((f) => f.id !== id));
    setConfirmDelete(null);
  }

  async function toggleAtivo(f: Funcionario) {
    const atualizado = await api.put<Funcionario>(`/ponto/gestao/funcionarios/${f.id}`, {
      ativo: !f.ativo
    });
    if (atualizado) {
      setFuncionarios((prev) => prev.map((x) => (x.id === f.id ? atualizado : x)));
    }
  }

  const nomeGerencia = (id: string) => gerencias.find((g) => g.id === id)?.nome ?? "—";

  const total = funcionarios.length;
  const estagiarios = funcionarios.filter((f) => f.categoria === "ESTAGIARIO").length;
  const concursados = funcionarios.filter((f) => f.categoria === "CONCURSADO").length;
  const assessores = funcionarios.filter((f) => f.categoria === "ASSESSOR").length;

  // Acesso restrito: apenas RH_AUDITORIA e super admin/ponto-admin
  if (!isRH) {
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", padding: "0 16px" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid rgba(122,30,38,0.12)",
            padding: "32px 28px",
            textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)"
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-900)", margin: "0 0 8px" }}>
            Acesso restrito
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, margin: 0 }}>
            A página de Gestão de Funcionários é exclusiva para o setor de{" "}
            <strong>Recursos Humanos</strong> e <strong>administradores do sistema</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
            Gestão de <em>Funcionários</em>
          </h1>
        </div>
        {/* Ações removidas: inserções são exclusivamente via sync da API Extensions + SSO */}
      </div>

      {/* ── Banner Sync Extensions (apenas admin) ── */}
      {isAdmin && (
        <div
          style={{
            background: "#fff",
            border: "1px solid rgba(37,99,235,0.2)",
            borderRadius: "var(--radius-md)",
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#1e40af" }}>
              API de Ramais (Extensions)
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-500)" }}>
              {syncStatus
                ? `Último sync: ${new Date(syncStatus.createdAt).toLocaleString("pt-BR")} — ${syncStatus.updated} atualizados, ${syncStatus.created} gerências criadas, ${syncStatus.errors} erros`
                : "Nenhuma sincronização realizada ainda."}
            </p>
            {syncMsg && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 11.5,
                  color: syncMsg.startsWith("Erro") ? "var(--red)" : "#065f46",
                  fontWeight: 500
                }}
              >
                {syncMsg}
              </p>
            )}
          </div>
          <button
            onClick={() => void sincronizarExtensions()}
            disabled={syncLoading}
            style={{
              padding: "7px 14px",
              border: "1px solid rgba(37,99,235,0.3)",
              borderRadius: "var(--radius-md)",
              background: syncLoading ? "rgba(37,99,235,0.06)" : "#eff6ff",
              color: "#1e40af",
              cursor: syncLoading ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0
            }}
          >
            {syncLoading ? "Sincronizando..." : "↻ Sincronizar Gerências"}
          </button>
        </div>
      )}

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <Stat valor={total} label="Total" cor="var(--burgundy-600)" />
        <Stat valor={concursados} label="Concursados" cor="var(--green)" />
        <Stat valor={assessores} label="Assessores" cor="#8a6a00" />
        <Stat valor={estagiarios} label="Estagiários" cor="var(--blue-ink)" />
      </div>

      {/* ── Barra de filtros ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Busca */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
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
            placeholder="Buscar por nome, matrícula ou e-mail…"
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

        {/* Filtro categoria */}
        <div style={{ position: "relative" }}>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value as Categoria | "")}
            style={{
              appearance: "none",
              padding: "9px 32px 9px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "#fff",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              color: "var(--ink-900)",
              cursor: "pointer",
              outline: "none"
            }}
          >
            <option value="">Todas as categorias</option>
            <option value="CONCURSADO">Concursado</option>
            <option value="ASSESSOR">Assessor</option>
            <option value="ESTAGIARIO">Estagiário</option>
          </select>
          <ChevronDownIcon
            size={14}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--ink-500)"
            }}
          />
        </div>

        {/* Filtro gerência */}
        <div style={{ position: "relative" }}>
          <select
            value={filtroGerencia}
            onChange={(e) => setFiltroGerencia(e.target.value)}
            style={{
              appearance: "none",
              padding: "9px 32px 9px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.14)",
              background: "#fff",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              color: "var(--ink-900)",
              cursor: "pointer",
              outline: "none"
            }}
          >
            <option value="">Todas as gerências</option>
            {gerencias.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={14}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--ink-500)"
            }}
          />
        </div>
      </div>

      {/* ── Tabela ── */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          overflow: "hidden"
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--cream-50)",
                  borderBottom: "1px solid rgba(122,30,38,0.08)"
                }}
              >
                {["Funcionário", "Matrícula", "Categoria", "Gerência", "Situação", "Ações"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "var(--ink-500)",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px",
                      textAlign: "center",
                      color: "var(--ink-500)",
                      fontSize: 14
                    }}
                  >
                    <UsersIcon
                      size={32}
                      style={{ display: "block", margin: "0 auto 8px", opacity: 0.3 }}
                    />
                    Nenhum funcionário encontrado.
                  </td>
                </tr>
              ) : (
                lista.map((f, i) => (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom:
                        i < lista.length - 1 ? "1px solid rgba(122,30,38,0.06)" : "none",
                      transition: "background 120ms"
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "rgba(122,30,38,0.02)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    {/* Funcionário */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            background: "var(--burgundy-600)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: 13,
                            flexShrink: 0
                          }}
                        >
                          {(f.user?.name ?? "?")
                            .split(" ")
                            .map((n: string) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div>
                          <p
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: "var(--ink-900)",
                              lineHeight: 1.2
                            }}
                          >
                            {f.user?.name ?? "—"}
                          </p>
                          <p style={{ fontSize: 11.5, color: "var(--ink-500)", lineHeight: 1 }}>
                            {f.user ? resolveEmail(f.user) : "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Matrícula */}
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12.5,
                          color: "var(--ink-700)"
                        }}
                      >
                        {f.matricula}
                      </span>
                    </td>
                    {/* Categoria */}
                    <td style={{ padding: "12px 16px" }}>
                      <CategoriaBadge cat={f.categoria} />
                    </td>
                    {/* Gerência */}
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 13, color: "var(--ink-700)" }}>
                        {nomeGerencia(f.gerenciaId)}
                      </span>
                      {f.section && isAdmin && (
                        <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "var(--ink-500)" }}>
                          {f.section}
                          {f.isManager ? " · Gerente" : ""}
                        </p>
                      )}
                    </td>
                    {/* Situação */}
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 12,
                          fontWeight: 600,
                          color: f.ativo ? "var(--green)" : "var(--ink-500)"
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: f.ativo ? "var(--green)" : "var(--gray-cfo)",
                            display: "inline-block"
                          }}
                        />
                        {f.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    {/* Ações */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          title="Editar"
                          onClick={() => abrirEditar(f)}
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
                        {podeToggleAtivo && (
                          <button
                            title={f.ativo ? "Desativar funcionário" : "Ativar funcionário"}
                            onClick={() => void toggleAtivo(f)}
                            style={{
                              padding: 6,
                              borderRadius: "var(--radius-sm)",
                              border: f.ativo
                                ? "1px solid rgba(198,127,0,0.30)"
                                : "1px solid rgba(47,125,79,0.30)",
                              background: "transparent",
                              cursor: "pointer",
                              color: f.ativo ? "#92400e" : "var(--green)",
                              display: "flex",
                              alignItems: "center"
                            }}
                          >
                            {f.ativo ? <XCircleIcon size={14} /> : <CheckCircleIcon size={14} />}
                          </button>
                        )}
                        <button
                          title="Excluir"
                          onClick={() => setConfirmDelete(f.id)}
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Rodapé da tabela */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid rgba(122,30,38,0.06)",
            fontSize: 12,
            color: "var(--ink-500)"
          }}
        >
          {lista.length} funcionário{lista.length !== 1 ? "s" : ""} exibido
          {lista.length !== 1 ? "s" : ""}
          {filtroCategoria || filtroGerencia || busca
            ? ` (filtrado${lista.length !== 1 ? "s" : ""} de ${total})`
            : ""}
        </div>
      </div>

      {/* ── Painel lateral — Novo / Editar ── */}
      {painel && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setPainel(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(10,5,6,0.35)", zIndex: 40 }}
          />
          {/* Drawer */}
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 440,
              maxWidth: "100vw",
              background: "#fff",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-8px 0 40px rgba(10,5,6,0.14)"
            }}
          >
            {/* Header do painel */}
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
                  {painel === "novo" ? "Novo Funcionário" : "Editar Funcionário"}
                </h2>
              </div>
              <button
                onClick={() => setPainel(null)}
                style={{
                  padding: 8,
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--ink-500)"
                }}
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Formulário */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              {/* Categoria — seleção visual */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--ink-500)",
                    display: "block",
                    marginBottom: 8
                  }}
                >
                  Categoria *
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {(Object.keys(CAT) as Categoria[]).map((cat) => {
                    const c = CAT[cat];
                    const Icon = c.icon;
                    const sel = form.categoria === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setForm((f) => ({ ...f, categoria: cat }))}
                        style={{
                          padding: "10px 8px",
                          borderRadius: "var(--radius-md)",
                          border: `2px solid ${sel ? c.cor : "rgba(122,30,38,0.12)"}`,
                          background: sel ? c.bg : "transparent",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          transition: "all 140ms ease"
                        }}
                      >
                        <Icon size={18} style={{ color: sel ? c.cor : "var(--ink-500)" }} />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: sel ? c.cor : "var(--ink-700)"
                          }}
                        >
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campos */}
              {(
                [
                  {
                    key: "nome",
                    label: "Nome completo *",
                    placeholder: "Ex: João da Silva",
                    type: "text"
                  },
                  {
                    key: "matricula",
                    label: "Matrícula *",
                    placeholder: "Ex: 00123 ou EST01",
                    type: "text"
                  },
                  {
                    key: "email",
                    label: "E-mail institucional",
                    placeholder: "nome@cfo.org.br",
                    type: "email"
                  },
                  { key: "cpf", label: "CPF", placeholder: "000.000.000-00", type: "text" },
                  {
                    key: "cargo",
                    label: "Cargo / Função",
                    placeholder: "Ex: Analista de RH",
                    type: "text"
                  }
                ] as { key: keyof typeof form; label: string; placeholder: string; type: string }[]
              ).map(({ key, label, placeholder, type }) => (
                <div key={key} style={{ marginBottom: 16 }}>
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
                  <input
                    type={type}
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
                </div>
              ))}

              {/* Gerência */}
              <div style={{ marginBottom: 16 }}>
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
                  Gerência *
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    value={form.gerenciaId}
                    onChange={(e) => setForm((f) => ({ ...f, gerenciaId: e.target.value }))}
                    style={{
                      width: "100%",
                      appearance: "none",
                      padding: "9px 32px 9px 12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid rgba(122,30,38,0.14)",
                      background: "#fff",
                      fontSize: 13.5,
                      fontFamily: "var(--font-body)",
                      color: form.gerenciaId ? "var(--ink-900)" : "var(--ink-500)",
                      cursor: "pointer",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="">Selecione uma gerência…</option>
                    {gerencias.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.sigla} — {g.nome}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    size={14}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "var(--ink-500)"
                    }}
                  />
                </div>
              </div>

              {/* Situação */}
              {painel === "editar" && (
                <div style={{ marginBottom: 16 }}>
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
                        onClick={() => setForm((f) => ({ ...f, ativo: v }))}
                        style={{
                          flex: 1,
                          padding: "8px",
                          borderRadius: "var(--radius-md)",
                          border: `2px solid ${form.ativo === v ? (v ? "var(--green)" : "var(--red)") : "rgba(122,30,38,0.12)"}`,
                          background:
                            form.ativo === v
                              ? v
                                ? "rgba(47,125,79,0.08)"
                                : "rgba(200,57,63,0.06)"
                              : "transparent",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 600,
                          color:
                            form.ativo === v
                              ? v
                                ? "var(--green)"
                                : "var(--red)"
                              : "var(--ink-500)",
                          transition: "all 140ms"
                        }}
                      >
                        {v ? "● Ativo" : "○ Inativo"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  background: "var(--cream-50)",
                  borderRadius: "var(--radius-md)",
                  fontSize: 12,
                  color: "var(--ink-500)"
                }}
              >
                Campos marcados com * são obrigatórios.
              </div>
            </div>

            {/* Footer do painel */}
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
                disabled={!form.nome || !form.matricula || !form.gerenciaId}
                style={{
                  flex: 2,
                  opacity: !form.nome || !form.matricula || !form.gerenciaId ? 0.5 : 1
                }}
              >
                {painel === "novo" ? "Cadastrar Funcionário" : "Salvar Alterações"}
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
              Esta ação não pode ser desfeita. O funcionário será removido do sistema.
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
