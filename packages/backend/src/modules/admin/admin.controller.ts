import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  Request
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { KeycloakAdminService } from "./keycloak-admin.service";

interface AuthRequest {
  user: { isSuperAdmin?: boolean };
  headers: { authorization?: string };
}

function extractToken(req: AuthRequest): string {
  const auth = req.headers.authorization ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}

@Controller("admin")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ponto-admin", "PONTO_ADMIN")
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kcAdmin: KeycloakAdminService
  ) {}

  /* ─── Grupos do Keycloak ─── */

  @Get("keycloak/grupos")
  async listarGruposKeycloak(@Request() req: AuthRequest) {
    const tk = extractToken(req);
    const [{ available, grupos: kcGrupos }, mapeamentos] = await Promise.all([
      this.kcAdmin.listGroups(tk),
      this.prisma.grupoSistema.findMany()
    ]);
    const mapaDB = Object.fromEntries(mapeamentos.map((g) => [g.grupoId, g]));
    return {
      available,
      grupos: kcGrupos.map((g) => ({
        id: g.id,
        nome: g.name,
        path: g.path,
        papeis: (mapaDB[g.id] as { papeis: string[] } | undefined)?.papeis ?? [],
        subGrupos: g.subGroups?.map((sg) => ({
          id: sg.id,
          nome: sg.name,
          path: sg.path,
          papeis: (mapaDB[sg.id] as { papeis: string[] } | undefined)?.papeis ?? []
        }))
      }))
    };
  }

  @Put("keycloak/grupos/:id/papeis")
  async atualizarPapeisGrupo(
    @Param("id") id: string,
    @Body() body: { grupoNome: string; papeis: string[] }
  ) {
    return this.prisma.grupoSistema.upsert({
      where: { grupoId: id },
      create: { grupoId: id, grupoNome: body.grupoNome, papeis: body.papeis },
      update: { grupoNome: body.grupoNome, papeis: body.papeis }
    });
  }

  @Delete("keycloak/grupos/:id/papeis")
  async removerPapeisGrupo(@Param("id") id: string) {
    await this.prisma.grupoSistema.deleteMany({ where: { grupoId: id } });
    return { ok: true };
  }

  /* ─── Usuários ─── */

  @Get("keycloak/usuarios")
  async listarUsuarios(@Request() req: AuthRequest, @Query("search") search?: string) {
    return this.kcAdmin.listUsers(extractToken(req), search);
  }

  @Get("keycloak/usuarios/:id/grupos")
  async gruposDoUsuario(@Request() req: AuthRequest, @Param("id") id: string) {
    const tk = extractToken(req);
    const [grupos, mapeamentos] = await Promise.all([
      this.kcAdmin.getUserGroups(id, tk),
      this.prisma.grupoSistema.findMany()
    ]);
    const mapaDB = Object.fromEntries(mapeamentos.map((g) => [g.grupoId, g]));
    return grupos.map((g) => ({
      id: g.id,
      nome: g.name,
      papeis: (mapaDB[g.id] as { papeis: string[] } | undefined)?.papeis ?? []
    }));
  }

  @Get("grupos-sistema")
  listarMapeamentos() {
    return this.prisma.grupoSistema.findMany({ orderBy: { grupoNome: "asc" } });
  }
}
