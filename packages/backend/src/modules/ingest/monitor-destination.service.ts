import { Injectable } from "@nestjs/common";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { networkInterfaces } from "os";

export interface MonitorDestination {
  scheme: "http" | "https";
  host: string;
  port: number;
  updatedAt?: string;
}

export interface IngestConfigResponse {
  destination: MonitorDestination | null;
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

export interface IngestCadastroConfigResponse {
  systemKey: string;
  ingestPushUrl: string | null;
  ingestKeyConfigured: boolean;
  pollingConfigJson: string;
  instructions: string;
}

const DEFAULT_SERVICE = "api-ponto";

@Injectable()
export class MonitorDestinationService {
  private readonly instanceDir = process.env.INSTANCE_DIR ?? join(process.cwd(), "instance");
  private readonly configPath = join(this.instanceDir, "monitor_destinations.json");

  getLocalIpv4(): string | null {
    const nets = networkInterfaces();
    for (const entries of Object.values(nets)) {
      for (const net of entries ?? []) {
        if (net.family === "IPv4" && !net.internal) return net.address;
      }
    }
    return null;
  }

  parsePushUrl(url: string | undefined): MonitorDestination | null {
    if (!url?.trim()) return null;
    try {
      const parsed = new URL(url.trim());
      const port =
        parsed.port !== "" ? parseInt(parsed.port, 10) : parsed.protocol === "https:" ? 443 : 80;
      return {
        scheme: parsed.protocol === "https:" ? "https" : "http",
        host: parsed.hostname,
        port
      };
    } catch {
      return null;
    }
  }

  buildPushUrl(dest: MonitorDestination): string {
    const base = `${dest.scheme}://${dest.host}:${dest.port}`;
    return `${base.replace(/\/$/, "")}/ingest/push-http`;
  }

  private readPanelDestination(): (MonitorDestination & { updatedAt: string }) | null {
    if (!existsSync(this.configPath)) return null;
    try {
      const raw = JSON.parse(readFileSync(this.configPath, "utf-8")) as {
        ingest?: MonitorDestination & { updatedAt?: string };
      };
      const ingest = raw?.ingest;
      if (!ingest?.host || !ingest.port) return null;
      return {
        scheme: ingest.scheme === "https" ? "https" : "http",
        host: ingest.host,
        port: Number(ingest.port),
        updatedAt: ingest.updatedAt ?? new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  getEffectiveDestination(): { destination: MonitorDestination; source: "panel" | "env" } | null {
    const panel = this.readPanelDestination();
    if (panel) {
      const destination: MonitorDestination = {
        scheme: panel.scheme,
        host: panel.host,
        port: panel.port
      };
      return { destination, source: "panel" };
    }
    const envDest = this.parsePushUrl(process.env.MONITOR_INGEST_PUSH_URL);
    if (envDest) return { destination: envDest, source: "env" };
    return null;
  }

  getConfig(): IngestConfigResponse {
    const panel = this.readPanelDestination();
    const envDest = this.parsePushUrl(process.env.MONITOR_INGEST_PUSH_URL);
    const effective = this.getEffectiveDestination();
    const auditFlag = (process.env.MONITOR_AUDIT_INGEST_ENABLED ?? "true").toLowerCase();

    return {
      destination: effective?.destination ?? null,
      pushUrl: effective ? this.buildPushUrl(effective.destination) : null,
      source: effective?.source ?? "none",
      ingestKeyConfigured: Boolean(process.env.INGEST_SHARED_KEY?.trim()),
      auditIngestEnabled: auditFlag !== "false" && auditFlag !== "0",
      systemKey: process.env.API_PUBLICA_SYSTEM_KEY ?? "ponto-eletronico-cfo",
      serviceName: process.env.MONITOR_SERVICE_NAME ?? DEFAULT_SERVICE,
      environment: process.env.MONITOR_ENVIRONMENT ?? process.env.NODE_ENV ?? "prod",
      envPushUrl: envDest ? this.buildPushUrl(envDest) : null,
      panelUpdatedAt: panel?.updatedAt ?? null
    };
  }

  saveDestination(input: MonitorDestination): IngestConfigResponse {
    mkdirSync(this.instanceDir, { recursive: true });
    const payload = {
      ingest: {
        scheme: input.scheme === "https" ? "https" : "http",
        host: input.host.trim(),
        port: Number(input.port),
        updatedAt: new Date().toISOString()
      }
    };
    writeFileSync(this.configPath, JSON.stringify(payload, null, 2), "utf-8");
    return this.getConfig();
  }

  removePanelOverride(): IngestConfigResponse {
    if (existsSync(this.configPath)) {
      try {
        unlinkSync(this.configPath);
      } catch {
        /* ignore */
      }
    }
    return this.getConfig();
  }

  getPushUrl(): string | null {
    const effective = this.getEffectiveDestination();
    return effective ? this.buildPushUrl(effective.destination) : null;
  }

  /** JSON para colar no campo "Configuração de polling (JSON)" — seção Monitoramento de logs no MonitorSistema */
  getMonitorCadastroConfig(): IngestCadastroConfigResponse {
    const config = this.getConfig();
    const ingestKeyConfigured = config.ingestKeyConfigured;

    const pollingConfig = {
      schemaVersion: "v1",
      integration: "ingest",
      systemKey: config.systemKey,
      serviceName: config.serviceName,
      environment: config.environment,
      transport: "push-http",
      ingestPushUrl: config.pushUrl ?? "<configure MONITOR_INGEST_PUSH_URL ou painel>",
      ingestKeyHeader: "x-ingest-key",
      ingestKey: ingestKeyConfigured ? process.env.INGEST_SHARED_KEY : "<INGEST_SHARED_KEY>",
      auditIngestEnabled: config.auditIngestEnabled,
      eventSchemaVersion: "v1"
    };

    return {
      systemKey: config.systemKey,
      ingestPushUrl: config.pushUrl,
      ingestKeyConfigured,
      pollingConfigJson: JSON.stringify(pollingConfig, null, 2),
      instructions:
        'No MonitorSistema, abra o cadastro do sistema e cole este JSON no campo "Configuração de polling (JSON)" ' +
        "da seção Monitoramento de logs. A ingestKey deve ser o mesmo valor de INGEST_SHARED_KEY neste sistema e no Monitor."
    };
  }
}
