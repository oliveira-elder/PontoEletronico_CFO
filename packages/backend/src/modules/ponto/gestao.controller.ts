import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { GestaoService } from "./gestao.service";

@Controller("ponto/gestao")
@UseGuards(AuthGuard("jwt"))
export class GestaoController {
  constructor(private readonly gestaoService: GestaoService) {}

  /* ─── Gerências ─── */

  @Get("gerencias")
  listGerencias() {
    return this.gestaoService.listGerencias();
  }

  @Post("gerencias")
  createGerencia(
    @Body() body: { nome: string; sigla: string; responsavel?: string; descricao?: string }
  ) {
    return this.gestaoService.createGerencia(body);
  }

  @Put("gerencias/:id")
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
  deleteGerencia(@Param("id") id: string) {
    return this.gestaoService.deleteGerencia(id);
  }

  /* ─── Funcionários ─── */

  @Get("funcionarios")
  listFuncionarios() {
    return this.gestaoService.listFuncionarios();
  }

  @Post("funcionarios")
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
  deleteFuncionario(@Param("id") id: string) {
    return this.gestaoService.deleteFuncionario(id);
  }
}
