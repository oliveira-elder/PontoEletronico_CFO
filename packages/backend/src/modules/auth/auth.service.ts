import { Injectable } from "@nestjs/common";

export interface AuthContext {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
  groups: string[];
}

@Injectable()
export class AuthService {
  mapTokenPayload(payload: Record<string, unknown>): AuthContext {
    const realmAccess = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
    const groups = Array.isArray(payload.groups) ? (payload.groups as string[]) : [];
    return {
      sub: String(payload.sub),
      email: payload.email ? String(payload.email) : undefined,
      name: payload.name ? String(payload.name) : undefined,
      roles: realmAccess,
      groups
    };
  }
}
