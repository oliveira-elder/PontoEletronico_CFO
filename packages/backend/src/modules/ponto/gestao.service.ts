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

  async setResponsavelGerencia(id: string, responsavelUserId: string | null) {
    let responsavelNome: string | undefined;
    let responsavelMatricula: string | null | undefined;
    if (responsavelUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: responsavelUserId },
        include: { funcionario: { select: { matricula: true } } }
      });
      if (!user) throw new NotFoundException("Usuário responsável não encontrado.");
      responsavelNome = user.name;
      responsavelMatricula = user.funcionario?.matricula ?? null;
    }
    return this.prisma.gerencia.update({
      where: { id },
      data: {
        responsavelUserId,
        responsavelMatricula,
        ...(responsavelNome ? { responsavel: responsavelNome } : {})
      },
      include: {
        responsavelUser: { select: { id: true, name: true, email: true } },
        _count: { select: { funcionarios: true } }
      }
    });
  }

  deleteGerencia(id: string) {
    return this.prisma.gerencia.delete({ where: { id } });
  }

  /* ─── Funcionários ─── */

  listFuncionarios() {
    return this.prisma.funcionario.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true, emailReal: true } },
        gerencia: { select: { id: true, nome: true, sigla: true } },
        jornadaPeriodo: { select: { id: true, nome: true, ePadrao: true } },
        enderecoResidencial: true,
        requerimentoEndereco: {
          select: { id: true, status: true, criadoEm: true, respondidoEm: true }
        }
      }
    });
  }

  criarRequerimentoEndereco(funcionarioId: string) {
    return this.prisma.requerimentoEndereco.upsert({
      where: { funcionarioId },
      create: { funcionarioId, status: "PENDENTE" },
      update: { status: "PENDENTE", respondidoEm: null, criadoEm: new Date() }
    });
  }

  async criarRequerimentoEnderecoTodos() {
    const ativos = await this.prisma.funcionario.findMany({
      where: { ativo: true },
      select: { id: true }
    });
    const agora = new Date();
    await this.prisma.$transaction(
      ativos.map((f) =>
        this.prisma.requerimentoEndereco.upsert({
          where: { funcionarioId: f.id },
          create: { funcionarioId: f.id, status: "PENDENTE" },
          update: { status: "PENDENTE", respondidoEm: null, criadoEm: agora }
        })
      )
    );
    return { total: ativos.length };
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
          cpf: data.cpf ?? null,
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
      matricula: string;
      cpf: string;
      cargo: string;
      categoria: string;
      gerenciaId: string;
      subsecao: string | null;
      ativo: boolean;
      dataNascimento: string | null;
      dataAdmissao: string | null;
      modoHomeOffice: boolean;
      modoHibridoLocal: boolean;
    }>
  ) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id },
      include: { user: true }
    });
    if (!func) throw new NotFoundException("Funcionário não encontrado");

    const {
      nome,
      email,
      matricula,
      cpf,
      dataNascimento,
      cargo,
      categoria,
      gerenciaId,
      subsecao,
      ativo,
      modoHomeOffice,
      modoHibridoLocal
    } = data;

    await this.prisma.$transaction(async (tx) => {
      const userUpdate: Record<string, string> = {};
      if (nome !== undefined && nome !== "") userUpdate.name = nome;
      if (email !== undefined && email !== "") userUpdate.email = email;
      if (Object.keys(userUpdate).length) {
        await tx.user.update({ where: { id: func.userId }, data: userUpdate });
      }
      const funcUpdate: {
        matricula?: string | null;
        cpf?: string | null;
        cargo?: string;
        categoria?: CategoriaFuncional;
        gerenciaId?: string | null;
        subsecao?: string | null;
        ativo?: boolean;
        dataNascimento?: Date | null;
        modoHomeOffice?: boolean;
        modoHibridoLocal?: boolean;
      } = {};
      if (matricula !== undefined) funcUpdate.matricula = matricula || null;
      if (cpf !== undefined) funcUpdate.cpf = cpf || null;
      if (cargo !== undefined) funcUpdate.cargo = cargo;
      if (categoria !== undefined) funcUpdate.categoria = categoria as CategoriaFuncional;
      if (gerenciaId !== undefined) funcUpdate.gerenciaId = gerenciaId || null;
      if (subsecao !== undefined) funcUpdate.subsecao = subsecao || null;
      if (ativo !== undefined) funcUpdate.ativo = ativo;
      if (dataNascimento !== undefined) {
        funcUpdate.dataNascimento = dataNascimento ? new Date(dataNascimento) : null;
      }
      if ((data as Record<string, unknown>).dataAdmissao !== undefined) {
        const da = (data as Record<string, unknown>).dataAdmissao as string | null;
        (funcUpdate as Record<string, unknown>).dataAdmissao = da ? new Date(da) : null;
      }
      if (modoHomeOffice !== undefined) funcUpdate.modoHomeOffice = modoHomeOffice;
      if (modoHibridoLocal !== undefined) funcUpdate.modoHibridoLocal = modoHibridoLocal;
      if (Object.keys(funcUpdate).length) {
        await tx.funcionario.update({ where: { id }, data: funcUpdate });
      }
    });

    return this.prisma.funcionario.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, emailReal: true } },
        gerencia: { select: { id: true, nome: true, sigla: true } },
        jornadaPeriodo: { select: { id: true, nome: true, ePadrao: true } },
        enderecoResidencial: true,
        requerimentoEndereco: {
          select: { id: true, status: true, criadoEm: true, respondidoEm: true }
        }
      }
    });
  }

  getEndereco(funcionarioId: string) {
    return this.prisma.enderecoResidencial.findUnique({ where: { funcionarioId } });
  }

  async upsertEndereco(
    funcionarioId: string,
    data: {
      cep?: string;
      logradouro?: string;
      numero?: string;
      complemento?: string;
      bairro?: string;
      cidade?: string;
      uf?: string;
      lat?: number | null;
      lng?: number | null;
      raioMetros?: number;
    }
  ) {
    const { lat, lng, raioMetros, ...addr } = data;
    const payload = {
      ...addr,
      lat: lat ?? null,
      lng: lng ?? null,
      raioMetros: raioMetros ?? 20
    };
    return this.prisma.enderecoResidencial.upsert({
      where: { funcionarioId },
      create: { funcionarioId, ...payload },
      update: payload
    });
  }

  async setModalidade(id: string, modoHomeOffice: boolean, modoHibridoLocal: boolean) {
    const update: { modoHomeOffice: boolean; modoHibridoLocal: boolean } = {
      modoHomeOffice,
      modoHibridoLocal
    };
    return this.prisma.funcionario.update({
      where: { id },
      data: update,
      select: { id: true, modoHomeOffice: true, modoHibridoLocal: true }
    });
  }

  async setJornadaPeriodo(id: string, jornadaPeriodoId: string | null) {
    const agora = new Date();

    const atual = await this.prisma.funcionario.findUnique({
      where: { id },
      select: {
        jornadaPeriodoId: true,
        jornadaPeriodoDesde: true,
        jornadaPeriodoAssociadoEm: true
      }
    });

    let jornadaPeriodoDesde: Date | null = null;
    let jornadaPeriodoAssociadoEm: Date | null = null;

    if (jornadaPeriodoId) {
      const mesmoPeriodo =
        atual?.jornadaPeriodoId === jornadaPeriodoId && atual.jornadaPeriodoAssociadoEm;
      if (mesmoPeriodo) {
        jornadaPeriodoAssociadoEm = atual.jornadaPeriodoAssociadoEm;
        jornadaPeriodoDesde = atual.jornadaPeriodoDesde;
      } else {
        jornadaPeriodoAssociadoEm = agora;
        const diaBr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(agora);
        jornadaPeriodoDesde = new Date(`${diaBr}T12:00:00-03:00`);
      }
    }

    return this.prisma.funcionario.update({
      where: { id },
      data: {
        jornadaPeriodoId: jornadaPeriodoId || null,
        jornadaPeriodoDesde,
        jornadaPeriodoAssociadoEm
      },
      include: {
        user: { select: { id: true, name: true, email: true, emailReal: true } },
        gerencia: { select: { id: true, nome: true, sigla: true } },
        jornadaPeriodo: true
      }
    });
  }

  deleteFuncionario(id: string) {
    return this.prisma.funcionario.delete({ where: { id } });
  }
}
