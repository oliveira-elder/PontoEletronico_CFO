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

/** Usuário do Keycloak com os campos que indicam conta federada ao AD e estado (habilitado). */
export interface KcUserDetalhe extends KcUser {
  /** Preenchido quando a conta vem da federação com o AD (LDAP). */
  federationLink?: string;
  attributes?: Record<string, string[]>;
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

  /** Token de serviço em cache (evita um login a cada consulta) e o realm em que ele funcionou. */
  private tokenServico: { token: string; expira: number; realm: string } | null = null;

  /* Obtém token de admin com a credencial de serviço (KEYCLOAK_ADMIN_USER/PASSWORD): tenta o realm
     master e, se a conta não existir lá, o realm do sistema (KEYCLOAK_ISSUER). Sem credencial ou se
     nenhuma funcionar, usa o token do usuário logado como alternativa. */
  async resolveAdminToken(userToken: string): Promise<string> {
    if (!this.svcClientId || !this.svcClientSecret) return userToken;
    if (this.tokenServico && this.tokenServico.expira > Date.now() + 15_000) {
      return this.tokenServico.token;
    }
    const ordem = [...new Set([this.tokenServico?.realm ?? "master", "master", this.realm])];
    for (const realm of ordem) {
      try {
        const res = await axios.post<{ access_token: string; expires_in?: number }>(
          `${this.baseUrl}/realms/${realm}/protocol/openid-connect/token`,
          new URLSearchParams({
            grant_type: "password",
            client_id: "admin-cli",
            username: this.svcClientId.trim(),
            password: this.svcClientSecret
          }).toString(),
          {
            ...this.axiosConfig,
            timeout: 15_000,
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
          }
        );
        this.tokenServico = {
          token: res.data.access_token,
          expira: Date.now() + (res.data.expires_in ?? 60) * 1000,
          realm
        };
        return res.data.access_token;
      } catch {
        /* tenta o próximo realm */
      }
    }
    this.tokenServico = null;
    return userToken;
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

  /**
   * Consulta EXATA por nome de usuário. `disponivel = false` quando a API Admin não responde (sem credencial
   * de serviço ou token sem permissão): quem chama deve falhar fechado, nunca assumir "não existe".
   */
  async buscarUsuarioExato(
    username: string,
    userToken = ""
  ): Promise<{ disponivel: boolean; usuario: KcUserDetalhe | null }> {
    const token = await this.resolveAdminToken(userToken);
    const params = new URLSearchParams({ username, exact: "true" });
    const data = await this.adminGet<KcUserDetalhe[]>(`/users?${params}`, token);
    if (data === null) return { disponivel: false, usuario: null };
    const alvo = username.trim().toLowerCase();
    return {
      disponivel: true,
      usuario: data.find((u) => u.username?.toLowerCase() === alvo) ?? null
    };
  }

  async getUserGroups(userId: string, userToken: string): Promise<KcGroup[]> {
    const token = await this.resolveAdminToken(userToken);
    const data = await this.adminGet<KcGroup[]>(`/users/${userId}/groups`, token);
    return data ?? [];
  }
}
