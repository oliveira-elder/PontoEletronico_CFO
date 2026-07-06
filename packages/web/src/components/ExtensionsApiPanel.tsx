import React, { useState, useEffect, useCallback } from "react";
import { api } from "../hooks/useApi";

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

interface ExtensionsConfig {
  url: string;
  tokenConfigured: boolean;
  tokenMasked: string | null;
  source: "panel" | "env" | "none";
  envUrl: string | null;
  panelUpdatedAt: string | null;
}

interface TestResult {
  ok: boolean;
  url: string;
  sectionsCount?: number;
  usersCount?: number;
  status?: number;
  error?: string;
}

interface ExtensionsApiPanelProps {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  onSyncComplete?: () => void;
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid rgba(37,99,235,0.25)",
  fontSize: 12.5,
  width: "100%",
  fontFamily: "inherit"
};

const btnOutline: React.CSSProperties = {
  padding: "7px 14px",
  border: "1px solid rgba(37,99,235,0.3)",
  borderRadius: "var(--radius-md)",
  background: "#eff6ff",
  color: "#1e40af",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0
};

const sourceBadge = (source: ExtensionsConfig["source"]) => {
  if (source === "panel") return { label: "Painel", bg: "#dbeafe", color: "#1d4ed8" };
  if (source === "env") return { label: "Ambiente", bg: "#f1f5f9", color: "#475569" };
  return { label: "Não configurado", bg: "#fee2e2", color: "#991b1b" };
};

