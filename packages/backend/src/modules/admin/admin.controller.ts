import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  Request,
  BadRequestException,
  ForbiddenException
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

function assertSuperAdmin(req: AuthRequest) {
  if (!req.user?.isSuperAdmin) {
    throw new ForbiddenException("Acesso restrito a Super Admin.");
  }
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
    assertSuperAdmin(req);
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
    @Request() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { grupoNome: string; papeis: string[] }
  ) {
    assertSuperAdmin(req);
    return this.prisma.grupoSistema.upsert({
      where: { grupoId: id },
      create: { grupoId: id, grupoNome: body.grupoNome, papeis: body.papeis },
      update: { grupoNome: body.grupoNome, papeis: body.papeis }
    });
  }

  @Delete("keycloak/grupos/:id/papeis")
  async removerPapeisGrupo(@Request() req: AuthRequest, @Param("id") id: string) {
    assertSuperAdmin(req);
    await this.prisma.grupoSistema.deleteMany({ where: { grupoId: id } });
    return { ok: true };
  }

  /* ─── Usuários ─── */

  @Get("keycloak/usuarios")
  async listarUsuarios(@Request() req: AuthRequest, @Query("search") search?: string) {
    assertSuperAdmin(req);
    return this.kcAdmin.listUsers(extractToken(req), search);
  }

  @Get("keycloak/usuarios/:id/grupos")
  async gruposDoUsuario(@Request() req: AuthRequest, @Param("id") id: string) {
    assertSuperAdmin(req);
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
  listarMapeamentos(@Request() req: AuthRequest) {
    assertSuperAdmin(req);
    return this.prisma.grupoSistema.findMany({ orderBy: { grupoNome: "asc" } });
  }

  /* ─── Usuários locais (banco interno) ─── */

  @Get("usuarios")
  async listarUsuariosLocais(@Request() req: AuthRequest, @Query("search") search?: string) {
    assertSuperAdmin(req);
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { emailReal: { contains: search, mode: "insensitive" as const } }
          ]
        }
      : undefined;

    return this.prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        emailReal: true,
        externalId: true,
        createdAt: true,
        funcionario: {
          select: {
            id: true,
            matricula: true,
            cargo: true,
            ativo: true,
            categoria: true,
            gerencia: { select: { id: true, nome: true, sigla: true } }
          }
        }
      }
    });
  }

  @Patch("usuarios/:id/email-real")
  async definirEmailReal(
    @Request() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: { emailReal: string | null }
  ) {
    assertSuperAdmin(req);
    if (body.emailReal !== null) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.emailReal)) {
        throw new BadRequestException("Formato de e-mail inválido.");
      }
      const existente = await this.prisma.user.findFirst({
        where: { emailReal: body.emailReal, NOT: { id } }
      });
      if (existente) {
        throw new BadRequestException("E-mail já cadastrado para outro usuário.");
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { emailReal: body.emailReal },
      select: { id: true, name: true, email: true, emailReal: true }
    });
  }
}
