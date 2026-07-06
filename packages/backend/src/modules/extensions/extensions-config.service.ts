import { Injectable, BadRequestException } from "@nestjs/common";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

export interface ExtensionsIntegrationConfig {
  url: string;
  token: string;
  updatedAt?: string;
}

export interface ExtensionsConfigResponse {
  url: string;
  tokenConfigured: boolean;
  tokenMasked: string | null;
  source: "panel" | "env" | "none";
  envUrl: string | null;
  panelUpdatedAt: string | null;
}

const DEFAULT_URL =
  process.env.SECTIONS_INTEGRATION_URL ??
  "https://192.168.161.50:11010/api/sections/integration/users";

@Injectable()
export class ExtensionsConfigService {
  private readonly instanceDir = process.env.INSTANCE_DIR ?? join(process.cwd(), "instance");
  private readonly configPath = join(this.instanceDir, "extensions_integration.json");

  private readPanelConfig(): ExtensionsIntegrationConfig | null {
    if (!existsSync(this.configPath)) return null;
    try {
      const raw = JSON.parse(readFileSync(this.configPath, "utf-8")) as ExtensionsIntegrationConfig;
      if (!raw?.url?.trim()) return null;
      return {
        url: raw.url.trim(),
        token: raw.token ?? "",
        updatedAt: raw.updatedAt
      };
    } catch {
      return null;
    }
  }

  getEffectiveConfig(): { url: string; token: string; source: "panel" | "env" } {
    const panel = this.readPanelConfig();
    if (panel) {
      return { url: panel.url, token: panel.token, source: "panel" };
    }
    return {
      url: DEFAULT_URL,
      token: process.env.SECTIONS_INTEGRATION_TOKEN ?? "",
      source: "env"
    };
  }

  maskToken(token: string): string | null {
    if (!token?.trim()) return null;
    if (token.length <= 8) return "••••••••";
    return `${token.slice(0, 4)}${"•".repeat(Math.min(token.length - 8, 12))}${token.slice(-4)}`;
  }

  getConfig(): ExtensionsConfigResponse {
    const panel = this.readPanelConfig();
    const effective = this.getEffectiveConfig();
    const envUrl = process.env.SECTIONS_INTEGRATION_URL?.trim() || DEFAULT_URL;

    return {
      url: effective.url,
      tokenConfigured: Boolean(effective.token?.trim()),
      tokenMasked: this.maskToken(effective.token),
      source: effective.source,
      envUrl: panel ? envUrl : null,
      panelUpdatedAt: panel?.updatedAt ?? null
    };
  }

  saveConfig(input: { url: string; token?: string }): ExtensionsConfigResponse {
    const url = input.url?.trim();
    if (!url) throw new BadRequestException("URL da API é obrigatória.");

    const current = this.readPanelConfig();
    const effective = this.getEffectiveConfig();
    const token =
      input.token !== undefined && input.token !== ""
        ? input.token.trim()
        : (current?.token ?? effective.token);

    mkdirSync(this.instanceDir, { recursive: true });
    const payload: ExtensionsIntegrationConfig = {
      url,
      token,
      updatedAt: new Date().toISOString()
    };
    writeFileSync(this.configPath, JSON.stringify(payload, null, 2), "utf-8");
    return this.getConfig();
  }

  removePanelOverride(): ExtensionsConfigResponse {
    if (existsSync(this.configPath)) {
      try {
        unlinkSync(this.configPath);
      } catch {
        /* ignore */
      }
    }
    return this.getConfig();
  }
}
