import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { type AxiosRequestConfig } from "axios";
import * as https from "https";

export interface KcGroup {
  id: string;
  name: string;
  path: string;
  subGroups?: KcGroup[];
}

export interface KcUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  readonly baseUrl: string;
  readonly realm: string;
  private readonly adminUser: string;
  private readonly adminPassword: string;
  private readonly kcClientId: string;
  private readonly kcClientSecret: string;
  private readonly axiosConfig: AxiosRequestConfig;

  constructor(private readonly cfg: ConfigService) {
    const issuer = cfg.get<string>("KEYCLOAK_ISSUER", "");
    const match = issuer.match(/^(.+)\/realms\/([^/]+)\/?$/);
    this.baseUrl = match
      ? match[1]
      : cfg.get<string>("KEYCLOAK_URL", "http://192.168.100.112:8080");
    this.realm = match ? match[2] : cfg.get<string>("KEYCLOAK_REALM", "cfo");
    this.adminUser = cfg.get<string>("KEYCLOAK_ADMIN_USER", "");
    this.adminPassword = cfg.get<string>("KEYCLOAK_ADMIN_PASSWORD", "");
    this.kcClientId =
      cfg.get<string>("KEYCLOAK_SERVICE_CLIENT_ID", "") ||
      cfg.get<string>("KEYCLOAK_CLIENT_ID", "") ||
      cfg.get<string>("KEYCLOAK_AUDIENCE", "pontoeletronico-dev");
    this.kcClientSecret =
      cfg.get<string>("KEYCLOAK_SERVICE_CLIENT_SECRET", "") ||
      cfg.get<string>("KEYCLOAK_CLIENT_SECRET", "");
    const insecureTls = cfg.get<string>("KEYCLOAK_JWKS_TLS_INSECURE") === "true";
    this.axiosConfig = {
      timeout: 15_000,
      ...(insecureTls ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) } : {})
    };
  }

  /* Token admin: 1) client_credentials (service account)  2) token do usuário logado */
  async resolveAdminToken(userToken: string): Promise<string> {
    if (this.kcClientId && this.kcClientSecret) {
      const svc = await this.fetchToken(
        `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.kcClientId,
          client_secret: this.kcClientSecret
        }).toString()
      );
      if (svc) return svc;
    }

    if (this.adminUser && this.adminPassword) {
      const master = await this.fetchToken(
        `${this.baseUrl}/realms/master/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: "password",
          client_id: "admin-cli",
          username: this.adminUser,
          password: this.adminPassword
        }).toString()
      );
      if (master) return master;
    }

    return userToken;
  }

  private async fetchToken(url: string, body: string): Promise<string | null> {
    try {
      const res = await axios.post<{ access_token: string }>(url, body, {
        ...this.axiosConfig,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      return res.data.access_token ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao obter token admin Keycloak: ${msg}`);
      return null;
    }
  }

  private async adminGet<T>(path: string, token: string): Promise<T | null> {
    try {
      const res = await axios.get<T>(`${this.baseUrl}/admin/realms/${this.realm}${path}`, {
        ...this.axiosConfig,
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      this.logger.warn(
        `API Admin Keycloak indisponível (${path}${status ? ` HTTP ${status}` : ""})`
      );
      return null;
    }
  }

  async listGroups(userToken: string): Promise<{ available: boolean; grupos: KcGroup[] }> {
    const token = await this.resolveAdminToken(userToken);
    const data = await this.adminGet<KcGroup[]>("/groups?briefRepresentation=false&max=500", token);
    return { available: data !== null, grupos: data ?? [] };
  }

  async listUsers(
    userToken: string,
    search?: string
  ): Promise<{ available: boolean; usuarios: KcUser[] }> {
    const token = await this.resolveAdminToken(userToken);
    const params = new URLSearchParams({ max: "200" });
    if (search) params.set("search", search);
    const data = await this.adminGet<KcUser[]>(`/users?${params}`, token);
    return { available: data !== null, usuarios: data ?? [] };
  }

  async getUserGroups(userId: string, userToken: string): Promise<KcGroup[]> {
    const token = await this.resolveAdminToken(userToken);
    const data = await this.adminGet<KcGroup[]>(`/users/${userId}/groups`, token);
    return data ?? [];
  }
}
