import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";

/* ─── Types ─── */
interface GrupoKC {
  id: string;
  nome: string;
  path: string;
  papeis: string[];
  subGrupos?: GrupoKC[];
}

interface UsuarioKC {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

const PAPEIS_DISPONIVEIS = [
  {
    valor: "PONTO_ADMIN",
    label: "Admin do Sistema",
    cor: "var(--burgundy-600)",
    desc: "Acesso total: configurações, relatórios, gestão"
  },
  {
    valor: "GESTOR_APROVACAO",
    label: "Gestor / Aprovador",
    cor: "var(--blue-ink)",
    desc: "Aprova solicitações de sua equipe"
  },
  {
    valor: "RH_AUDITORIA",
    label: "RH / Auditoria",
    cor: "#8a6a00",
    desc: "Auditoria mensal do ponto de todos os funcionários"
  }
];

const SUPER_ADMINS = (import.meta.env.VITE_SUPER_ADMIN_USERNAMES ?? "elder.oliveira")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

/* ─── Badge de papel ─── */
function PapelBadge({ papel }: { papel: string }) {
  const p = PAPEIS_DISPONIVEIS.find((x) => x.valor === papel);
  if (!p) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--radius-full)",
        background: `${p.cor}18`,
        border: `1px solid ${p.cor}40`,
        fontSize: 11,
        fontWeight: 600,
        color: p.cor,
        whiteSpace: "nowrap"
      }}
    >
      {p.label}
    </span>
  );
}

/* ─── Modal de edição de papéis do grupo ─── */
function ModalPapeis({
  grupo,
  onSave,
  onClose
}: {
  grupo: GrupoKC;
  onSave: (papeis: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [selecionados, setSelecionados] = useState<string[]>(grupo.papeis);
  const [salvando, setSalvando] = useState(false);

  function toggle(papel: string) {
    setSelecionados((prev) =>
      prev.includes(papel) ? prev.filter((p) => p !== papel) : [...prev, papel]
    );
  }

  async function handleSave() {
    setSalvando(true);
    await onSave(selecionados);
    setSalvando(false);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,5,6,0.50)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-xl)",
          width: "100%",
          maxWidth: 480,
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(10,5,6,0.20)"
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, var(--burgundy-700) 0%, var(--burgundy-600) 100%)",
            padding: "20px 24px"
          }}
        >
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              margin: 0
            }}
          >
            Configurar papéis
          </p>
          <h2
            style={{
              color: "#fff",
              fontSize: 18,
              margin: "4px 0 0",
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontWeight: 400
            }}
          >
            {grupo.nome}
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", margin: "2px 0 0" }}>
            {grupo.path}
          </p>
        </div>

        <div style={{ padding: "20px 24px" }}>
          <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.5 }}>
            Selecione os papéis que os membros deste grupo terão no sistema:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {PAPEIS_DISPONIVEIS.map((p) => {
              const ativo = selecionados.includes(p.valor);
              return (
                <label
                  key={p.valor}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    border: `2px solid ${ativo ? p.cor : "rgba(122,30,38,0.10)"}`,
                    background: ativo ? `${p.cor}08` : "#fff",
                    cursor: "pointer",
                    transition: "all 150ms"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={() => toggle(p.valor)}
                    style={{ marginTop: 2, accentColor: p.cor, flexShrink: 0 }}
                  />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: p.cor, margin: 0 }}>
                      {p.label}
                    </p>
                    <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "2px 0 0" }}>
                      {p.desc}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{
                padding: "9px 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(122,30,38,0.15)",
                background: "transparent",
                color: "var(--ink-500)",
                fontSize: 13,
                cursor: "pointer"
              }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={salvando}
              style={{ padding: "9px 20px", fontSize: 13, opacity: salvando ? 0.7 : 1 }}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Linha de grupo ─── */
function GrupoRow({ grupo, onEdit }: { grupo: GrupoKC; onEdit: (g: GrupoKC) => void }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid rgba(122,30,38,0.06)",
        flexWrap: "wrap"
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
          {grupo.nome}
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--ink-500)",
            margin: "1px 0 0",
            fontFamily: "var(--font-mono)"
          }}
        >
          {grupo.path}
        </p>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
        {grupo.papeis.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--ink-400)", fontStyle: "italic" }}>
            Sem papel atribuído
          </span>
        ) : (
          grupo.papeis.map((p) => <PapelBadge key={p} papel={p} />)
        )}
      </div>
      <button
        onClick={() => onEdit(grupo)}
        style={{
          padding: "6px 14px",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.20)",
          background: "transparent",
          color: "var(--burgundy-600)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap"
        }}
      >
        Editar
      </button>
    </div>
  );
}

