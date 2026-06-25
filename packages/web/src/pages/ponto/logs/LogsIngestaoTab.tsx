import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../../hooks/useApi";
import {
  RefreshCwIcon,
  SendIcon,
  InfoIcon,
  ServerIcon,
  CopyIcon,
  CheckIcon
} from "../../../components/icons";
import { formatDateTimeBrasilia } from "../../../utils/horario-brasilia";

interface IngestConfig {
  destination: { scheme: "http" | "https"; host: string; port: number } | null;
  pushUrl: string | null;
  source: "panel" | "env" | "none";
  ingestKeyConfigured: boolean;
  auditIngestEnabled: boolean;
  systemKey: string;
  serviceName: string;
  environment: string;
  envPushUrl: string | null;
  panelUpdatedAt: string | null;
}

interface IngestEvent {
  id: string;
  eventId: string;
  timestamp: string;
  systemKey: string;
  environment: string;
  serviceName: string;
  operation: string;
  status: string;
  severity: string;
  message: string;
  traceId: string | null;
  createdAt: string;
}

interface IngestCadastroConfigResponse {
  systemKey: string;
  ingestPushUrl: string | null;
  ingestKeyConfigured: boolean;
  pollingConfigJson: string;
  instructions: string;
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--border, #e2e8f0)",
  fontSize: 13,
  width: "100%"
};

const btnSecondary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 14px",
  borderRadius: 6,
  border: "1px solid var(--border, #e2e8f0)",
  background: "white",
  cursor: "pointer",
  fontSize: 13,
  color: "#475569"
};

