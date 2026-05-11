import { Injectable, NotFoundException } from "@nestjs/common";
import { CategoriaFuncional } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class GestaoService {
  constructor(private readonly prisma: PrismaService) {}

  /* ─── Gerências ─── */

  listGerencias() {
    return this.prisma.gerencia.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { funcionarios: true } } }
    });
  }

  createGerencia(data: { nome: string; sigla: string; responsavel?: string; descricao?: string }) {
    return this.prisma.gerencia.create({ data });
  }

  updateGerencia(
    id: string,
    data: Partial<{
      nome: string;
      sigla: string;
      responsavel: string;
      descricao: string;
      ativa: boolean;
    }>
  ) {
    return this.prisma.gerencia.update({ where: { id }, data });
  }

  deleteGerencia(id: string) {
    return this.prisma.gerencia.delete({ where: { id } });
  }

  /* ─── Funcionários ─── */

  listFuncionarios() {
    return this.prisma.funcionario.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        gerencia: { select: { id: true, nome: true, sigla: true } }
      }
    });
  }

  async createFuncionario(data: {
    nome: string;
    email: string;
    matricula: string;
    cargo: string;
    cpf?: string;
    categoria: string;
    gerenciaId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: data.nome, email: data.email }
      });
      return tx.funcionario.create({
        data: {
          userId: user.id,
          matricula: data.matricula,
          cargo: data.cargo,
          categoria: data.categoria as CategoriaFuncional,
          gerenciaId: data.gerenciaId ?? null
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          gerencia: { select: { id: true, nome: true, sigla: true } }
        }
      });
    });
  }

  async updateFuncionario(
    id: string,
    data: Partial<{
      nome: string;
      email: string;
      cargo: string;
      categoria: string;
      gerenciaId: string;
      ativo: boolean;
    }>
  ) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id },
      include: { user: true }
    });
    if (!func) throw new NotFoundException("Funcionário não encontrado");

    const { nome, email, ...funcData } = data;

    await this.prisma.$transaction(async (tx) => {
      if (nome || email) {
        await tx.user.update({ where: { id: func.userId }, data: { name: nome, email } });
      }
      if (Object.keys(funcData).length) {
        await tx.funcionario.update({
          where: { id },
          data: funcData as Partial<{
            cargo: string;
            categoria: CategoriaFuncional;
            gerenciaId: string;
            ativo: boolean;
          }>
        });
      }
    });

    return this.prisma.funcionario.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        gerencia: { select: { id: true, nome: true, sigla: true } }
      }
    });
  }

  deleteFuncionario(id: string) {
    return this.prisma.funcionario.delete({ where: { id } });
  }
}
