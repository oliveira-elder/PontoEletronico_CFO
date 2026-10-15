import { RepLivroService } from "../rep/rep-livro.service";
import { mensagemCpfObrigatorio } from "../../utils/cpf";
import { PontoService } from "./ponto.service";
import { inteiroConfig } from "../../utils/licenca-regras";
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { registrarMudancaModalidade } from "../../utils/modalidade-historico";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  AtividadeTipo,
  CategoriaFuncional,
  Prisma,
  TipoRequerimentoCadastro
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { dataCivilISO, hojeBrasiliaISO, intervaloDiaBrasilia } from "../../utils/horario-brasilia";
import { NotificacaoService } from "../notificacao/notificacao.service";
import {
  funcionarioSemRegistroPonto,
  labelSemRegistroPonto,
  type SituacaoRegistroPonto
} from "../../utils/categoria-jornada";
import {
  ensureCategoriaHistorico,
  registrarMudancaSituacao
} from "../../utils/categoria-historico";
import {
  adicionarVigenciaLotacao,
  atualizarVigenciaLotacao,
  ensureLotacaoHistorico,
  removerVigenciaLotacao,
  sincronizarFuncionarioComLotacao
} from "../../utils/lotacao-historico";
import {
  CATEGORIAS_REQUERIMENTO_CADASTRO,
  TIPOS_REQUERIMENTO_CADASTRO,
  syncCapacitacoes,
  syncDependentes,
  syncFormacoesAcademicas,
  type CapacitacaoInput,
  type DependenteInput,
  type FormacaoAcademicaInput
} from "../../utils/cadastro-listas";
import {
  adicionarCessao,
  atualizarCessao,
  contarCessoesEmAberto,
  listarCessoes,
  removerCessao,
  sincronizarFuncionarioComCessao,
  type PeriodoCessao
} from "../../utils/cessao-historico";

const ERROS_LOTACAO: Record<string, string> = {
  VIGENCIA_NAO_ENCONTRADA: "Período de lotação não encontrado.",
  INICIO_ANTES_DA_ANTERIOR: "A data de início deve ser posterior ao início da lotação anterior.",
  INICIO_DEPOIS_DA_SEGUINTE: "A data de início deve ser anterior ao início da lotação seguinte.",
  FIM_ANTES_DO_INICIO: "A data de fim deve ser igual ou posterior à data de início.",
  UNICA_VIGENCIA: "O funcionário precisa ter ao menos um período de lotação."
};

const ERROS_CESSAO: Record<string, string> = {
  CESSAO_NAO_ENCONTRADA: "Período de cessão não encontrado.",
  CESSAO_INCOMPLETA:
    "Cessão do Empregado: preencha Data de Início, Órgão de Origem e Órgão de Destino.",
  CESSAO_FIM_ANTES_DO_INICIO:
    "Cessão do Empregado: a data de fim deve ser igual ou posterior à data de início.",
  CESSAO_SOBREPOSTA: "Cessão do Empregado: o período se sobrepõe a outra cessão registrada."
};

export type LinhaLotacaoBody = {
  cargo?: string;
  gerenciaId: string | null;
  subsecao: string | null;
  vigenciaDesde: string;
  vigenciaAte?: string | null;
};

/** Campos "simples" de RH — sem efeito colateral em vigência/histórico, só passthrough. */
export type CamposSimplesFuncionario = Partial<{
  rg: string | null;
  rgOrgaoEmissor: string | null;
  rgUf: string | null;
  rgDataEmissao: string | null;
  raca: string | null;
  genero: string | null;
  emailPessoal: string | null;
  telefone: string | null;
  atividade: AtividadeTipo | null;
  isFiscal: boolean;
  valeTransporte: boolean;
  registroPontoObrigatorio: boolean | null;
  /** Nível do cargo (só empregado/concursado). */
  nivelCargo: "MEDIO" | "SUPERIOR" | null;
  cargoData: string | null;
  lotacaoInicio: string | null;
  lotacaoTermino: string | null;
  bolsaAuxilio: number | string | null;
  curso: string | null;
  contratoInicio: string | null;
  contratoTermino: string | null;
  cargaHoraria: string | null;
  diasSemana: string | null;
  observacoes: string | null;
  cedido: boolean;
  cessaoInicio: string | null;
  cessaoFim: string | null;
  cessaoOrgaoOrigem: string | null;
  cessaoOrgaoDestino: string | null;
}>;

const CAMPOS_TEXTO_SIMPLES = [
  "rg",
  "rgOrgaoEmissor",
  "rgUf",
  "raca",
  "genero",
  "emailPessoal",
  "telefone",
  "curso",
  "cargaHoraria",
  "diasSemana",
  "cessaoOrgaoOrigem",
  "cessaoOrgaoDestino",
  "observacoes"
] as const;

const CAMPOS_DATA_SIMPLES = [
  "rgDataEmissao",
  "cargoData",
  "lotacaoInicio",
  "lotacaoTermino",
  "contratoInicio",
  "contratoTermino",
  "cessaoInicio",
  "cessaoFim"
] as const;

const CAMPOS_BOOLEAN_SIMPLES = ["isFiscal", "valeTransporte", "cedido"] as const;

/**
 * Cessão marcada (só Empregado/CONCURSADO): início e órgãos são obrigatórios; o fim é
 * opcional (cessão em aberto), mas não pode ser anterior ao início.
 */
function validarCessao(v: {
  categoria: CategoriaFuncional;
  cedido: boolean;
  cessaoInicio: string | null;
  cessaoFim: string | null;
  cessaoOrgaoOrigem: string | null;
  cessaoOrgaoDestino: string | null;
}) {
  if (v.categoria !== "CONCURSADO" || !v.cedido) return;
  const faltando = [
    !v.cessaoInicio && "Data de Início da Cessão",
    !v.cessaoOrgaoOrigem?.trim() && "Órgão de Origem",
    !v.cessaoOrgaoDestino?.trim() && "Órgão de Destino"
  ].filter(Boolean);
  if (faltando.length) {
    throw new BadRequestException(`Cessão do Empregado: preencha ${faltando.join(", ")}.`);
  }
  if (v.cessaoFim && v.cessaoFim < v.cessaoInicio!) {
    throw new BadRequestException(
      "Cessão do Empregado: a data de fim deve ser igual ou posterior à data de início."
    );
  }
}

