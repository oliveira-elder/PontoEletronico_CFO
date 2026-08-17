import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CategoriaFuncional, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { dataBrasiliaISO, hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { NotificacaoService } from "../notificacao/notificacao.service";
import { categoriaSemRegistroPonto } from "../../utils/categoria-jornada";
import {
  ensureCategoriaHistorico,
  registrarMudancaCategoria
} from "../../utils/categoria-historico";

export type SubstituicaoPayload = {
  substitutoId: string | null;
  dataInicio: string | null;
  dataFim: string | null;
};

@Injectable()
export class GestaoService {
  private readonly logger = new Logger(GestaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacaoService: NotificacaoService
  ) {}

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

  private substituicaoInclude = {
    where: { status: { in: ["AGENDADA", "ATIVA"] } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: {
      id: true,
      status: true,
      dataInicio: true,
      dataFim: true,
      titularId: true,
      substitutoId: true,
      gerenciaId: true,
      substituto: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } }
        }
      },
      titular: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } }
        }
      }
    }
  };

  async listFuncionarios() {
    const list = await this.prisma.funcionario.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true, emailReal: true } },
        gerencia: { select: { id: true, nome: true, sigla: true } },
        jornadaPeriodo: { select: { id: true, nome: true, ePadrao: true } },
        enderecoResidencial: true,
        requerimentoEndereco: {
          select: { id: true, status: true, criadoEm: true, respondidoEm: true }
        },
        supervisorEstagio: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true } }
          }
        },
        substituicoesComoTitular: this.substituicaoInclude,
        substituicoesComoSubstituto: this.substituicaoInclude
      }
    });

    return list.map((f) => this.enrichFuncionarioSubstituicao(f));
  }

  private enrichFuncionarioSubstituicao<
    T extends {
      id: string;
      isManager: boolean;
      substituicoesComoTitular?: Array<{ status: string }>;
      substituicoesComoSubstituto?: Array<{ status: string }>;
    }
  >(f: T) {
    const comoTitular = f.substituicoesComoTitular?.[0] ?? null;
    const comoSubstituto = f.substituicoesComoSubstituto?.[0] ?? null;
    const substituicaoAtiva =
      (comoSubstituto?.status === "ATIVA" ? comoSubstituto : null) ??
      (comoTitular?.status === "ATIVA" ? comoTitular : null);
    const substituicaoPendente = comoTitular?.status === "AGENDADA" ? comoTitular : null;

    return {
      ...f,
      ehGerenteSubstituto: comoSubstituto?.status === "ATIVA",
      ehTitularEmSubstituicao: comoTitular?.status === "ATIVA",
      substituicao: substituicaoAtiva ?? substituicaoPendente ?? comoTitular ?? null
    };
  }

  private funcionarioDetailInclude() {
    return {
      user: { select: { id: true, name: true, email: true, emailReal: true } },
      gerencia: { select: { id: true, nome: true, sigla: true } },
      jornadaPeriodo: { select: { id: true, nome: true, ePadrao: true } },
      enderecoResidencial: true,
      requerimentoEndereco: {
        select: { id: true, status: true, criadoEm: true, respondidoEm: true }
      },
      supervisorEstagio: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } }
        }
      },
      substituicoesComoTitular: this.substituicaoInclude,
      substituicoesComoSubstituto: this.substituicaoInclude
    } satisfies Prisma.FuncionarioInclude;
  }

  async getFuncionario(id: string) {
    const f = await this.prisma.funcionario.findUnique({
      where: { id },
      include: this.funcionarioDetailInclude()
    });
    if (!f) throw new NotFoundException("Funcionário não encontrado");
    return this.enrichFuncionarioSubstituicao(f);
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
      const hoje = hojeBrasiliaISO();
      const cat = data.categoria as CategoriaFuncional;
      const pontoObrigatorioDesde = categoriaSemRegistroPonto(cat)
        ? null
        : new Date(`${hoje}T12:00:00-03:00`);
      const funcionario = await tx.funcionario.create({
        data: {
          userId: user.id,
          matricula: data.matricula,
          cargo: data.cargo,
          cpf: data.cpf,
          categoria: cat,
          gerenciaId: data.gerenciaId,
          pontoObrigatorioDesde
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          gerencia: { select: { id: true, nome: true, sigla: true } }
        }
      });
      await tx.funcionarioCategoriaHistorico.create({
        data: {
          funcionarioId: funcionario.id,
          categoria: cat,
          vigenciaDesde: new Date(`${hoje}T12:00:00-03:00`),
          vigenciaAte: null
        }
      });
      return funcionario;
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
      supervisorEstagioId: string | null;
      substitutoId: string | null;
      substitutoDataInicio: string | null;
      substitutoDataFim: string | null;
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
      modoHibridoLocal,
      supervisorEstagioId,
      substitutoId,
      substitutoDataInicio,
      substitutoDataFim
    } = data;

    const categoriaFinal = (categoria ?? func.categoria) as CategoriaFuncional;
    const gerenciaFinal = gerenciaId !== undefined ? gerenciaId || null : func.gerenciaId;
    const isEstagio = categoriaFinal === "ESTAGIARIO" || categoriaFinal === "MENOR_APRENDIZ";

    if (supervisorEstagioId !== undefined && supervisorEstagioId) {
      if (!isEstagio) {
        throw new BadRequestException(
          "Supervisor de estágio só se aplica a Estagiário ou Menor Aprendiz."
        );
      }
      if (supervisorEstagioId === id) {
        throw new BadRequestException("O funcionário não pode ser supervisor de si mesmo.");
      }
      const supervisor = await this.prisma.funcionario.findUnique({
        where: { id: supervisorEstagioId },
        select: { id: true, gerenciaId: true, ativo: true, categoria: true }
      });
      if (!supervisor) throw new NotFoundException("Supervisor de estágio não encontrado.");
      if (!supervisor.ativo) {
        throw new BadRequestException("O supervisor de estágio precisa estar ativo.");
      }
      if (supervisor.categoria === "ESTAGIARIO" || supervisor.categoria === "MENOR_APRENDIZ") {
        throw new BadRequestException(
          "Estagiário e Menor Aprendiz não podem ser supervisor de estágio. Escolha um concursado, assessor ou gerente da mesma gerência."
        );
      }
      if (!gerenciaFinal || supervisor.gerenciaId !== gerenciaFinal) {
        throw new BadRequestException("O supervisor de estágio deve pertencer à mesma gerência.");
      }
    }

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
        supervisorEstagioId?: string | null;
      } = {};
      if (matricula !== undefined) funcUpdate.matricula = matricula || null;
      if (cpf !== undefined) funcUpdate.cpf = cpf || null;
      if (cargo !== undefined) funcUpdate.cargo = cargo;
      if (categoria !== undefined) {
        const novaCat = categoria as CategoriaFuncional;
        if (novaCat !== func.categoria) {
          /* Histórico ANTES de alterar funcionario.categoria (seed usa a categoria antiga). */
          await ensureCategoriaHistorico(tx, id);
          const { desdeNova } = await registrarMudancaCategoria(tx, id, novaCat);

          const eraSemRegistro = categoriaSemRegistroPonto(func.categoria);
          const seraComRegistro = !categoriaSemRegistroPonto(novaCat);
          /* Retorno Assessor/Gerente → categoria com ponto:
             obrigação só a partir do dia seguinte à mudança (desdeNova). */
          if (eraSemRegistro && seraComRegistro && !func.pontoObrigatorioDesde) {
            (funcUpdate as Record<string, unknown>).pontoObrigatorioDesde = new Date(
              `${desdeNova}T12:00:00-03:00`
            );
          }
        }
        funcUpdate.categoria = novaCat;
      }
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
      if (supervisorEstagioId !== undefined || categoria !== undefined) {
        funcUpdate.supervisorEstagioId = isEstagio
          ? supervisorEstagioId !== undefined
            ? supervisorEstagioId || null
            : func.supervisorEstagioId
          : null;
      }
      if (Object.keys(funcUpdate).length) {
        await tx.funcionario.update({ where: { id }, data: funcUpdate });
      }
    });

    const desativou = ativo === false && func.ativo === true;
    if (desativou) {
      void this.notificacaoService
        .notificarRhPapelCriticoDesativado(id)
        .catch((e) =>
          this.logger.error(`Falha ao notificar RH sobre desativação crítica (${id}): ${e}`)
        );
    }

    if (
      substitutoId !== undefined ||
      substitutoDataInicio !== undefined ||
      substitutoDataFim !== undefined
    ) {
      await this.configurarSubstituicao(id, {
        substitutoId: substitutoId ?? null,
        dataInicio: substitutoDataInicio ?? null,
        dataFim: substitutoDataFim ?? null,
        categoriaTitular: categoriaFinal,
        gerenciaId: gerenciaFinal
      });
    } else if (categoria !== undefined && categoriaFinal !== "GERENTE") {
      await this.cancelarSubstituicoesTitular(id);
    }

    await this.processarSubstituicoesPendentes();

    return this.getFuncionario(id);
  }

  /* ─── Gerente substituto ─── */

  async configurarSubstituicao(
    titularId: string,
    opts: {
      substitutoId: string | null;
      dataInicio: string | null;
      dataFim: string | null;
      categoriaTitular: CategoriaFuncional;
      gerenciaId: string | null;
    }
  ) {
    const { substitutoId, dataInicio, dataFim, categoriaTitular, gerenciaId } = opts;

    if (!substitutoId) {
      await this.cancelarSubstituicoesTitular(titularId);
      return null;
    }

    if (categoriaTitular !== "GERENTE") {
      throw new BadRequestException(
        "Somente funcionários na categoria Gerente podem ter substituto."
      );
    }
    if (!gerenciaId) {
      throw new BadRequestException("O gerente precisa estar vinculado a uma gerência.");
    }
    if (!dataInicio || !dataFim) {
      throw new BadRequestException("Informe o período (início e fim) da substituição.");
    }
    if (dataFim < dataInicio) {
      throw new BadRequestException("A data fim deve ser igual ou posterior à data início.");
    }
    if (substitutoId === titularId) {
      throw new BadRequestException("O gerente não pode ser substituto de si mesmo.");
    }

    const substituto = await this.prisma.funcionario.findUnique({
      where: { id: substitutoId },
      select: {
        id: true,
        gerenciaId: true,
        categoria: true,
        isManager: true,
        ativo: true
      }
    });
    if (!substituto) throw new NotFoundException("Substituto não encontrado.");
    if (substituto.gerenciaId !== gerenciaId) {
      throw new BadRequestException(
        "O substituto deve pertencer à mesma gerência do gerente titular."
      );
    }
    const categoriasPermitidas: CategoriaFuncional[] = ["CONCURSADO", "ASSESSOR"];
    if (!categoriasPermitidas.includes(substituto.categoria)) {
      throw new BadRequestException(
        "O gerente só pode ser substituído por um Concursado ou Assessor."
      );
    }

    // Se já existe ATIVA/AGENDADA com o mesmo substituto, só atualiza as datas
    const existente = await this.prisma.gerenteSubstituicao.findFirst({
      where: {
        titularId,
        status: { in: ["AGENDADA", "ATIVA"] }
      },
      orderBy: { createdAt: "desc" }
    });

    if (existente && existente.substitutoId === substitutoId) {
      await this.prisma.gerenteSubstituicao.update({
        where: { id: existente.id },
        data: {
          gerenciaId,
          dataInicio: new Date(`${dataInicio}T12:00:00.000Z`),
          dataFim: new Date(`${dataFim}T12:00:00.000Z`)
        }
      });
      return existente;
    }

    // Encerra/cancela substituições anteriores do titular
    await this.cancelarSubstituicoesTitular(titularId);

    const criada = await this.prisma.gerenteSubstituicao.create({
      data: {
        gerenciaId,
        titularId,
        substitutoId,
        dataInicio: new Date(`${dataInicio}T12:00:00.000Z`),
        dataFim: new Date(`${dataFim}T12:00:00.000Z`),
        categoriaAnteriorSubstituto: substituto.categoria,
        isManagerAnteriorSubstituto: substituto.isManager,
        titularAtivoAnterior: true,
        status: "AGENDADA"
      }
    });

    return criada;
  }

  async cancelarSubstituicoesTitular(titularId: string) {
    const abertas = await this.prisma.gerenteSubstituicao.findMany({
      where: { titularId, status: { in: ["AGENDADA", "ATIVA"] } }
    });
    for (const s of abertas) {
      if (s.status === "ATIVA") {
        await this.encerrarSubstituicao(s.id);
      } else {
        await this.prisma.gerenteSubstituicao.update({
          where: { id: s.id },
          data: { status: "CANCELADA", endedAt: new Date() }
        });
      }
    }
  }

  /** IDs de funcionários sob substituição ativa (protegidos do sync Extensions). */
  async idsSobSubstituicaoAtiva(): Promise<{
    funcionarioIds: Set<string>;
    gerenciaIds: Set<string>;
  }> {
    const ativas = await this.prisma.gerenteSubstituicao.findMany({
      where: { status: "ATIVA" },
      select: { titularId: true, substitutoId: true, gerenciaId: true }
    });
    return {
      funcionarioIds: new Set(ativas.flatMap((s) => [s.titularId, s.substitutoId])),
      gerenciaIds: new Set(ativas.map((s) => s.gerenciaId))
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async cronSubstituicoes() {
    this.logger.log("Processando substituições de gerente…");
    await this.processarSubstituicoesPendentes();
  }

  async processarSubstituicoesPendentes() {
    const hoje = hojeBrasiliaISO();

    const agendadas = await this.prisma.gerenteSubstituicao.findMany({
      where: { status: "AGENDADA" }
    });
    for (const s of agendadas) {
      const ini = dataBrasiliaISO(s.dataInicio);
      const fim = dataBrasiliaISO(s.dataFim);
      if (hoje >= ini && hoje <= fim) {
        await this.aplicarSubstituicao(s.id);
      } else if (hoje > fim) {
        await this.prisma.gerenteSubstituicao.update({
          where: { id: s.id },
          data: { status: "CANCELADA", endedAt: new Date() }
        });
      }
    }

    const ativas = await this.prisma.gerenteSubstituicao.findMany({
      where: { status: "ATIVA" }
    });
    for (const s of ativas) {
      const fim = dataBrasiliaISO(s.dataFim);
      if (hoje > fim) {
        await this.encerrarSubstituicao(s.id);
      }
    }
  }

  private async aplicarSubstituicao(id: string) {
    const s = await this.prisma.gerenteSubstituicao.findUnique({
      where: { id },
      include: {
        titular: { select: { id: true, userId: true, ativo: true, matricula: true } },
        substituto: {
          select: {
            id: true,
            userId: true,
            categoria: true,
            isManager: true,
            matricula: true,
            user: { select: { name: true } }
          }
        }
      }
    });
    if (!s || s.status !== "AGENDADA") return;

    await this.prisma.$transaction(async (tx) => {
      await tx.funcionario.update({
        where: { id: s.titularId },
        data: { ativo: false }
      });
      await ensureCategoriaHistorico(tx, s.substitutoId);
      await registrarMudancaCategoria(tx, s.substitutoId, "GERENTE");
      await tx.funcionario.update({
        where: { id: s.substitutoId },
        data: {
          categoria: "GERENTE",
          isManager: true,
          ativo: true
        }
      });
      await tx.gerencia.update({
        where: { id: s.gerenciaId },
        data: {
          responsavelUserId: s.substituto.userId,
          responsavel: s.substituto.user.name,
          responsavelMatricula: s.substituto.matricula
        }
      });
      await tx.gerenteSubstituicao.update({
        where: { id: s.id },
        data: {
          status: "ATIVA",
          appliedAt: new Date(),
          titularAtivoAnterior: s.titular.ativo,
          categoriaAnteriorSubstituto: s.substituto.categoria,
          isManagerAnteriorSubstituto: s.substituto.isManager
        }
      });
    });

    // Titular desativado pela passagem de bastão — alerta RH se era supervisor de estágio
    if (s.titular.ativo) {
      void this.notificacaoService
        .notificarRhPapelCriticoDesativado(s.titularId)
        .catch((e) =>
          this.logger.error(
            `Falha ao notificar RH (titular desativado na substituição ${s.id}): ${e}`
          )
        );
    }

    this.logger.log(`Substituição aplicada: titular=${s.titularId} → substituto=${s.substitutoId}`);
  }

  private async encerrarSubstituicao(id: string) {
    const s = await this.prisma.gerenteSubstituicao.findUnique({
      where: { id },
      include: {
        titular: {
          select: {
            id: true,
            userId: true,
            matricula: true,
            user: { select: { name: true } }
          }
        },
        substituto: { select: { id: true } }
      }
    });
    if (!s || (s.status !== "ATIVA" && s.status !== "AGENDADA")) return;

    if (s.status === "AGENDADA") {
      await this.prisma.gerenteSubstituicao.update({
        where: { id: s.id },
        data: { status: "CANCELADA", endedAt: new Date() }
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.funcionario.update({
        where: { id: s.titularId },
        data: {
          ativo: s.titularAtivoAnterior,
          categoria: "GERENTE",
          isManager: true
        }
      });
      await ensureCategoriaHistorico(tx, s.substitutoId);
      await registrarMudancaCategoria(tx, s.substitutoId, s.categoriaAnteriorSubstituto);
      await tx.funcionario.update({
        where: { id: s.substitutoId },
        data: {
          categoria: s.categoriaAnteriorSubstituto,
          isManager: s.isManagerAnteriorSubstituto
        }
      });
      await tx.gerencia.update({
        where: { id: s.gerenciaId },
        data: {
          responsavelUserId: s.titular.userId,
          responsavel: s.titular.user.name,
          responsavelMatricula: s.titular.matricula
        }
      });
      await tx.gerenteSubstituicao.update({
        where: { id: s.id },
        data: { status: "ENCERRADA", endedAt: new Date() }
      });
    });

    this.logger.log(
      `Substituição encerrada: titular=${s.titularId} restaurado, substituto=${s.substitutoId}`
    );
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
    return this.prisma.enderecoResidencial.upsert({
      where: { funcionarioId },
      create: { funcionarioId, ...data, raioMetros: data.raioMetros ?? 100 },
      update: { ...data }
    });
  }

  setModalidade(funcionarioId: string, modoHomeOffice: boolean, modoHibridoLocal: boolean) {
    return this.prisma.funcionario.update({
      where: { id: funcionarioId },
      data: { modoHomeOffice, modoHibridoLocal }
    });
  }

  async setJornadaPeriodo(funcionarioId: string, jornadaPeriodoId: string | null) {
    const atual = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { jornadaPeriodoId: true }
    });
    if (!jornadaPeriodoId) {
      return this.prisma.funcionario.update({
        where: { id: funcionarioId },
        data: {
          jornadaPeriodoId: null,
          jornadaPeriodoAssociadoEm: null,
          jornadaPeriodoDesde: null
        }
      });
    }
    const mesma = atual?.jornadaPeriodoId === jornadaPeriodoId;
    return this.prisma.funcionario.update({
      where: { id: funcionarioId },
      data: {
        jornadaPeriodoId,
        ...(mesma
          ? {}
          : {
              jornadaPeriodoAssociadoEm: new Date(),
              jornadaPeriodoDesde: null
            })
      }
    });
  }

  async deleteFuncionario(id: string) {
    await this.notificacaoService
      .notificarRhPapelCriticoDesativado(id)
      .catch((e) =>
        this.logger.error(`Falha ao notificar RH antes de excluir funcionário (${id}): ${e}`)
      );
    return this.prisma.funcionario.delete({ where: { id } });
  }
}
