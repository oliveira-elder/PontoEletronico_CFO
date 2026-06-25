import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../../hooks/useApi";
import {
  DatabaseIcon,
  RefreshCwIcon,
  PlusIcon,
  CopyIcon,
  CheckIcon,
  InfoIcon
} from "../../../components/icons";
import { formatDateTimeBrasilia, formatTimeBrasilia } from "../../../utils/horario-brasilia";

interface BackupJob {
  id: string;
  systemKey: string;
  engine: string;
  backupMode: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastHeartbeat: string | null;
  artifactPath: string | null;
  artifactSize: number | null;
  failureMsg: string | null;
  retentionDays: number;
  createdAt: string;
}

interface PollingConfigResponse {
  systemKey: string;
  apiBaseUrl: string;
  agentKeyConfigured: boolean;
  pollingConfigJson: string;
  instructions: string;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  PENDING: { background: "#e0f2fe", color: "#0369a1" },
  RUNNING: { background: "#fef9c3", color: "#92400e" },
  SUCCESS: { background: "#dcfce7", color: "#15803d" },
  FAILED: { background: "#fee2e2", color: "#991b1b" }
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const AGENT_SCRIPT = `#!/bin/bash
# Agente de Backup — MonitorSistema / Ponto Eletrônico CFO
# Variáveis de ambiente obrigatórias:
#   MONITOR_API_URL=https://192.168.100.30:12003/api
#   MONITOR_SYSTEM_KEY=ponto-eletronico-cfo
#   MONITOR_BACKUP_AGENT_KEY=<chave-segura>
#   DATABASE_URL=postgresql://user:pass@localhost:5432/db

set -euo pipefail

API="\${MONITOR_API_URL}"
SYS_KEY="\${MONITOR_SYSTEM_KEY}"
AGENT_KEY="\${MONITOR_BACKUP_AGENT_KEY}"
POLL_INTERVAL="\${POLL_INTERVAL:-45}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

poll_job() {
  curl -sf -H "x-backup-agent-key: $AGENT_KEY" \\
    "$API/backup-agent/jobs/next?systemKey=$SYS_KEY" || echo ""
}

heartbeat() {
  local RUN_ID="$1" TOKEN="$2"
  curl -sf -X POST -H "Authorization: Bearer $TOKEN" \\
    "$API/backup-agent/runs/$RUN_ID/heartbeat" > /dev/null
}

send_artifact() {
  local RUN_ID="$1" TOKEN="$2" FILE="$3"
  curl -sf -X POST -H "Authorization: Bearer $TOKEN" \\
    -F "file=@$FILE" \\
    "$API/backup-agent/runs/$RUN_ID/artifact"
}

report_failure() {
  local RUN_ID="$1" TOKEN="$2" MSG="$3"
  curl -sf -X POST -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d "{\\"message\\":\\"$MSG\\"}" \\
    "$API/backup-agent/runs/$RUN_ID/failure" > /dev/null
}

while true; do
  JOB=$(poll_job)

  if [ -z "$JOB" ]; then
    log "Nenhum job pendente. Aguardando $POLL_INTERVAL s..."
    sleep "$POLL_INTERVAL"
    continue
  fi

  RUN_ID=$(echo "$JOB" | jq -r '.runId')
  TOKEN=$(echo "$JOB" | jq -r '.token')
  ENGINE=$(echo "$JOB" | jq -r '.engine')

  log "Job recebido: runId=$RUN_ID engine=$ENGINE"

  DUMP_FILE="/tmp/backup-$RUN_ID.sql.gz"

  (
    # Heartbeat a cada 30s em background
    while true; do heartbeat "$RUN_ID" "$TOKEN"; sleep 30; done
  ) &
  HB_PID=$!

  if pg_dump "$DATABASE_URL" | gzip > "$DUMP_FILE" 2>/tmp/pg_err.txt; then
    kill "$HB_PID" 2>/dev/null || true
    log "Dump concluído. Enviando artefato..."
    send_artifact "$RUN_ID" "$TOKEN" "$DUMP_FILE"
    rm -f "$DUMP_FILE"
    log "Backup finalizado com sucesso."
  else
    kill "$HB_PID" 2>/dev/null || true
    ERR=$(cat /tmp/pg_err.txt | head -3)
    report_failure "$RUN_ID" "$TOKEN" "$ERR"
    log "Backup falhou: $ERR"
  fi
done`;

export function LogsBackupTab() {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [pollingConfig, setPollingConfig] = useState<PollingConfigResponse | null>(null);
  const [copiedPolling, setCopiedPolling] = useState(false);
  const [newJobForm, setNewJobForm] = useState({
    systemKey: "ponto-eletronico-cfo",
    engine: "postgresql",
    backupMode: "full"
  });
  const [creating, setCreating] = useState(false);
  const [showScript, setShowScript] = useState(false);

  const loadPollingConfig = useCallback(async () => {
    try {
      const data = await api.get<PollingConfigResponse>("/logs/backup/polling-config");
      setPollingConfig(data);
    } catch {
      setPollingConfig(null);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<BackupJob[]>("/logs/backup/jobs");
      setJobs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPollingConfig();
    void loadJobs();
    const interval = setInterval(loadJobs, 15000);
    return () => clearInterval(interval);
  }, [loadJobs, loadPollingConfig]);

  function copyPollingJson() {
    if (!pollingConfig?.pollingConfigJson) return;
    navigator.clipboard.writeText(pollingConfig.pollingConfigJson).catch(() => null);
    setCopiedPolling(true);
    setTimeout(() => setCopiedPolling(false), 2000);
  }

  async function createJob() {
    setCreating(true);
    try {
      await api.post("/logs/backup/jobs", newJobForm);
      void loadJobs();
    } finally {
      setCreating(false);
    }
  }

  function copyScript() {
    navigator.clipboard.writeText(AGENT_SCRIPT).catch(() => null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Configuração de polling — MonitorSistema */}
      <div
        style={{
          background: "#eff6ff",
          borderRadius: 12,
          padding: "18px 20px",
          border: "2px solid #93c5fd"
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
            <h3 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: "#1e3a8a" }}>
              Configuração de polling (JSON) — seção API de Backup
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "#1e40af", lineHeight: 1.6 }}>
              {pollingConfig?.instructions ??
                'Cole o JSON abaixo no campo "Configuração de polling (JSON)" da seção API de Backup no cadastro de sistemas do MonitorSistema.'}
            </p>
          </div>
          <button
            type="button"
            onClick={copyPollingJson}
            disabled={!pollingConfig?.pollingConfigJson}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
          >
            {copiedPolling ? (
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

        {pollingConfig && !pollingConfig.agentKeyConfigured && (
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
            Defina <code>BACKUP_AGENT_SHARED_KEY</code> no ambiente — o JSON abaixo usa placeholder
            até a chave existir.
          </div>
        )}

        <div style={{ position: "relative" }}>
          <pre
            style={{
              background: "#1e293b",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: 16,
              fontSize: 12,
              margin: 0,
              overflowX: "auto",
              maxHeight: 420,
              lineHeight: 1.5
            }}
          >
            {pollingConfig?.pollingConfigJson ?? "Carregando configuração de polling…"}
          </pre>
        </div>

        <div
          style={{
            marginTop: 12,
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
            systemKey: <strong>{pollingConfig?.systemKey ?? "—"}</strong>
          </span>
          <span
            style={{
              background: "white",
              borderRadius: 999,
              padding: "4px 10px",
              border: "1px solid #bfdbfe"
            }}
          >
            apiBaseUrl: <strong>{pollingConfig?.apiBaseUrl ?? "—"}</strong>
          </span>
          <span
            style={{
              background: "white",
              borderRadius: 999,
              padding: "4px 10px",
              border: "1px solid #bfdbfe"
            }}
          >
            agentKey:{" "}
            <strong>{pollingConfig?.agentKeyConfigured ? "configurada" : "pendente"}</strong>
          </span>
        </div>
      </div>

      {/* Fluxo ponta a ponta */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Fluxo Ponta a Ponta</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              step: "1",
              desc: "MonitorSistema cria um BackupJob (PENDING) com engine, backupMode e config."
            },
            {
              step: "2",
              desc: "O agente faz GET /backup-agent/jobs/next?systemKey=... com x-backup-agent-key. Se 204, aguarda 30-60s."
            },
            {
              step: "3",
              desc: "Se 200, executa o dump local (pg_dump, pgBackRest etc.) com heartbeat a cada 30s."
            },
            {
              step: "4",
              desc: "Em sucesso: POST /backup-agent/runs/:runId/artifact com Authorization: Bearer <token> + multipart."
            },
            {
              step: "5",
              desc: 'Em falha: POST /backup-agent/runs/:runId/failure com {"message":"..."}.'
            },
            {
              step: "6",
              desc: `O artefato é armazenado em /data/backups/{systemKey}/{runId}/. Retenção automática por retentionDays.`
            }
          ].map(({ step, desc }) => (
            <div key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#6366f1",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {step}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Variáveis de ambiente */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>
          Variáveis de Ambiente do Agente
        </h3>
        <pre
          style={{
            background: "#1e293b",
            color: "#e2e8f0",
            borderRadius: 8,
            padding: 14,
            fontSize: 12,
            margin: 0
          }}
        >
          {`MONITOR_API_URL=https://192.168.100.30:12003/api
MONITOR_SYSTEM_KEY=ponto-eletronico-cfo
MONITOR_BACKUP_AGENT_KEY=<chave-de-BACKUP_AGENT_SHARED_KEY>
DATABASE_URL=postgresql://user:pass@localhost:5432/db
POLL_INTERVAL=45`}
        </pre>
      </div>

      {/* Script do agente */}
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
            Script do Agente (Bash / PostgreSQL)
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={copyScript}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                background: "white",
                cursor: "pointer",
                fontSize: 12
              }}
            >
              <CopyIcon size={13} /> Copiar
            </button>
            <button
              onClick={() => setShowScript(!showScript)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                background: "white",
                cursor: "pointer",
                fontSize: 12
              }}
            >
              {showScript ? "Ocultar" : "Ver Script"}
            </button>
          </div>
        </div>
        {showScript && (
          <pre
            style={{
              background: "#1e293b",
              color: "#e2e8f0",
              borderRadius: 8,
              padding: 14,
              fontSize: 11,
              margin: 0,
              overflowX: "auto",
              maxHeight: 400
            }}
          >
            {AGENT_SCRIPT}
          </pre>
        )}
      </div>

      {/* Criar job manual */}
      <div
        style={{
          background: "var(--surface-raised, #f8fafc)",
          borderRadius: 12,
          padding: "18px 20px",
          border: "1px solid var(--border, #e2e8f0)"
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Criar Job Manual</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>System Key</span>
            <input
              value={newJobForm.systemKey}
              onChange={(e) => setNewJobForm((f) => ({ ...f, systemKey: e.target.value }))}
              style={{
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                fontSize: 13,
                width: 220
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Engine</span>
            <select
              value={newJobForm.engine}
              onChange={(e) => setNewJobForm((f) => ({ ...f, engine: e.target.value }))}
              style={{
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                fontSize: 13
              }}
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>Modo</span>
            <select
              value={newJobForm.backupMode}
              onChange={(e) => setNewJobForm((f) => ({ ...f, backupMode: e.target.value }))}
              style={{
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--border, #e2e8f0)",
                fontSize: 13
              }}
            >
              <option value="full">Full</option>
              <option value="incremental">Incremental</option>
            </select>
          </label>
          <button
            onClick={createJob}
            disabled={creating}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6, height: 36 }}
          >
            <PlusIcon size={14} /> {creating ? "Criando…" : "Criar Job"}
          </button>
        </div>
      </div>

      {/* Lista de jobs */}
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
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Histórico de Jobs</h3>
          <button
            onClick={loadJobs}
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
                {[
                  "System Key",
                  "Engine",
                  "Modo",
                  "Status",
                  "Agendado",
                  "Iniciado",
                  "Concluído",
                  "Tamanho",
                  "Heartbeat"
                ].map((h) => (
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
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#94a3b8" }}>
                    Nenhum job encontrado.
                  </td>
                </tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} style={{ borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{j.systemKey}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <DatabaseIcon size={13} style={{ marginRight: 4 }} />
                    {j.engine}
                  </td>
                  <td style={{ padding: "9px 12px" }}>{j.backupMode}</td>
                  <td style={{ padding: "9px 12px" }}>
                    <span
                      style={{
                        ...(STATUS_STYLE[j.status] ?? {}),
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontWeight: 600,
                        fontSize: 11
                      }}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {formatDateTimeBrasilia(j.scheduledAt, {
                      dateStyle: "short",
                      timeStyle: "short"
                    })}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {j.startedAt ? formatTimeBrasilia(j.startedAt) : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {j.completedAt ? formatTimeBrasilia(j.completedAt) : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b" }}>
                    {j.artifactSize ? formatBytes(j.artifactSize) : "—"}
                  </td>
                  <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>
                    {j.lastHeartbeat ? formatTimeBrasilia(j.lastHeartbeat) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