function mapCamposSimples(data: CamposSimplesFuncionario): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_TEXTO_SIMPLES) {
    if (data[k] !== undefined) out[k] = data[k] || null;
  }
  for (const k of CAMPOS_DATA_SIMPLES) {
    const v = data[k];
    if (v !== undefined) out[k] = v ? new Date(`${v}T12:00:00-03:00`) : null;
  }
  for (const k of CAMPOS_BOOLEAN_SIMPLES) {
    if (data[k] !== undefined) out[k] = !!data[k];
  }
  if (data.atividade !== undefined) out.atividade = data.atividade || null;
  if (data.nivelCargo !== undefined) {
    const nivel = data.nivelCargo;
    if (nivel !== null && nivel !== "MEDIO" && nivel !== "SUPERIOR") {
      throw new BadRequestException("Nível do cargo inválido (use Médio ou Superior).");
    }
    out.nivelCargo = nivel;
  }
  if (data.registroPontoObrigatorio !== undefined) {
    out.registroPontoObrigatorio = data.registroPontoObrigatorio;
  }
  if (data.bolsaAuxilio !== undefined) {
    out.bolsaAuxilio =
      data.bolsaAuxilio === null || data.bolsaAuxilio === "" ? null : data.bolsaAuxilio;
  }
  return out;
}

