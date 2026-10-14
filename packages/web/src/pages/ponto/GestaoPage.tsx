import React, { useState, useEffect, Suspense } from "react";
import { SolicitarTodosBarra } from "../../components/SolicitarTodosBarra";
import { Link } from "react-router-dom";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";
import {
  UsersIcon,
  SearchIcon,
  Edit2Icon,
  Trash2Icon,
  ChevronDownIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon
} from "../../components/icons";
import { ExtensionsApiPanel } from "../../components/ExtensionsApiPanel";
import { dataBrasiliaISO, hojeBrasiliaISO } from "../../utils/horario-brasilia";
import {
  CAT,
  infoContato,
  nomeGerencia as resolverNomeGerencia,
  resolveEmail,
  slugLabel,
  type Categoria,
  type Funcionario,
  type Gerencia
} from "./gestaoShared";
import { paginaRhLiberada } from "../../utils/recursosRh";
import { SemAcessoRh } from "../../components/SemAcessoRh";

function fezLoginHoje(f: Funcionario): boolean {
  if (f.loginHoje !== undefined) return f.loginHoje;
  const ultimoLoginEm = f.user?.ultimoLoginEm;
  return !!ultimoLoginEm && dataBrasiliaISO(ultimoLoginEm) === hojeBrasiliaISO();
}