export function LogsIngestaoTab() {
  const [config, setConfig] = useState<IngestConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    pushUrl?: string;
    status?: number;
    error?: string;
  } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<IngestEvent[]>([]);
  const [cadastroConfig, setCadastroConfig] = useState<IngestCadastroConfigResponse | null>(null);
  const [copiedCadastro, setCopiedCadastro] = useState(false);

  const [form, setForm] = useState({ scheme: "http" as "http" | "https", host: "", port: 9000 });

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [data, cadastro] = await Promise.all([
        api.get<IngestConfig>("/logs/ingest/config"),
        api.get<IngestCadastroConfigResponse>("/logs/ingest/polling-config")
      ]);
      setConfig(data);
      setCadastroConfig(cadastro);
      if (data.destination) {
        setForm({
          scheme: data.destination.scheme,
          host: data.destination.host,
          port: data.destination.port
        });
      } else if (data.envPushUrl) {
        try {
          const u = new URL(data.envPushUrl);
          setForm({
            scheme: u.protocol === "https:" ? "https" : "http",
            host: u.hostname,
            port: u.port ? parseInt(u.port, 10) : u.protocol === "https:" ? 443 : 80
          });
        } catch {
          /* mantém formulário atual */
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    const data = await api.get<IngestEvent[]>("/logs/ingest/events?limit=50");
    setEvents(data);
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (showEvents) void loadEvents();
  }, [showEvents, loadEvents]);

  const previewUrl =
    form.host.trim() !== ""
      ? `${form.scheme}://${form.host.trim()}:${form.port}/ingest/push-http`
      : null;

  async function saveDestination() {
    if (!form.host.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const data = await api.put<IngestConfig>("/logs/ingest/destination", form);
      setConfig(data);
      const cadastro = await api.get<IngestCadastroConfigResponse>("/logs/ingest/polling-config");
      setCadastroConfig(cadastro);
      setSaveMsg("Destino salvo no painel.");
    } catch (e) {
      setSaveMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeOverride() {
    if (
      !confirm(
        "Remover override do painel e voltar a usar apenas MONITOR_INGEST_PUSH_URL do ambiente?"
      )
    )
      return;
    setSaving(true);
    try {
      const data = await api.delete<IngestConfig>("/logs/ingest/destination");
      setConfig(data);
      void loadConfig();
      setSaveMsg("Override do painel removido.");
    } finally {
      setSaving(false);
    }
  }

  async function reloadFromEnv() {
    setSaveMsg(null);
    await loadConfig();
    setSaveMsg("Formulário recarregado a partir do ambiente.");
  }

  async function fillLocalIp() {
    try {
      const { ip } = await api.get<{ ip: string | null }>("/logs/ingest/local-ip");
      if (ip) setForm((f) => ({ ...f, host: ip }));
    } catch {
      /* ignore */
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<{ ok: boolean; pushUrl: string; status?: number; error?: string }>(
        "/logs/ingest/test-connection",
        {}
      );
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, error: String(e) });
    } finally {
      setTesting(false);
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => null);
  }

  function copyCadastroJson() {
    if (!cadastroConfig?.pollingConfigJson) return;
    navigator.clipboard.writeText(cadastroConfig.pollingConfigJson).catch(() => null);
    setCopiedCadastro(true);
    setTimeout(() => setCopiedCadastro(false), 2000);
  }

  const sourceBadge =
    config?.source === "panel"
      ? { label: "Painel (persistido)", bg: "#dbeafe", color: "#1d4ed8" }
      : config?.source === "env"
        ? { label: "Ambiente", bg: "#f1f5f9", color: "#475569" }
        : { label: "Não configurado", bg: "#fee2e2", color: "#991b1b" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Alertas informativos */}
      <div
        style={{
          background: "#dcfce7",
          border: "1px solid #86efac",
          borderRadius: 10,
          padding: "14px 18px"
        }}
      >
        <div style={{ fontWeight: 700, color: "#15803d", fontSize: 13, marginBottom: 6 }}>
          Autenticação de Ingestão
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#166534", lineHeight: 1.6 }}>
          Utilize o header{" "}
          <code
            style={{ background: "rgba(255,255,255,0.6)", padding: "1px 5px", borderRadius: 4 }}
          >
            x-ingest-key
          </code>{" "}
          com o valor definido na variável de ambiente{" "}
          <code
            style={{ background: "rgba(255,255,255,0.6)", padding: "1px 5px", borderRadius: 4 }}
          >
            INGEST_SHARED_KEY
          </code>{" "}
          no servidor que envia eventos. Não versionar a chave em repositório: armazenar em cofre
          seguro.
          {config && (
            <span style={{ display: "block", marginTop: 6, fontWeight: 600 }}>
              Status:{" "}
              {config.ingestKeyConfigured
                ? "✓ Chave configurada no ambiente"
                : "⚠ INGEST_SHARED_KEY não definida"}
            </span>
          )}
        </p>
      </div>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "14px 18px",
          display: "flex",
          gap: 12
        }}
      >
        <RefreshCwIcon size={18} style={{ color: "#64748b", flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, color: "#334155", fontSize: 13, marginBottom: 6 }}>
            Envio automático de auditoria
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
            Cada linha de log (HTTP, auth, export, scheduler) é enviada em segundo plano ao{" "}
            <strong>MonitorSistema</strong> quando <code>MONITOR_INGEST_PUSH_URL</code> e{" "}
            <code>INGEST_SHARED_KEY</code> estão definidos. Exceção:{" "}
            <code>GET /api/auth/login</code> com sucesso por ator anônimo. Desligar tudo:{" "}
            <code>MONITOR_AUDIT_INGEST_ENABLED=false</code> no ambiente.
            {config && (
              <span style={{ display: "block", marginTop: 6 }}>
                Envio automático:{" "}
                <strong
                  style={{
                    color:
                      config.auditIngestEnabled && config.pushUrl && config.ingestKeyConfigured
                        ? "#15803d"
                        : "#92400e"
                  }}
                >
                  {config.auditIngestEnabled && config.pushUrl && config.ingestKeyConfigured
                    ? "ativo"
                    : "inativo ou incompleto"}
                </strong>
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Destino do Monitor */}
      <Section
        title="Destino do Monitor — ingestão de logs"
        badge={sourceBadge}
        subtitle={
          <>
            Host/IP e porta para onde os logs de auditoria são enviados (equivalente a{" "}
            <code>MONITOR_INGEST_PUSH_URL</code>). Persistido em{" "}
            <code>instance/monitor_destinations.json</code> quando preenchido —{" "}
            <strong>substitui</strong> o valor definido no ambiente para esta aplicação.
          </>
        }
      >
        {loading ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>Carregando configuração…</div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 100px",
                gap: 12,
                marginBottom: 14
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Esquema</span>
                <select
                  value={form.scheme}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, scheme: e.target.value as "http" | "https" }))
                  }
                  style={inputStyle}
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Host / IP</span>
                <input
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="192.168.161.55"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Porta</span>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, port: parseInt(e.target.value, 10) || 0 }))
                  }
                  style={inputStyle}
                />
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: 12
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={fillLocalIp} style={btnSecondary}>
                  IP local
                </button>
                <button type="button" onClick={reloadFromEnv} style={btnSecondary}>
                  <RefreshCwIcon size={14} /> Recarregar ambiente
                </button>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}
              >
                <button
                  type="button"
                  onClick={saveDestination}
                  disabled={saving || !form.host.trim()}
                  className="btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <ServerIcon size={14} /> {saving ? "Salvando…" : "Salvar destino"}
                </button>
                {config?.source === "panel" && (
                  <button
                    type="button"
                    onClick={removeOverride}
                    disabled={saving}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontSize: 12,
                      textDecoration: "underline"
                    }}
                  >
                    Remover override do painel
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: "#64748b" }}>
              {previewUrl && (
                <div style={{ fontFamily: "monospace", color: "#4338ca", marginBottom: 4 }}>
                  {previewUrl}
                </div>
              )}
              {config?.panelUpdatedAt && config.source === "panel" && (
                <div>
                  Atualizado em:{" "}
                  {formatDateTimeBrasilia(config.panelUpdatedAt, {
                    dateStyle: "short",
                    timeStyle: "short"
                  })}
                </div>
              )}
              {config?.envPushUrl && config.source === "env" && (
                <div>
                  Ambiente: <code>{config.envPushUrl}</code>
                </div>
              )}
              {saveMsg && (
                <div
                  style={{
                    marginTop: 6,
                    color: saveMsg.startsWith("Destino") ? "#15803d" : "#991b1b"
                  }}
                >
                  {saveMsg}
                </div>
              )}
            </div>
          </>
        )}
      </Section>

      {/* Teste de comunicação */}
      <Section
        title="Teste de comunicação"
        subtitle={
          <>
            Envia um evento INFO de teste (<code>ingest_connectivity_test</code>) para o destino
            configurado com <code>x-ingest-key</code>. Verifique o dashboard do MonitorSistema.
          </>
        }
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12
          }}
        >
          <div style={{ fontSize: 13, color: "#475569", flex: 1, minWidth: 200 }}>
            {config?.pushUrl ? (
              <>
                Destino ativo: <code style={{ fontSize: 12 }}>{config.pushUrl}</code>
              </>
            ) : (
              "Configure o destino antes de testar."
            )}
          </div>
          <button
            type="button"
            onClick={testConnection}
            disabled={testing || !config?.pushUrl}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <SendIcon size={14} /> {testing ? "Testando…" : "Testar comunicação"}
          </button>
        </div>
        {testResult && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 13,
              background: testResult.ok ? "#dcfce7" : "#fee2e2",
              color: testResult.ok ? "#15803d" : "#991b1b",
              border: `1px solid ${testResult.ok ? "#86efac" : "#fecaca"}`
            }}
          >
            {testResult.ok ? (
              <>
                ✓ Evento de teste aceito{testResult.status ? ` (HTTP ${testResult.status})` : ""}.
                Verifique o MonitorSistema.
              </>
            ) : (
              <>✗ Falha: {testResult.error ?? "erro desconhecido"}</>
            )}
          </div>
        )}
      </Section>

      {/* Cadastro no MonitorSistema */}
      <Section
        title="Cadastro no MonitorSistema"
        subtitle='Campos do formulário "Monitoramento de logs" no cadastro de sistemas'
      >
        <div
          style={{
            background: "#eff6ff",
            borderRadius: 10,
            padding: "16px 18px",
            border: "2px solid #93c5fd",
            marginBottom: 16
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 10,
              flexWrap: "wrap"
            }}
          >
            <div>
              <h4 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#1e3a8a" }}>
                Configuração de polling (JSON) — MonitorSistema
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                {cadastroConfig?.instructions ??
                  'Cole o JSON abaixo no campo "Configuração de polling (JSON)" da seção Monitoramento de logs no cadastro de sistemas do MonitorSistema.'}
              </p>
            </div>
            <button
              type="button"
              onClick={copyCadastroJson}
              disabled={!cadastroConfig?.pollingConfigJson}
              className="btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
            >
              {copiedCadastro ? (
                <>
                  <CheckIcon size={14} /> Copiado
                </>
              ) : (
                <>
                  <CopyIcon size={14} /> Copiar JSON
                </>
              )}
            </button>
          </div>

          {cadastroConfig && !cadastroConfig.ingestKeyConfigured && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 14px",
                background: "#fef9c3",
                borderRadius: 8,
                border: "1px solid #fde047",
                fontSize: 12,
                color: "#92400e"
              }}
            >
              <InfoIcon size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Defina <code>INGEST_SHARED_KEY</code> no ambiente — o JSON abaixo usa placeholder até
              a chave existir.
            </div>
          )}

          <pre
            style={{
              background: "#1e293b",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: 16,
              fontSize: 12,
              margin: 0,
              overflowX: "auto",
              maxHeight: 360,
              lineHeight: 1.5
            }}
          >
            {cadastroConfig?.pollingConfigJson ?? "Carregando configuração de polling…"}
          </pre>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              fontSize: 11,
              color: "#475569"
            }}
          >
            <span
              style={{
                background: "white",
                borderRadius: 999,
                padding: "4px 10px",
                border: "1px solid #bfdbfe"
              }}
            >
              systemKey: <strong>{cadastroConfig?.systemKey ?? "—"}</strong>
            </span>
            <span
              style={{
                background: "white",
                borderRadius: 999,
                padding: "4px 10px",
                border: "1px solid #bfdbfe"
              }}
            >
              ingestPushUrl: <strong>{cadastroConfig?.ingestPushUrl ?? "—"}</strong>
            </span>
            <span
              style={{
                background: "white",
                borderRadius: 999,
                padding: "4px 10px",
                border: "1px solid #bfdbfe"
              }}
            >
              ingestKey:{" "}
              <strong>{cadastroConfig?.ingestKeyConfigured ? "configurada" : "pendente"}</strong>
            </span>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12
          }}
        >
          <CadastroField
            label="systemKey"
            value={config?.systemKey ?? "—"}
            hint="API_PUBLICA_SYSTEM_KEY"
          />
          <CadastroField
            label="serviceName"
            value={config?.serviceName ?? "—"}
            hint="MONITOR_SERVICE_NAME"
          />
          <CadastroField
            label="environment"
            value={config?.environment ?? "—"}
            hint="MONITOR_ENVIRONMENT"
          />
          <CadastroField
            label="ingestPushUrl"
            value={config?.pushUrl ?? "—"}
            hint="URL efetiva de envio"
            mono
          />
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
          O envio de logs usa <strong>push HTTP</strong> (não há polling de eventos). Para backup
          agendado, use a aba <strong>API de Backup</strong> — lá está o JSON da seção Backup no
          MonitorSistema.
        </p>
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            background: "white",
            borderRadius: 8,
            border: "1px solid #e2e8f0"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <InfoIcon size={15} style={{ color: "#6366f1" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
              Contrato Event v1 (campos obrigatórios no payload)
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              "eventId",
              "schemaVersion",
              "timestamp",
              "systemKey",
              "environment",
              "serviceName",
              "operation",
              "status",
              "severity",
              "message"
            ].map((f) => (
              <code
                key={f}
                style={{
                  fontSize: 11,
                  background: "#f1f5f9",
                  padding: "3px 8px",
                  borderRadius: 4,
                  color: "#4338ca"
                }}
              >
                {f}
              </code>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              copyText(
                JSON.stringify(
                  {
                    eventId: "<uuid>",
                    schemaVersion: "v1",
                    timestamp: "<iso-utc>",
                    systemKey: config?.systemKey,
                    environment: config?.environment,
                    serviceName: config?.serviceName,
                    operation: "GET /health",
                    status: "SUCCESS",
                    severity: "INFO",
                    message: "Exemplo de evento"
                  },
                  null,
                  2
                )
              )
            }
            style={{ ...btnSecondary, marginTop: 10 }}
          >
            <CopyIcon size={13} /> Copiar exemplo JSON
          </button>
        </div>
      </Section>

      {/* API receptora local (secundário) */}
      <div
        style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 12, overflow: "hidden" }}
      >
        <button
          type="button"
          onClick={() => setShowEvents(!showEvents)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            background: "#f8fafc",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            color: "#475569"
          }}
        >
          <span>API receptora local — eventos recebidos neste sistema</span>
          <span>{showEvents ? "▲" : "▼"}</span>
        </button>
        {showEvents && (
          <div style={{ padding: "14px 18px" }}>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
              Este sistema também expõe <code>POST /api/ingest/push-http</code> para receber eventos
              de terceiros (idempotência por <code>eventId</code>).
            </p>
            <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Timestamp", "System Key", "Operação", "Status", "Mensagem"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "#475569",
                          borderBottom: "2px solid #e2e8f0"
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ padding: 16, textAlign: "center", color: "#94a3b8" }}
                      >
                        Nenhum evento recebido.
                      </td>
                    </tr>
                  )}
                  {events.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "8px 12px", whiteSpace: "nowrap", color: "#64748b" }}>
                        {formatDateTimeBrasilia(e.createdAt, {
                          dateStyle: "short",
                          timeStyle: "short"
                        })}
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>{e.systemKey}</td>
                      <td
                        style={{
                          padding: "8px 12px",
                          fontFamily: "monospace",
                          fontSize: 11,
                          color: "#6366f1"
                        }}
                      >
                        {e.operation}
                      </td>
                      <td style={{ padding: "8px 12px" }}>{e.status}</td>
                      <td
                        style={{
                          padding: "8px 12px",
                          maxWidth: 240,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {e.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  badge,
  children
}: {
  title: string;
  subtitle?: React.ReactNode;
  badge?: { label: string; bg: string; color: string };
  children: React.ReactNode;
}) {
  return (
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
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: subtitle ? 8 : 14
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{title}</h3>
        {badge && (
          <span
            style={{
              background: badge.bg,
              color: badge.color,
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap"
            }}
          >
            {badge.label}
          </span>
        )}
      </div>
      {subtitle && (
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

function CadastroField({
  label,
  value,
  hint,
  mono
}: {
  label: string;
  value: string;
  hint: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "white",
        borderRadius: 8,
        border: "1px solid #e2e8f0"
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontWeight: 600,
          color: "#334155",
          wordBreak: "break-all",
          fontFamily: mono ? "monospace" : undefined,
          fontSize: mono ? 11 : 13
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{hint}</div>
    </div>
  );
}