export type { DependenteInput, FormacaoAcademicaInput, CapacitacaoInput };

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
    private readonly notificacaoService: NotificacaoService,
    private readonly pontoService: PontoService,
    @Optional() private readonly repLivro?: RepLivroService
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
      include: this.funcionarioDetailInclude()
    });

    const idsComAtividadeHoje = await this.idsComAtividadeHoje();

    return list.map((f) => {
      const enriched = this.enrichFuncionarioSubstituicao(f);
      const { externalId, ...user } = enriched.user ?? {};
      const loginHoje = this.calcularLoginHoje(
        externalId,
        enriched.user?.ultimoLoginEm,
        idsComAtividadeHoje
      );
      return { ...enriched, user, loginHoje };
    });
  }

  /** IDs (externalId/Keycloak sub) de usuários com alguma requisição autenticada registrada hoje. */
  private async idsComAtividadeHoje(): Promise<Set<string>> {
    const { inicio } = intervaloDiaBrasilia(hojeBrasiliaISO());
    const logs = await this.prisma.auditLog.findMany({
      where: { createdAt: { gte: inicio }, actorUserId: { not: null } },
      select: { actorUserId: true },
      distinct: ["actorUserId"]
    });
    return new Set(logs.map((l) => l.actorUserId).filter((id): id is string => !!id));
  }

  private calcularLoginHoje(
    externalId: string | null | undefined,
    ultimoLoginEm: Date | null | undefined,
    idsComAtividadeHoje: Set<string>
  ): boolean {
    const { inicio } = intervaloDiaBrasilia(hojeBrasiliaISO());
    if (ultimoLoginEm && ultimoLoginEm >= inicio) return true;
    return !!externalId && idsComAtividadeHoje.has(externalId);
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
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailReal: true,
          ultimoLoginEm: true,
          externalId: true
        }
      },
      gerencia: {
        select: {
          id: true,
          nome: true,
          sigla: true,
          /* "Chefe" (Empregado/Comissionado) é somente leitura: responsável oficial
             da Lotação do funcionário — não uma seleção manual. */
          responsavel: true,
          responsavelUserId: true,
          responsavelMatricula: true
        }
      },
      jornadaPeriodo: { select: { id: true, nome: true, ePadrao: true } },
      enderecoResidencial: true,
      requerimentoEndereco: {
        select: { id: true, status: true, criadoEm: true, respondidoEm: true }
      },
      requerimentosCadastro: {
        select: { tipo: true, status: true, criadoEm: true, respondidoEm: true }
      },
      supervisorEstagio: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } }
        }
      },
      substituicoesComoTitular: this.substituicaoInclude,
      substituicoesComoSubstituto: this.substituicaoInclude,
      dependentes: { orderBy: { createdAt: "asc" } },
      formacoesAcademicas: { orderBy: { createdAt: "asc" } },
      capacitacoes: { orderBy: { createdAt: "asc" } }
    } satisfies Prisma.FuncionarioInclude;
  }

  async getFuncionario(id: string) {
    const f = await this.prisma.funcionario.findUnique({
      where: { id },
      include: this.funcionarioDetailInclude()
    });
    if (!f) throw new NotFoundException("Funcionário não encontrado");
    const enriched = this.enrichFuncionarioSubstituicao(f);
    const { externalId, ...user } = enriched.user ?? {};
    const loginHoje = await this.temLoginHoje(externalId, enriched.user?.ultimoLoginEm);
    return { ...enriched, user, loginHoje };
  }

  /** Versão de checagem individual de "login hoje" (usada em endpoints de um único funcionário). */
  private async temLoginHoje(
    externalId: string | null | undefined,
    ultimoLoginEm: Date | null | undefined
  ): Promise<boolean> {
    const { inicio } = intervaloDiaBrasilia(hojeBrasiliaISO());
    if (ultimoLoginEm && ultimoLoginEm >= inicio) return true;
    if (!externalId) return false;
    const log = await this.prisma.auditLog.findFirst({
      where: { actorUserId: externalId, createdAt: { gte: inicio } },
      select: { id: true }
    });
    return !!log;
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

  /** Quantos receberiam "Solicitar Endereço a Todos" (1ª etapa da confirmação). */
  async contarAlvosRequerimentoEndereco() {
    return { total: await this.prisma.funcionario.count({ where: { ativo: true } }) };
  }

  /* ─── Requerimentos de cadastro (Dependentes / Formação / Cursos) ─── */

  private validarTipoRequerimento(tipo: string): TipoRequerimentoCadastro {
    if (!TIPOS_REQUERIMENTO_CADASTRO.includes(tipo as TipoRequerimentoCadastro)) {
      throw new BadRequestException("Tipo de requerimento inválido.");
    }
    return tipo as TipoRequerimentoCadastro;
  }

  /** Só Empregado e Comissionado têm Dependentes/Capacitação no cadastro. */
  private readonly alvosRequerimentoCadastro = {
    ativo: true,
    categoria: { in: [...CATEGORIAS_REQUERIMENTO_CADASTRO] as CategoriaFuncional[] }
  } satisfies Prisma.FuncionarioWhereInput;

  async criarRequerimentoCadastro(funcionarioId: string, tipoStr: string) {
    const tipo = this.validarTipoRequerimento(tipoStr);
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { categoria: true }
    });
    if (!func) throw new NotFoundException("Funcionário não encontrado");
    if (!(CATEGORIAS_REQUERIMENTO_CADASTRO as readonly string[]).includes(func.categoria)) {
      throw new BadRequestException(
        "Este requerimento se aplica somente a Empregado e Comissionado."
      );
    }
    return this.prisma.requerimentoCadastro.upsert({
      where: { funcionarioId_tipo: { funcionarioId, tipo } },
      create: { funcionarioId, tipo, status: "PENDENTE" },
      update: { status: "PENDENTE", respondidoEm: null, criadoEm: new Date() },
      select: { tipo: true, status: true, criadoEm: true, respondidoEm: true }
    });
  }

  async contarAlvosRequerimentoCadastro(tipoStr: string) {
    this.validarTipoRequerimento(tipoStr);
    return {
      total: await this.prisma.funcionario.count({ where: this.alvosRequerimentoCadastro })
    };
  }

  async criarRequerimentoCadastroTodos(tipoStr: string) {
    const tipo = this.validarTipoRequerimento(tipoStr);
    const alvos = await this.prisma.funcionario.findMany({
      where: this.alvosRequerimentoCadastro,
      select: { id: true }
    });
    const agora = new Date();
    await this.prisma.$transaction(
      alvos.map((f) =>
        this.prisma.requerimentoCadastro.upsert({
          where: { funcionarioId_tipo: { funcionarioId: f.id, tipo } },
          create: { funcionarioId: f.id, tipo, status: "PENDENTE" },
          update: { status: "PENDENTE", respondidoEm: null, criadoEm: agora }
        })
      )
    );
    return { total: alvos.length };
  }

  async createFuncionario(
    data: {
      nome: string;
      email: string;
      matricula: string;
      cargo: string;
      cpf?: string;
      categoria: string;
      gerenciaId?: string;
      subsecao?: string | null;
      isManager?: boolean;
      dataNascimento?: string | null;
      dataAdmissao?: string | null;
      modoHomeOffice?: boolean;
      modoHibridoLocal?: boolean;
      dependentes?: DependenteInput[];
      formacoesAcademicas?: FormacaoAcademicaInput[];
      capacitacoes?: CapacitacaoInput[];
    } & CamposSimplesFuncionario
  ) {
    const erroCpf = mensagemCpfObrigatorio(data.cpf);
    if (erroCpf) throw new BadRequestException(erroCpf);
    validarCessao({
      categoria: data.categoria as CategoriaFuncional,
      cedido: !!data.cedido,
      cessaoInicio: data.cessaoInicio ?? null,
      cessaoFim: data.cessaoFim ?? null,
      cessaoOrgaoOrigem: data.cessaoOrgaoOrigem ?? null,
      cessaoOrgaoDestino: data.cessaoOrgaoDestino ?? null
    });
    const funcionario = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: data.nome, email: data.email }
      });
      const hoje = hojeBrasiliaISO();
      const cat = data.categoria as CategoriaFuncional;
      const isManager = !!data.isManager;
      const pontoObrigatorioDesde = funcionarioSemRegistroPonto({
        categoria: cat,
        isManager,
        isFiscal: data.isFiscal,
        registroPontoObrigatorio: data.registroPontoObrigatorio
      })
        ? null
        : new Date(`${hoje}T12:00:00-03:00`);
      const funcionario = await tx.funcionario.create({
        data: {
          userId: user.id,
          matricula: data.matricula,
          cargo: data.cargo,
          cpf: data.cpf,
          categoria: cat,
          isManager,
          gerenciaId: data.gerenciaId,
          subsecao: data.subsecao || null,
          dataNascimento: data.dataNascimento ? new Date(data.dataNascimento) : null,
          dataAdmissao: data.dataAdmissao ? new Date(data.dataAdmissao) : null,
          modoHomeOffice: !!data.modoHomeOffice,
          modoHibridoLocal: !!data.modoHibridoLocal,
          pontoObrigatorioDesde,
          ...mapCamposSimples(data)
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
          isManager,
          vigenciaDesde: new Date(`${hoje}T12:00:00-03:00`),
          vigenciaAte: null
        }
      });
      if (cat === "CONCURSADO" && data.cedido && data.cessaoInicio) {
        /* Cadastro novo com cessão: o período informado inaugura o histórico. */
        await adicionarCessao(tx, funcionario.id, {
          inicio: data.cessaoInicio,
          fim: data.cessaoFim || null,
          orgaoOrigem: data.cessaoOrgaoOrigem ?? "",
          orgaoDestino: data.cessaoOrgaoDestino ?? ""
        });
        await sincronizarFuncionarioComCessao(tx, funcionario.id);
      }
      await syncDependentes(tx, funcionario.id, data.dependentes);
      await syncFormacoesAcademicas(tx, funcionario.id, data.formacoesAcademicas);
      await syncCapacitacoes(tx, funcionario.id, data.capacitacoes);
      return funcionario;
    });
    void this.repLivro?.sincronizarEmpregados();
    return this.getFuncionario(funcionario.id);
  }

  async updateFuncionario(
    id: string,
    data: Partial<
      {
        nome: string;
        email: string;
        matricula: string;
        cpf: string;
        cargo: string;
        categoria: string;
        gerenciaId: string;
        subsecao: string | null;
        ativo: boolean;
        camposManuaisConfigurados: boolean;
        dataNascimento: string | null;
        dataAdmissao: string | null;
        dataDesligamento: string | null;
        modoHomeOffice: boolean;
        modoHibridoLocal: boolean;
        supervisorEstagioId: string | null;
        substitutoId: string | null;
        substitutoDataInicio: string | null;
        substitutoDataFim: string | null;
        isManager: boolean;
        dependentes: DependenteInput[];
        formacoesAcademicas: FormacaoAcademicaInput[];
        capacitacoes: CapacitacaoInput[];
      } & CamposSimplesFuncionario
    >,
    atorKeycloakSub?: string
  ) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id },
      include: { user: true }
    });
    if (!func) throw new NotFoundException("Funcionário não encontrado");

    /* CPF obrigatório: não pode ser apagado nem ficar inválido; na edição completa do cadastro
       (com nome/matrícula) quem ainda não tem CPF precisa informá-lo. Outras ações (ex.:
       desativar) não são bloqueadas por CPF ausente. */
    const edicaoCompleta = data.nome !== undefined || data.matricula !== undefined;
    if (data.cpf !== undefined || (edicaoCompleta && !func.cpf)) {
      const erroCpf = mensagemCpfObrigatorio(data.cpf !== undefined ? data.cpf : func.cpf);
      if (erroCpf) throw new BadRequestException(erroCpf);
    }

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
      camposManuaisConfigurados,
      modoHomeOffice,
      modoHibridoLocal,
      supervisorEstagioId,
      substitutoId,
      substitutoDataInicio,
      substitutoDataFim,
      isManager,
      dataDesligamento,
      dependentes,
      formacoesAcademicas,
      capacitacoes
    } = data;

    const emailTrim = email?.trim() ?? "";
    const emailEhMascaraSso =
      emailTrim.endsWith("@sso.local") || emailTrim.endsWith("@pending.local");

    if (emailTrim && !emailEhMascaraSso) {
      const duplicadoEmail = await this.prisma.user.findFirst({
        where: {
          NOT: { id: func.userId },
          OR: [
            { emailReal: { equals: emailTrim, mode: "insensitive" } },
            { email: { equals: emailTrim, mode: "insensitive" } }
          ]
        },
        select: { id: true }
      });
      if (duplicadoEmail) {
        throw new BadRequestException(
          "Este e-mail institucional já está em uso por outro usuário."
        );
      }
    }

    if (matricula !== undefined && matricula.trim()) {
      const duplicadoMat = await this.prisma.funcionario.findFirst({
        where: { matricula: matricula.trim(), NOT: { id } },
        select: { id: true }
      });
      if (duplicadoMat) {
        throw new BadRequestException("Esta matrícula já está em uso.");
      }
    }

    const categoriaFinal = (categoria ?? func.categoria) as CategoriaFuncional;
    const isManagerFinal = isManager ?? func.isManager;
    const gerenciaFinal = gerenciaId !== undefined ? gerenciaId || null : func.gerenciaId;
    const subsecaoFinal = subsecao !== undefined ? subsecao || null : func.subsecao;
    const isEstagio = categoriaFinal === "ESTAGIARIO" || categoriaFinal === "MENOR_APRENDIZ";

    /* Cessão marcada exige ao menos um período no histórico (as linhas são gravadas
       pelos endpoints de cessão; aqui só se confere a marcação). */
    if (categoriaFinal === "CONCURSADO" && (data.cedido ?? func.cedido)) {
      const periodos = await this.prisma.funcionarioCessaoHistorico.count({
        where: { funcionarioId: id }
      });
      if (!periodos) {
        throw new BadRequestException(
          "Cessão do Empregado: registre ao menos um período de cessão ou desmarque a opção."
        );
      }
    }
    /* Desmarcar mantém o histórico, mas só quando todas as cessões têm data de fim. */
    if (data.cedido === false && func.cedido) {
      if (await contarCessoesEmAberto(this.prisma, id)) {
        throw new BadRequestException(
          "Cessão do Empregado: há cessão em aberto. Informe a data de fim antes de desmarcar."
        );
      }
    }

    /* Data de Desligamento é a fonte de verdade da inatividade: preenchida com data
       igual/anterior a hoje desativa na hora; reativação explícita (ativo=true) limpa a
       data. Ver plano "Inatividade automática por Data de Desligamento". */
    let ativoFinal = ativo;
    let dataDesligamentoFinal: Date | null | undefined; // undefined = não mexe no campo
    if (dataDesligamento !== undefined) {
      dataDesligamentoFinal = dataDesligamento
        ? new Date(`${dataDesligamento}T12:00:00-03:00`)
        : null;
      if (dataDesligamento && dataDesligamento <= hojeBrasiliaISO() && ativoFinal === undefined) {
        ativoFinal = false;
      }
    }
    if (ativoFinal === true) {
      dataDesligamentoFinal = null;
    }

    if (supervisorEstagioId !== undefined && supervisorEstagioId) {
      if (!isEstagio) {
        throw new BadRequestException(
          "Supervisor de estágio só se aplica a Estagiário ou Jovem Aprendiz."
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
          "Estagiário e Jovem Aprendiz não podem ser supervisor de estágio. Escolha um efetivo, comissionado ou chefe da mesma gerência."
        );
      }
      if (!gerenciaFinal || supervisor.gerenciaId !== gerenciaFinal) {
        throw new BadRequestException("O supervisor de estágio deve pertencer à mesma gerência.");
      }
    }

    /** Mudança de obrigação de ponto nesta edição (gera o fechamento do banco e o aviso ao RH). */
    let fechamentoInfo: {
      dataMudanca: string;
      de: SituacaoRegistroPonto;
      para: SituacaoRegistroPonto;
    } | null = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        const userUpdate: Record<string, string> = {};
        if (nome !== undefined && nome !== "") userUpdate.name = nome;
        if (emailTrim) {
          if (emailEhMascaraSso) {
            if (func.user.email !== emailTrim) userUpdate.email = emailTrim;
          } else {
            /* E-mail institucional: persiste em emailReal e não sobrescreve o e-mail SSO. */
            userUpdate.emailReal = emailTrim;
            const emailAtualSso =
              func.user.email.endsWith("@sso.local") || func.user.email.endsWith("@pending.local");
            if (!emailAtualSso && func.user.email.toLowerCase() !== emailTrim.toLowerCase()) {
              userUpdate.email = emailTrim;
            }
          }
        }
        if (Object.keys(userUpdate).length) {
          await tx.user.update({ where: { id: func.userId }, data: userUpdate });
        }
        const funcUpdate: Record<string, unknown> = {};
        if (matricula !== undefined) funcUpdate.matricula = matricula || null;
        if (cpf !== undefined) funcUpdate.cpf = cpf || null;
        if (cargo !== undefined) funcUpdate.cargo = cargo;
        if (camposManuaisConfigurados !== undefined) {
          funcUpdate.camposManuaisConfigurados = camposManuaisConfigurados;
        }

        /* Categoria e/ou "é chefe" (isManager) mudaram: uma única vigência de histórico
         reage às duas juntas (antes só existia a troca de categoria, porque "ser chefe"
         era a própria categoria GERENTE — agora são independentes). */
        const fiscalFinal = data.isFiscal !== undefined ? !!data.isFiscal : func.isFiscal;
        const overrideFinal =
          data.registroPontoObrigatorio !== undefined
            ? data.registroPontoObrigatorio
            : func.registroPontoObrigatorio;
        if (
          (categoria !== undefined && categoriaFinal !== func.categoria) ||
          (isManager !== undefined && isManagerFinal !== func.isManager) ||
          fiscalFinal !== func.isFiscal ||
          (overrideFinal ?? null) !== (func.registroPontoObrigatorio ?? null)
        ) {
          /* Histórico ANTES de alterar o funcionário (seed usa a situação antiga). */
          await ensureCategoriaHistorico(tx, id);
          const { desdeNova } = await registrarMudancaSituacao(
            tx,
            id,
            {
              categoria: categoriaFinal,
              isManager: isManagerFinal,
              isFiscal: fiscalFinal,
              registroPontoObrigatorio: overrideFinal ?? null
            },
            undefined,
            {
              isFiscal: func.isFiscal,
              registroPontoObrigatorio: func.registroPontoObrigatorio ?? null
            }
          );

          const situacaoAnterior = {
            categoria: func.categoria,
            isManager: func.isManager,
            isFiscal: func.isFiscal,
            registroPontoObrigatorio: func.registroPontoObrigatorio
          };
          const situacaoNova = {
            categoria: categoriaFinal,
            isManager: isManagerFinal,
            isFiscal: data.isFiscal !== undefined ? data.isFiscal : func.isFiscal,
            registroPontoObrigatorio:
              data.registroPontoObrigatorio !== undefined
                ? data.registroPontoObrigatorio
                : func.registroPontoObrigatorio
          };
          const eraSemRegistro = funcionarioSemRegistroPonto(situacaoAnterior);
          const seraComRegistro = !funcionarioSemRegistroPonto(situacaoNova);
          if (eraSemRegistro === seraComRegistro) {
            /* A obrigação de ponto mudou de fato (passou a isento ou voltou a bater). */
            fechamentoInfo = {
              dataMudanca: desdeNova,
              de: situacaoAnterior,
              para: situacaoNova
            };
          }
          /* Retorno de isento → obrigação: só a partir do dia seguinte à mudança (desdeNova). */
          if (eraSemRegistro && seraComRegistro && !func.pontoObrigatorioDesde) {
            funcUpdate.pontoObrigatorioDesde = new Date(`${desdeNova}T12:00:00-03:00`);
          }
        }
        if (categoria !== undefined) funcUpdate.categoria = categoriaFinal;
        if (isManager !== undefined) funcUpdate.isManager = isManagerFinal;

        if (gerenciaId !== undefined) funcUpdate.gerenciaId = gerenciaId || null;
        if (subsecao !== undefined) funcUpdate.subsecao = subsecao || null;
        if (ativoFinal !== undefined) funcUpdate.ativo = ativoFinal;
        if (dataDesligamentoFinal !== undefined)
          funcUpdate.dataDesligamento = dataDesligamentoFinal;
        if (dataNascimento !== undefined) {
          funcUpdate.dataNascimento = dataNascimento ? new Date(dataNascimento) : null;
        }
        if ((data as Record<string, unknown>).dataAdmissao !== undefined) {
          const da = (data as Record<string, unknown>).dataAdmissao as string | null;
          funcUpdate.dataAdmissao = da ? new Date(da) : null;
        }
        if (modoHomeOffice !== undefined || modoHibridoLocal !== undefined) {
          /* Histórico ANTES de alterar (seed usa a modalidade antiga): vale daqui para frente. */
          await registrarMudancaModalidade(tx, id, {
            homeOffice: modoHomeOffice ?? func.modoHomeOffice,
            hibrido: modoHibridoLocal ?? func.modoHibridoLocal
          });
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
        Object.assign(funcUpdate, mapCamposSimples(data));

        if (Object.keys(funcUpdate).length) {
          await tx.funcionario.update({
            where: { id },
            data: funcUpdate as Prisma.FuncionarioUpdateInput
          });
        }

        await syncDependentes(tx, id, dependentes);
        await syncFormacoesAcademicas(tx, id, formacoesAcademicas);
        await syncCapacitacoes(tx, id, capacitacoes);
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const alvo = Array.isArray(err.meta?.target)
          ? err.meta.target.join(", ")
          : String(err.meta?.target ?? "");
        if (alvo.includes("email")) {
          throw new BadRequestException("Este e-mail já está em uso por outro usuário.");
        }
        if (alvo.includes("matricula")) {
          throw new BadRequestException("Esta matrícula já está em uso.");
        }
        throw new BadRequestException("Já existe um cadastro com estes dados.");
      }
      throw err;
    }

    if (fechamentoInfo) {
      await this.registrarFechamentoSituacao(id, fechamentoInfo, atorKeycloakSub).catch((e) =>
        this.logger.error(`Falha ao registrar fechamento por mudança de situação (${id}): ${e}`)
      );
    }

    const desativou = ativoFinal === false && func.ativo === true;
    if (desativou) {
      void this.notificacaoService
        .notificarRhPapelCriticoDesativado(id)
        .catch((e) =>
          this.logger.error(`Falha ao notificar RH sobre desativação crítica (${id}): ${e}`)
        );
      if (func.isManager || isManagerFinal) {
        await this.cancelarSubstituicoesTitular(id).catch((e) =>
          this.logger.error(`Falha ao cancelar substituições do titular desativado (${id}): ${e}`)
        );
      }
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
        isManagerTitular: isManagerFinal,
        gerenciaId: gerenciaFinal,
        subsecaoTitular: subsecaoFinal
      });
    } else if (isManager !== undefined && !isManagerFinal) {
      await this.cancelarSubstituicoesTitular(id);
    }

    await this.processarSubstituicoesPendentes().catch((e) =>
      this.logger.error(`Falha ao processar substituições após salvar funcionário ${id}: ${e}`)
    );

    void this.repLivro?.sincronizarEmpregados();
    return this.getFuncionario(id);
  }

  /* ─── Gerente substituto ─── */

  async configurarSubstituicao(
    titularId: string,
    opts: {
      substitutoId: string | null;
      dataInicio: string | null;
      dataFim: string | null;
      isManagerTitular: boolean;
      gerenciaId: string | null;
      subsecaoTitular?: string | null;
    }
  ) {
    const { substitutoId, dataInicio, dataFim, isManagerTitular, gerenciaId, subsecaoTitular } =
      opts;

    if (!substitutoId) {
      await this.cancelarSubstituicoesTitular(titularId);
      return null;
    }

    if (!isManagerTitular) {
      throw new BadRequestException(
        "Somente funcionários marcados como Chefe podem ter substituto."
      );
    }
    if (!gerenciaId) {
      throw new BadRequestException("O chefe precisa estar vinculado a uma gerência.");
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
        subsecao: true,
        categoria: true,
        isManager: true,
        ativo: true
      }
    });
    if (!substituto) throw new NotFoundException("Substituto não encontrado.");
    if (substituto.gerenciaId !== gerenciaId) {
      throw new BadRequestException(
        "O substituto deve pertencer à mesma gerência do chefe titular."
      );
    }
    /* Exceção de coordenação: chefe de subseção cujo nome contém "coordenação" só
       pode ser substituído por alguém da mesma subseção, não da gerência inteira. */
    const ehCoordenacao = !!subsecaoTitular && /coordena/i.test(subsecaoTitular);
    if (ehCoordenacao && substituto.subsecao !== subsecaoTitular) {
      throw new BadRequestException(
        "O substituto deve pertencer à mesma subseção (coordenação) do chefe titular."
      );
    }
    const categoriasPermitidas: CategoriaFuncional[] = ["CONCURSADO", "ASSESSOR"];
    if (!categoriasPermitidas.includes(substituto.categoria)) {
      throw new BadRequestException(
        "O chefe só pode ser substituído por um Efetivo ou Comissionado."
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

  /**
   * Aplica desligamentos agendados: dataDesligamento é a fonte de verdade da inatividade
   * (ver updateFuncionario) — quando preenchida no futuro, o funcionário continua ativo até
   * a data chegar, e este job desativa sozinho no dia certo (mesmos efeitos colaterais do
   * desligamento manual/imediato: cancelamento de substituições e alerta ao RH).
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async cronDesligamentos() {
    const hoje = hojeBrasiliaISO();
    const pendentes = await this.prisma.funcionario.findMany({
      where: { ativo: true, dataDesligamento: { lte: new Date(`${hoje}T12:00:00-03:00`) } },
      select: { id: true, isManager: true }
    });
    for (const f of pendentes) {
      await this.prisma.funcionario.update({ where: { id: f.id }, data: { ativo: false } });
      void this.notificacaoService
        .notificarRhPapelCriticoDesativado(f.id)
        .catch((e) =>
          this.logger.error(`Falha ao notificar RH sobre desligamento agendado (${f.id}): ${e}`)
        );
      if (f.isManager) {
        await this.cancelarSubstituicoesTitular(f.id).catch((e) =>
          this.logger.error(`Falha ao cancelar substituições do titular desligado (${f.id}): ${e}`)
        );
      }
    }
    if (pendentes.length) {
      this.logger.log(`Desligamentos agendados aplicados: ${pendentes.length}`);
    }
  }

  async processarSubstituicoesPendentes() {
    const hoje = hojeBrasiliaISO();

    const agendadas = await this.prisma.gerenteSubstituicao.findMany({
      where: { status: "AGENDADA" }
    });
    for (const s of agendadas) {
      const ini = dataCivilISO(s.dataInicio);
      const fim = dataCivilISO(s.dataFim);
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
      const fim = dataCivilISO(s.dataFim);
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
      await registrarMudancaSituacao(tx, s.substitutoId, {
        categoria: s.substituto.categoria,
        isManager: true
      });
      await tx.funcionario.update({
        where: { id: s.substitutoId },
        data: {
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
        substituto: { select: { id: true, categoria: true } }
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
          isManager: true
        }
      });
      await ensureCategoriaHistorico(tx, s.substitutoId);
      await registrarMudancaSituacao(tx, s.substitutoId, {
        categoria: s.substituto.categoria,
        isManager: s.isManagerAnteriorSubstituto
      });
      await tx.funcionario.update({
        where: { id: s.substitutoId },
        data: {
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

  async setModalidade(funcionarioId: string, modoHomeOffice: boolean, modoHibridoLocal: boolean) {
    /* A modalidade vale daqui para frente: o histórico guarda a anterior para os dias passados. */
    return this.prisma.$transaction(async (tx) => {
      await registrarMudancaModalidade(tx, funcionarioId, {
        homeOffice: modoHomeOffice,
        hibrido: modoHibridoLocal
      });
      return tx.funcionario.update({
        where: { id: funcionarioId },
        data: { modoHomeOffice, modoHibridoLocal }
      });
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

  /* ─── Dashboard executivo (Fase 3) ─── */

  async getDashboardStats() {
    const hoje = hojeBrasiliaISO();
    const [funcionarios, gerencias] = await Promise.all([
      this.prisma.funcionario.findMany({
        include: {
          dependentes: { select: { id: true } },
          formacoesAcademicas: { select: { grauEscolaridade: true } },
          gerencia: { select: { id: true, nome: true } },
          user: { select: { name: true } }
        }
      }),
      this.prisma.gerencia.findMany({ where: { ativa: true }, select: { id: true, nome: true } })
    ]);

    const ativos = funcionarios.filter((f) => f.ativo);
    const contagem = <T>(arr: T[], key: (x: T) => string) => {
      const m = new Map<string, number>();
      for (const x of arr) {
        const k = key(x) || "Não informado";
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m.entries()].map(([chave, total]) => ({ chave, total }));
    };

    // ── Totais ──
    const totais = {
      total: funcionarios.length,
      ativos: ativos.length,
      inativos: funcionarios.length - ativos.length,
      chefes: ativos.filter((f) => f.isManager).length
    };

    // ── Por categoria ──
    const porCategoria = contagem(ativos, (f) => f.categoria);

    // ── Por lotação (top 10) ──
    const porLotacaoMap = new Map<string, { nome: string; total: number }>();
    for (const f of ativos) {
      if (!f.gerenciaId) continue;
      const nome = f.gerencia?.nome ?? "—";
      const atual = porLotacaoMap.get(f.gerenciaId) ?? { nome, total: 0 };
      atual.total += 1;
      porLotacaoMap.set(f.gerenciaId, atual);
    }
    const porLotacao = [...porLotacaoMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);

    // ── Modalidade de trabalho ──
    const porModalidade = {
      presencial: ativos.filter((f) => !f.modoHomeOffice && !f.modoHibridoLocal).length,
      homeOffice: ativos.filter((f) => f.modoHomeOffice).length,
      hibrido: ativos.filter((f) => f.modoHibridoLocal).length
    };

    // ── Diversidade ──
    const porGenero = contagem(ativos, (f) => f.genero ?? "");
    const porRaca = contagem(ativos, (f) => f.raca ?? "");

    // ── Escolaridade (conta ocorrências de grau entre as formações cadastradas) ──
    const todasFormacoes = ativos.flatMap((f) => f.formacoesAcademicas);
    const porEscolaridade = contagem(todasFormacoes, (fa) => fa.grauEscolaridade ?? "");

    // ── Faixa etária ──
    const faixaEtariaDe = (dataNascimento: Date | null): string | null => {
      if (!dataNascimento) return null;
      const idade = Math.floor(
        (Date.parse(`${hoje}T12:00:00-03:00`) - dataNascimento.getTime()) /
          (365.25 * 24 * 3600 * 1000)
      );
      if (idade < 20) return "< 20";
      if (idade < 30) return "20–29";
      if (idade < 40) return "30–39";
      if (idade < 50) return "40–49";
      if (idade < 60) return "50–59";
      return "60+";
    };
    const faixaEtariaMap = new Map<string, number>();
    for (const f of ativos) {
      const faixa = faixaEtariaDe(f.dataNascimento);
      if (!faixa) continue;
      faixaEtariaMap.set(faixa, (faixaEtariaMap.get(faixa) ?? 0) + 1);
    }
    const ORDEM_FAIXAS = ["< 20", "20–29", "30–39", "40–49", "50–59", "60+"];
    const faixaEtaria = ORDEM_FAIXAS.filter((f) => faixaEtariaMap.has(f)).map((chave) => ({
      chave,
      total: faixaEtariaMap.get(chave)!
    }));

    // ── Aniversariantes (ano inteiro, para o gráfico por mês) ──
    const aniversariantes = ativos
      .filter((f) => f.dataNascimento)
      .map((f) => ({
        nome: f.user?.name ?? f.matricula ?? f.id,
        dia: f.dataNascimento!.getUTCDate(),
        mes: f.dataNascimento!.getUTCMonth() + 1
      }))
      .sort((a, b) => a.mes - b.mes || a.dia - b.dia);

    // ── Isenção de registro de ponto ──
    const isentos = ativos.filter((f) => funcionarioSemRegistroPonto(f)).length;
    const isencaoPonto = { obrigatorio: ativos.length - isentos, isento: isentos };

    // ── Vale-transporte ──
    const valeTransporte = {
      sim: ativos.filter((f) => f.valeTransporte).length,
      nao: ativos.filter((f) => !f.valeTransporte).length
    };

    // ── Admissões x Desligamentos (últimos 12 meses) ──
    const meses: { chave: string; admissoes: number; desligamentos: number }[] = [];
    const [anoAtual, mesAtualNum] = hoje.split("-").map(Number);
    for (let i = 11; i >= 0; i--) {
      let m = mesAtualNum - i;
      let a = anoAtual;
      while (m <= 0) {
        m += 12;
        a -= 1;
      }
      meses.push({ chave: `${a}-${String(m).padStart(2, "0")}`, admissoes: 0, desligamentos: 0 });
    }
    const mesIndex = new Map(meses.map((m, i) => [m.chave, i]));
    for (const f of funcionarios) {
      if (f.dataAdmissao) {
        const chave = dataCivilISO(f.dataAdmissao).slice(0, 7);
        const idx = mesIndex.get(chave);
        if (idx !== undefined) meses[idx].admissoes += 1;
      }
      if (f.dataDesligamento) {
        const chave = dataCivilISO(f.dataDesligamento).slice(0, 7);
        const idx = mesIndex.get(chave);
        if (idx !== undefined) meses[idx].desligamentos += 1;
      }
    }

    // ── Contratos a vencer (Estágio/Jovem Aprendiz, antecedência configurável — padrão 90 dias) ──
    const cfgContrato = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { contratoAvisoAntecedenciaDias: true }
    });
    const contratoAvisoDias = cfgContrato?.contratoAvisoAntecedenciaDias ?? 90;
    const limiteAviso = new Date(
      Date.parse(`${hoje}T12:00:00-03:00`) + contratoAvisoDias * 24 * 3600 * 1000
    );
    const limiteAvisoIso = dataCivilISO(limiteAviso);
    const contratosAVencer = ativos
      .filter(
        (f) =>
          (f.categoria === "ESTAGIARIO" || f.categoria === "MENOR_APRENDIZ") &&
          f.contratoTermino &&
          dataCivilISO(f.contratoTermino) >= hoje &&
          dataCivilISO(f.contratoTermino) <= limiteAvisoIso
      )
      .map((f) => ({
        nome: f.user?.name ?? f.matricula ?? f.id,
        matricula: f.matricula,
        categoria: f.categoria,
        contratoTermino: dataCivilISO(f.contratoTermino!)
      }))
      .sort((a, b) => a.contratoTermino.localeCompare(b.contratoTermino));

    // ── Cobertura de chefes por lotação ──
    const gerenciasComChefe = new Set(
      ativos.filter((f) => f.isManager && f.gerenciaId).map((f) => f.gerenciaId as string)
    );
    const chefesPorLotacao = gerencias.map((g) => ({
      gerenciaId: g.id,
      nome: g.nome,
      temChefe: gerenciasComChefe.has(g.id)
    }));

    // ── Dependentes ──
    const totalDependentes = ativos.reduce((acc, f) => acc + f.dependentes.length, 0);
    const dependentesMedia = ativos.length ? totalDependentes / ativos.length : 0;

    // ── Tempo médio de casa (tenure) por categoria ──
    const tenurePorCategoriaMap = new Map<string, { somaAnos: number; total: number }>();
    for (const f of ativos) {
      if (!f.dataAdmissao) continue;
      const anos =
        (Date.parse(`${hoje}T12:00:00-03:00`) - f.dataAdmissao.getTime()) /
        (365.25 * 24 * 3600 * 1000);
      const atual = tenurePorCategoriaMap.get(f.categoria) ?? { somaAnos: 0, total: 0 };
      atual.somaAnos += anos;
      atual.total += 1;
      tenurePorCategoriaMap.set(f.categoria, atual);
    }
    const tenurePorCategoria = [...tenurePorCategoriaMap.entries()].map(([categoria, v]) => ({
      chave: categoria,
      mediaAnos: v.total ? Math.round((v.somaAnos / v.total) * 10) / 10 : 0
    }));

    // ── Detalhe por funcionário (para os modais "quem está nesta barra") ──
    const detalheFuncionarios = ativos.map((f) => ({
      id: f.id,
      nome: f.user?.name ?? f.matricula ?? f.id,
      matricula: f.matricula,
      categoria: f.categoria,
      lotacao: f.gerencia?.nome ?? null,
      genero: f.genero ?? null,
      raca: f.raca ?? null,
      escolaridades: f.formacoesAcademicas
        .map((fa) => fa.grauEscolaridade)
        .filter((g): g is string => !!g),
      faixaEtaria: faixaEtariaDe(f.dataNascimento),
      modalidade: f.modoHomeOffice ? "homeOffice" : f.modoHibridoLocal ? "hibrido" : "presencial",
      valeTransporte: f.valeTransporte,
      isentoRegistroPonto: funcionarioSemRegistroPonto(f)
    }));

    return {
      totais,
      porCategoria,
      porLotacao,
      porModalidade,
      porGenero,
      porRaca,
      porEscolaridade,
      faixaEtaria,
      aniversariantes,
      isencaoPonto,
      valeTransporte,
      admissoesDesligamentos: meses,
      contratosAVencer,
      contratoAvisoDias,
      chefesPorLotacao,
      totalDependentes,
      dependentesMedia: Math.round(dependentesMedia * 100) / 100,
      tenurePorCategoria,
      detalheFuncionarios
    };
  }

  /* ─── Histórico de Cargo/Lotação (Fase 2) ─── */

  async getLotacaoHistorico(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUnique({ where: { id: funcionarioId } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");
    const historico = await ensureLotacaoHistorico(this.prisma, funcionarioId);
    return [...historico].sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde));
  }

  /** Dados de uma linha de lotação vindos da tela (cargo só para Comissionado). */
  private async alterarLotacao(
    funcionarioId: string,
    operacao: (tx: Prisma.TransactionClient, cargoAtual: string) => Promise<void>
  ) {
    const func = await this.prisma.funcionario.findUnique({ where: { id: funcionarioId } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");
    try {
      await this.prisma.$transaction(async (tx) => {
        await ensureLotacaoHistorico(tx, funcionarioId);
        await operacao(tx, func.cargo || "");
        /* Mantém os campos "atuais" do Funcionario em sincronia com a vigência de hoje. */
        await sincronizarFuncionarioComLotacao(tx, funcionarioId);
      });
    } catch (e) {
      const msg = e instanceof Error ? ERROS_LOTACAO[e.message] : undefined;
      if (msg) throw new BadRequestException(msg);
      throw e;
    }
    return {
      historico: await this.getLotacaoHistorico(funcionarioId),
      funcionario: await this.getFuncionario(funcionarioId)
    };
  }

  async adicionarLotacao(funcionarioId: string, data: LinhaLotacaoBody) {
    if (!data.vigenciaDesde) throw new BadRequestException("Informe a data de início.");
    return this.alterarLotacao(funcionarioId, (tx, cargoAtual) =>
      adicionarVigenciaLotacao(tx, funcionarioId, {
        /* Cargo é opcional — telas sem cargo na linha mantêm o valor já vigente. */
        cargo: data.cargo?.trim() || cargoAtual,
        gerenciaId: data.gerenciaId || null,
        subsecao: data.subsecao || null,
        vigenciaDesde: data.vigenciaDesde,
        vigenciaAte: data.vigenciaAte || null
      })
    );
  }

  async atualizarLotacao(funcionarioId: string, vigenciaId: string, data: LinhaLotacaoBody) {
    if (!data.vigenciaDesde) throw new BadRequestException("Informe a data de início.");
    return this.alterarLotacao(funcionarioId, (tx) =>
      atualizarVigenciaLotacao(tx, funcionarioId, vigenciaId, {
        cargo: data.cargo?.trim() || undefined,
        gerenciaId: data.gerenciaId || null,
        subsecao: data.subsecao || null,
        vigenciaDesde: data.vigenciaDesde,
        vigenciaAte: data.vigenciaAte === undefined ? undefined : data.vigenciaAte || null
      })
    );
  }

  async removerLotacao(funcionarioId: string, vigenciaId: string) {
    return this.alterarLotacao(funcionarioId, (tx) =>
      removerVigenciaLotacao(tx, funcionarioId, vigenciaId)
    );
  }

  /* ─── Histórico de cessão (Empregado) ─── */

  /**
   * Fechamento por mudança de situação: guarda o saldo do banco na data em que o funcionário
   * passou a não registrar ponto (ou voltou a registrar) e avisa o RH e o chefe.
   */
  private async registrarFechamentoSituacao(
    funcionarioId: string,
    info: { dataMudanca: string; de: SituacaoRegistroPonto; para: SituacaoRegistroPonto },
    atorKeycloakSub?: string
  ) {
    const rotulo = (s: SituacaoRegistroPonto) =>
      funcionarioSemRegistroPonto(s)
        ? `Sem registro de ponto (${labelSemRegistroPonto(s)})`
        : "Registra ponto";
    const deSem = funcionarioSemRegistroPonto(info.de);
    const paraSem = funcionarioSemRegistroPonto(info.para);
    const banco = await this.pontoService.calcularBancoHorasAdmin(funcionarioId);
    const ator = atorKeycloakSub
      ? await this.prisma.user.findFirst({
          where: { externalId: atorKeycloakSub },
          select: { name: true }
        })
      : null;
    await this.prisma.fechamentoSituacao.create({
      data: {
        funcionarioId,
        dataMudanca: new Date(`${info.dataMudanca}T12:00:00-03:00`),
        deRotulo: rotulo(info.de),
        paraRotulo: rotulo(info.para),
        deSemRegistro: deSem,
        paraSemRegistro: paraSem,
        saldoMinutos: banco.saldoAtualMinutos,
        cicloInicio: banco.cicloInicio ?? null,
        alteradoPorNome: ator?.name ?? null
      }
    });
    await this.notificacaoService.notificarFechamentoSituacao(funcionarioId, {
      dataMudanca: info.dataMudanca,
      paraSemRegistro: paraSem,
      rotuloNovo: rotulo(info.para),
      saldoMinutos: banco.saldoAtualMinutos,
      proximaZeragem: banco.proximaZeragem ?? null
    });
  }

  /** Tolerância do fechamento do banco: individual (RH) + global de fallback. */
  async getToleranciaFechamento(id: string) {
    const [f, cfg] = await Promise.all([
      this.prisma.funcionario.findUnique({
        where: { id },
        select: { bancoHorasToleranciaFechamentoDias: true }
      }),
      this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: { bancoHorasToleranciaFechamentoDias: true }
      })
    ]);
    if (!f) throw new NotFoundException("Funcionário não encontrado.");
    const globalDias = cfg?.bancoHorasToleranciaFechamentoDias ?? 0;
    const individualDias = f.bancoHorasToleranciaFechamentoDias;
    return { individualDias, globalDias, efetivoDias: individualDias ?? globalDias };
  }

  /** `null`/vazio remove a tolerância individual (volta a valer a global). */
  async setToleranciaFechamento(id: string, valor: unknown) {
    let dias: number | null;
    try {
      dias = inteiroConfig(valor, "Tolerância individual (dias)");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    await this.prisma.funcionario.update({
      where: { id },
      data: { bancoHorasToleranciaFechamentoDias: dias }
    });
    return this.getToleranciaFechamento(id);
  }

  async getCessoes(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUnique({ where: { id: funcionarioId } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");
    return listarCessoes(this.prisma, funcionarioId);
  }

  private async alterarCessao(
    funcionarioId: string,
    operacao: (tx: Prisma.TransactionClient) => Promise<void>
  ) {
    const func = await this.prisma.funcionario.findUnique({ where: { id: funcionarioId } });
    if (!func) throw new NotFoundException("Funcionário não encontrado");
    if (func.categoria !== "CONCURSADO") {
      throw new BadRequestException("Cessão se aplica somente à categoria Empregado.");
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await operacao(tx);
        await sincronizarFuncionarioComCessao(tx, funcionarioId);
      });
    } catch (e) {
      const msg = e instanceof Error ? ERROS_CESSAO[e.message] : undefined;
      if (msg) throw new BadRequestException(msg);
      throw e;
    }
    return {
      cessoes: await listarCessoes(this.prisma, funcionarioId),
      funcionario: await this.getFuncionario(funcionarioId)
    };
  }

  adicionarCessao(funcionarioId: string, p: PeriodoCessao) {
    return this.alterarCessao(funcionarioId, async (tx) => {
      await adicionarCessao(tx, funcionarioId, p);
      /* Registrar um período implica cessão marcada. */
      await tx.funcionario.update({ where: { id: funcionarioId }, data: { cedido: true } });
    });
  }

  atualizarCessao(funcionarioId: string, cessaoId: string, p: PeriodoCessao) {
    return this.alterarCessao(funcionarioId, (tx) =>
      atualizarCessao(tx, funcionarioId, cessaoId, p)
    );
  }

  removerCessao(funcionarioId: string, cessaoId: string) {
    return this.alterarCessao(funcionarioId, (tx) => removerCessao(tx, funcionarioId, cessaoId));
  }

  async deleteFuncionario(id: string, superAdminSub: string, numeroChamado: string) {
    this.logger.warn(
      `Exclusão de funcionário ${id} autorizada pelo Super Administrador ${superAdminSub} ` +
        `— chamado interno: ${numeroChamado}`
    );
    await this.notificacaoService
      .notificarRhPapelCriticoDesativado(id)
      .catch((e) =>
        this.logger.error(`Falha ao notificar RH antes de excluir funcionário (${id}): ${e}`)
      );
    return this.prisma.funcionario.delete({ where: { id } });
  }
}
