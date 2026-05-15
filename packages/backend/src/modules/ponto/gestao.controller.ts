import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { GestaoService } from "./gestao.service";

@Controller("ponto/gestao")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class GestaoController {
  constructor(private readonly gestaoService: GestaoService) {}

  /* ─── Gerências ─── */

  @Get("gerencias")
  @Roles("gestor", "ponto-admin")
  listGerencias() {
    return this.gestaoService.listGerencias();
  }

  @Post("gerencias")
  @Roles("ponto-admin")
  createGerencia(
    @Body() body: { nome: string; sigla: string; responsavel?: string; descricao?: string }
  ) {
    return this.gestaoService.createGerencia(body);
  }

  @Put("gerencias/:id")
  @Roles("ponto-admin")
  updateGerencia(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      nome: string;
      sigla: string;
      responsavel: string;
      descricao: string;
      ativa: boolean;
    }>
  ) {
    return this.gestaoService.updateGerencia(id, body);
  }

  @Delete("gerencias/:id")
  @Roles("ponto-admin")
  deleteGerencia(@Param("id") id: string) {
    return this.gestaoService.deleteGerencia(id);
  }

  /* ─── Funcionários ─── */

  @Get("funcionarios")
  @Roles("gestor", "ponto-admin")
  listFuncionarios() {
    return this.gestaoService.listFuncionarios();
  }

  @Post("funcionarios")
  @Roles("gestor", "ponto-admin")
  createFuncionario(
    @Body()
    body: {
      nome: string;
      email: string;
      matricula: string;
      cargo: string;
      cpf?: string;
      categoria: string;
      gerenciaId?: string;
    }
  ) {
    return this.gestaoService.createFuncionario(body);
  }

  @Put("funcionarios/:id")
  @Roles("gestor", "ponto-admin")
  updateFuncionario(
    @Param("id") id: string,
    @Body()
    body: Partial<{
      nome: string;
      email: string;
      cargo: string;
      categoria: string;
      gerenciaId: string;
      ativo: boolean;
    }>
  ) {
    return this.gestaoService.updateFuncionario(id, body);
  }

  @Delete("funcionarios/:id")
  @Roles("ponto-admin")
  deleteFuncionario(@Param("id") id: string) {
    return this.gestaoService.deleteFuncionario(id);
  }
}
