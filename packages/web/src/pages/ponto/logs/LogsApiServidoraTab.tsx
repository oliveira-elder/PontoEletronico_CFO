import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../../hooks/useApi";
import {
  KeyIcon,
  PlusIcon,
  TrashIcon,
  CopyIcon,
  RefreshCwIcon,
  CheckIcon
} from "../../../components/icons";
import { formatDateBrasilia, formatDateTimeBrasilia } from "../../../utils/horario-brasilia";

interface ApiToken {
  id: string;
  name: string;
  description: string | null;
  tokenPrefix: string;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface FeriadoPreview {
  schemaVersion: string;
  geradoEm: string;
  totalFeriados: number;
  feriados: { id: string; data: string; nome: string; tipo: string; bloqueiaRegistro: boolean }[];
}

const API_HOST = "http://192.168.100.30:12003";
const ENDPOINT_BASE = `${API_HOST}/api/api-publica/v1`;

export function LogsApiServidoraTab() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [newToken, setNewToken] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", expiresAt: "" });
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<FeriadoPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ApiToken[]>("/logs/api-tokens");
      setTokens(Array.isArray(data) ? data : []);
    } catch {
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      // /ponto/config/feriados retorna array direto de feriados
      type FeriadoRaw = {
        id: string;
        data: string;
        nome: string;
        tipo: string;
        bloqueiaRegistro: boolean;
        observacao?: string | null;
      };
      const raw = await api.get<FeriadoRaw[]>("/ponto/config/feriados");
      const list = Array.isArray(raw) ? raw : [];
      setPreview({
        schemaVersion: "v1",
        geradoEm: new Date().toISOString(),
        totalFeriados: list.length,
        feriados: list.map((f) => ({
          id: f.id,
          data: typeof f.data === "string" ? f.data.slice(0, 10) : String(f.data).slice(0, 10),
          nome: f.nome,
          tipo: f.tipo,
          bloqueiaRegistro: f.bloqueiaRegistro
        }))
      });
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    void loadTokens();
    void loadPreview();
  }, [loadTokens, loadPreview]);

  async function createToken() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ token: string; name: string }>("/logs/api-tokens", {
        name: form.name,
        description: form.description || undefined,
        expiresAt: form.expiresAt || undefined
      });
      setNewToken(res);
      setForm({ name: "", description: "", expiresAt: "" });
      void loadTokens();
    } finally {
      setCreating(false);
    }
  }

  async function revokeToken(id: string) {
    await api.patch(`/logs/api-tokens/${id}/revoke`, {});
    void loadTokens();
  }

  async function deleteToken(id: string) {
    if (!confirm("Excluir este token permanentemente?")) return;
    await api.delete(`/logs/api-tokens/${id}`);
    void loadTokens();
  }

  function copyToken(t: string) {
    navigator.clipboard.writeText(t).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Visão geral */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>
          API Servidora — Endpoints Públicos
        </h3>
        <p style={{ margin: "0 0 14px", color: "#475569", fontSize: 13, lineHeight: 1.6 }}>
          Sistemas externos consultam dados deste sistema via HTTP GET autenticado por{" "}
          <strong>Bearer token</strong>. Os dados refletem automaticamente as configurações atuais
          do sistema.
        </p>

        {/* Endpoints */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          <EndpointDoc
            method="GET"
            url={`${ENDPOINT_BASE}/feriados`}
            desc="Calendário completo de feriados (NACIONAL, DISTRITAL, FACULTATIVO, MANUAL)"
          />
          <EndpointDoc
            method="GET"
            url={`${ENDPOINT_BASE}/configuracoes`}
            desc="Configurações do sistema + calendário de feriados compilado"
          />
        </div>

        {/* Como autenticar */}
        <div style={{ borderTop: "1px solid var(--border, #e2e8f0)", paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 10 }}>
            Autenticação
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#64748b", minWidth: 100 }}>Header:</span>
              <code
                style={{
                  background: "#f1f5f9",
                  borderRadius: 4,
                  padding: "3px 8px",
                  color: "#4338ca"
                }}
              >
                Authorization: Bearer &lt;token&gt;
              </code>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#64748b", minWidth: 100 }}>Protocolo:</span>
              <span style={{ color: "#334155" }}>
                HTTP{" "}
                <span
                  style={{
                    background: "#fef9c3",
                    color: "#92400e",
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  porta 12003
                </span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#64748b", minWidth: 100 }}>
                Token na URL:
              </span>
              <span style={{ color: "#dc2626", fontWeight: 600 }}>
                Não permitido — o token deve ser enviado exclusivamente no header, nunca na URL.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Token recém-criado */}
      {newToken && (
        <div
          style={{
            background: "#dcfce7",
            borderRadius: 10,
            padding: "14px 18px",
            border: "2px solid #86efac",
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}
        >
          <div style={{ fontWeight: 700, color: "#15803d", fontSize: 13 }}>
            ✓ Token "{newToken.name}" criado. Copie agora — não será exibido novamente.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <code
              style={{
                background: "white",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 12,
                flex: 1,
                wordBreak: "break-all",
                border: "1px solid #86efac"
              }}
            >
              {newToken.token}
            </code>
            <button
              onClick={() => copyToken(newToken.token)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 6,
                background: "#15803d",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                whiteSpace: "nowrap"
              }}
            >
              {copied ? (
                <>
                  <CheckIcon size={14} /> Copiado
                </>
              ) : (
                <>
                  <CopyIcon size={14} /> Copiar
                </>
              )}
            </button>
          </div>
          <button
            onClick={() => setNewToken(null)}
            style={{
              alignSelf: "flex-end",
              background: "none",
              border: "none",
              color: "#15803d",
              cursor: "pointer",
              fontSize: 12
            }}
          >
            Fechar
          </button>
        </div>
      )}

      {/* Criar token */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Gerar Novo Token</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: 12,
            alignItems: "flex-end"
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
              Nome do Sistema *
            </span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="ex: sistema-folha-pagamento"
              style={{
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                fontSize: 13
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Descrição</span>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="descrição opcional"
              style={{
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                fontSize: 13
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Expira em</span>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              style={{
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                fontSize: 13
              }}
            />
          </label>
          <button
            onClick={createToken}
            disabled={creating || !form.name.trim()}
            className="btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              whiteSpace: "nowrap"
            }}
          >
            <PlusIcon size={14} /> {creating ? "Gerando…" : "Gerar Token"}
          </button>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "#94a3b8" }}>
          O token pleno é exibido apenas no momento da criação. O sistema armazena apenas o hash
          SHA-256. Guarde em cofre seguro.
        </p>
      </div>

      {/* Lista de tokens */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Tokens Ativos</h3>
          <button
            onClick={loadTokens}
            disabled={loading}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
          >
            <RefreshCwIcon size={16} />
          </button>
        </div>
        <div
          style={{ overflowX: "auto", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)" }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr
                style={{ background: "#f8fafc", borderBottom: "2px solid var(--border, #e2e8f0)" }}
              >
                {["Nome", "Prefixo", "Status", "Criado em", "Último uso", "Expira em", "Ações"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "9px 12px",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#475569",
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
              {loading && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading && tokens.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                    Nenhum token cadastrado.
                  </td>
                </tr>
              )}
              {tokens.map((t) => (
                <tr
                  key={t.id}
                  style={{
                    borderBottom: "1px solid var(--border, #e2e8f0)",
                    opacity: t.active ? 1 : 0.5
                  }}
                >
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <KeyIcon size={13} style={{ color: "#6366f1" }} />
                      {t.name}
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{t.description}</div>
                    )}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <code
                      style={{
                        background: "#f1f5f9",
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: 11
                      }}
                    >
                      {t.tokenPrefix}…
                    </code>
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontWeight: 600,
                        fontSize: 11,
                        background: t.active ? "#dcfce7" : "#f1f5f9",
                        color: t.active ? "#15803d" : "#64748b"
                      }}
                    >
                      {t.active ? "Ativo" : "Revogado"}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {formatDateBrasilia(t.createdAt)}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {t.lastUsedAt
                      ? formatDateTimeBrasilia(t.lastUsedAt, {
                          dateStyle: "short",
                          timeStyle: "short"
                        })
                      : "Nunca"}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {t.expiresAt ? formatDateBrasilia(t.expiresAt) : "Sem expiração"}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {t.active && (
                        <button
                          onClick={() => revokeToken(t.id)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid #f59e0b",
                            background: "#fef9c3",
                            color: "#92400e",
                            cursor: "pointer",
                            fontSize: 11
                          }}
                        >
                          Revogar
                        </button>
                      )}
                      <button
                        onClick={() => deleteToken(t.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 8px",
                          borderRadius: 4,
                          border: "1px solid #ef4444",
                          background: "#fee2e2",
                          color: "#991b1b",
                          cursor: "pointer",
                          fontSize: 11
                        }}
                      >
                        <TrashIcon size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Exemplo de uso */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Exemplo de Requisição</h3>
        <pre
          style={{
            background: "#1e293b",
            color: "#e2e8f0",
            borderRadius: 8,
            padding: 14,
            fontSize: 11,
            margin: 0,
            overflowX: "auto"
          }}
        >
          {`GET ${ENDPOINT_BASE}/feriados
Authorization: Bearer <seu-token>

---

GET ${ENDPOINT_BASE}/configuracoes
Authorization: Bearer <seu-token>`}
        </pre>
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "#fef2f2",
            borderRadius: 8,
            border: "1px solid #fca5a5",
            fontSize: 12,
            color: "#991b1b"
          }}
        >
          <strong>O token não faz parte da URL.</strong> Ele é enviado exclusivamente no header{" "}
          <code>Authorization</code>. Incluí-lo na URL causa erro 404.
        </div>
      </div>

      {/* Preview JSON dos feriados */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
            Preview — Resposta de Feriados (JSON ao vivo)
          </h3>
          <button
            onClick={loadPreview}
            disabled={loadingPreview}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}
          >
            <RefreshCwIcon size={16} />
          </button>
        </div>
        {loadingPreview ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>Carregando preview…</div>
        ) : preview ? (
          <>
            <div style={{ marginBottom: 10, fontSize: 12, color: "#475569" }}>
              <strong>{preview.totalFeriados}</strong> feriados · gerado em{" "}
              {formatDateTimeBrasilia(preview.geradoEm)}
            </div>
            <div
              style={{
                overflowX: "auto",
                maxHeight: 300,
                borderRadius: 8,
                border: "1px solid var(--border, #e2e8f0)"
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    {["Data", "Nome", "Tipo", "Bloqueia"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "#475569",
                          borderBottom: "2px solid var(--border, #e2e8f0)"
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.feriados.map((f) => (
                    <tr key={f.id} style={{ borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>{f.data}</td>
                      <td style={{ padding: "8px 12px" }}>{f.nome}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span
                          style={{
                            background: "#e0f2fe",
                            color: "#0369a1",
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 11,
                            fontWeight: 600
                          }}
                        >
                          {f.tipo}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>{f.bloqueiaRegistro ? "Sim" : "Não"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>Nenhum feriado cadastrado.</div>
        )}
      </div>
    </div>
  );
}

function EndpointDoc({ method, url, desc }: { method: string; url: string; desc: string }) {
  const methodColor: Record<string, string> = {
    GET: "#22c55e",
    POST: "#6366f1",
    DELETE: "#ef4444"
  };
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "white",
        borderRadius: 8,
        border: "1px solid var(--border, #e2e8f0)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span
          style={{
            background: methodColor[method] ?? "#64748b",
            color: "white",
            borderRadius: 4,
            padding: "2px 8px",
            fontFamily: "monospace",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap"
          }}
        >
          {method}
        </span>
        <code style={{ fontSize: 12, color: "#4338ca", wordBreak: "break-all" }}>{url}</code>
      </div>
      <span style={{ fontSize: 11, color: "#64748b", paddingLeft: 4 }}>{desc}</span>
    </div>
  );
}
