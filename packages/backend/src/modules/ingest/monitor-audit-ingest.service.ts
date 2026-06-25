import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { MonitorDestinationService } from "./monitor-destination.service";

export interface AuditIngestPayload {
  tracker: string;
  method: string;
  path: string;
  action: string;
  statusCode: number;
  durationMs: number;
  username: string | null;
  actorUserId: string | null;
  ipAddress: string | null;
}

@Injectable()
export class MonitorAuditIngestService {
  constructor(private readonly destinations: MonitorDestinationService) {}

  isEnabled(): boolean {
    const flag = (process.env.MONITOR_AUDIT_INGEST_ENABLED ?? "true").toLowerCase();
    if (flag === "false" || flag === "0") return false;
    const key = process.env.INGEST_SHARED_KEY?.trim();
    const url = this.destinations.getPushUrl();
    return Boolean(key && url);
  }

  shouldSkipPush(payload: AuditIngestPayload): boolean {
    if (!this.isEnabled()) return true;
    if (
      payload.method === "GET" &&
      payload.path === "/api/auth/login" &&
      payload.statusCode < 400
    ) {
      return !payload.actorUserId && !payload.username;
    }
    return false;
  }

  private mapStatus(statusCode: number): "SUCCESS" | "FAILURE" | "ERROR" {
    if (statusCode >= 500) return "ERROR";
    if (statusCode >= 400) return "FAILURE";
    return "SUCCESS";
  }

  private mapSeverity(statusCode: number): "INFO" | "WARN" | "ERROR" | "CRITICAL" {
    if (statusCode >= 500) return "ERROR";
    if (statusCode >= 400) return "WARN";
    return "INFO";
  }

  private buildEvent(
    operation: string,
    message: string,
    status: "SUCCESS" | "FAILURE" | "ERROR",
    severity: "INFO" | "WARN" | "ERROR" | "CRITICAL",
    traceId?: string | null
  ) {
    const cfg = this.destinations.getConfig();
    return {
      eventId: randomUUID(),
      schemaVersion: "v1" as const,
      timestamp: new Date().toISOString(),
      systemKey: cfg.systemKey,
      environment: cfg.environment,
      serviceName: cfg.serviceName,
      operation,
      status,
      severity,
      message,
      traceId: traceId ?? undefined
    };
  }

  async pushAudit(payload: AuditIngestPayload): Promise<void> {
    if (this.shouldSkipPush(payload)) return;

    const url = this.destinations.getPushUrl();
    const key = process.env.INGEST_SHARED_KEY?.trim();
    if (!url || !key) return;

    const status = this.mapStatus(payload.statusCode);
    const severity = this.mapSeverity(payload.statusCode);
    const actor = payload.username ?? payload.actorUserId ?? "anônimo";
    const message = `${payload.action} — ${payload.statusCode} (${payload.durationMs}ms) — ${actor}`;

    const event = this.buildEvent(payload.action, message, status, severity, payload.tracker);
    await this.postEvent(url, key, event);
  }

  async testConnectivity(): Promise<{
    ok: boolean;
    pushUrl: string;
    status?: number;
    error?: string;
  }> {
    const url = this.destinations.getPushUrl();
    if (!url) {
      return {
        ok: false,
        pushUrl: "",
        error: "Destino não configurado (painel ou MONITOR_INGEST_PUSH_URL)."
      };
    }
    const key = process.env.INGEST_SHARED_KEY?.trim();
    if (!key) {
      return { ok: false, pushUrl: url, error: "INGEST_SHARED_KEY não definida no ambiente." };
    }

    const event = this.buildEvent(
      "ingest_connectivity_test",
      "Teste de comunicação com MonitorSistema",
      "SUCCESS",
      "INFO"
    );

    try {
      const res = await this.postEvent(url, key, event);
      return {
        ok: res.ok,
        pushUrl: url,
        status: res.status,
        error: res.ok ? undefined : res.error
      };
    } catch (err) {
      return { ok: false, pushUrl: url, error: String(err) };
    }
  }

  private async postEvent(
    url: string,
    key: string,
    event: Record<string, unknown>
  ): Promise<{ ok: boolean; status?: number; error?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ingest-key": key
        },
        body: JSON.stringify(event),
        signal: controller.signal
      });
      if (res.status === 202 || res.ok) {
        return { ok: true, status: res.status };
      }
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: body || `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timeout);
    }
  }
}
