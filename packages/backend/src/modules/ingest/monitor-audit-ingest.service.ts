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
  /** Corpo/query sanitizados da requisição (ex.: usuário digitado num formulário
   *  de login) — usado só para saber se a falha tem algum conteúdo rastreável,
   *  nunca reenviado ao monitor externo (evita vazar dado sensível em trânsito
   *  duas vezes). */
  hasTraceableContent?: boolean;
}

@Injectable()
export class MonitorAuditIngestService {
  constructor(private readonly destinations: MonitorDestinationService) {}

  /* Deduplicação de 401 repetido (mesmo ator/IP) em janela curta — só afeta o
     que é ENVIADO AO PAINEL EXTERNO, nunca a resposta dada ao cliente nem
     nenhuma decisão de autenticação/sessão. Existe porque o frontend já faz
     1 retry automático em 401 (packages/web/src/hooks/useApi.ts): quando a
     sessão de um usuário está realmente expirada, isso gera 2 requisições
     falhas em sequência para o MESMO incidente — sem isto, o monitor conta
     "2 falhas" onde só houve 1 problema real. */
  private readonly recentAuthFailures = new Map<string, number>();
  private static readonly AUTH_FAILURE_DEDUP_MS = 5_000;

  private isDuplicateRecentAuthFailure(payload: AuditIngestPayload): boolean {
    if (payload.statusCode !== 401) return false;
    const key = payload.actorUserId || payload.ipAddress;
    if (!key) return false; // sem nada pra correlacionar, não arrisca suprimir

    const now = Date.now();
    const last = this.recentAuthFailures.get(key);
    this.recentAuthFailures.set(key, now);

    // Limpeza oportunista — evita crescimento ilimitado do mapa em produção.
    if (this.recentAuthFailures.size > 500) {
      for (const [k, t] of this.recentAuthFailures) {
        if (now - t > MonitorAuditIngestService.AUTH_FAILURE_DEDUP_MS) {
          this.recentAuthFailures.delete(k);
        }
      }
    }

    return last !== undefined && now - last < MonitorAuditIngestService.AUTH_FAILURE_DEDUP_MS;
  }

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
    /* Falha de autenticação/autorização (401/403) sem NENHUM conteúdo
       rastreável — nem actorUserId, nem username, nem sequer um corpo/query
       com algo digitado (ex.: usuário informado num formulário). O
       AuthFailureLogFilter só deixa os dois primeiros nulos quando a
       requisição não trouxe sequer um header Authorization decodificável
       (ex.: o healthcheck do Docker Compose batendo em /api/auth/me sem
       token a cada 10s — docker-compose.yml). Sem nenhum "quem" pra
       investigar, isso é ruído puro no monitor externo — vale para QUALQUER
       rota protegida, não só /auth/me. Uma tentativa de login com
       usuário/senha errados sempre carrega o usuário digitado no corpo da
       requisição (capturado pelo AuditLogInterceptor, senha já redigida) —
       por isso NUNCA cai aqui, continua sendo reportada normalmente, assim
       como qualquer token com identidade decodificável (expirado, assinatura
       inválida etc.), mesmo que inválida. */
    if (
      (payload.statusCode === 401 || payload.statusCode === 403) &&
      !payload.actorUserId &&
      !payload.username &&
      !payload.hasTraceableContent
    ) {
      return true;
    }
    if (this.isDuplicateRecentAuthFailure(payload)) return true;
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