/* ─── Tipos para usuários locais ─── */
interface UserLocal {
  id: string;
  name: string;
  email: string;
  emailReal: string | null;
  externalId: string | null;
  createdAt: string;
  funcionario: {
    id: string;
    matricula: string | null;
    cargo: string;
    ativo: boolean;
    categoria: string;
    gerencia: { id: string; nome: string; sigla: string } | null;
  } | null;
}

/* ─── Modal para definir e-mail real ─── */
function ModalEmailReal({
  user: u,
  onSave,
  onClose
}: {
  user: UserLocal;
  onSave: (emailReal: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [emailReal, setEmailReal] = useState(u.emailReal ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setSalvando(true);
    setErro("");
    try {
      await onSave(emailReal.trim() || null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar e-mail.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: 440,
          padding: "24px 28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
        }}
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-display)" }}>
          Definir E-mail Real
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-500)" }}>
          Usuário: <strong>{u.name}</strong>
          <br />
          E-mail SSO: <code style={{ fontSize: 12 }}>{u.email}</code>
        </p>

        <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
          E-mail organizacional real (ex: elder.oliveira@cfo.org.br)
        </label>
        <input
          type="email"
          value={emailReal}
          onChange={(e) => setEmailReal(e.target.value)}
          placeholder="usuario@cfo.org.br"
          style={{
            width: "100%",
            padding: "8px 10px",
            border: "1px solid rgba(0,0,0,0.15)",
            borderRadius: "var(--radius-md)",
            fontSize: 13,
            boxSizing: "border-box"
          }}
        />
        {erro && <p style={{ color: "var(--red)", fontSize: 12, margin: "6px 0 0" }}>{erro}</p>}
        <p style={{ fontSize: 11.5, color: "var(--ink-500)", margin: "8px 0 0" }}>
          Deixe em branco para remover o e-mail real cadastrado.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={salvando}
            style={{
              padding: "8px 18px",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: "var(--radius-md)",
              background: "#fff",
              cursor: "pointer",
              fontSize: 13
            }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              padding: "8px 20px",
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--burgundy-600)",
              color: "#fff",
              cursor: salvando ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              opacity: salvando ? 0.7 : 1
            }}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Página principal ─── */