export function ExtensionsApiPanel({
  isAdmin,
  isSuperAdmin,
  onSyncComplete
}: ExtensionsApiPanelProps) {
  const [config, setConfig] = useState<ExtensionsConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ url: "", token: "" });

  const carregarDados = useCallback(async () => {
    try {
      const requests: [Promise<ExtensionsConfig | null>, Promise<SyncStatus>] = [
        isAdmin ? api.get<ExtensionsConfig>("/admin/extensions/config") : Promise.resolve(null),
        api.get<SyncStatus>("/admin/extensions/sync/status")
      ];
      const [cfg, status] = await Promise.all(requests);
      if (cfg) {
        setConfig(cfg);
        setForm((f) => ({ ...f, url: cfg.url }));
      }
      setSyncStatus(status);
    } catch {
      /* opcional */
    }
  }, [isAdmin]);

  useEffect(() => {
    void carregarDados();
  }, [carregarDados]);

  async function sincronizar() {
    setSyncLoading(true);
    setSyncMsg("");
    setTestResult(null);
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
      const status = await api.get<SyncStatus>("/admin/extensions/sync/status");
      setSyncStatus(status);
      onSyncComplete?.();
    } catch {
      setSyncMsg("Erro ao sincronizar com a API de ramais.");
    } finally {
      setSyncLoading(false);
    }
  }

  async function testar(usarFormulario = false) {
    setTesting(true);
    setTestResult(null);
    try {
      const body =
        usarFormulario && isSuperAdmin
          ? { url: form.url.trim() || undefined, token: form.token || undefined }
          : {};
      const res = await api.post<TestResult>("/admin/extensions/test", body);
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, url: form.url, error: String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function salvarConfig() {
    if (!form.url.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const data = await api.put<ExtensionsConfig>("/admin/extensions/config", {
        url: form.url.trim(),
        ...(form.token ? { token: form.token } : {})
      });
      setConfig(data);
      setForm(() => ({ url: data.url, token: "" }));
      setSaveMsg("Configuração salva.");
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function restaurarAmbiente() {
    if (!confirm("Remover configuração do painel e voltar a usar apenas as variáveis de ambiente?"))
      return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const data = await api.delete<ExtensionsConfig>("/admin/extensions/config");
      setConfig(data);
      setForm({ url: data.url, token: "" });
      setSaveMsg("Configuração do painel removida. Usando ambiente.");
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  const badge = config ? sourceBadge(config.source) : null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(37,99,235,0.2)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        marginBottom: 20
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: "#1e40af" }}>
              API de Ramais (Extensions)
            </p>
            {isAdmin && badge && (
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: badge.bg,
                  color: badge.color
                }}
              >
                {badge.label}
              </span>
            )}
          </div>

          {isAdmin && config && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 11,
                color: "var(--ink-500)",
                wordBreak: "break-all"
              }}
            >
              <strong>URL:</strong> {config.url}
              {config.tokenConfigured && (
                <>
                  {" "}
                  · <strong>Token:</strong> {config.tokenMasked ?? "configurado"}
                </>
              )}
            </p>
          )}

          <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--ink-500)" }}>
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

          {testResult && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 11.5,
                color: testResult.ok ? "#065f46" : "var(--red)",
                fontWeight: 500
              }}
            >
              {testResult.ok
                ? `Teste OK: ${testResult.sectionsCount ?? 0} seções, ${testResult.usersCount ?? 0} usuários na API.`
                : `Teste falhou${testResult.status ? ` (HTTP ${testResult.status})` : ""}: ${testResult.error ?? "erro desconhecido"}`}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => void testar(false)}
              disabled={testing || syncLoading}
              style={{
                ...btnOutline,
                cursor: testing || syncLoading ? "not-allowed" : "pointer",
                opacity: testing || syncLoading ? 0.7 : 1
              }}
            >
              {testing ? "Testando..." : "⚡ Testar"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void sincronizar()}
            disabled={syncLoading || testing}
            style={{
              ...btnOutline,
              background: syncLoading ? "rgba(37,99,235,0.06)" : "#eff6ff",
              cursor: syncLoading || testing ? "not-allowed" : "pointer"
            }}
          >
            {syncLoading ? "Sincronizando..." : "↻ Sincronizar Gerências"}
          </button>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              style={{
                ...btnOutline,
                background: showConfig ? "#1e40af" : "#fff",
                color: showConfig ? "#fff" : "#1e40af"
              }}
            >
              {showConfig ? "Fechar" : "⚙ Configurar"}
            </button>
          )}
        </div>
      </div>

      {isSuperAdmin && showConfig && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(37,99,235,0.15)",
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          <p style={{ margin: 0, fontSize: 11.5, color: "#475569", lineHeight: 1.5 }}>
            Apenas Super Admin pode alterar a URL e o token Bearer da API de integração. Deixe o
            token em branco para manter o valor atual.
          </p>

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "#334155" }}>
              URL da API
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://192.168.161.50:11010/api/sections/integration/users"
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: "#334155" }}>
              Token Bearer
              <input
                type="password"
                value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                placeholder={
                  config?.tokenConfigured
                    ? `Manter atual (${config.tokenMasked ?? "••••"})`
                    : "Informe o token, se necessário"
                }
                style={{ ...inputStyle, marginTop: 4 }}
                autoComplete="off"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => void salvarConfig()}
              disabled={saving || !form.url.trim()}
              style={{
                ...btnOutline,
                background: "#1e40af",
                color: "#fff",
                border: "none",
                opacity: saving || !form.url.trim() ? 0.6 : 1
              }}
            >
              {saving ? "Salvando..." : "Salvar configuração"}
            </button>
            <button
              type="button"
              onClick={() => void testar(true)}
              disabled={testing}
              style={btnOutline}
            >
              Testar com valores do formulário
            </button>
            {config?.source === "panel" && (
              <button
                type="button"
                onClick={() => void restaurarAmbiente()}
                disabled={saving}
                style={{
                  ...btnOutline,
                  background: "#fff",
                  color: "#64748b",
                  borderColor: "#e2e8f0"
                }}
              >
                Restaurar ambiente
              </button>
            )}
            {config?.envUrl && config.source === "panel" && (
              <span style={{ fontSize: 11, color: "#64748b" }}>Env: {config.envUrl}</span>
            )}
          </div>

          {saveMsg && (
            <p
              style={{
                margin: 0,
                fontSize: 11.5,
                color:
                  saveMsg.includes("Erro") || saveMsg.includes("403") ? "var(--red)" : "#065f46"
              }}
            >
              {saveMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