/* ─── Stat Card ─── */
function Stat({
  valor,
  label,
  cor,
  onClick,
  selecionado
}: {
  valor: number;
  label: string;
  cor: string;
  onClick?: () => void;
  selecionado?: boolean;
}) {
  const clicavel = !!onClick;
  return (
    <div
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clicavel
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{
        background: selecionado ? "var(--burgundy-50, #fdf2f3)" : "#fff",
        borderRadius: "var(--radius-lg)",
        border: selecionado
          ? "1px solid var(--burgundy-300, #d68f96)"
          : "1px solid rgba(122,30,38,0.08)",
        padding: "16px 20px",
        flex: "1 0 auto",
        minWidth: 110,
        cursor: clicavel ? "pointer" : "default",
        boxShadow: selecionado ? "0 0 0 1px var(--burgundy-300, #d68f96) inset" : "none",
        transition: "background 0.15s, border-color 0.15s"
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
  const c = CAT[cat] ?? CAT.CONCURSADO;
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

/* ─── Página ─── */
function GestaoListaTab() {
  const { user, hasRole, podeRh } = useAuth();
  const isAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  const isRH = isAdmin || hasRole("RH_AUDITORIA");
  const podeToggleAtivo = isRH;
  const isSuperAdmin = !!user?.isSuperAdmin;

  const isRhOuAdmin = isAdmin || hasRole("RH_AUDITORIA");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [gerencias, setGerencias] = useState<Gerencia[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | "">("");
  const [filtroGerencia, setFiltroGerencia] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"todos" | "ativo" | "inativo">("ativo");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [numeroChamado, setNumeroChamado] = useState("");
  const [erroExclusao, setErroExclusao] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [desligarAlvo, setDesligarAlvo] = useState<Funcionario | null>(null);
  const [dataDesligamento, setDataDesligamento] = useState("");
  const [desligando, setDesligando] = useState(false);

  useEffect(() => {
    api
      .get<Funcionario[]>("/ponto/gestao/funcionarios")
      .then((funcs) => setFuncionarios(funcs ?? []))
      .catch(() => {});
    api
      .get<(Gerencia & { _count: { funcionarios: number } })[]>("/ponto/gestao/gerencias")
      .then((gers) => setGerencias(gers ?? []))
      .catch(() => {});
  }, []);

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
    const matchSituacao =
      filtroSituacao === "todos" ||
      (filtroSituacao === "ativo" && f.ativo) ||
      (filtroSituacao === "inativo" && !f.ativo);
    return matchBusca && matchCat && matchGer && matchSituacao;
  });

  function abrirConfirmDelete(id: string) {
    setConfirmDelete(id);
    setNumeroChamado("");
    setErroExclusao("");
  }

  async function excluir(id: string) {
    if (!numeroChamado.trim()) {
      setErroExclusao("Informe o número do chamado interno para confirmar a exclusão.");
      return;
    }
    setExcluindo(true);
    setErroExclusao("");
    try {
      await api.delete(`/ponto/gestao/funcionarios/${id}`, { numeroChamado: numeroChamado.trim() });
      setFuncionarios((prev) => prev.filter((f) => f.id !== id));
      setConfirmDelete(null);
      setNumeroChamado("");
    } catch (e: unknown) {
      setErroExclusao(e instanceof Error ? e.message : "Erro ao excluir funcionário.");
    } finally {
      setExcluindo(false);
    }
  }

  async function toggleAtivo(f: Funcionario) {
    if (f.ativo) {
      /* Inativar exige data de desligamento — fonte de verdade da inatividade. */
      setDesligarAlvo(f);
      setDataDesligamento(hojeBrasiliaISO());
      return;
    }
    /* Reativar: PUT ativo=true limpa dataDesligamento no backend (recontratação). */
    const atualizado = await api.put<Funcionario>(`/ponto/gestao/funcionarios/${f.id}`, {
      ativo: true
    });
    if (atualizado) {
      setFuncionarios((prev) => prev.map((x) => (x.id === f.id ? atualizado : x)));
    }
  }

  async function confirmarDesligamento() {
    if (!desligarAlvo || !dataDesligamento) return;
    setDesligando(true);
    try {
      const atualizado = await api.put<Funcionario>(
        `/ponto/gestao/funcionarios/${desligarAlvo.id}`,
        { dataDesligamento }
      );
      if (atualizado) {
        setFuncionarios((prev) => prev.map((x) => (x.id === desligarAlvo.id ? atualizado : x)));
      }
      setDesligarAlvo(null);
    } finally {
      setDesligando(false);
    }
  }

  async function toggleCamposManuais(f: Funcionario) {
    const novoValor = !f.camposManuaisConfigurados;
    setFuncionarios((prev) =>
      prev.map((x) => (x.id === f.id ? { ...x, camposManuaisConfigurados: novoValor } : x))
    );
    try {
      await api.put<Funcionario>(`/ponto/gestao/funcionarios/${f.id}`, {
        camposManuaisConfigurados: novoValor
      });
    } catch {
      setFuncionarios((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, camposManuaisConfigurados: !novoValor } : x))
      );
    }
  }

  const nomeGerencia = (
    id: string | null | undefined,
    gerencia?: { nome?: string | null } | null
  ) => resolverNomeGerencia(gerencias, id, gerencia);

  const total = funcionarios.length;
  /* Cards: as categorias contam só ativos, para somarem o "Total Ativos". */
  const listaAtivos = funcionarios.filter((f) => f.ativo);
  const ativos = listaAtivos.length;
  const inativos = total - ativos;
  const ativosPorCategoria = (cat: Categoria) =>
    listaAtivos.filter((f) => f.categoria === cat).length;

  /* Clique nos cards: Total Ativos / categoria filtram ativos; Inativos filtra inativos.
     Clicar de novo no card já selecionado volta para "Total Ativos". */
  const cardAtivosSelecionado = (cat: Categoria | "") =>
    filtroSituacao === "ativo" && filtroCategoria === cat;
  const selecionarCardAtivos = (cat: Categoria | "") => {
    const jaSelecionado = cardAtivosSelecionado(cat);
    setFiltroSituacao("ativo");
    setFiltroCategoria(jaSelecionado ? "" : cat);
  };
  const selecionarCardInativos = () => {
    const jaSelecionado = filtroSituacao === "inativo" && filtroCategoria === "";
    setFiltroSituacao(jaSelecionado ? "ativo" : "inativo");
    setFiltroCategoria("");
  };

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
    <div>
      {/* Solicitar endereço em massa */}
      {isRhOuAdmin && podeRh("gestao.solicitar-todos") && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <SolicitarTodosBarra pode={podeRh} />
        </div>
      )}

      {/* ── Banner Sync Extensions (RH e admin) ── */}
      {isRhOuAdmin && podeRh("gestao.ramais") && (
        <ExtensionsApiPanel
          isAdmin={isAdmin}
          isSuperAdmin={!!user?.isSuperAdmin}
          podeSincronizar={podeRh("gestao.ramais.sincronizar")}
          onSyncComplete={() => {
            void api
              .get<Funcionario[]>("/ponto/gestao/funcionarios")
              .then((funcs) => setFuncionarios(funcs ?? []))
              .catch(() => {});
            void api
              .get<(Gerencia & { _count: { funcionarios: number } })[]>("/ponto/gestao/gerencias")
              .then((gers) => setGerencias(gers ?? []))
              .catch(() => {});
          }}
        />
      )}

      {/* Perfil do RH: lista e ficha exigem a área "Funcionários". */}
      {podeRh("gestao.funcionarios") && (
        <>
          {/* ── Stats ── */}
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "stretch",
              marginBottom: 24,
              overflowX: "auto",
              paddingBottom: 2
            }}
          >
            <Stat
              valor={ativos}
              label="Total Ativos"
              cor="var(--burgundy-600)"
              selecionado={cardAtivosSelecionado("")}
              onClick={() => selecionarCardAtivos("")}
            />
            <Stat
              valor={ativosPorCategoria("CONCURSADO")}
              label="Empregados"
              cor="var(--green)"
              selecionado={cardAtivosSelecionado("CONCURSADO")}
              onClick={() => selecionarCardAtivos("CONCURSADO")}
            />
            <Stat
              valor={ativosPorCategoria("ASSESSOR")}
              label="Comissionados"
              cor="#8a6a00"
              selecionado={cardAtivosSelecionado("ASSESSOR")}
              onClick={() => selecionarCardAtivos("ASSESSOR")}
            />
            <Stat
              valor={ativosPorCategoria("ESTAGIARIO")}
              label="Estagiários"
              cor="var(--blue-ink)"
              selecionado={cardAtivosSelecionado("ESTAGIARIO")}
              onClick={() => selecionarCardAtivos("ESTAGIARIO")}
            />
            <Stat
              valor={ativosPorCategoria("MENOR_APRENDIZ")}
              label="Jovens Aprendizes"
              cor="#5b4a9e"
              selecionado={cardAtivosSelecionado("MENOR_APRENDIZ")}
              onClick={() => selecionarCardAtivos("MENOR_APRENDIZ")}
            />
            {/* Separador: à esquerda os ativos (total e por categoria), à direita os inativos. */}
            <div
              aria-hidden
              style={{
                width: 1,
                flexShrink: 0,
                margin: "6px 4px",
                background: "rgba(122,30,38,0.18)"
              }}
            />
            <Stat
              valor={inativos}
              label="Inativos"
              cor="var(--ink-500)"
              selecionado={filtroSituacao === "inativo" && filtroCategoria === ""}
              onClick={selecionarCardInativos}
            />
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
                {(Object.keys(CAT) as Categoria[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CAT[cat].label}
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

            {/* Filtro situação (ativo/inativo) */}
            <div style={{ position: "relative" }}>
              <select
                value={filtroSituacao}
                onChange={(e) => setFiltroSituacao(e.target.value as "todos" | "ativo" | "inativo")}
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
                <option value="todos">Ativos e Inativos</option>
                <option value="ativo">Somente Ativos</option>
                <option value="inativo">Somente Inativos</option>
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
                    {[
                      "Funcionário",
                      "Matrícula",
                      "Categoria",
                      "Gerência",
                      "Situação",
                      "Login Hoje",
                      "Ações"
                    ].map((h) => (
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
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
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
                          ((e.currentTarget as HTMLElement).style.background =
                            "rgba(122,30,38,0.02)")
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
                                background: f.fotoPerfilUrl ? "transparent" : "var(--burgundy-600)",
                                border: f.fotoPerfilUrl ? "2px solid var(--burgundy-600)" : "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontWeight: 600,
                                fontSize: 13,
                                flexShrink: 0,
                                overflow: "hidden"
                              }}
                            >
                              {f.fotoPerfilUrl ? (
                                <img
                                  src={f.fotoPerfilUrl}
                                  alt={f.user?.name}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    display: "block"
                                  }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                (f.user?.name ?? "?")
                                  .split(" ")
                                  .map((n: string) => n[0])
                                  .slice(0, 2)
                                  .join("")
                              )}
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
                        {/* Gerência / Subseção */}
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 13, color: "var(--ink-700)", fontWeight: 500 }}>
                            {nomeGerencia(f.gerenciaId, f.gerencia)}
                            {f.subsecao && (
                              <span style={{ color: "var(--ink-400)", fontWeight: 400 }}>
                                {" / "}
                                {slugLabel(f.subsecao)}
                              </span>
                            )}
                          </span>
                          {f.isManager && !f.ehGerenteSubstituto && (
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontSize: 10.5,
                                color: "var(--burgundy-600)",
                                fontWeight: 600
                              }}
                            >
                              Chefe da área
                              {f.ehTitularEmSubstituicao ? " (em substituição)" : ""}
                            </p>
                          )}
                          {f.ehGerenteSubstituto && (
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontSize: 10.5,
                                color: "#5b4a9e",
                                fontWeight: 600
                              }}
                            >
                              Chefe Substituto
                              {f.substituicao?.dataInicio && f.substituicao?.dataFim
                                ? ` · ${new Date(f.substituicao.dataInicio).toLocaleDateString("pt-BR")}–${new Date(f.substituicao.dataFim).toLocaleDateString("pt-BR")}`
                                : ""}
                            </p>
                          )}
                          {(f.categoria === "ESTAGIARIO" || f.categoria === "MENOR_APRENDIZ") &&
                            f.supervisorEstagio && (
                              <p
                                style={{
                                  margin: "2px 0 0",
                                  fontSize: 10.5,
                                  color: "var(--blue-ink)",
                                  fontWeight: 600
                                }}
                              >
                                Supervisor: {f.supervisorEstagio.user?.name ?? "—"}
                              </p>
                            )}
                          {infoContato(f) && (
                            <p
                              style={{ margin: "2px 0 0", fontSize: 10.5, color: "var(--ink-400)" }}
                            >
                              {infoContato(f)}
                            </p>
                          )}
                          {f.jornadaPeriodo && (
                            <p
                              style={{
                                margin: "2px 0 0",
                                fontSize: 10.5,
                                color: "var(--burgundy-600)",
                                fontWeight: 600
                              }}
                            >
                              {f.jornadaPeriodo.nome}
                              {f.jornadaPeriodo.ePadrao ? " ★" : ""}
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
                        {/* Login Hoje / Campos Manuais */}
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {fezLoginHoje(f) ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "var(--green)"
                                }}
                              >
                                <CheckCircleIcon size={14} />
                                Login hoje
                              </span>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--ink-400)" }}>
                                Sem login hoje
                              </span>
                            )}
                            <label
                              title="Marca que os campos manuais deste cadastro (cargo, categoria, gerência etc.) já foram revisados pelo RH"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                color: "var(--ink-600)",
                                cursor: podeToggleAtivo ? "pointer" : "default"
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={!!f.camposManuaisConfigurados}
                                disabled={!podeToggleAtivo}
                                onChange={() => void toggleCamposManuais(f)}
                                style={{ width: 14, height: 14, cursor: "inherit" }}
                              />
                              Campos manuais
                            </label>
                          </div>
                        </td>
                        {/* Ações */}
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Link
                              to={`/ponto/gestao/${f.id}/editar`}
                              title="Editar"
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
                            </Link>
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
                                {f.ativo ? (
                                  <XCircleIcon size={14} />
                                ) : (
                                  <CheckCircleIcon size={14} />
                                )}
                              </button>
                            )}
                            {isSuperAdmin && (
                              <button
                                title="Excluir"
                                onClick={() => abrirConfirmDelete(f.id)}
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
                            )}
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
        </>
      )}

      {/* ── Modal de confirmação de exclusão ── */}
      {confirmDelete && isSuperAdmin && (
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
              style={{ fontSize: 13.5, color: "var(--ink-700)", marginBottom: 16, lineHeight: 1.6 }}
            >
              Esta ação não pode ser desfeita. O funcionário será removido do sistema.
            </p>
            <label
              style={{
                display: "block",
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--ink-700)",
                marginBottom: 6
              }}
            >
              Número do chamado interno
            </label>
            <input
              autoFocus
              value={numeroChamado}
              onChange={(e) => {
                setNumeroChamado(e.target.value);
                setErroExclusao("");
              }}
              placeholder="Ex.: CH-2026-0123"
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                fontSize: 13,
                fontFamily: "var(--font-body)",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 8
              }}
            />
            {erroExclusao && (
              <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{erroExclusao}</p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: erroExclusao ? 0 : 12 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void excluir(confirmDelete!)}
                disabled={!numeroChamado.trim() || excluindo}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background:
                    !numeroChamado.trim() || excluindo ? "rgba(200,57,63,0.45)" : "var(--red)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: !numeroChamado.trim() || excluindo ? "not-allowed" : "pointer"
                }}
              >
                {excluindo ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal: Data de Desligamento (inativação) ── */}
      {desligarAlvo && (
        <>
          <div
            onClick={() => setDesligarAlvo(null)}
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
              Desativar funcionário
            </h3>
            <p
              style={{ fontSize: 13.5, color: "var(--ink-700)", marginBottom: 16, lineHeight: 1.6 }}
            >
              Informe a data de desligamento de <strong>{desligarAlvo.user?.name}</strong>. Data de
              hoje ou passada desativa imediatamente; data futura mantém o funcionário ativo até lá.
            </p>
            <label
              style={{
                display: "block",
                fontSize: 11.5,
                fontWeight: 600,
                color: "var(--ink-700)",
                marginBottom: 6
              }}
            >
              Data de desligamento
            </label>
            <input
              autoFocus
              type="date"
              value={dataDesligamento}
              onChange={(e) => setDataDesligamento(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.20)",
                fontSize: 13,
                fontFamily: "var(--font-body)",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 8
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setDesligarAlvo(null)}
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmarDesligamento()}
                disabled={!dataDesligamento || desligando}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background:
                    !dataDesligamento || desligando ? "rgba(200,57,63,0.45)" : "var(--red)",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: !dataDesligamento || desligando ? "not-allowed" : "pointer"
                }}
              >
                {desligando ? "Salvando…" : "Confirmar desligamento"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Página ─── */
export function GestaoPage() {
  const { hasRole, user, podeRh, permissoesRhCarregadas } = useAuth();
  const isAdmin = !!user?.isSuperAdmin || hasRole("ponto-admin") || hasRole("PONTO_ADMIN");
  const isRH = isAdmin || hasRole("RH_AUDITORIA");
  /* Perfis do RH: gestão exclusiva do Gerente de RH (PONTO_ADMIN) e do super admin. */
  const podeGerirPerfis = !!user?.isSuperAdmin || hasRole("PONTO_ADMIN") || hasRole("ponto-admin");

  if (isRH && permissoesRhCarregadas && !paginaRhLiberada(podeRh, "gestao")) {
    return <SemAcessoRh pagina="Gestão" />;
  }

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
          marginBottom: 24,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap"
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
        {podeGerirPerfis && (
          <Link
            to="/ponto/perfis-rh"
            className="btn btn-ghost btn-sm"
            title="Perfis de acesso dos funcionários do RH (abas e funções)"
            style={{ gap: 6, textDecoration: "none" }}
          >
            <ShieldCheckIcon size={14} /> Perfis do RH
          </Link>
        )}
      </div>

      {/* ── Conteúdo ── */}
      <Suspense
        fallback={
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
            Carregando…
          </div>
        }
      >
        <GestaoListaTab />
      </Suspense>
    </div>
  );
}
