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

/* ─── Página principal ─── */
export function GestaoUsuariosPage() {
  const { token, user } = useAuth();
  const [grupos, setGrupos] = useState<GrupoKC[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioKC[]>([]);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"grupos" | "usuarios">("grupos");
  const [carregando, setCarregando] = useState(false);
  const [kcDisponivel, setKcDisponivel] = useState<boolean | null>(null);
  const [modalGrupo, setModalGrupo] = useState<GrupoKC | null>(null);

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

  useEffect(() => {
    if (aba === "grupos") carregarGrupos();
    else carregarUsuarios();
  }, [aba, carregarGrupos, carregarUsuarios]);

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
        {(["grupos", "usuarios"] as const).map((a) => (
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
            {a === "grupos" ? "📁 Grupos do AD" : "👥 Usuários"}
          </button>
        ))}
      </div>

      {/* Barra de busca (usuários) */}
      {aba === "usuarios" && (
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
            onClick={carregarUsuarios}
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
        ) : usuarios.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>
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
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
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
        )}
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

      {/* Modal */}
      {modalGrupo && (
        <ModalPapeis
          grupo={modalGrupo}
          onSave={(papeis) => salvarPapeis(modalGrupo, papeis)}
          onClose={() => setModalGrupo(null)}
        />
      )}
    </div>
  );
}
