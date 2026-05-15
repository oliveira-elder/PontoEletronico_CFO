import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

  constructor(private readonly cfg: ConfigService) {
    const issuer = cfg.get<string>("KEYCLOAK_ISSUER", "");
    const match = issuer.match(/^(.+)\/realms\/([^/]+)$/);
    this.baseUrl = match ? match[1] : "";
    this.realm = match ? match[2] : "cfo";
    this.svcClientId = cfg.get<string>("KEYCLOAK_ADMIN_USER", "");
    this.svcClientSecret = cfg.get<string>("KEYCLOAK_ADMIN_PASSWORD", "");
  }

  /* Obtém token de admin via credenciais do realm master.
     Se não configurado, usa o token do usuário logado como fallback. */
  async resolveAdminToken(userToken: string): Promise<string> {
    if (!this.svcClientId || !this.svcClientSecret) return userToken;
    const res = await fetch(`${this.baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: this.svcClientId,
        password: this.svcClientSecret
      }).toString()
    });
    if (!res.ok) return userToken;
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  private async admin(path: string, token: string) {
    return fetch(`${this.baseUrl}/admin/realms/${this.realm}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /* Retorna null quando a API admin não está acessível (sem lançar erro). */
  private async tryAdmin(path: string, token: string): Promise<unknown[] | null> {
    try {
      const res = await this.admin(path, token);
      if (!res.ok) return null;
      return res.json() as Promise<unknown[]>;
    } catch {
      return null;
    }
  }

  async listGroups(userToken: string): Promise<{ available: boolean; grupos: KcGroup[] }> {
    const token = await this.resolveAdminToken(userToken);
    const data = await this.tryAdmin("/groups?briefRepresentation=false&max=500", token);
    return { available: data !== null, grupos: (data as KcGroup[] | null) ?? [] };
  }

  async listUsers(
    userToken: string,
    search?: string
  ): Promise<{ available: boolean; usuarios: KcUser[] }> {
    const token = await this.resolveAdminToken(userToken);
    const params = new URLSearchParams({ max: "200" });
    if (search) params.set("search", search);
    const data = await this.tryAdmin(`/users?${params}`, token);
    return { available: data !== null, usuarios: (data as KcUser[] | null) ?? [] };
  }

  async getUserGroups(userId: string, userToken: string): Promise<KcGroup[]> {
    const token = await this.resolveAdminToken(userToken);
    const data = await this.tryAdmin(`/users/${userId}/groups`, token);
    return (data as KcGroup[] | null) ?? [];
  }
}
