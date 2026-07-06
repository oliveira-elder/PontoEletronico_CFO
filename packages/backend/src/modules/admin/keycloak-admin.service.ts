import { Injectable } from "@nestjs/common";
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
  readonly baseUrl: string;
  readonly realm: string;
  private readonly svcClientId: string;
  private readonly svcClientSecret: string;
  private readonly axiosConfig: AxiosRequestConfig;

  constructor(private readonly cfg: ConfigService) {
    const issuer = cfg.get<string>("KEYCLOAK_ISSUER", "");
    const match = issuer.match(/^(.+)\/realms\/([^/]+)\/?$/);
    this.baseUrl = match ? match[1] : cfg.get<string>("KEYCLOAK_URL", "https://sso.cfo.org.br");
    this.realm = match ? match[2] : cfg.get<string>("KEYCLOAK_REALM", "cfo");
    this.svcClientId = cfg.get<string>("KEYCLOAK_ADMIN_USER", "");
    this.svcClientSecret = cfg.get<string>("KEYCLOAK_ADMIN_PASSWORD", "");
    const insecureTls = cfg.get<string>("KEYCLOAK_JWKS_TLS_INSECURE") === "true";
    this.axiosConfig = insecureTls
      ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
      : {};
  }

  /* Obtém token de admin via credenciais do realm master.
     Se não configurado, usa o token do usuário logado como fallback. */
  async resolveAdminToken(userToken: string): Promise<string> {
    if (!this.svcClientId || !this.svcClientSecret) return userToken;
    try {
      const res = await axios.post<{ access_token: string }>(
        `${this.baseUrl}/realms/master/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: "password",
          client_id: "admin-cli",
          username: this.svcClientId,
          password: this.svcClientSecret
        }).toString(),
        {
          ...this.axiosConfig,
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        }
      );
      return res.data.access_token;
    } catch {
      return userToken;
    }
  }

  private async adminGet<T>(path: string, token: string): Promise<T | null> {
    try {
      const res = await axios.get<T>(`${this.baseUrl}/admin/realms/${this.realm}${path}`, {
        ...this.axiosConfig,
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    } catch {
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