export function GestaoUsuariosPage() {
  const { token, user } = useAuth();
  const [grupos, setGrupos] = useState<GrupoKC[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioKC[]>([]);
  const [usuariosLocais, setUsuariosLocais] = useState<UserLocal[]>([]);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"grupos" | "usuarios" | "cadastrados">("grupos");
  const [carregando, setCarregando] = useState(false);
  const [kcDisponivel, setKcDisponivel] = useState<boolean | null>(null);
  const [modalGrupo, setModalGrupo] = useState<GrupoKC | null>(null);
  const [modalEmailUser, setModalEmailUser] = useState<UserLocal | null>(null);

  const tk = token();
  const isSuperAdmin = user
    ? SUPER_ADMINS.includes(user.username) ||
      user.roles.includes("PONTO_ADMIN") ||
      user.roles.includes("ponto-admin")
    : false;

  const carregarGrupos = useCallback(async () => {
    if (!tk) return;
    setCarregando(true);
    try {
      const data = await api.get<{ available: boolean; grupos: GrupoKC[] }>(
        "/admin/keycloak/grupos",
        tk
      );
      setKcDisponivel(data?.available ?? false);
      setGrupos(data?.grupos ?? []);
    } catch {
      setKcDisponivel(false);
      setGrupos([]);
    } finally {
      setCarregando(false);
    }
  }, [tk]);

  const carregarUsuarios = useCallback(async () => {
    if (!tk) return;
    setCarregando(true);
    try {
      const data = await api.get<{ available: boolean; usuarios: UsuarioKC[] }>(
        `/admin/keycloak/usuarios${busca ? `?search=${encodeURIComponent(busca)}` : ""}`,
        tk
      );
      setKcDisponivel(data?.available ?? false);
      setUsuarios(data?.usuarios ?? []);
    } catch {
      setKcDisponivel(false);
      setUsuarios([]);
    } finally {
      setCarregando(false);
    }
  }, [tk, busca]);

  const carregarUsuariosLocais = useCallback(async () => {
    if (!tk) return;
    setCarregando(true);
    try {
      const data = await api.get<UserLocal[]>(
        `/admin/usuarios${busca ? `?search=${encodeURIComponent(busca)}` : ""}`,
        tk
      );
      setUsuariosLocais(Array.isArray(data) ? data : []);
    } catch {
      setUsuariosLocais([]);
    } finally {
      setCarregando(false);
    }
  }, [tk, busca]);

  async function salvarEmailReal(userId: string, emailReal: string | null) {
    await api.patch(`/admin/usuarios/${userId}/email-real`, { emailReal }, tk);
    setUsuariosLocais((prev) => prev.map((u) => (u.id === userId ? { ...u, emailReal } : u)));
    setModalEmailUser(null);
  }

  useEffect(() => {
    if (aba === "grupos") carregarGrupos();
    else if (aba === "usuarios") carregarUsuarios();
    else carregarUsuariosLocais();
  }, [aba, carregarGrupos, carregarUsuarios, carregarUsuariosLocais]);

  async function salvarPapeis(grupo: GrupoKC, papeis: string[]) {
    await api.put(
      "/admin/keycloak/grupos/" + grupo.id + "/papeis",
      { grupoNome: grupo.nome, papeis },
      tk
    );
    setGrupos((prev) => prev.map((g) => (g.id === grupo.id ? { ...g, papeis } : g)));
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--ink-500)" }}>
        <p style={{ fontSize: 24, marginBottom: 8 }}>🔒</p>
        <p style={{ fontSize: 14 }}>Acesso restrito a administradores do sistema.</p>
      </div>
    );
  }

  const gruposFlat = grupos.flatMap((g) => [g, ...(g.subGrupos ?? [])]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 24 }}>
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
          Gestão de <em>Usuários</em>
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>
          Grupos e usuários sincronizados do AD via Keycloak. Atribua papéis para controlar o fluxo
          de aprovações.
        </p>
      </div>

      {/* Banner super admin */}
      {user && SUPER_ADMINS.includes(user.username) && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(122,30,38,0.06)",
            border: "1px solid rgba(122,30,38,0.15)",
            marginBottom: 20
          }}
        >
          <span style={{ fontSize: 16 }}>⭐</span>
          <p style={{ fontSize: 12.5, color: "var(--burgundy-700)", margin: 0 }}>
            <strong>{user.name || user.username}</strong> — Super Administrador. Você tem acesso
            irrestrito a todo o sistema.
          </p>
        </div>
      )}

      {/* Abas */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          borderBottom: "2px solid rgba(122,30,38,0.08)",
          paddingBottom: 0
        }}
      >
        {(["grupos", "usuarios", "cadastrados"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius-md) var(--radius-md) 0 0",
              border: "none",
              background: aba === a ? "var(--burgundy-600)" : "transparent",
              color: aba === a ? "#fff" : "var(--ink-500)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 150ms"
            }}
          >
            {a === "grupos"
              ? "📁 Grupos do AD"
              : a === "usuarios"
                ? "👥 Usuários KC"
                : "🏢 Usuários Cadastrados"}
          </button>
        ))}
      </div>

      {/* Barra de busca (usuários KC e cadastrados) */}
      {(aba === "usuarios" || aba === "cadastrados") && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && carregarUsuarios()}
            placeholder="Buscar por nome, e-mail ou usuário…"
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(122,30,38,0.18)",
              fontSize: 13,
              fontFamily: "var(--font-body)",
              outline: "none"
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => (aba === "usuarios" ? carregarUsuarios() : carregarUsuariosLocais())}
            style={{ fontSize: 13, padding: "9px 16px" }}
          >
            Buscar
          </button>
        </div>
      )}

      {/* Aviso informativo — sem acesso à API admin do Keycloak */}
      {kcDisponivel === false && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(198,127,0,0.07)",
            border: "1px solid rgba(198,127,0,0.22)",
            borderRadius: "var(--radius-md)",
            marginBottom: 16,
            fontSize: 12.5,
            color: "#7a5200",
            lineHeight: 1.6,
            display: "flex",
            gap: 8,
            alignItems: "flex-start"
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
          <span>
            A sincronização com a API Admin do Keycloak não está disponível. Os mapeamentos de
            papéis salvos neste sistema continuam funcionando normalmente. Para habilitar a listagem
            de grupos e usuários do AD, configure as credenciais de serviço do Keycloak.
          </span>
        </div>
      )}

      {/* Conteúdo */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius-lg)",
          border: "1px solid rgba(122,30,38,0.08)",
          overflow: "hidden"
        }}
      >
        {carregando ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>
            Carregando…
          </div>
        ) : aba === "grupos" ? (
          gruposFlat.length === 0 ? (
            <div
              style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}
            >
              {kcDisponivel === false
                ? "Sincronização com Keycloak não disponível. Os papéis salvos continuam ativos."
                : "Nenhum grupo encontrado no Keycloak."}
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(122,30,38,0.08)",
                  display: "flex",
                  gap: 12,
                  background: "var(--cream-50)"
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--ink-500)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em"
                  }}
                >
                  Grupo
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--ink-500)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em"
                  }}
                >
                  Papéis atribuídos
                </span>
                <span style={{ width: 70 }} />
              </div>
              {gruposFlat.map((g) => (
                <GrupoRow key={g.id} grupo={g} onEdit={setModalGrupo} />
              ))}
            </>
          )
        ) : aba === "usuarios" ? (
          usuarios.length === 0 ? (
            <div
              style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}
            >
              {kcDisponivel === false
                ? "Sincronização com Keycloak não disponível."
                : "Nenhum usuário encontrado."}
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(122,30,38,0.08)",
                  background: "var(--cream-50)"
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--ink-500)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em"
                  }}
                >
                  {usuarios.length} usuário{usuarios.length !== 1 ? "s" : ""}
                </span>
              </div>
              {usuarios.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(122,30,38,0.06)"
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--burgundy-600)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {(u.firstName?.[0] ?? u.username[0]).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}
                    >
                      {u.firstName} {u.lastName}
                      {SUPER_ADMINS.includes(u.username) && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: "var(--burgundy-600)",
                            fontWeight: 700
                          }}
                        >
                          ⭐ Super Admin
                        </span>
                      )}
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--ink-500)",
                        margin: "1px 0 0",
                        fontFamily: "var(--font-mono)"
                      }}
                    >
                      {u.username}
                      {u.email ? ` · ${u.email}` : ""}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      background: u.enabled ? "rgba(47,125,79,0.12)" : "rgba(200,57,63,0.10)",
                      color: u.enabled ? "var(--green)" : "var(--red)",
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  >
                    {u.enabled ? "Ativo" : "Inativo"}
                  </span>
                </div>
              ))}
            </>
          )
        ) : aba === "cadastrados" ? (
          /* ─── Aba Usuários Cadastrados (banco local) ─── */
          usuariosLocais.length === 0 ? (
            <div
              style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}
            >
              Nenhum usuário cadastrado. Os usuários aparecem aqui após realizarem o primeiro login.
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(122,30,38,0.08)",
                  background: "var(--cream-50)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr auto",
                  gap: 8
                }}
              >
                {["Nome / E-mail SSO", "E-mail Real", "Gerência / Cargo", ""].map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--ink-500)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em"
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>
              {usuariosLocais.map((u) => {
                const emailPendente = !u.emailReal && u.email.endsWith("@sso.local");
                return (
                  <div
                    key={u.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr auto",
                      gap: 8,
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(122,30,38,0.06)",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{u.name}</p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          fontSize: 11,
                          color: "var(--ink-500)",
                          fontFamily: "var(--font-mono)"
                        }}
                      >
                        {u.email}
                      </p>
                    </div>
                    <div>
                      {u.emailReal ? (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: "#065f46",
                            fontFamily: "var(--font-mono)"
                          }}
                        >
                          {u.emailReal}
                        </p>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: 5,
                            background: emailPendente ? "rgba(198,127,0,0.12)" : "rgba(0,0,0,0.05)",
                            color: emailPendente ? "#92400e" : "var(--ink-500)",
                            fontSize: 11,
                            fontWeight: 600
                          }}
                        >
                          {emailPendente ? "⚠ Não confirmado" : "—"}
                        </span>
                      )}
                    </div>
                    <div>
                      {u.funcionario ? (
                        <>
                          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-700)" }}>
                            {u.funcionario.gerencia?.sigla ?? "—"}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-500)" }}>
                            {u.funcionario.cargo || "—"}
                          </p>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--ink-400)" }}>Sem vínculo</span>
                      )}
                    </div>
                    <button
                      onClick={() => setModalEmailUser(u)}
                      style={{
                        padding: "6px 12px",
                        border: "1px solid rgba(122,30,38,0.2)",
                        borderRadius: "var(--radius-md)",
                        background: "#fff",
                        color: "var(--burgundy-600)",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: "nowrap"
                      }}
                    >
                      ✉ Definir E-mail
                    </button>
                  </div>
                );
              })}
            </>
          )
        ) : null}
      </div>

      {/* Legenda papéis */}
      <div
        style={{
          marginTop: 20,
          padding: "14px 16px",
          background: "var(--cream-50)",
          borderRadius: "var(--radius-md)",
          border: "1px solid rgba(122,30,38,0.08)"
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--ink-500)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10
          }}
        >
          Referência de papéis
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {PAPEIS_DISPONIVEIS.map((p) => (
            <div key={p.valor} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <PapelBadge papel={p.valor} />
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--ink-500)",
                  margin: 0,
                  lineHeight: 1.5,
                  maxWidth: 220
                }}
              >
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Papéis */}
      {modalGrupo && (
        <ModalPapeis
          grupo={modalGrupo}
          onSave={(papeis) => salvarPapeis(modalGrupo, papeis)}
          onClose={() => setModalGrupo(null)}
        />
      )}

      {/* Modal E-mail Real */}
      {modalEmailUser && (
        <ModalEmailReal
          user={modalEmailUser}
          onSave={(emailReal) => salvarEmailReal(modalEmailUser.id, emailReal)}
          onClose={() => setModalEmailUser(null)}
        />
      )}
    </div>
  );
}
