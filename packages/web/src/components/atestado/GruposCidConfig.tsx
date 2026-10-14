import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../hooks/useApi";

interface GrupoCid {
  id: string;
  codigo: string;
  descricao: string;
  ativo: boolean;
  ordem: number;
}

const input: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid rgba(122,30,38,0.14)",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  boxSizing: "border-box"
};

/**
 * Configurações → Solicitações → Grupos do CID: adicionar, editar, desativar e reordenar.
 * Excluir de vez é só do super usuário (os atestados guardam o grupo no momento do envio).
 */
export function GruposCidConfig({ podeEditar }: { podeEditar: boolean }) {
  const { user } = useAuth();
  const superUsuario = !!user?.isSuperAdmin;
  const [grupos, setGrupos] = useState<GrupoCid[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ codigo: "", descricao: "" });
  const [novo, setNovo] = useState({ codigo: "", descricao: "" });
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setGrupos(await api.get<GrupoCid[]>("/ponto/config/cid-grupos/gestao"));
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, texto: ok });
      await carregar();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message || "Não foi possível concluir." });
    } finally {
      setOcupado(false);
    }
  }

  const mover = (i: number, delta: number) => {
    const ids = grupos.map((g) => g.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void executar(() => api.patch("/ponto/config/cid-grupos/ordem", { ids }), "Ordem atualizada.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12.5, color: "var(--ink-500)", margin: 0, lineHeight: 1.5 }}>
        Grupos do CID oferecidos no atestado médico. Grupos desativados deixam de aparecer para o
        funcionário, mas os atestados já enviados mantêm o grupo informado.
      </p>
      {msg && (
        <p style={{ margin: 0, fontSize: 12.5, color: msg.ok ? "var(--green)" : "var(--red)" }}>
          {msg.ok ? "✓ " : "⚠ "}
          {msg.texto}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {grupos.map((g, i) => (
          <div
            key={g.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              padding: "8px 10px",
              border: "1px solid rgba(122,30,38,0.10)",
              borderRadius: "var(--radius-md)",
              background: g.ativo ? "#fff" : "rgba(0,0,0,0.03)",
              opacity: g.ativo ? 1 : 0.75
            }}
          >
            {editando === g.id ? (
              <>
                <input
                  style={{ ...input, width: 110, fontFamily: "var(--font-mono)" }}
                  value={form.codigo}
                  onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  aria-label="Código"
                />
                <input
                  style={{ ...input, flex: 1, minWidth: 220 }}
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  aria-label="Descrição"
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(async () => {
                      await api.put(`/ponto/config/cid-grupos/${g.id}`, form);
                      setEditando(null);
                    }, "Grupo atualizado.")
                  }
                >
                  Salvar
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <strong style={{ fontFamily: "var(--font-mono)", fontSize: 13, minWidth: 90 }}>
                  {g.codigo}
                </strong>
                <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}>{g.descricao}</span>
                {!g.ativo && <span className="badge badge-gray">Desativado</span>}
                {podeEditar && (
                  <>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={ocupado || i === 0}
                      onClick={() => mover(i, -1)}
                      aria-label="Subir"
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={ocupado || i === grupos.length - 1}
                      onClick={() => mover(i, 1)}
                      aria-label="Descer"
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={ocupado}
                      onClick={() => {
                        setEditando(g.id);
                        setForm({ codigo: g.codigo, descricao: g.descricao });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={ocupado}
                      onClick={() =>
                        void executar(
                          () =>
                            api.patch(`/ponto/config/cid-grupos/${g.id}/ativo`, {
                              ativo: !g.ativo
                            }),
                          g.ativo ? "Grupo desativado." : "Grupo ativado."
                        )
                      }
                    >
                      {g.ativo ? "Desativar" : "Ativar"}
                    </button>
                    {superUsuario && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--red)" }}
                        disabled={ocupado}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir definitivamente o grupo ${g.codigo}? Os atestados já enviados mantêm o grupo informado.`
                            )
                          ) {
                            void executar(
                              () => api.delete(`/ponto/config/cid-grupos/${g.id}`),
                              "Grupo excluído."
                            );
                          }
                        }}
                      >
                        Excluir
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {podeEditar && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            paddingTop: 8,
            borderTop: "1px dashed rgba(122,30,38,0.2)"
          }}
        >
          <input
            style={{ ...input, width: 110, fontFamily: "var(--font-mono)" }}
            placeholder="A00-B99"
            value={novo.codigo}
            onChange={(e) => setNovo((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
            aria-label="Código do novo grupo"
          />
          <input
            style={{ ...input, flex: 1, minWidth: 220 }}
            placeholder="Descrição do grupo"
            value={novo.descricao}
            onChange={(e) => setNovo((f) => ({ ...f, descricao: e.target.value }))}
            aria-label="Descrição do novo grupo"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={ocupado || !novo.codigo || !novo.descricao}
            onClick={() =>
              void executar(async () => {
                await api.post("/ponto/config/cid-grupos", novo);
                setNovo({ codigo: "", descricao: "" });
              }, "Grupo adicionado.")
            }
          >
            ＋ Adicionar grupo
          </button>
        </div>
      )}
    </div>
  );
}
