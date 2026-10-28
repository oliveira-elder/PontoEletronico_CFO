import { mascararNome, registrarDocumentoEmitido } from "../../utils/documentos-emitidos";
import { RepLivroService } from "../rep/rep-livro.service";
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  OnModuleInit,
  Optional
} from "@nestjs/common";
import { TipoPonto, OrigemPonto, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { listarCidGrupos, listarTiposLicenca } from "../../utils/licenca-db";
import { grupoDoCid, normalizarCid } from "../../utils/cid";
import {
  datasUsadasDoTipo,
  resumoRegra,
  validarPedidoLicenca,
  type TipoLicencaRegra
} from "../../utils/licenca-regras";
import {
  STATUS_SOLICITACAO_COTA_EM_USO,
  janelaDoDia,
  validarCotaAbono
} from "../../utils/abono-cota";
import {
  alocarCredito,
  calcularMinutosDoAbono,
  fmtHoraMin,
  aplicarLiberacoesNoExtrato,
  situacaoDasLiberacoes,
  totalDisponivel
} from "../../utils/banco-horas-liberacao";
import { carregarLiberacoes, carregarUsoCredito } from "../../utils/banco-horas-liberacao-db";
import { FotoService } from "./foto.service";
import { DocumentoService } from "./documento.service";
import { FeriadoConfigService } from "./feriado-config.service";
import { NotificacaoService } from "../notificacao/notificacao.service";
import { ConfigSolicitacoesService } from "./config-solicitacoes.service";
import { CreateRegistroDto } from "./dto/create-registro.dto";
import {
  dataBrasiliaISO,
  dataCivilPeriodo,
  dataCivilISO,
  dataCivilFimAfastamento,
  horarioDeDataBrasilia,
  horarioParaMinutos,
  aplicarHorarioBrasilia,
  hojeBrasiliaISO,
  intervaloColunaDate,
  intervaloDiaBrasilia,
  fimDiaCivilBrasilia,
  minutosParaHorario,
  validarHorarioPermitido
} from "../../utils/horario-brasilia";
import { appendObservacao } from "../../utils/registro-observacoes";
import { montarRelatorioQuadro } from "../../utils/historico-quadro";
import { previsaoInicioAlmoco } from "../../utils/previsao-registros";
import { assertMesAposGoLive, getDataInicioProducao } from "../../utils/inicio-producao";
import { inicioAtividadesUsuario } from "../../utils/inicio-atividades";
import {
  jornadaEsperadaMin,
  resolverJornadaHistoricoContexto,
  calcularJornadaParcialFeriado,
  calcularJornadaComAtestadoParcial,
  calcularJornadaComAtestadosParciais,
  calcularJanelasEfetivasComCreditoDeslocamento,
  calcularCreditoDeslocamentoIda,
  encontrarRetornoAposAtestado,
  encontrarSaidaAntesDoAtestado,
  saidaEhAlmoco,
  prepararRegsCalculoAtestadosParciais,
  isAfastamentoParcial,
  labelAtestadosParciais,
  dispensarAlmocoPorAtestadoParcial,
  atestadoParcialEhMatutino,
  atestadoParcialIntersectaJanelaAlmoco,
  normalizarRegsAtestadoSemAlmoco,
  horarioNoPeriodoAfastamento,
  aplicarMargemCalculoDiario,
  creditoAlmocoDireitoDoDia
} from "../../utils/jornada-historico";
import { enriquecerAfastamentosComSolicitacoes } from "../../utils/atestado-parcial-enrich";
import {
  classificarTurnoEntrada,
  criarObservacaoCategoriaSemIntervalo,
  criarObservacaoTurnoSemIntervalo,
  observacaoTurnoSemIntervalo,
  observacaoForcaSemIntervalo
} from "../../utils/turno-entrada";
import {
  categoriaSemIntervaloAlmoco,
  categoriaSemHoraExtra,
  funcionarioSemRegistroPonto,
  categoriaSemVisibilidadeBancoHoras,
  diaSemObrigacaoPonto,
  labelCategoriaSemIntervalo,
  labelSemRegistroPonto,
  periodosSemObrigacaoPonto,
  type CategoriaSemIntervaloAlmoco
} from "../../utils/categoria-jornada";
import { ensureCategoriaHistorico } from "../../utils/categoria-historico";
import { cedidoHoje, diaEmCessao, periodosCessao } from "../../utils/cessao-historico";
import { ehDiaAbonado } from "../../utils/feriado-rotulo";
import { montarDiaNeutro } from "../../utils/dias-neutros";
import {
  TIPOS_REQUERIMENTO_CADASTRO,
  cpfValido,
  syncCapacitacoes,
  syncDependentes,
  syncFormacoesAcademicas,
  type CapacitacaoInput,
  type DependenteInput,
  type FormacaoAcademicaInput
} from "../../utils/cadastro-listas";
import { calcHorasTrabalhadasMinutos } from "../../utils/calc-horas-trabalhadas";
import { resolverCicloBancoHoras, listarCiclosBancoHoras } from "../../utils/banco-horas-marco";
import { toleranciaFechamentoDias } from "../../utils/tolerancia-fechamento";
import { codigoCienciaGestorExibido } from "../../utils/assinatura-codigo";
import { exigenciasCicloPresencial } from "../../utils/ciclo-completo-presencial";
import { cicloCompleto } from "../../utils/ciclo-completo";
import {
  type AvisoInterjornada,
  calcularInterjornada,
  fmtDiaHoraBrasilia,
  interjornadaCurtaPorDia,
  mensagemInterjornada,
  ultimaSaidaFechada
} from "../../utils/interjornada";
import {
  intervalosDaSolicitacao,
  periodosDoAbono,
  validarPeriodosAbono
} from "../../utils/abono-periodos";
import {
  diasCorridos,
  somarDiasIso,
  validarPeriodosEstagiario,
  validarPeriodosFerias,
  type CalendarioFerias
} from "../../utils/ferias-regras";
import { ordemArquivoRodada, rodadasDe, type RodadaFeriasMeta } from "../../utils/ferias-rodadas";
import {
  aplicarRegraHoraExtra,
  carregarContextoHoraExtra,
  rotulosModalidadePorDia,
  contextoDoDia,
  diasCicloCompletoEmCasa,
  type AjusteHoraExtraDia
} from "../../utils/hora-extra-decisao";
import {
  validarItensCorrecaoPontoPausa,
  type ItemCorrecaoPonto
} from "../../utils/correcao-ponto-pausa";

/* Status que encerram a análise da solicitação — a partir daqui, documentos
   anexados pelo funcionário não podem mais ser editados/substituídos. */
const STATUS_FINALIZADOS = ["APROVADA", "REJEITADA", "REJEITADA_GESTOR", "REJEITADA_RH"];

const TIPO_AFASTAMENTO_LABEL: Record<string, string> = {
  FERIAS: "Férias",
  ATESTADO: "Atestado médico",
  LICENCA_MEDICA: "Licença",
  LICENCA_MATERNIDADE: "Licença maternidade",
  LICENCA_PATERNIDADE: "Licença paternidade",
  FALTA_JUSTIFICADA: "Falta justificada",
  FALTA_INJUSTIFICADA: "Falta injustificada",
  ABONO: "Abono"
};

const TIPO_SOLICITACAO_LABEL: Record<string, string> = {
  CORRECAO_PONTO: "Correção de ponto",
  ATESTADO: "Atestado médico",
  FERIAS: "Férias",
  LICENCA: "Licença e Outros",
  ABONO: "Abono",
  DAY_OFF: "Day Off de Aniversário",
  HORA_EXTRA: "Hora Extra",
  ENVIO_DOCUMENTO_RH: "Envio de documento ao RH"
};

const TIPO_PONTO_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  INICIO_INTERVALO: "Início do intervalo",
  FIM_INTERVALO: "Fim do intervalo",
  INTERROMPER_EXPEDIENTE: "Interromper expediente",
  REINICIAR_EXPEDIENTE: "Reiniciar expediente"
};

function extrairTiposCorrecaoPonto(metadados: unknown): string[] {
  if (!metadados || typeof metadados !== "object") return [];
  const meta = metadados as Record<string, unknown>;
  if (Array.isArray(meta.correcoesDia)) {
    return meta.correcoesDia
      .map((c) => (c as { tipoRegistro?: string })?.tipoRegistro)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
  }
  if (typeof meta.tipoRegistro === "string" && meta.tipoRegistro) {
    return [meta.tipoRegistro];
  }
  return [];
}

function periodosSobrepostos(inicioA: Date, fimA: Date, inicioB: Date, fimB: Date): boolean {
  return inicioA <= fimB && fimA >= inicioB;
}

function fmtDataBr(iso: string | Date): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return String(iso);
  }
}

type SolicitacaoCorrecaoRef = {
  id: string;
  status: string;
  dataReferencia: Date;
  dataInicio: Date | null;
  dataFim: Date | null;
  metadados: unknown;
};

const STATUS_BLOQUEIO_CORRECAO_PONTO = [
  "APROVADA",
  "REJEITADA",
  "REJEITADA_GESTOR",
  "REJEITADA_RH"
] as const;

function encontrarConflitoCorrecaoPonto(
  existentes: SolicitacaoCorrecaoRef[],
  novosTipos: Set<string>,
  novoInicio: Date,
  novoFim: Date,
  alteracaoDeId: string | null
): SolicitacaoCorrecaoRef | undefined {
  return existentes.find((s) => {
    if (alteracaoDeId && s.id === alteracaoDeId) return false;
    const inicioExist = s.dataInicio ?? s.dataReferencia;
    const fimExist = s.dataFim ?? inicioExist;
    if (!periodosSobrepostos(novoInicio, novoFim, inicioExist, fimExist)) return false;
    const tiposExist = extrairTiposCorrecaoPonto(s.metadados);
    return tiposExist.some((t) => novosTipos.has(t));
  });
}

function labelsTiposConflitoCorrecao(
  novosTipos: Set<string>,
  conflito: SolicitacaoCorrecaoRef
): string {
  return [...novosTipos]
    .filter((t) => extrairTiposCorrecaoPonto(conflito.metadados).includes(t))
    .map((t) => TIPO_PONTO_LABEL[t] ?? t)
    .join(", ");
}

function descricaoRejeicaoCorrecao(status: string): string {
  switch (status) {
    case "REJEITADA_GESTOR":
      return "rejeitada pelo chefe";
    case "REJEITADA_RH":
      return "rejeitada pelo RH";
    default:
      return "rejeitada";
  }
}

/* Fase da jornada do dia, derivada da sequência de registros.
   MANHA/TARDE = trabalhando (antes/depois do almoço); PAUSA_* = expediente
   interrompido temporariamente dentro do respectivo período. */
type FaseJornada =
  | "NENHUMA"
  | "MANHA"
  | "PAUSA_MANHA"
  | "ALMOCO"
  | "TARDE"
  | "PAUSA_TARDE"
  | "ENCERRADA";

const ACOES_POR_FASE: Record<FaseJornada, string[]> = {
  NENHUMA: ["ENTRADA"],
  MANHA: ["INICIO_INTERVALO", "INTERROMPER_EXPEDIENTE", "SAIDA"],
  /* Pausa: só reiniciar — na janela de almoço vira FIM_INTERVALO (pausa já é o início). */
  PAUSA_MANHA: ["REINICIAR_EXPEDIENTE"],
  ALMOCO: ["FIM_INTERVALO"],
  TARDE: ["INTERROMPER_EXPEDIENTE", "SAIDA"],
  PAUSA_TARDE: ["REINICIAR_EXPEDIENTE"],
  ENCERRADA: []
};

const ACOES_BLOQUEADAS_NA_JANELA_ALMOCO = [
  "INTERROMPER_EXPEDIENTE",
  "REINICIAR_EXPEDIENTE",
  "SAIDA"
];

function horarioNaJanelaAlmoco(
  horaHHMM: string,
  almocoPodeIniciarA: string,
  almocoPodeIniciarAte: string
): boolean {
  const atual = horarioParaMinutos(horaHHMM);
  const ini = horarioParaMinutos(almocoPodeIniciarA);
  const fim = horarioParaMinutos(almocoPodeIniciarAte);
  return atual >= ini && atual <= fim;
}

/** União da janela de almoço: config global + jornada (início mais cedo, fim mais tarde). */
function janelaAlmocoUniao(
  jornada: { almocoPodeIniciarA?: string | null; almocoPodeIniciarAte?: string | null },
  cfg?: { almocoPodeIniciarA?: string | null; almocoPodeIniciarAte?: string | null } | null
): { inicio: string; fim: string } {
  const inicios = [cfg?.almocoPodeIniciarA, jornada.almocoPodeIniciarA, "11:30"].filter(
    (h): h is string => !!h
  );
  const fins = [cfg?.almocoPodeIniciarAte, jornada.almocoPodeIniciarAte, "13:00"].filter(
    (h): h is string => !!h
  );
  const inicio = inicios.reduce((a, b) => (horarioParaMinutos(a) <= horarioParaMinutos(b) ? a : b));
  const fim = fins.reduce((a, b) => (horarioParaMinutos(a) >= horarioParaMinutos(b) ? a : b));
  return { inicio, fim };
}

/** Pausa da manhã que já cruzou o início da janela: conta como almoço até o retorno,
 *  inclusive depois do fim da janela. Pausa só depois da janela continua pausa. */
function pausaManhaContaComoAlmoco(
  registros: { tipo: string; dataHora?: Date | string }[],
  agoraHHMM: string,
  almocoPodeIniciarA: string,
  almocoPodeIniciarAte: string
): boolean {
  let pausaEm: Date | string | undefined;
  for (const r of registros) {
    if (r.tipo === "INTERROMPER_EXPEDIENTE") pausaEm = r.dataHora;
    else if (r.tipo === "REINICIAR_EXPEDIENTE" || r.tipo === "INICIO_INTERVALO")
      pausaEm = undefined;
  }
  if (!pausaEm) return false;
  const pausaHH = horarioDeDataBrasilia(new Date(pausaEm)).substring(0, 5);
  const pausaMin = horarioParaMinutos(pausaHH);
  const agoraMin = horarioParaMinutos(agoraHHMM.substring(0, 5));
  const ini = horarioParaMinutos(almocoPodeIniciarA);
  const fim = horarioParaMinutos(almocoPodeIniciarAte);
  return pausaMin <= fim && agoraMin >= ini;
}

const ESTADO_POR_FASE: Record<FaseJornada, "FORA" | "TRABALHANDO" | "INTERVALO" | "PAUSADO"> = {
  NENHUMA: "FORA",
  MANHA: "TRABALHANDO",
  PAUSA_MANHA: "PAUSADO",
  ALMOCO: "INTERVALO",
  TARDE: "TRABALHANDO",
  PAUSA_TARDE: "PAUSADO",
  ENCERRADA: "FORA"
};

/** Documento de férias enviado pelo RH, com a assinatura ou a rejeição do funcionário. */
interface DocumentoFeriasMeta {
  tipo: string;
  rotulo?: string;
  nome?: string | null;
  url: string;
  urlAssinado?: string;
  assinatura?: Record<string, unknown>;
  rejeicao?: { nome: string; em: string; justificativa: string };
}

@Injectable()
export class PontoService implements OnModuleInit {
  private readonly logger = new Logger(PontoService.name);

  onModuleInit() {
    this.migrarDocumentosEmbutidos().catch((e) =>
      this.logger.warn(`Migração de documentos embutidos falhou: ${(e as Error).message}`)
    );
  }

  /**
   * Solicitações gravadas com o arquivo dentro de `metadados.documentoBase64` (ex.: abono
   * enviado enquanto o backend ainda não salvava anexo de abono): salva o arquivo como
   * documento e troca o base64 pelo `documentoUrl`. Idempotente — roda a cada início.
   */
  private async migrarDocumentosEmbutidos() {
    const linhas = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Solicitacao" WHERE metadados ? 'documentoBase64'`;
    for (const { id } of linhas) {
      const sol = await this.prisma.solicitacao.findUnique({
        where: { id },
        select: { id: true, funcionarioId: true, metadados: true }
      });
      const meta = { ...((sol?.metadados ?? {}) as Record<string, unknown>) };
      if (!sol || typeof meta.documentoBase64 !== "string") continue;
      const url = await this.documentoService.salvarDocumento({
        funcionarioId: sol.funcionarioId,
        solicitacaoId: sol.id,
        arquivoBase64: meta.documentoBase64,
        mimeType: typeof meta.documentoMime === "string" ? meta.documentoMime : undefined
      });
      delete meta.documentoBase64;
      delete meta.documentoMime;
      await this.prisma.solicitacao.update({
        where: { id: sol.id },
        data: { metadados: { ...meta, documentoUrl: url } as Prisma.InputJsonValue }
      });
      this.logger.log(`Documento embutido da solicitação ${sol.id} salvo em ${url}.`);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly fotoService: FotoService,
    private readonly documentoService: DocumentoService,
    private readonly feriadoConfigService: FeriadoConfigService,
    private readonly notificacaoService: NotificacaoService,
    private readonly configSolicitacoesService: ConfigSolicitacoesService,
    @Optional() private readonly repLivro?: RepLivroService
  ) {}

  /* ─── Helpers ─── */

  private async getJornadaHistoricoContexto(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        jornadaPeriodoId: true,
        jornadaHorasDia: true,
        jornadaPeriodoDesde: true,
        jornadaPeriodoAssociadoEm: true,
        jornadaPeriodo: {
          select: {
            nome: true,
            jornadaDiariaMin: true,
            horaEntrada: true,
            horaSaida: true,
            almocoMinMin: true,
            almocoPodeIniciarA: true,
            almocoPodeIniciarAte: true,
            toleranciaEntradaMin: true,
            toleranciaSaidaMin: true,
            toleranciaCalculoMin: true,
            horaExtraLimiteAuto: true
          }
        }
      }
    });
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: {
        horaEntrada: true,
        horaSaida: true,
        almocoMinMin: true,
        almocoPodeIniciarA: true,
        almocoPodeIniciarAte: true,
        toleranciaEntradaMin: true,
        toleranciaSaidaMin: true,
        toleranciaCalculoMin: true,
        horaExtraLimiteAuto: true
      }
    });
    let periodo = func?.jornadaPeriodo ?? null;
    if (!periodo) {
      periodo = await this.prisma.jornadaPeriodo.findFirst({
        where: { ePadrao: true, ativo: true },
        select: {
          nome: true,
          jornadaDiariaMin: true,
          horaEntrada: true,
          horaSaida: true,
          almocoMinMin: true,
          almocoPodeIniciarA: true,
          almocoPodeIniciarAte: true,
          toleranciaEntradaMin: true,
          toleranciaSaidaMin: true,
          toleranciaCalculoMin: true,
          horaExtraLimiteAuto: true
        }
      });
    }
    const cfgSolicitacoes = await this.configSolicitacoesService.getConfig();
    return {
      ...resolverJornadaHistoricoContexto({
        ...func,
        jornadaPeriodo: periodo,
        configuracaoHoraEntrada: cfg?.horaEntrada ?? null,
        configuracaoHoraSaida: cfg?.horaSaida ?? null,
        configuracaoAlmocoMinMin: cfg?.almocoMinMin ?? null,
        configuracaoAlmocoPodeIniciarA: cfg?.almocoPodeIniciarA ?? null,
        configuracaoAlmocoPodeIniciarAte: cfg?.almocoPodeIniciarAte ?? null,
        configuracaoToleranciaEntradaMin: cfg?.toleranciaEntradaMin ?? null,
        configuracaoToleranciaSaidaMin: cfg?.toleranciaSaidaMin ?? null,
        configuracaoToleranciaCalculoMin: cfg?.toleranciaCalculoMin ?? null,
        configuracaoHoraExtraLimiteAuto: cfg?.horaExtraLimiteAuto ?? null
      }),
      atestadoTempoRetornoMin: cfgSolicitacoes.atestadoTempoRetornoMin,
      atestadoTempoIdaMin: cfgSolicitacoes.atestadoTempoIdaMin
    };
  }

  private jornadaDiariaParaDia(
    ctx: { anteriorMin: number; atualMin: number; vigenciaDesde: string | null },
    isoDate: string
  ): number {
    return jornadaEsperadaMin(isoDate, ctx);
  }

  /* Retorna os parâmetros de jornada efetivos para um funcionário:
     1. JornadaPeriodo atribuído ao funcionário
     2. JornadaPeriodo marcado como padrão (ePadrao = true)
     3. Fallback: campos do ConfiguracaoSistema singleton */
  private async getJornadaEfetiva(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { jornadaPeriodoId: true, jornadaHorasDia: true }
    });

    if (func?.jornadaPeriodoId) {
      const jp = await this.prisma.jornadaPeriodo.findUnique({
        where: { id: func.jornadaPeriodoId }
      });
      if (jp) return jp;
    }

    const padrao = await this.prisma.jornadaPeriodo.findFirst({
      where: { ePadrao: true, ativo: true }
    });
    if (padrao) return padrao;

    const cfg = await this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } });
    return {
      jornadaDiariaMin: (func?.jornadaHorasDia ?? 8) * 60,
      jornadaSemanalMin: cfg?.jornadaSemanalMin ?? 2400,
      diasUteis: cfg?.diasUteis ?? "[false,true,true,true,true,true,false]",
      tipoFlexibilidade: cfg?.tipoFlexibilidade ?? "FIXO",
      horaEntrada: cfg?.horaEntrada ?? "08:00",
      horaSaida: cfg?.horaSaida ?? "17:00",
      toleranciaEntradaMin: cfg?.toleranciaEntradaMin ?? 5,
      toleranciaSaidaMin: cfg?.toleranciaEntradaMin ?? cfg?.toleranciaSaidaMin ?? 5,
      toleranciaHoraExtraMin: cfg?.toleranciaHoraExtraMin ?? 10,
      toleranciaCalculoMin: cfg?.toleranciaCalculoMin ?? 0,
      almocoPodeIniciarA: cfg?.almocoPodeIniciarA ?? "11:30",
      almocoPodeIniciarAte: cfg?.almocoPodeIniciarAte ?? "13:00",
      almocoMinMin: cfg?.almocoMinMin ?? 60,
      almocoMaxMin: cfg?.almocoMaxMin ?? 90,
      bancoHorasLimiteMin: cfg?.bancoHorasLimiteMin ?? 120,
      bancoHorasVigenciaDias: cfg?.bancoHorasVigenciaDias ?? 30,
      horaExtraLimiteAuto: cfg?.horaExtraLimiteAuto ?? 120
    };
  }

  /** Média dos inícios de almoço do colaborador (últimos 90 dias, até 40 registros). */
  private async mediaInicioAlmocoHistorico(
    funcionarioId: string,
    hojeIso: string,
    janelaInicio: string,
    janelaFim: string
  ): Promise<string> {
    const { inicio: inicioHoje } = intervaloDiaBrasilia(hojeIso);
    const desde = new Date(inicioHoje);
    desde.setUTCDate(desde.getUTCDate() - 90);
    const regs = await this.prisma.registroPonto.findMany({
      where: {
        funcionarioId,
        tipo: "INICIO_INTERVALO",
        apenasInformativo: false,
        dataHora: { gte: desde, lt: inicioHoje }
      },
      select: { dataHora: true },
      orderBy: { dataHora: "desc" },
      take: 40
    });
    const historicoHHMM = regs.map((r) => horarioDeDataBrasilia(r.dataHora).substring(0, 5));
    return previsaoInicioAlmoco({
      historicoHHMM,
      janelaInicio,
      janelaFim,
      fallback: janelaInicio
    });
  }

  /* Resolve Keycloak sub → User (via externalId) → Funcionario.
     Auto-cria o Funcionario se não existir (User já deve existir via /api/auth/me). */
  /**
   * Funcionário do usuário logado (`sub` do Keycloak) ou, em rotas do RH, a referência
   * `@func:<id>` — assim os mesmos métodos servem ao RH que age em nome do funcionário.
   */
  private async getFuncionario(keycloakSub: string) {
    if (keycloakSub.startsWith("@func:")) {
      const alvo = await this.prisma.funcionario.findUnique({
        where: { id: keycloakSub.slice(6) },
        include: { enderecoResidencial: true }
      });
      if (!alvo) throw new NotFoundException("Funcionário não encontrado.");
      return alvo;
    }
    const user = await this.prisma.user.findUnique({ where: { externalId: keycloakSub } });
    if (!user) {
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    }

    const f = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      include: { enderecoResidencial: true }
    });
    if (!f) {
      // Não inventa matrícula aqui: a criação do Funcionario (com ou sem matrícula real)
      // é responsabilidade exclusiva do AuthService.syncUser, chamado por /api/auth/me,
      // que também aplica o bloqueio de acesso para quem não tem matrícula (SEM_MATRICULA).
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    }
    return f;
  }

  /* Solicita que a próxima ENTRADA com foto atualize a foto de perfil. */
  async solicitarAtualizacaoFotoPerfil(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    await this.prisma.funcionario.update({
      where: { id: func.id },
      data: { solicitarAtualizacaoFoto: true }
    });
    return { ok: true };
  }

  private haversineMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private dentroDoRaio(dist: number, raio: number, precisaoMetros?: number): boolean {
    const acc = Number.isFinite(precisaoMetros) ? Math.max(0, Number(precisaoMetros)) : 50;
    const margem = Math.min(acc, Math.max(50, raio));
    return dist <= raio + margem;
  }

  /** HOME_OFFICE / HIBRIDO / VIAGEM são modos de trabalho, não origem de dispositivo. */
  private normalizarOrigemPonto(origem?: string): OrigemPonto {
    if (origem === "DESKTOP") return OrigemPonto.DESKTOP;
    if (origem === "TOTEM") return OrigemPonto.TOTEM;
    if (origem === "WEB") return OrigemPonto.WEB;
    if (
      origem === "MOBILE" ||
      origem === "HIBRIDO" ||
      origem === "HOME_OFFICE" ||
      origem === "VIAGEM"
    ) {
      return OrigemPonto.MOBILE;
    }
    return OrigemPonto.WEB;
  }

  private async encontrarAreaViagem(lat: number, lng: number, precisaoMetros?: number) {
    const areas = await this.prisma.areaViagem.findMany({ where: { ativa: true } });
    for (const area of areas) {
      if (area.lat != null && area.lng != null) {
        const d = this.haversineMetros(lat, lng, Number(area.lat), Number(area.lng));
        if (this.dentroDoRaio(d, area.raioMetros, precisaoMetros)) return area;
      }
    }
    return null;
  }

  private async obterLimitesHorarioPonto() {
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { pontoHorarioMinimo: true, pontoHorarioMaximo: true }
    });
    return {
      min: cfg?.pontoHorarioMinimo ?? "06:00",
      max: cfg?.pontoHorarioMaximo ?? "23:59"
    };
  }

  /* Conta quantos dias da semana corrente (seg–dom, horário de Brasília) o
     funcionário já registrou ENTRADA em modo remoto (HIBRIDO ou HOME_OFFICE). */
  private async contarDiasRemotosSemana(funcionarioId: string): Promise<number> {
    const hoje = new Date();
    const diaSemana = hoje.getDay(); // 0=dom, 1=seg...
    const diasAteSeg = diaSemana === 0 ? 6 : diaSemana - 1;
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - diasAteSeg);
    seg.setHours(0, 0, 0, 0);
    const dom = new Date(seg);
    dom.setDate(seg.getDate() + 6);
    dom.setHours(23, 59, 59, 999);

    const entradas = await this.prisma.registroPonto.findMany({
      where: {
        funcionarioId,
        tipo: "ENTRADA",
        dataHora: { gte: seg, lte: dom },
        modoRegistro: { in: ["HIBRIDO", "HOME_OFFICE"] }
      },
      select: { dataHora: true }
    });

    const diasUnicos = new Set(entradas.map((r) => dataBrasiliaISO(r.dataHora)));
    return diasUnicos.size;
  }

  private validarHorarioAtualPonto() {
    return this.obterLimitesHorarioPonto().then((limites) => {
      const agora = horarioDeDataBrasilia(new Date());
      const validacao = validarHorarioPermitido(agora, limites.min, limites.max);
      if (!validacao.ok) {
        throw new BadRequestException(validacao.message);
      }
    });
  }

  /* Percorre os registros do dia e deriva a fase atual da jornada,
     considerando pausas (INTERROMPER_EXPEDIENTE/REINICIAR_EXPEDIENTE)
     dentro dos períodos da manhã (antes do almoço) e da tarde (depois).
     ENTRADA com observação TURNO_SEM_INTERVALO (ou categoria carga corrida)
     pula o almoço e vai para TARDE. */
  private getFaseEAcoes(
    registros: { tipo: string; observacoes?: unknown; dataHora?: Date | string }[],
    opts?: {
      forcarSemIntervalo?: boolean;
      naJanelaAlmoco?: boolean;
      agoraHora?: string;
      almocoPodeIniciarA?: string;
      almocoPodeIniciarAte?: string;
    }
  ): {
    fase: FaseJornada;
    acoesPermitidas: string[];
  } {
    const forcarSemIntervalo = !!opts?.forcarSemIntervalo;
    const naJanelaAlmoco = !!opts?.naJanelaAlmoco;
    let fase: FaseJornada = "NENHUMA";
    for (const r of registros) {
      switch (r.tipo) {
        case "ENTRADA":
          fase =
            forcarSemIntervalo || observacaoForcaSemIntervalo(r.observacoes) ? "TARDE" : "MANHA";
          break;
        case "INICIO_INTERVALO":
          fase = "ALMOCO";
          break;
        case "FIM_INTERVALO":
          fase = "TARDE";
          break;
        case "SAIDA":
          fase = "ENCERRADA";
          break;
        case "INTERROMPER_EXPEDIENTE":
          if (fase === "MANHA") fase = "PAUSA_MANHA";
          else if (fase === "TARDE") fase = "PAUSA_TARDE";
          break;
        case "REINICIAR_EXPEDIENTE":
          if (fase === "PAUSA_MANHA") fase = "MANHA";
          else if (fase === "PAUSA_TARDE") fase = "TARDE";
          break;
      }
    }

    /* Estagiário: nunca fica em fases de almoço — pausa vira PAUSA_TARDE. */
    if (forcarSemIntervalo) {
      if (fase === "MANHA") fase = "TARDE";
      else if (fase === "PAUSA_MANHA") fase = "PAUSA_TARDE";
      else if (fase === "ALMOCO") fase = "TARDE";
    }

    let acoesPermitidas = ACOES_POR_FASE[fase];
    if (forcarSemIntervalo) {
      acoesPermitidas = acoesPermitidas.filter(
        (a) => a !== "INICIO_INTERVALO" && a !== "FIM_INTERVALO"
      );
    } else if (naJanelaAlmoco && fase === "MANHA") {
      acoesPermitidas = ["INICIO_INTERVALO"];
    } else if (naJanelaAlmoco && fase === "PAUSA_MANHA") {
      /* Pausa na janela global/jornada de almoço: o retorno é Fim do Almoço, não Reiniciar. */
      acoesPermitidas = ["FIM_INTERVALO"];
    } else if (
      fase === "PAUSA_MANHA" &&
      opts?.agoraHora &&
      opts.almocoPodeIniciarA &&
      opts.almocoPodeIniciarAte &&
      pausaManhaContaComoAlmoco(
        registros,
        opts.agoraHora,
        opts.almocoPodeIniciarA,
        opts.almocoPodeIniciarAte
      )
    ) {
      /* Pausa que cruzou a janela já é almoço — Fim do Almoço vale também depois da janela. */
      acoesPermitidas = ["FIM_INTERVALO"];
    }
    return { fase, acoesPermitidas };
  }

  /* ─── Status atual (hoje) ─── */

  async getStatusAtual(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    const hojeIso = hojeBrasiliaISO();
    const { inicio, fim } = intervaloDiaBrasilia(hojeIso);

    const historicoCat = await ensureCategoriaHistorico(this.prisma, func.id);
    const pontoObrigatorioDesde = func.pontoObrigatorioDesde
      ? dataCivilISO(func.pontoObrigatorioDesde)
      : null;
    const isentoHoje = diaSemObrigacaoPonto(hojeIso, {
      historico: historicoCat,
      categoriaAtual: func.categoria,
      isManagerAtual: func.isManager,
      isFiscalAtual: func.isFiscal,
      registroPontoObrigatorioAtual: func.registroPontoObrigatorio,
      pontoObrigatorioDesde
    });

    const registros = await this.prisma.registroPonto.findMany({
      where: {
        funcionarioId: func.id,
        dataHora: {
          gte: inicio,
          lte: fim
        }
      },
      orderBy: { dataHora: "asc" }
    });

    const ultimo = registros[registros.length - 1];

    const afastamento = await this.getAfastamentoDoDia(func.id, hojeIso);
    const agoraHora = horarioDeDataBrasilia(new Date());
    const afastamentoBloqueiaAgora =
      !!afastamento &&
      (!isAfastamentoParcial(afastamento) ||
        horarioNoPeriodoAfastamento(
          agoraHora,
          afastamento.horarioInicio!,
          afastamento.horarioFim!
        ));
    const afastamentoHoje =
      afastamento && afastamentoBloqueiaAgora
        ? {
            tipo: afastamento.tipo,
            label: isAfastamentoParcial(afastamento)
              ? `${TIPO_AFASTAMENTO_LABEL[afastamento.tipo] ?? afastamento.tipo} (${afastamento.horarioInicio}–${afastamento.horarioFim})`
              : (TIPO_AFASTAMENTO_LABEL[afastamento.tipo] ?? afastamento.tipo),
            dataInicio: dataBrasiliaISO(afastamento.dataInicio),
            dataFim: dataBrasiliaISO(afastamento.dataFim),
            horarioInicio: afastamento.horarioInicio ?? null,
            horarioFim: afastamento.horarioFim ?? null
          }
        : null;

    const semIntervaloCategoria = categoriaSemIntervaloAlmoco(func.categoria);
    const jornada = await this.getJornadaEfetiva(func.id);
    const cfgAlmoco = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { almocoPodeIniciarA: true, almocoPodeIniciarAte: true }
    });
    const janelaAlmoco = janelaAlmocoUniao(jornada, cfgAlmoco);
    const almocoPodeIniciarA = janelaAlmoco.inicio;
    const almocoPodeIniciarAte = janelaAlmoco.fim;
    const previsaoInicioAlmocoHora = semIntervaloCategoria
      ? null
      : await this.mediaInicioAlmocoHistorico(
          func.id,
          hojeIso,
          almocoPodeIniciarA,
          almocoPodeIniciarAte
        );
    const naJanelaAlmoco = horarioNaJanelaAlmoco(
      agoraHora,
      almocoPodeIniciarA,
      almocoPodeIniciarAte
    );
    const atestadoMatutino =
      !!afastamento &&
      isAfastamentoParcial(afastamento) &&
      !!afastamento.horarioInicio &&
      !!afastamento.horarioFim &&
      atestadoParcialEhMatutino(afastamento.horarioInicio, afastamento.horarioFim, {
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "12:00",
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
      });
    /* Atestado matutino só dispensa o botão de almoço se cobrir a janela
       (retorno após o intervalo). Atestado curto (ex.: 08:00–09:30) mantém o ciclo. */
    const atestadoDispensaAlmoco =
      atestadoMatutino &&
      !!afastamento?.horarioInicio &&
      !!afastamento?.horarioFim &&
      atestadoParcialIntersectaJanelaAlmoco(afastamento.horarioInicio, afastamento.horarioFim, {
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
      });
    const { fase, acoesPermitidas: acoesPorFase } = this.getFaseEAcoes(registros, {
      forcarSemIntervalo: semIntervaloCategoria || atestadoDispensaAlmoco,
      naJanelaAlmoco,
      agoraHora,
      almocoPodeIniciarA,
      almocoPodeIniciarAte
    });
    const acoesPermitidas = afastamentoHoje || isentoHoje ? [] : acoesPorFase;
    const estado = afastamentoHoje || isentoHoje ? "FORA" : ESTADO_POR_FASE[fase];

    let jornadaMinutos = jornada.jornadaDiariaMin;
    if (
      afastamento &&
      isAfastamentoParcial(afastamento) &&
      afastamento.horarioInicio &&
      afastamento.horarioFim
    ) {
      const cfgSolicitacoes = await this.configSolicitacoesService.getConfig();
      const regsMinHoje = registros.map((r) => ({
        tipo: r.tipo,
        minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora))
      }));
      const [janelaEfetivaHoje] = calcularJanelasEfetivasComCreditoDeslocamento(
        [{ horarioInicio: afastamento.horarioInicio, horarioFim: afastamento.horarioFim }],
        regsMinHoje,
        {
          toleranciaRetornoMin: cfgSolicitacoes.atestadoTempoRetornoMin,
          toleranciaIdaMin: cfgSolicitacoes.atestadoTempoIdaMin,
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? undefined,
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? undefined
        }
      );
      jornadaMinutos = calcularJornadaComAtestadoParcial(
        afastamento.horarioInicio,
        janelaEfetivaHoje.horarioFim,
        {
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          jornadaDiariaMin: jornada.jornadaDiariaMin,
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
        }
      );
    }

    const entradaHoje = registros.find((r) => r.tipo === "ENTRADA");
    const obsTurno = entradaHoje ? observacaoTurnoSemIntervalo(entradaHoje.observacoes) : undefined;
    const obsForcaSemIntervalo = entradaHoje
      ? observacaoForcaSemIntervalo(entradaHoje.observacoes)
      : undefined;
    const optsDispAlmoco = {
      horarioInicio: afastamento?.horarioInicio,
      horarioFim: afastamento?.horarioFim,
      almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
      almocoMinMin: jornada.almocoMinMin ?? 60,
      almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
    };
    const semIntervalo =
      !!obsForcaSemIntervalo ||
      semIntervaloCategoria ||
      dispensarAlmocoPorAtestadoParcial(
        isAfastamentoParcial(afastamento ?? {}),
        registros,
        optsDispAlmoco
      );

    const regsHoras = semIntervalo ? normalizarRegsAtestadoSemAlmoco(registros) : registros;
    const horasTrabalhadasMinutos = this.calcHorasMinutos(regsHoras, Date.now(), {
      exigirIntervalo: !semIntervalo,
      almocoMinMin: jornada.almocoMinMin ?? 60,
      almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
      almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
      horaEntrada: jornada.horaEntrada ?? "08:00",
      horaSaida: jornada.horaSaida ?? "17:00",
      toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
      toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
    });

    return {
      estado,
      fase,
      ultimoRegistro: ultimo ?? null,
      registrosHoje: registros,
      horasTrabalhadasMinutos,
      jornadaMinutos,
      /* Só o próximo registro PRINCIPAL/obrigatório: a pausa (Interromper Expediente) é opcional e
         não vira "próximo"; na pausa, o próximo obrigatório é Reiniciar Expediente. */
      proximaAcao: acoesPermitidas.find((a) => a !== "INTERROMPER_EXPEDIENTE") ?? null,
      acoesPermitidas,
      /* Descanso de interjornada em curso (só informativo; o bloqueio efetivo é no registro). */
      interjornada: await this.interjornadaParaStatus(func.id),
      /* Presencial: o dia exige o intervalo e ele ainda não foi registrado (só aviso; o registro
         continua como sempre — sem o intervalo, o dia fica Pendente). */
      intervaloPendenteParaFechar: await this.intervaloPendenteParaFechar(
        func.id,
        hojeIso,
        inicio,
        fim,
        registros
      ),
      /* Em casa, a Saída só é aceita depois do intervalo (aviso na tela; o bloqueio é no registro). */
      saidaExigeIntervalo:
        fase === "MANHA" &&
        (func.modoHomeOffice || func.modoHibridoLocal) &&
        this.cicloCompletoAtivoEm(
          (
            await this.prisma.configuracaoSistema.findUnique({
              where: { id: "singleton" },
              select: { cicloCompletoEmCasaDesde: true }
            })
          )?.cicloCompletoEmCasaDesde,
          hojeIso
        ),
      afastamentoHoje,
      categoria: func.categoria,
      isManager: func.isManager,
      isFiscal: func.isFiscal,
      semRegistroPonto: isentoHoje || funcionarioSemRegistroPonto(func),
      isentoHoje,
      modoHomeOffice: func.modoHomeOffice,
      modoHibridoLocal: func.modoHibridoLocal,
      semIntervalo,
      turno:
        obsTurno?.turno ??
        (atestadoDispensaAlmoco ? "VESPERTINO" : entradaHoje ? "MATUTINO" : null),
      motivoSemIntervalo:
        obsForcaSemIntervalo?.motivo ??
        (semIntervaloCategoria
          ? "CATEGORIA_CARGA_CORRIDA"
          : dispensarAlmocoPorAtestadoParcial(
                isAfastamentoParcial(afastamento ?? {}),
                registros,
                optsDispAlmoco
              )
            ? "ATESTADO_PARCIAL_SEM_ALMOCO"
            : null),
      almocoPodeIniciarA,
      almocoPodeIniciarAte,
      horaEntrada: jornada.horaEntrada ?? "08:00",
      horaSaida: jornada.horaSaida ?? "17:00",
      almocoMinMin: jornada.almocoMinMin ?? 60,
      previsaoInicioAlmoco: previsaoInicioAlmocoHora,
      enderecoResidencial: func.enderecoResidencial
        ? {
            lat: func.enderecoResidencial.lat != null ? Number(func.enderecoResidencial.lat) : null,
            lng: func.enderecoResidencial.lng != null ? Number(func.enderecoResidencial.lng) : null,
            raioMetros: func.enderecoResidencial.raioMetros
          }
        : null
    };
  }

  /* Busca um afastamento aprovado que cubra o dia informado (YYYY-MM-DD em Brasília).
     Compara pela data civil (UTC) gravada em dataInicio/dataFim, evitando
     desvios de fuso horário ao consultar uma janela de um único dia. */
  private async getAfastamentoDoDia(funcionarioId: string, diaISO: string) {
    const diaBase = new Date(`${diaISO}T00:00:00.000Z`);
    const diaAnterior = new Date(diaBase);
    diaAnterior.setUTCDate(diaAnterior.getUTCDate() - 1);
    const diaSeguinte = new Date(diaBase);
    diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);

    const candidatos = await this.prisma.afastamento.findMany({
      where: {
        funcionarioId,
        apenasInformativo: false,
        dataInicio: { lte: diaSeguinte },
        dataFim: { gte: diaAnterior }
      },
      select: {
        tipo: true,
        dataInicio: true,
        dataFim: true,
        horarioInicio: true,
        horarioFim: true
      }
    });

    return candidatos.find((a) => {
      const inicio = dataBrasiliaISO(a.dataInicio);
      const fim = dataCivilFimAfastamento(a.dataInicio, a.dataFim);
      return diaISO >= inicio && diaISO <= fim;
    });
  }

  /** Detalhe completo do(s) atestado(s)/abono(s) aprovado(s) que cobrem o dia
   *  informado — usado pelo modal de detalhe do badge "Atestado parcial" no
   *  Histórico do funcionário e na Auditoria. */
  async getAtestadoDoDia(funcionarioId: string, diaISO: string) {
    const { inicio, fim } = intervaloDiaBrasilia(diaISO);
    const sols = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: { in: ["ATESTADO", "ABONO"] },
        status: "APROVADA",
        OR: [
          { dataInicio: { lte: fim }, dataFim: { gte: inicio } },
          { dataReferencia: { gte: inicio, lte: fim } }
        ]
      },
      orderBy: { createdAt: "asc" }
    });
    if (!sols.length) return { atestados: [] };

    const userIds = [
      ...new Set(
        sols.flatMap((s) => [s.gestorUserId, s.rhUserId]).filter((id): id is string => !!id)
      )
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true }
        })
      : [];
    const nomePorId = new Map(users.map((u) => [u.id, u.name]));

    const cfgSolicitacoes = await this.configSolicitacoesService.getConfig();
    const registrosDia = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" }
    });
    const regsMin = registrosDia.map((r) => ({
      tipo: r.tipo,
      minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora))
    }));
    const jornadaDetalhe = await this.getJornadaEfetiva(funcionarioId);
    const almocoMinMin = jornadaDetalhe.almocoMinMin ?? 60;
    const janelaAlmocoDetalhe = {
      podeIniciarA: jornadaDetalhe.almocoPodeIniciarA ?? undefined,
      podeIniciarAte: jornadaDetalhe.almocoPodeIniciarAte ?? undefined
    };

    const atestados = sols.map((s) => {
      const meta = (s.metadados && typeof s.metadados === "object" ? s.metadados : {}) as Record<
        string,
        unknown
      >;
      const horarioInicio = typeof meta.horarioInicio === "string" ? meta.horarioInicio : null;
      const horarioFim = typeof meta.horarioFim === "string" ? meta.horarioFim : null;
      const cienciaGestor =
        meta.cienciaGestor && typeof meta.cienciaGestor === "object"
          ? (meta.cienciaGestor as Record<string, unknown>)
          : null;

      let deslocamento: {
        atrasoRealMin: number;
        creditoMin: number;
        toleranciaMin: number;
        horaRetorno: string;
      } | null = null;
      if (horarioInicio && horarioFim) {
        const retorno = encontrarRetornoAposAtestado(regsMin, horarioFim);
        const regRetorno = retorno
          ? registrosDia.find(
              (r) =>
                r.tipo === retorno.tipo &&
                horarioParaMinutos(horarioDeDataBrasilia(r.dataHora)) === retorno.minuto
            )
          : undefined;
        if (retorno && regRetorno) {
          const hfMin = horarioParaMinutos(horarioFim);
          const atrasoRealMin = retorno.minuto - hfMin;
          deslocamento = {
            atrasoRealMin,
            creditoMin: Math.max(
              0,
              Math.min(atrasoRealMin, cfgSolicitacoes.atestadoTempoRetornoMin)
            ),
            toleranciaMin: cfgSolicitacoes.atestadoTempoRetornoMin,
            horaRetorno: horarioDeDataBrasilia(regRetorno.dataHora).substring(0, 5)
          };
        }
      }

      /* Ida: saída do trabalho (saída, interrupção ou início do almoço) antes do início. */
      let deslocamentoIda: {
        deslocamentoRealMin: number;
        creditoMin: number;
        toleranciaMin: number;
        horaSaida: string;
        paraAlmoco: boolean;
      } | null = null;
      if (horarioInicio) {
        const saida = encontrarSaidaAntesDoAtestado(regsMin, horarioInicio);
        if (saida) {
          const paraAlmoco = saidaEhAlmoco(saida, janelaAlmocoDetalhe);
          const bruto = horarioParaMinutos(horarioInicio) - saida.minuto;
          deslocamentoIda = {
            deslocamentoRealMin: Math.max(0, bruto - (paraAlmoco ? almocoMinMin : 0)),
            creditoMin: calcularCreditoDeslocamentoIda(
              regsMin,
              horarioInicio,
              cfgSolicitacoes.atestadoTempoIdaMin,
              almocoMinMin,
              janelaAlmocoDetalhe
            ),
            toleranciaMin: cfgSolicitacoes.atestadoTempoIdaMin,
            horaSaida: minutosParaHorario(saida.minuto),
            paraAlmoco
          };
        }
      }

      const diStart = s.dataInicio ?? s.dataReferencia;
      const diEndRaw = s.dataFim ?? diStart;

      return {
        id: s.id,
        tipo: s.tipo,
        status: s.status,
        dataInicio: dataBrasiliaISO(diStart),
        dataFim: dataCivilFimAfastamento(diStart, diEndRaw),
        horarioInicio,
        horarioFim,
        descricao: s.descricao,
        documentoUrl: typeof meta.documentoUrl === "string" ? meta.documentoUrl : null,
        documentoRetornoUrl: s.documentoRetornoUrl,
        gestor: s.gestorUserId
          ? {
              nome: nomePorId.get(s.gestorUserId) ?? null,
              resolvidoEm: s.gestorResolvidoEm,
              observacao: s.gestorObservacao
            }
          : null,
        ciencia: cienciaGestor
          ? {
              em: (cienciaGestor.em as string | undefined) ?? null,
              nome: (cienciaGestor.gestorNome as string | undefined) ?? null,
              codigoHash: (cienciaGestor.codigoHash as string | undefined) ?? null
            }
          : null,
        rh: s.rhUserId
          ? {
              nome: nomePorId.get(s.rhUserId) ?? null,
              resolvidoEm: s.rhResolvidoEm,
              observacao: s.rhObservacao
            }
          : null,
        deslocamento,
        deslocamentoIda
      };
    });

    return { atestados };
  }

  async getMeuAtestadoDoDia(keycloakSub: string, diaISO: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.getAtestadoDoDia(func.id, diaISO);
  }

  /* ─── Calcular horas trabalhadas em minutos ─── */

  /**
   * Mesma regra do Histórico: diferença em HH:MM (Brasília), com almoço mínimo
   * obrigatório quando a jornada exige intervalo.
   * @param capMs  Instantâneo do “agora” no dia corrente. Em dias históricos,
   *               omita para ignorar trecho aberto (retorno sem saída).
   */
  private calcHorasMinutos(
    registros: { tipo: string; dataHora: Date }[],
    capMs?: number,
    opts?: {
      exigirIntervalo?: boolean;
      almocoMinMin?: number;
      almocoPodeIniciarA?: string;
      almocoPodeIniciarAte?: string;
      horaEntrada?: string;
      horaSaida?: string;
      toleranciaEntradaMin?: number;
      toleranciaSaidaMin?: number;
    }
  ) {
    return calcHorasTrabalhadasMinutos(
      registros.map((r) => ({
        tipo: r.tipo,
        minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora))
      })),
      {
        agoraMin:
          capMs !== undefined
            ? horarioParaMinutos(horarioDeDataBrasilia(new Date(capMs)))
            : undefined,
        exigirIntervalo: opts?.exigirIntervalo,
        almocoMinMin: opts?.almocoMinMin,
        almocoPodeIniciarA: opts?.almocoPodeIniciarA,
        almocoPodeIniciarAte: opts?.almocoPodeIniciarAte,
        horaEntrada: opts?.horaEntrada,
        horaSaida: opts?.horaSaida,
        toleranciaEntradaMin: opts?.toleranciaEntradaMin,
        toleranciaSaidaMin: opts?.toleranciaSaidaMin
      }
    );
  }

  /* ─── Descanso de interjornada ─── */

  /**
   * Situação do descanso de interjornada do funcionário em `agora`. Devolve null quando a
   * regra está desativada (0), não há jornada anterior fechada (sem saída, jornada aberta
   * ou já em andamento) ou o descanso já foi cumprido.
   */
  private async verificarInterjornada(funcionarioId: string, agora: Date) {
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { interjornadaMin: true }
    });
    const minimoMin = cfg?.interjornadaMin ?? 660;
    if (minimoMin <= 0) return null;

    const ultimo = await this.prisma.registroPonto.findFirst({
      where: { funcionarioId, apenasInformativo: false, dataHora: { lte: agora } },
      orderBy: { dataHora: "desc" },
      select: { tipo: true, dataHora: true }
    });
    const ultimaSaida = ultimo ? ultimaSaidaFechada([ultimo]) : null;
    const r = calcularInterjornada({ ultimaSaida, agora, minimoMin });
    if (!r?.bloqueado || !ultimaSaida) return null;
    return {
      descansoMin: r.descansoMin,
      minimoMin,
      liberadoEm: r.liberadoEm,
      mensagem: mensagemInterjornada(r, minimoMin, ultimaSaida)
    };
  }

  /**
   * Pedido de correção de ponto com ENTRADA (incluída ou alterada) cujo descanso desde a última
   * saída fica abaixo do mínimo. Devolve o aviso para gravar em `metadados.avisoInterjornada`.
   */
  private async avisoInterjornadaCorrecao(
    funcionarioId: string,
    dataReferencia: Date,
    meta: Record<string, unknown>
  ): Promise<AvisoInterjornada | null> {
    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { interjornadaMin: true }
    });
    const minimoMin = cfg?.interjornadaMin ?? 660;
    if (minimoMin <= 0) return null;

    type Item = { acao?: string; tipoRegistro?: string; horario?: string; registroId?: string };
    const itens: Item[] = Array.isArray(meta.correcoesDia)
      ? (meta.correcoesDia as Item[])
      : meta.horarioSolicitado
        ? [
            {
              acao: "INCLUIR",
              tipoRegistro: (meta.tipoRegistro as string) ?? "ENTRADA",
              horario: meta.horarioSolicitado as string
            }
          ]
        : [];

    let pior: AvisoInterjornada | null = null;
    for (const c of itens) {
      if (c.tipoRegistro !== "ENTRADA" || !c.horario || c.acao === "EXCLUIR") continue;
      let base = dataReferencia;
      if (c.acao === "CORRIGIR" && c.registroId) {
        const atual = await this.prisma.registroPonto.findUnique({
          where: { id: c.registroId },
          select: { dataHora: true }
        });
        if (atual) base = atual.dataHora;
      }
      const entrada = aplicarHorarioBrasilia(base, c.horario);
      const anterior = await this.prisma.registroPonto.findFirst({
        where: {
          funcionarioId,
          apenasInformativo: false,
          dataHora: { lt: entrada },
          ...(c.registroId ? { id: { not: c.registroId } } : {})
        },
        orderBy: { dataHora: "desc" },
        select: { tipo: true, dataHora: true }
      });
      const saida = anterior ? ultimaSaidaFechada([anterior]) : null;
      const r = calcularInterjornada({ ultimaSaida: saida, agora: entrada, minimoMin });
      if (r?.bloqueado && saida && (!pior || r.descansoMin < pior.descansoMin)) {
        pior = { saidaAnterior: saida.toISOString(), descansoMin: r.descansoMin, minimoMin };
      }
    }
    return pior;
  }

  /**
   * Aviso da tela de registro (ponto presencial): hoje exige intervalo, já há Entrada, ainda
   * não há Saída e o intervalo exigido não foi registrado. Devolve o tipo e o tempo mínimo
   * configurados, ou null.
   */
  private async intervaloPendenteParaFechar(
    funcionarioId: string,
    hojeIso: string,
    inicio: Date,
    fim: Date,
    registrosHoje: Array<{ tipo: string; observacoes?: unknown }>
  ) {
    if (
      !registrosHoje.some((r) => r.tipo === "ENTRADA") ||
      registrosHoje.some((r) => r.tipo === "SAIDA")
    ) {
      return null;
    }
    const exig = await exigenciasCicloPresencial(
      this.prisma,
      funcionarioId,
      inicio,
      fim,
      await this.getJornadaHistoricoContexto(funcionarioId)
    );
    const ex = exig.porDia[hojeIso];
    if (!ex) return null;
    const turnoSemIntervalo = !!observacaoForcaSemIntervalo(
      registrosHoje.find((r) => r.tipo === "ENTRADA")?.observacoes
    );
    const modo = turnoSemIntervalo ? "ALMOCO_OU_PAUSA" : ex.modo;
    const r = cicloCompleto([...registrosHoje, { tipo: "SAIDA" }], { modoIntervalo: modo });
    if (r.completo || !r.faltas.some((f) => /intervalo/i.test(f))) return null;
    return { modo, minimoMin: ex.minimoMin };
  }

  /** A regra do ciclo completo em casa vale em `dia` (YYYY-MM-DD)? Nulo/futuro = desligada. */
  private cicloCompletoAtivoEm(desde: Date | null | undefined, dia: string): boolean {
    return !!desde && dia >= dataCivilISO(desde);
  }

  /** Dados para o aviso do front; null se não há descanso em curso ou o dia já começou. */
  private async interjornadaParaStatus(funcionarioId: string) {
    const b = await this.verificarInterjornada(funcionarioId, new Date());
    if (!b) return null;
    return {
      ativa: true,
      descansoMin: b.descansoMin,
      minimoMin: b.minimoMin,
      liberadoEm: b.liberadoEm.toISOString(),
      liberadoEmTexto: fmtDiaHoraBrasilia(b.liberadoEm)
    };
  }

  /* ─── Bater ponto ─── */

  async baterPonto(keycloakSub: string, dto: CreateRegistroDto) {
    const func = await this.getFuncionario(keycloakSub);
    const hojeIso = hojeBrasiliaISO();

    if (funcionarioSemRegistroPonto(func)) {
      throw new BadRequestException(
        `Funcionários na condição "${labelSemRegistroPonto(func)}" não registram ponto eletrônico.`
      );
    }
    if (await cedidoHoje(this.prisma, func.id)) {
      throw new ForbiddenException(
        "Efetivo cedido a outro órgão: o registro de ponto fica suspenso durante a cessão."
      );
    }

    const historicoCat = await ensureCategoriaHistorico(this.prisma, func.id);
    const pontoObrigatorioDesde = func.pontoObrigatorioDesde
      ? dataCivilISO(func.pontoObrigatorioDesde)
      : null;
    if (
      diaSemObrigacaoPonto(hojeIso, {
        historico: historicoCat,
        categoriaAtual: func.categoria,
        isManagerAtual: func.isManager,
        isFiscalAtual: func.isFiscal,
        registroPontoObrigatorioAtual: func.registroPontoObrigatorio,
        pontoObrigatorioDesde
      })
    ) {
      throw new BadRequestException(
        "Hoje ainda não há obrigação de registro de ponto. " +
          "Após retorno de Comissionado/Chefe para categoria com ponto, " +
          "a obrigação começa apenas no dia seguinte."
      );
    }

    await this.validarHorarioAtualPonto();

    const hoje = new Date();
    const feriadoBloq = await this.feriadoConfigService.isBloqueado(hoje);
    if (feriadoBloq.bloqueado) {
      if (feriadoBloq.marcoHorario && feriadoBloq.marcoLado) {
        const agoraHora = horarioDeDataBrasilia(hoje).substring(0, 5);
        const noPeriodoFeriado =
          feriadoBloq.marcoLado === "ANTES"
            ? agoraHora < feriadoBloq.marcoHorario
            : agoraHora >= feriadoBloq.marcoHorario;
        if (noPeriodoFeriado) {
          const periodo =
            feriadoBloq.marcoLado === "ANTES"
              ? `até ${feriadoBloq.marcoHorario}`
              : `a partir de ${feriadoBloq.marcoHorario}`;
          throw new BadRequestException(
            `Registro de ponto bloqueado: feriado ${periodo} (${feriadoBloq.nome ?? ""}). Entre em contato com o RH se precisar registrar.`
          );
        }
      } else if (feriadoBloq.abono) {
        throw new BadRequestException(
          `Registro de ponto bloqueado: ${feriadoBloq.nome ?? "dia abonado pelo RH"}.`
        );
      } else {
        throw new BadRequestException(
          `Registro de ponto bloqueado: hoje é feriado (${feriadoBloq.nome ?? ""}). Entre em contato com o RH se precisar registrar.`
        );
      }
    }

    const status = await this.getStatusAtual(keycloakSub);

    if (status.afastamentoHoje) {
      throw new BadRequestException(
        `Você está em ${status.afastamentoHoje.label} hoje. Não é possível registrar ponto.`
      );
    }

    /* Estagiário: carga horária corrida — sem início/fim de almoço. */
    if (
      (dto.tipo === "INICIO_INTERVALO" || dto.tipo === "FIM_INTERVALO") &&
      categoriaSemIntervaloAlmoco(func.categoria)
    ) {
      const label = labelCategoriaSemIntervalo(func.categoria);
      throw new BadRequestException(
        `${label} realiza carga horária corrida e não registra intervalo de almoço. ` +
          `Use Interromper/Reiniciar Expediente para pausas.`
      );
    }

    /* Descanso de interjornada (CLT art. 66): enquanto o descanso mínimo desde a última saída
       não se completa, não é possível iniciar nova jornada. Só vale para ENTRADA; correção de
       ponto aprovada (chefe + RH) e correção do RH não passam por aqui. */
    if (dto.tipo === "ENTRADA") {
      const bloqueioInterjornada = await this.verificarInterjornada(func.id, new Date());
      if (bloqueioInterjornada) throw new BadRequestException(bloqueioInterjornada.mensagem);
    }

    /* Validação de sequência */
    const permitidas = status.acoesPermitidas;
    if (!permitidas.includes(dto.tipo)) {
      const janelaIni = status.almocoPodeIniciarA ?? "11:30";
      const janelaFim = status.almocoPodeIniciarAte ?? "13:00";
      /* Pausa na janela de almoço: o app envia Fim do Almoço (fluxo atual, não Reiniciar). */
      const aceitarFimAlmocoNaPausa =
        dto.tipo === "FIM_INTERVALO" &&
        permitidas.includes("REINICIAR_EXPEDIENTE") &&
        status.fase === "PAUSA_MANHA";
      if (aceitarFimAlmocoNaPausa) {
        /* segue o fluxo de FIM_INTERVALO (sintetiza INÍCIO a partir da pausa) */
      } else if (
        ACOES_BLOQUEADAS_NA_JANELA_ALMOCO.includes(dto.tipo) &&
        (permitidas.includes("INICIO_INTERVALO") || permitidas.includes("FIM_INTERVALO"))
      ) {
        throw new BadRequestException(
          `Neste horário (${janelaIni}–${janelaFim}) registre o intervalo de almoço. ` +
            `Pausa e encerramento não estão disponíveis durante a janela.`
        );
      } else {
        throw new BadRequestException(
          permitidas.length
            ? `Sequência inválida. Próxima ação esperada: ${permitidas.join(" ou ")}. Recebido: ${dto.tipo}`
            : `Jornada já encerrada. Não há novas ações permitidas hoje. Recebido: ${dto.tipo}`
        );
      }
    }

    /* Valida geo e calcula dentroPerimetro com base na configuração vigente.
       O backend é a camada autoritativa — o frontend não pode ser confiado sozinho. */
    const sysConfig = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" }
    });

    let dentroPerimetro = false;
    const origemPersistida = this.normalizarOrigemPonto(dto.origem);
    let modoRegistroEfetivo = (dto.modoRegistro ?? dto.origem ?? origemPersistida) as string;
    if (!["DESKTOP", "MOBILE", "HIBRIDO", "VIAGEM", "HOME_OFFICE"].includes(modoRegistroEfetivo)) {
      modoRegistroEfetivo = origemPersistida === OrigemPonto.DESKTOP ? "DESKTOP" : "MOBILE";
    }

    const precisaGeoRemoto = !!(func.modoHomeOffice || func.modoHibridoLocal);
    const origemOuModoMobile =
      ["MOBILE", "HIBRIDO", "HOME_OFFICE", "VIAGEM"].includes(dto.origem ?? "") ||
      ["MOBILE", "HIBRIDO", "HOME_OFFICE", "VIAGEM"].includes(dto.modoRegistro ?? "");
    const origemEhMobile = origemPersistida === OrigemPonto.MOBILE || origemOuModoMobile;

    /* Home Office / Híbrido exigem GPS independentemente do campo origem
       (clientes antigos enviavam HOME_OFFICE em origem; o DTO rejeitava a requisição). */
    if (precisaGeoRemoto) {
      if (dto.latitude == null || dto.longitude == null) {
        throw new BadRequestException(
          "Localização GPS não compartilhada. Para registrar o ponto, ative o GPS e permita o acesso à localização no navegador.\n\n" +
            "• Android Chrome: toque no ícone 🔒 na barra de endereço → Permissões → Localização → Permitir\n" +
            "• iPhone Safari: Ajustes → Privacidade → Serviços de Localização → Safari → Ao usar o app"
        );
      }

      const lat = Number(dto.latitude);
      const lng = Number(dto.longitude);
      const precisao = dto.precisaoMetros;
      const endereco = func.enderecoResidencial;
      let dentroResidencial = false;

      if (endereco?.lat != null && endereco?.lng != null) {
        const distRes = this.haversineMetros(lat, lng, Number(endereco.lat), Number(endereco.lng));
        dentroResidencial = this.dentroDoRaio(distRes, endereco.raioMetros ?? 20, precisao);
      }

      if (dentroResidencial) {
        /* 1. Dentro do raio residencial → registro remoto */
        if (dto.tipo === "ENTRADA" && func.modoHibridoLocal && !func.modoHomeOffice) {
          const sysHibrido = await this.prisma.configuracaoSistema.findUnique({
            where: { id: "singleton" },
            select: { hibridoMaxDiasSemana: true }
          });
          const limite = sysHibrido?.hibridoMaxDiasSemana ?? 2;
          const diasUsados = await this.contarDiasRemotosSemana(func.id);
          if (diasUsados >= limite) {
            throw new BadRequestException(
              `Limite de ${limite} dia${limite > 1 ? "s" : ""} híbrido${limite > 1 ? "s" : ""} por semana atingido. ` +
                `Você já registrou ${diasUsados} dia${diasUsados > 1 ? "s" : ""} de home office esta semana. ` +
                `Dirija-se ao CFO para registrar o ponto presencialmente.`
            );
          }
        }
        modoRegistroEfetivo = func.modoHomeOffice ? "HOME_OFFICE" : "HIBRIDO";
        dentroPerimetro = true;
      } else if (sysConfig) {
        /* 2. Tenta sede */
        const distSede = this.haversineMetros(
          lat,
          lng,
          Number(sysConfig.lat),
          Number(sysConfig.lng)
        );
        const naSede = this.dentroDoRaio(distSede, sysConfig.raioMetros, precisao);
        if (!sysConfig.mobileCheckGeo || naSede) {
          dentroPerimetro = naSede;
          modoRegistroEfetivo = "MOBILE";
        } else if (sysConfig.modoViagem) {
          /* 3. Tenta áreas de viagem */
          const areaOk = await this.encontrarAreaViagem(lat, lng, precisao);
          if (areaOk) {
            modoRegistroEfetivo = "VIAGEM";
            dentroPerimetro = true;
          } else {
            const raioRes = endereco?.raioMetros ?? 20;
            const msgRes =
              endereco?.lat != null && endereco?.lng != null
                ? `, a mais de ${raioRes}m do endereço residencial`
                : "";
            throw new BadRequestException(
              `Você está a ${Math.round(distSede)}m do CFO${msgRes} e fora das áreas de viagem configuradas. ` +
                `Deve estar na sede, em casa ou em uma área de viagem para registrar o ponto.`
            );
          }
        } else {
          const raioRes = endereco?.raioMetros ?? 20;
          const msgRes =
            endereco?.lat != null && endereco?.lng != null
              ? `, ou a mais de ${raioRes}m do endereço residencial`
              : "";
          throw new BadRequestException(
            `Você está a ${Math.round(distSede)}m do CFO${msgRes}. ` +
              `Deve estar na sede ou em casa para registrar o ponto.`
          );
        }
      }
    } else if (origemEhMobile && sysConfig?.mobileCheckGeo) {
      /* Mobile regular: sede, e áreas de viagem se o modo estiver ativo */
      if (dto.latitude == null || dto.longitude == null) {
        throw new BadRequestException(
          "Registro mobile exige localização GPS. Ative o GPS no dispositivo e tente novamente."
        );
      }
      const lat = Number(dto.latitude);
      const lng = Number(dto.longitude);
      const precisao = dto.precisaoMetros;
      const dist = this.haversineMetros(lat, lng, Number(sysConfig.lat), Number(sysConfig.lng));
      if (this.dentroDoRaio(dist, sysConfig.raioMetros, precisao)) {
        dentroPerimetro = true;
      } else if (sysConfig.modoViagem) {
        const areaOk = await this.encontrarAreaViagem(lat, lng, precisao);
        if (areaOk) {
          modoRegistroEfetivo = "VIAGEM";
          dentroPerimetro = true;
        } else {
          throw new BadRequestException(
            `Fora do perímetro permitido. Você está a ${Math.round(dist)}m da sede ` +
              `(máximo permitido: ${sysConfig.raioMetros}m) e fora das áreas de viagem.`
          );
        }
      } else {
        throw new BadRequestException(
          `Fora do perímetro permitido. Você está a ${Math.round(dist)}m ` +
            `(máximo permitido: ${sysConfig.raioMetros}m).`
        );
      }
    } else if (dto.latitude != null && dto.longitude != null && sysConfig) {
      /* Outros modos com coordenadas: calcula mas não rejeita */
      const dist = this.haversineMetros(
        Number(dto.latitude),
        Number(dto.longitude),
        Number(sysConfig.lat),
        Number(sysConfig.lng)
      );
      dentroPerimetro = dist <= sysConfig.raioMetros;
    }

    /* Persiste foto se enviada */
    let fotoUrl: string | undefined;
    if (dto.fotoBase64) {
      try {
        fotoUrl = await this.fotoService.salvarFoto({
          matricula: func.matricula ?? func.id,
          tipo: dto.tipo,
          fotoBase64: dto.fotoBase64
        });
      } catch (err) {
        this.logger.warn(
          `Falha ao salvar foto do registro — prosseguindo sem foto: ${(err as Error).message}`
        );
      }
    }

    const agora = new Date();

    /* Em casa (home office/híbrido), com a regra do ciclo completo ativa: a Saída exige o
       intervalo de almoço já registrado — não cria intervalo automático. Ficam de fora os
       turnos sem intervalo (fase TARDE desde a entrada) e o feriado parcial. */
    if (
      dto.tipo === "SAIDA" &&
      status.fase === "MANHA" &&
      (modoRegistroEfetivo === "HOME_OFFICE" || modoRegistroEfetivo === "HIBRIDO") &&
      !feriadoBloq.marcoHorario &&
      this.cicloCompletoAtivoEm(sysConfig?.cicloCompletoEmCasaDesde, hojeIso)
    ) {
      throw new BadRequestException(
        "Em casa, registre o intervalo de almoço antes de encerrar a jornada (Início e Fim do intervalo). " +
          "Se não puder, solicite a Correção de ponto no dia seguinte: ela será analisada pelo seu chefe e pelo RH."
      );
    }

    /* Encerrar a jornada sem ter feito o intervalo de almoço: completa as
       posições de Início/Fim no histórico (duração zero junto à saída) para
       documentação. A dedução mínima de almoço é aplicada no cálculo de horas. */
    if (dto.tipo === "SAIDA" && status.fase === "MANHA") {
      const jornadaSaida = await this.getJornadaEfetiva(func.id);
      const minutoAgora = horarioParaMinutos(horarioDeDataBrasilia(agora));
      const janelaIni = horarioParaMinutos(jornadaSaida.almocoPodeIniciarA ?? "11:30");
      const almocoMin = jornadaSaida.almocoMinMin ?? 60;
      const aposJanelaAlmoco = minutoAgora >= janelaIni;

      const observacaoAjuste = {
        data: agora.toISOString(),
        tipo: "AJUSTE_AUTOMATICO" as const,
        texto: aposJanelaAlmoco
          ? `Intervalo de almoço não registrado — ${almocoMin} min deduzidos automaticamente no cálculo.`
          : "Intervalo de almoço não realizado — jornada encerrada antes do horário de almoço."
      };
      await this.prisma.registroPonto.createMany({
        data: [
          {
            funcionarioId: func.id,
            tipo: "INICIO_INTERVALO",
            dataHora: new Date(agora.getTime() - 2),
            origem: origemPersistida,
            observacoes: appendObservacao([], observacaoAjuste) as unknown as Prisma.InputJsonValue
          },
          {
            funcionarioId: func.id,
            tipo: "FIM_INTERVALO",
            dataHora: new Date(agora.getTime() - 1),
            origem: origemPersistida,
            observacoes: appendObservacao([], observacaoAjuste) as unknown as Prisma.InputJsonValue
          }
        ]
      });
    }

    /* Entrada sem intervalo de almoço:
       - Estagiário (carga horária corrida), ou
       - Turno vespertino/noturno (durante ou após a janela de almoço).
       Anota observação na própria ENTRADA — sem criar registros de intervalo. */
    let observacoesRegistro: Prisma.InputJsonValue | undefined;
    if (dto.tipo === "ENTRADA") {
      if (categoriaSemIntervaloAlmoco(func.categoria)) {
        const jornada = await this.getJornadaEfetiva(func.id);
        const horaAgora = horarioDeDataBrasilia(agora);
        const classificacao = classificarTurnoEntrada(
          horaAgora,
          jornada.almocoPodeIniciarA,
          jornada.almocoPodeIniciarAte
        );
        observacoesRegistro = appendObservacao(
          [],
          criarObservacaoCategoriaSemIntervalo(
            func.categoria as CategoriaSemIntervaloAlmoco,
            classificacao.turno
          )
        ) as unknown as Prisma.InputJsonValue;
      } else {
        const jornada = await this.getJornadaEfetiva(func.id);
        const horaAgora = horarioDeDataBrasilia(agora);
        let classificacao = classificarTurnoEntrada(
          horaAgora,
          jornada.almocoPodeIniciarA,
          jornada.almocoPodeIniciarAte
        );
        /* Atestado matutino: só trata o retorno como vespertino (sem intervalo)
           se o atestado cobriu o almoço ou a entrada já passou da janela. */
        const afastHoje = await this.getAfastamentoDoDia(func.id, hojeIso);
        if (
          afastHoje &&
          isAfastamentoParcial(afastHoje) &&
          afastHoje.horarioInicio &&
          afastHoje.horarioFim &&
          atestadoParcialEhMatutino(afastHoje.horarioInicio, afastHoje.horarioFim, {
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "12:00",
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
          }) &&
          horarioParaMinutos(horaAgora.substring(0, 5)) >= horarioParaMinutos(afastHoje.horarioFim)
        ) {
          const horaMin = horarioParaMinutos(horaAgora.substring(0, 5));
          const fimJanelaAlmoco = horarioParaMinutos(jornada.almocoPodeIniciarAte ?? "13:00");
          const cobreJanelaAlmoco = atestadoParcialIntersectaJanelaAlmoco(
            afastHoje.horarioInicio,
            afastHoje.horarioFim,
            {
              almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
              almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
            }
          );
          if (cobreJanelaAlmoco || horaMin >= fimJanelaAlmoco) {
            classificacao = {
              turno: "VESPERTINO",
              semIntervalo: true,
              motivo: "APOS_JANELA",
              janelaAlmoco: `${jornada.almocoPodeIniciarA}–${jornada.almocoPodeIniciarAte}`
            };
          }
        }
        if (classificacao.semIntervalo) {
          observacoesRegistro = appendObservacao(
            [],
            criarObservacaoTurnoSemIntervalo(classificacao)
          ) as unknown as Prisma.InputJsonValue;
        }
      }
    }

    /* Crédito de tempo de deslocamento: retorno ao trabalho (ENTRADA, FIM_INTERVALO
       ou REINICIAR_EXPEDIENTE) após o horarioFim de um atestado médico parcial,
       dentro da tolerância configurada em Configurações → Solicitações
       (atestadoTempoRetornoMin). Só credita quando este registro é, de fato, a
       PRIMEIRA atividade do dia após o fim do atestado — uma pausa/almoço comum
       ocorrendo bem depois (retorno já feito no horário certo, almoço normal
       horas mais tarde) não pode ser confundida com o retorno do atestado.
       Documenta no próprio registro de retorno para aparecer nas Observações do
       dia (Histórico do funcionário e Auditoria). */
    if (
      dto.tipo === "ENTRADA" ||
      dto.tipo === "FIM_INTERVALO" ||
      dto.tipo === "REINICIAR_EXPEDIENTE"
    ) {
      const afastRetorno = await this.getAfastamentoDoDia(func.id, hojeIso);
      if (
        afastRetorno &&
        isAfastamentoParcial(afastRetorno) &&
        afastRetorno.horarioInicio &&
        afastRetorno.horarioFim
      ) {
        const horaAgoraStr = horarioDeDataBrasilia(agora).substring(0, 5);
        const agoraMin = horarioParaMinutos(horaAgoraStr);
        const regsHojeMin = [
          ...status.registrosHoje.map((r) => ({
            tipo: r.tipo,
            minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora))
          })),
          { tipo: dto.tipo, minuto: agoraMin }
        ];
        const retorno = encontrarRetornoAposAtestado(regsHojeMin, afastRetorno.horarioFim);
        if (retorno && retorno.minuto === agoraMin) {
          const cfgSolicitacoes = await this.configSolicitacoesService.getConfig();
          const hfMin = horarioParaMinutos(afastRetorno.horarioFim);
          const atrasoReal = agoraMin - hfMin;
          const credito = Math.min(atrasoReal, cfgSolicitacoes.atestadoTempoRetornoMin);
          if (credito > 0) {
            const texto =
              `Atestado médico das ${afastRetorno.horarioInicio} às ${afastRetorno.horarioFim} — ` +
              `retorno registrado às ${horaAgoraStr}` +
              (atrasoReal > credito ? ` (atraso real de ${atrasoReal} min)` : "") +
              `. Creditados ${credito} min de tempo de deslocamento` +
              (atrasoReal > credito ? " (limitado pela tolerância configurada)." : ".");
            observacoesRegistro = appendObservacao(observacoesRegistro ?? [], {
              data: agora.toISOString(),
              tipo: "AJUSTE_AUTOMATICO",
              texto
            }) as unknown as Prisma.InputJsonValue;
          }
        }
      }
    }

    /* Crédito de deslocamento na IDA: saída do trabalho (SAIDA, INTERROMPER_EXPEDIENTE ou
       INICIO_INTERVALO) antes do início de um atestado parcial já registrado para hoje,
       dentro da tolerância de Configurações → Solicitações (atestadoTempoIdaMin). Se a
       saída foi para o almoço, o almoço mínimo não conta. Documenta no próprio registro.
       Quando o atestado é enviado depois, o crédito entra só no cálculo, sem anotação. */
    if (
      dto.tipo === "SAIDA" ||
      dto.tipo === "INTERROMPER_EXPEDIENTE" ||
      dto.tipo === "INICIO_INTERVALO"
    ) {
      const afastIda = await this.getAfastamentoDoDia(func.id, hojeIso);
      const horaAgoraStr = horarioDeDataBrasilia(agora).substring(0, 5);
      const agoraMin = horarioParaMinutos(horaAgoraStr);
      if (
        afastIda &&
        isAfastamentoParcial(afastIda) &&
        afastIda.horarioInicio &&
        afastIda.horarioFim &&
        agoraMin < horarioParaMinutos(afastIda.horarioInicio)
      ) {
        const cfgSolicitacoes = await this.configSolicitacoesService.getConfig();
        const jornadaIda = await this.getJornadaEfetiva(func.id);
        const almocoMinMin = jornadaIda.almocoMinMin ?? 60;
        const janelaAlmocoIda = {
          podeIniciarA: jornadaIda.almocoPodeIniciarA ?? undefined,
          podeIniciarAte: jornadaIda.almocoPodeIniciarAte ?? undefined
        };
        const regsHojeMin = [
          ...status.registrosHoje.map((r) => ({
            tipo: r.tipo,
            minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora))
          })),
          { tipo: dto.tipo, minuto: agoraMin }
        ];
        const credito = calcularCreditoDeslocamentoIda(
          regsHojeMin,
          afastIda.horarioInicio,
          cfgSolicitacoes.atestadoTempoIdaMin,
          almocoMinMin,
          janelaAlmocoIda
        );
        if (credito > 0) {
          const texto =
            `Atestado médico das ${afastIda.horarioInicio} às ${afastIda.horarioFim} — ` +
            `saída registrada às ${horaAgoraStr}` +
            (saidaEhAlmoco({ tipo: dto.tipo, minuto: agoraMin }, janelaAlmocoIda)
              ? ` (almoço de ${almocoMinMin} min descontado)`
              : "") +
            `. Até ${credito} min de tempo de deslocamento (ida) serão creditados` +
            ` (tolerância de ${cfgSolicitacoes.atestadoTempoIdaMin} min).`;
          observacoesRegistro = appendObservacao(observacoesRegistro ?? [], {
            data: agora.toISOString(),
            tipo: "AJUSTE_AUTOMATICO",
            texto
          }) as unknown as Prisma.InputJsonValue;
        }
      }
    }

    let observacoesAlmoco: Prisma.InputJsonValue | undefined;
    if (dto.tipo === "FIM_INTERVALO" && status.fase === "PAUSA_MANHA") {
      const pausa = [...status.registrosHoje]
        .reverse()
        .find((r) => r.tipo === "INTERROMPER_EXPEDIENTE");
      const horaPausa = pausa ? horarioDeDataBrasilia(pausa.dataHora).substring(0, 5) : null;
      const inicioAlmocoEm = pausa
        ? new Date(new Date(pausa.dataHora).getTime() + 1)
        : new Date(agora.getTime() - 1);
      observacoesAlmoco = appendObservacao([], {
        data: agora.toISOString(),
        tipo: "AJUSTE_AUTOMATICO",
        texto: horaPausa
          ? `Almoço iniciado na pausa às ${horaPausa} — o retorno encerra o intervalo.`
          : "Almoço considerado em conjunto com a pausa em andamento."
      }) as unknown as Prisma.InputJsonValue;
      await this.prisma.registroPonto.create({
        data: {
          funcionarioId: func.id,
          tipo: "INICIO_INTERVALO",
          dataHora: inicioAlmocoEm,
          origem: origemPersistida,
          modoRegistro: modoRegistroEfetivo as import("@prisma/client").ModoRegistro,
          observacoes: observacoesAlmoco
        }
      });
    }

    /* Batida + marcação ORIGINAL no livro do REP (NSR) na mesma transação (Portaria 671). */
    const registro = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.registroPonto.create({
        data: {
          funcionarioId: func.id,
          tipo: dto.tipo as TipoPonto,
          dataHora: agora,
          origem: origemPersistida,
          modoRegistro: modoRegistroEfetivo as import("@prisma/client").ModoRegistro,
          latitude: dto.latitude,
          longitude: dto.longitude,
          dentroPerimetro,
          observacao: dto.observacao,
          fotoUrl: fotoUrl ?? null,
          ...(observacoesRegistro ? { observacoes: observacoesRegistro } : {})
        }
      });
      const marcacaoRep = await this.repLivro?.registrarMarcacao(tx, {
        registroPontoId: criado.id,
        funcionarioId: func.id,
        cpf: func.cpf ?? null,
        tipoPonto: criado.tipo,
        dataHoraMarcacao: agora,
        origem: origemPersistida
      });
      /* NSR devolvido ao cliente: abre o Comprovante de Registro de Ponto (art. 80, II). */
      return { ...criado, nsr: marcacaoRep?.nsr ?? null };
    });

    /* Verifica hora extra acima do limite configurado e cria solicitação automática */
    if (dto.tipo === "SAIDA") {
      this.verificarHoraExtraAuto(func.id).catch(() => {});
    }

    if (dto.tipo === "ENTRADA" || dto.tipo === "SAIDA") {
      this.notificarRegistroPontoGestor(func.id, "Funcionário", dto.tipo).catch((e) =>
        this.logger.error(`Falha ao notificar REGISTRO_PONTO: ${e}`)
      );
    }

    /* Atualiza foto de perfil quando há foto:
       - Primeira foto (qualquer tipo): sem foto de perfil → define automaticamente.
       - Atualização solicitada: flag ativa + tipo ENTRADA → atualiza e limpa a flag. */
    if (fotoUrl) {
      const semFoto = !func.fotoPerfilUrl;
      const flagAtiva = !!func.solicitarAtualizacaoFoto && dto.tipo === "ENTRADA";
      if (semFoto || flagAtiva) {
        await this.prisma.funcionario.update({
          where: { id: func.id },
          data: { fotoPerfilUrl: fotoUrl, solicitarAtualizacaoFoto: false }
        });
      }
    }

    return registro;
  }

  /* ─── Histórico (paginado por mês) ─── */

  async getHistorico(
    keycloakSub: string,
    mes: number,
    ano: number,
    isSuperAdmin = false,
    opts?: { exporBancoHoras?: boolean }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { externalId: keycloakSub },
      select: { createdAt: true, primeiroLoginEm: true }
    });
    if (!user) {
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    }
    const func = await this.getFuncionario(keycloakSub);
    const inicioAtividades = inicioAtividadesUsuario(user);
    const mesPrefix = `${ano}-${String(mes).padStart(2, "0")}`;
    const dataInicioProducao = await getDataInicioProducao(this.prisma);
    const { periodoTeste } = assertMesAposGoLive({
      mesAnoPrefixo: mesPrefix,
      dataInicioProducao,
      isSuperAdmin,
      contexto: "Histórico"
    });
    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const primeiroDia = `${ano}-${mm}-01`;
    const ultimoDiaIso = `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}`;
    const { inicio } = intervaloDiaBrasilia(primeiroDia);
    const { fim } = intervaloDiaBrasilia(ultimoDiaIso);

    const registros = await this.prisma.registroPonto.findMany({
      where: {
        funcionarioId: func.id,
        dataHora: { gte: inicio, lte: fim }
      },
      orderBy: { dataHora: "asc" },
      select: {
        id: true,
        tipo: true,
        dataHora: true,
        ajustado: true,
        observacao: true,
        observacoes: true,
        apenasInformativo: true
      }
    });

    /* Janela com folga de 1 dia para evitar perder afastamentos cujo dataInicio/dataFim
       (gravados em UTC à meia-noite) caem fora do intervalo Brasília do mês por causa
       do fuso horário (ex.: afastamento no dia 1 do mês). */
    const inicioBuffer = new Date(inicio);
    inicioBuffer.setUTCDate(inicioBuffer.getUTCDate() - 1);
    const fimBuffer = new Date(fim);
    fimBuffer.setUTCDate(fimBuffer.getUTCDate() + 1);

    const afastamentosRaw = await this.prisma.afastamento.findMany({
      where: {
        funcionarioId: func.id,
        dataInicio: { lte: fimBuffer },
        dataFim: { gte: inicioBuffer }
      },
      orderBy: { dataInicio: "asc" },
      select: {
        id: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        justificativa: true,
        apenasInformativo: true,
        horarioInicio: true,
        horarioFim: true,
        rotulo: true
      }
    });

    const solsAtestado = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId: func.id,
        tipo: { in: ["ATESTADO", "ABONO"] },
        status: "APROVADA",
        OR: [
          { dataInicio: { lte: fimBuffer }, dataFim: { gte: inicioBuffer } },
          { dataReferencia: { gte: inicioBuffer, lte: fimBuffer } }
        ]
      },
      select: {
        dataInicio: true,
        dataFim: true,
        dataReferencia: true,
        metadados: true
      }
    });

    const afastamentos = enriquecerAfastamentosComSolicitacoes(afastamentosRaw, solsAtestado);

    // Persiste horários descobertos nas solicitações (corrige DB sem script manual)
    for (let i = 0; i < afastamentos.length; i++) {
      const a = afastamentos[i];
      const raw = afastamentosRaw[i];
      if (
        (a.tipo === "ATESTADO" || a.tipo === "ABONO") &&
        a.id &&
        a.horarioInicio &&
        a.horarioFim &&
        (!raw.horarioInicio || !raw.horarioFim)
      ) {
        await this.prisma.afastamento
          .update({
            where: { id: a.id },
            data: { horarioInicio: a.horarioInicio, horarioFim: a.horarioFim }
          })
          .catch(() => {});
      }
    }

    const { inicio: feriadoIni, fim: feriadoFim } = intervaloColunaDate(primeiroDia, ultimoDiaIso);
    const feriadosRaw = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: feriadoIni, lte: feriadoFim } },
      select: { data: true, nome: true, tipo: true, marcoHorario: true, marcoLado: true }
    });
    const feriados = feriadosRaw.map((f) => ({
      ...f,
      /* Meio-dia em Brasília: o Histórico antigo convertia meia-noite UTC para o dia anterior. */
      data: `${dataCivilISO(f.data)}T12:00:00.000-03:00`
    }));

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasSabadoPct: true, bancoHorasDomingoPct: true, bancoHorasFeriadoPct: true }
    });

    const jornada = await this.getJornadaHistoricoContexto(func.id);

    const pontoObrigatorioDesde = func.pontoObrigatorioDesde
      ? dataCivilISO(func.pontoObrigatorioDesde)
      : null;

    const historicoCat = await ensureCategoriaHistorico(this.prisma, func.id);
    const periodosSemObrigacao = periodosSemObrigacaoPonto(historicoCat, {
      pontoObrigatorioDesde,
      categoriaAtual: func.categoria,
      isManagerAtual: func.isManager,
      isFiscalAtual: func.isFiscal,
      registroPontoObrigatorioAtual: func.registroPontoObrigatorio
    });

    const ocultarBancoHoras = categoriaSemVisibilidadeBancoHoras(func.categoria);
    /* Estagiário/aprendiz não veem banco: pular o ciclo inteiro. RH/auditoria usa
       calcularBancoHorasAdmin. opts.exporBancoHoras força o cálculo (legado). */
    const precisaBanco = opts?.exporBancoHoras === true || !ocultarBancoHoras;
    const exporBancoHoras = precisaBanco;

    const bancoPorDia: Record<
      string,
      {
        horasTrabalhadasMinutos: number;
        saldoDiaMinutos: number;
        saldoAcumuladoMinutos: number;
        jornadaEsperadaMinutos: number;
        observacao?: string;
        abono?: boolean;
        neutro: boolean;
        horaExtra?: AjusteHoraExtraDia;
      }
    > = {};
    let saldoMesBanco = 0;
    let saldoAcumuladoMes = 0;
    let saldoAcumuladoMesAnterior = 0;

    if (precisaBanco) {
      /* Banco do mês, no ciclo em que o mês está (também para meses de ciclos anteriores). */
      const ultimoDiaMes = new Date(ano, mes, 0).getDate();
      const banco = await this.bancoHorasDoIntervalo(
        func.id,
        `${mesPrefix}-01`,
        `${mesPrefix}-${String(ultimoDiaMes).padStart(2, "0")}`
      );
      const bancoMes = banco.dias;
      for (const d of bancoMes) {
        bancoPorDia[d.data] = {
          horasTrabalhadasMinutos: d.horasTrabalhadasMinutos,
          saldoDiaMinutos: d.saldoDiaMinutos,
          saldoAcumuladoMinutos: d.saldoAcumuladoMinutos,
          jornadaEsperadaMinutos: d.jornadaEsperadaMinutos,
          observacao: d.observacao,
          ...(d.abono ? { abono: true } : {}),
          ...(d.horaExtra ? { horaExtra: d.horaExtra } : {}),
          /* Neutro só quando o saldo não deve aparecer (afastamento integral / isento /
             feriado sem trabalho / abono do RH). Atestado parcial e feriado parcial mostram saldo. */
          neutro:
            !!d.abono ||
            (!!d.observacao &&
              (d.observacao === "Afastamento" ||
                d.observacao.startsWith("Isento") ||
                (d.observacao.startsWith("Feriado:") && d.horasTrabalhadasMinutos === 0)))
        };
      }
      saldoMesBanco = bancoMes.reduce((s, d) => s + d.saldoDiaMinutos, 0);
      saldoAcumuladoMes = banco.saldoFinalMinutos;
      saldoAcumuladoMesAnterior = banco.saldoAntesMinutos;
    }

    /* Dias em casa (apurados uma vez; o presencial os exclui). */
    const cicloCompletoEmCasa = await diasCicloCompletoEmCasa(this.prisma, func.id, inicio, fim);

    return {
      mes,
      ano,
      inicioAtividades,
      dataInicioProducao,
      periodoTeste,
      pontoObrigatorioDesde,
      semRegistroPonto: funcionarioSemRegistroPonto(func),
      categoria: func.categoria,
      periodosSemObrigacao,
      /* Cessão a outro órgão: dias neutros no histórico (rótulo "Isento — Cedido"). */
      periodosCessao: await periodosCessao(this.prisma, func.id),
      categoriaHistorico: historicoCat,
      funcionario: { id: func.id, matricula: func.matricula, cargo: func.cargo },
      bancoPorDia: exporBancoHoras ? bancoPorDia : {},
      saldoMesBanco: exporBancoHoras ? saldoMesBanco : 0,
      saldoAcumuladoMes: exporBancoHoras ? saldoAcumuladoMes : 0,
      saldoAcumuladoMesAnterior: exporBancoHoras ? saldoAcumuladoMesAnterior : 0,
      ocultarBancoHoras,
      registros,
      afastamentos: afastamentos.map((a) => ({
        ...a,
        dataInicio: dataBrasiliaISO(a.dataInicio),
        dataFim: dataBrasiliaISO(a.dataFim)
      })),
      feriados,
      multiplicadores: {
        sabadoPct: cfg?.bancoHorasSabadoPct ?? 100,
        domingoPct: cfg?.bancoHorasDomingoPct ?? 200,
        feriadoPct: cfg?.bancoHorasFeriadoPct ?? 200
      },
      jornada,
      /* Entradas com descanso de interjornada abaixo do mínimo (ícone de informação). */
      interjornadaPorDia: await interjornadaCurtaPorDia(this.prisma, func.id, inicio, fim),
      /* Dias em casa que exigem o ciclo completo de batidas (status OK só com ele). */
      cicloCompletoEmCasa,
      /* Status "OK - Home Office" / "OK - Híbrido": só dias em que bateu em casa. */
      rotuloModalidadePorDia: await rotulosModalidadePorDia(this.prisma, func.id, inicio, fim),
      /* Presencial: dias que exigem o ciclo (e o tipo de intervalo), pela jornada e pela lei. */
      cicloCompletoPresencial: await exigenciasCicloPresencial(
        this.prisma,
        func.id,
        inicio,
        fim,
        jornada,
        cicloCompletoEmCasa.dias
      )
    };
  }

  /* ─── Relatório mensal ─── */

  async getRelatorio(keycloakSub: string, mes: number, ano: number, isSuperAdmin = false) {
    const historico = await this.getHistorico(keycloakSub, mes, ano, isSuperAdmin);

    const registrosCalc = historico.registros.filter((r) => !r.apenasInformativo);
    const afastamentosCalc = historico.afastamentos.filter((a) => !a.apenasInformativo);

    const quadro = montarRelatorioQuadro(
      registrosCalc,
      afastamentosCalc,
      mes,
      ano,
      historico.jornada,
      historico.feriados,
      historico.multiplicadores.sabadoPct,
      historico.multiplicadores.domingoPct,
      historico.multiplicadores.feriadoPct,
      historico.inicioAtividades,
      {
        forcarSemIntervalo: categoriaSemIntervaloAlmoco(historico.categoria),
        diasCicloCompletoEmCasa: historico.cicloCompletoEmCasa.dias,
        exigenciasCicloPresencial: historico.cicloCompletoPresencial.porDia,
        diaNeutro: await montarDiaNeutro(this.prisma, historico.funcionario.id)
      }
    );

    const diasMesBanco = Object.entries(historico.bancoPorDia).map(([data, d]) => ({
      data,
      ...d
    }));

    const horasEsperadasMinutos = quadro.horasEsperadasMinutos;
    const horasExtrasMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos > 0)
      .reduce((s, d) => s + d.saldoDiaMinutos, 0);
    const horasFaltaMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos < 0)
      .reduce((s, d) => s + Math.abs(d.saldoDiaMinutos), 0);
    /** Mesmo saldo do PDF da folha (montarRelatorioQuadro), não o recorte do banco de horas. */
    const saldoMinutos = quadro.saldoMinutos;
    const diasTrabalhados = quadro.diasTrabalhados;
    const diasOk = quadro.dias.filter((d) => d.statusInterno === "OK").length;

    const ocultarBancoHoras = !!historico.ocultarBancoHoras;

    return {
      mes,
      ano,
      funcionario: historico.funcionario,
      diasTrabalhados,
      diasOk,
      horasTrabalhadasMinutos: quadro.horasTrabalhadasMinutos,
      horasEsperadasMinutos,
      horasExtrasMinutos: ocultarBancoHoras ? 0 : horasExtrasMinutos,
      horasFaltaMinutos: ocultarBancoHoras ? 0 : horasFaltaMinutos,
      saldoMinutos: ocultarBancoHoras ? 0 : saldoMinutos,
      ocultarBancoHoras
    };
  }

  /* ─── Banco de Horas ─── */

  async getBancoHoras(keycloakSub: string, cicloInicioQuery?: string) {
    const func = await this.getFuncionario(keycloakSub);
    if (categoriaSemVisibilidadeBancoHoras(func.categoria)) {
      throw new ForbiddenException(
        "Banco de horas não está disponível para consulta nesta categoria funcional."
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: func.userId },
      select: { primeiroLoginEm: true }
    });
    const inicioAtividades = inicioAtividadesUsuario(user);
    const cicloInicio =
      cicloInicioQuery && /^\d{4}-\d{2}-\d{2}$/.test(cicloInicioQuery)
        ? cicloInicioQuery
        : undefined;
    return this.calcularBancoHoras(func.id, inicioAtividades, cicloInicio, true);
  }

  /** Ciclo de banco de horas para auditoria/admin (mesmas regras de /ponto/banco-horas). */
  async calcularBancoHorasAdmin(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { user: { select: { primeiroLoginEm: true } } }
    });
    const inicioAtividades = func?.user ? inicioAtividadesUsuario(func.user) : undefined;
    return this.calcularBancoHoras(funcionarioId, inicioAtividades);
  }

  /**
   * Origem dos ciclos do banco: o 1º acesso ao sistema ou, se houver batida anterior a ele, o dia da
   * 1ª batida (as horas registradas contam; só a FALTA continua começando no 1º acesso).
   */
  private async origemCiclosBanco(funcionarioId: string, inicioLogin: string): Promise<string> {
    const primeira = await this.prisma.registroPonto.findFirst({
      where: { funcionarioId, apenasInformativo: false },
      orderBy: { dataHora: "asc" },
      select: { dataHora: true }
    });
    const dia = primeira ? dataBrasiliaISO(primeira.dataHora) : null;
    return dia && dia < inicioLogin ? dia : inicioLogin;
  }

  /**
   * Banco de horas (mesma conta da página Banco de Horas) para um intervalo de datas, cruzando
   * os ciclos que o cobrem. Usado pela folha mensal/assinatura e pela Auditoria.
   * `saldoAntesMinutos`: acumulado do ciclo até a véspera de `inicioIso` (0 se o ciclo começa no
   * intervalo); `saldoFinalMinutos`: acumulado no último dia do intervalo.
   */
  async bancoHorasDoIntervalo(funcionarioId: string, inicioIso: string, fimIso: string) {
    const funcUser = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { user: { select: { primeiroLoginEm: true } } }
    });
    const inicioLogin = inicioAtividadesUsuario(funcUser?.user);
    const marcos = await this.prisma.bancoHorasMarco.findMany();
    const hojeIso = hojeBrasiliaISO();
    const dataInicioProducao = await getDataInicioProducao(this.prisma);
    const tolerancia = await toleranciaFechamentoDias(this.prisma, funcionarioId);
    const ciclos = listarCiclosBancoHoras(
      marcos,
      await this.origemCiclosBanco(funcionarioId, inicioLogin),
      hojeIso,
      dataInicioProducao,
      tolerancia
    ).filter((c) => c.inicio <= fimIso && c.fim >= inicioIso);
    type Dia = Awaited<ReturnType<PontoService["calcularBancoHoras"]>>["dias"][number];
    const dias: Dia[] = [];
    let saldoAntesMinutos = 0;
    let saldoFinalMinutos = 0;
    const detalhes = ciclos.length
      ? await Promise.all(
          ciclos.map((c) => this.calcularBancoHoras(funcionarioId, inicioLogin, c.inicio, false))
        )
      : [await this.calcularBancoHoras(funcionarioId, inicioLogin, undefined, false)];
    detalhes.forEach((det, i) => {
      if (i === 0) {
        saldoAntesMinutos =
          det.dias.filter((d) => d.data < inicioIso).at(-1)?.saldoAcumuladoMinutos ?? 0;
      }
      const doIntervalo = det.dias.filter((d) => d.data >= inicioIso && d.data <= fimIso);
      dias.push(...doIntervalo);
      const ultimo = det.dias.filter((d) => d.data <= fimIso).at(-1);
      if (ultimo) saldoFinalMinutos = ultimo.saldoAcumuladoMinutos;
      else if (i === 0) saldoFinalMinutos = saldoAntesMinutos;
    });
    dias.sort((a, b) => a.data.localeCompare(b.data));
    return { dias, saldoAntesMinutos, saldoFinalMinutos };
  }

  /** Calcula o saldo do banco de horas do ciclo atual, iterando todos os dias
   *  úteis (seg–sex conforme diasUteis) e contabilizando feriados e afastamentos
   *  como saldo neutro (0), e faltas como saldo negativo. */
  private async calcularBancoHoras(
    funcionarioId: string,
    inicioAtividades?: string,
    cicloInicioQuery?: string,
    incluirSaldosCiclos = false
  ) {
    const funcMeta = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        categoria: true,
        isManager: true,
        isFiscal: true,
        registroPontoObrigatorio: true,
        pontoObrigatorioDesde: true
      }
    });
    const pontoObrigatorioDesde = funcMeta?.pontoObrigatorioDesde
      ? dataCivilISO(funcMeta.pontoObrigatorioDesde)
      : null;
    const historicoCat = await ensureCategoriaHistorico(this.prisma, funcionarioId);
    const optsObrigacao = {
      historico: historicoCat,
      categoriaAtual: funcMeta?.categoria,
      isManagerAtual: funcMeta?.isManager,
      isFiscalAtual: funcMeta?.isFiscal,
      registroPontoObrigatorioAtual: funcMeta?.registroPontoObrigatorio,
      pontoObrigatorioDesde
    };

    const jornada = await this.getJornadaEfetiva(funcionarioId);
    const jornadaCtx = await this.getJornadaHistoricoContexto(funcionarioId);
    const cessoes = await periodosCessao(this.prisma, funcionarioId);

    const diasUteisCfg: boolean[] = JSON.parse(
      typeof jornada.diasUteis === "string"
        ? jornada.diasUteis
        : "[false,true,true,true,true,true,false]"
    );

    const marcos = await this.prisma.bancoHorasMarco.findMany();
    const hojeIso = hojeBrasiliaISO();
    const tolerancia = await toleranciaFechamentoDias(this.prisma, funcionarioId);
    const { cicloInicio, proximaZeragem } = resolverCicloBancoHoras(marcos, hojeIso, tolerancia);
    const dataInicioProducao = await getDataInicioProducao(this.prisma);

    let inicioLogin = inicioAtividades;
    if (!inicioLogin) {
      const funcUser = await this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { user: { select: { primeiroLoginEm: true } } }
      });
      inicioLogin = inicioAtividadesUsuario(funcUser?.user);
    }

    const ciclos = listarCiclosBancoHoras(
      marcos,
      await this.origemCiclosBanco(funcionarioId, inicioLogin),
      hojeIso,
      dataInicioProducao,
      tolerancia
    );
    const cicloAlvo =
      cicloInicioQuery != null
        ? (ciclos.find((c) => c.inicio === cicloInicioQuery) ?? null)
        : (ciclos.find((c) => c.atual) ?? null);

    /* Sem marco: inicia do primeiro login no sistema (alinhado ao Histórico). */
    const inicioBaseCiclo: string | null = cicloAlvo?.inicio ?? cicloInicio ?? null;
    let cicloInicioEfetivo: string = inicioBaseCiclo ?? inicioLogin;
    const cicloFimEfetivo = cicloAlvo?.fim ?? hojeIso;
    if (cicloInicioEfetivo < inicioLogin || !inicioBaseCiclo) {
      /* Antes do 1º acesso não há falta, mas batidas existentes entram no cálculo (horas e saldo):
         o ciclo começa na 1ª batida anterior ao 1º acesso, se houver; senão, no 1º acesso. */
      const primeiraBatida = await this.prisma.registroPonto.findFirst({
        where: {
          funcionarioId,
          apenasInformativo: false,
          dataHora: {
            ...(inicioBaseCiclo ? { gte: intervaloDiaBrasilia(inicioBaseCiclo).inicio } : {}),
            lt: intervaloDiaBrasilia(inicioLogin).inicio
          }
        },
        orderBy: { dataHora: "asc" },
        select: { dataHora: true }
      });
      cicloInicioEfetivo = primeiraBatida ? dataBrasiliaISO(primeiraBatida.dataHora) : inicioLogin;
    }
    /* Não antecipa o ciclo para pontoObrigatorioDesde: períodos intercalados
       (concursado → assessor → concursado) precisam iterar o meio e zerar só nele. */

    const { inicio } = intervaloDiaBrasilia(cicloInicioEfetivo);
    const { fim } = intervaloDiaBrasilia(cicloFimEfetivo);

    // Todos os registros do ciclo, agrupados por dia civil (Brasília)
    // Ignora registros apenas informativos (solicitações de assessor/gerente).
    const registros = await this.prisma.registroPonto.findMany({
      where: {
        funcionarioId,
        apenasInformativo: false,
        dataHora: { gte: inicio, lte: fim }
      },
      orderBy: { dataHora: "asc" },
      select: { tipo: true, dataHora: true, observacoes: true }
    });

    const porDia = new Map<
      string,
      { tipo: string; dataHora: Date; observacoes: Prisma.JsonValue }[]
    >();
    const semIntervaloCategoria = categoriaSemIntervaloAlmoco(funcMeta?.categoria);
    for (const r of registros) {
      const key = dataBrasiliaISO(r.dataHora);
      if (!porDia.has(key)) porDia.set(key, []);
      porDia.get(key)!.push(r);
    }

    // Afastamentos aprovados que interceptam o ciclo (exceto informativos)
    const afastamentosRaw = await this.prisma.afastamento.findMany({
      where: {
        funcionarioId,
        apenasInformativo: false,
        dataInicio: { lte: fim },
        dataFim: { gte: inicio }
      },
      select: {
        id: true,
        tipo: true,
        dataInicio: true,
        dataFim: true,
        horarioInicio: true,
        horarioFim: true
      }
    });
    const solsAtestado = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: { in: ["ATESTADO", "ABONO"] },
        status: "APROVADA",
        OR: [
          { dataInicio: { lte: fim }, dataFim: { gte: inicio } },
          { dataReferencia: { gte: inicio, lte: fim } }
        ]
      },
      select: { dataInicio: true, dataFim: true, dataReferencia: true, metadados: true }
    });
    const afastamentos = enriquecerAfastamentosComSolicitacoes(afastamentosRaw, solsAtestado);
    /* HE sem aprovação não entra (ou só até o limite) — ver utils/hora-extra-decisao. */
    const contextoHe = await carregarContextoHoraExtra(this.prisma, funcionarioId, inicio, fim);

    // Todos os feriados do ciclo (inclusive os que não bloqueiam registro)
    const { inicio: feriadoIni, fim: feriadoFim } = intervaloColunaDate(
      cicloInicioEfetivo,
      cicloFimEfetivo
    );
    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: feriadoIni, lte: feriadoFim } },
      select: { data: true, nome: true, tipo: true, marcoHorario: true, marcoLado: true }
    });
    const feriadoMap = new Map(
      feriados.map((f) => [
        dataCivilISO(f.data),
        {
          nome: f.nome,
          abono: ehDiaAbonado(f),
          marcoHorario: f.marcoHorario,
          marcoLado: f.marcoLado
        }
      ])
    );

    const cfgMult = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasSabadoPct: true, bancoHorasDomingoPct: true, bancoHorasFeriadoPct: true }
    });
    const sabadoPct = cfgMult?.bancoHorasSabadoPct ?? 100;
    const domingoPct = cfgMult?.bancoHorasDomingoPct ?? 200;
    const feriadoPct = cfgMult?.bancoHorasFeriadoPct ?? 200;

    const dias: {
      data: string;
      horasTrabalhadasMinutos: number;
      jornadaEsperadaMinutos: number;
      saldoDiaMinutos: number;
      saldoAcumuladoMinutos: number;
      observacao?: string;
      /** Abono do RH: dia neutro com o nome cadastrado como status. */
      abono?: boolean;
      /** HE rejeitada: quanto foi creditado/rejeitado e o informativo. */
      horaExtra?: AjusteHoraExtraDia;
      /** Linha afetada por liberação (ou revogação) de tempo do banco pelo RH. */
      liberacaoRh?: boolean;
    }[] = [];

    let saldoAcumulado = 0;

    // Itera cada dia civil do ciclo usando aritmética de strings (evita DST)
    let dataAtual = cicloInicioEfetivo;
    while (dataAtual <= cicloFimEfetivo) {
      const [year, month, day] = dataAtual.split("-").map(Number);
      const diaSemana = new Date(year, month - 1, day).getDay();
      const eDiaUtil = diasUteisCfg[diaSemana];
      const feriadoDia = feriadoMap.get(dataAtual);
      const nomeFeriado = feriadoDia?.nome;
      const afastamentosDia = afastamentos.filter((a) => {
        const aInicio = dataBrasiliaISO(a.dataInicio);
        const aFim = dataCivilFimAfastamento(a.dataInicio, a.dataFim);
        return dataAtual >= aInicio && dataAtual <= aFim;
      });
      const afastamentoIntegral = afastamentosDia.find((a) => !isAfastamentoParcial(a));
      const parciaisDia = afastamentosDia.filter(isAfastamentoParcial);
      const afastamento = afastamentoIntegral ?? parciaisDia[0];
      const afastamentoParcial = !afastamentoIntegral && parciaisDia.length > 0;
      const janelasParciais = parciaisDia.map((p) => ({
        horarioInicio: p.horarioInicio!,
        horarioFim: p.horarioFim!
      }));
      const regsDodia = porDia.get(dataAtual) ?? [];
      const eHoje = dataAtual === hojeIso;
      /* Mesma regra do Histórico: em dias passados o trecho aberto (ex. retorno
         sem saída) NÃO conta; no dia corrente usa o horário atual como teto. */
      const capMs = eHoje ? Date.now() : undefined;

      /* Antes do primeiro login: não conta falta. Batidas do dia ainda entram no ciclo. */
      if (dataAtual < inicioLogin && regsDodia.length === 0) {
        const prox = new Date(year, month - 1, day);
        prox.setDate(prox.getDate() + 1);
        dataAtual = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
        continue;
      }

      /* Período como assessor/gerente (ou pré-obrigação) ou de cessão a outro órgão:
         neutro — não falta nem crédito. Preserva saldos dos períodos antes/depois. */
      const cedidoNoDia = diaEmCessao(dataAtual, cessoes);
      if (cedidoNoDia || diaSemObrigacaoPonto(dataAtual, optsObrigacao)) {
        if (eDiaUtil || regsDodia.length > 0) {
          dias.push({
            data: dataAtual,
            horasTrabalhadasMinutos: 0,
            jornadaEsperadaMinutos: 0,
            saldoDiaMinutos: 0,
            saldoAcumuladoMinutos: saldoAcumulado,
            observacao: cedidoNoDia ? "Isento — Cedido" : "Isento — Comissionado/Chefe"
          });
        }
        const prox = new Date(year, month - 1, day);
        prox.setDate(prox.getDate() + 1);
        dataAtual = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
        continue;
      }

      /* Abono do RH: dia neutro para todos — nem falta nem crédito, mesmo com batidas.
         O status exibido é exatamente o nome cadastrado (sem o prefixo "Feriado:"). */
      if (feriadoDia?.abono) {
        if (eDiaUtil || regsDodia.length > 0) {
          dias.push({
            data: dataAtual,
            horasTrabalhadasMinutos: 0,
            jornadaEsperadaMinutos: 0,
            saldoDiaMinutos: 0,
            saldoAcumuladoMinutos: saldoAcumulado,
            observacao: feriadoDia.nome,
            abono: true
          });
        }
        const prox = new Date(year, month - 1, day);
        prox.setDate(prox.getDate() + 1);
        dataAtual = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
        continue;
      }

      if (eDiaUtil) {
        // Dia útil normal
        const entradaDia = regsDodia.find((r) => r.tipo === "ENTRADA");
        const optsDispAlmocoDia = {
          horarioInicio: parciaisDia[0]?.horarioInicio,
          horarioFim: parciaisDia[0]?.horarioFim,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
        };
        const semAlmocoDia =
          semIntervaloCategoria ||
          !!observacaoForcaSemIntervalo(entradaDia?.observacoes) ||
          dispensarAlmocoPorAtestadoParcial(afastamentoParcial, regsDodia, optsDispAlmocoDia);
        const regsCalcDia = semAlmocoDia ? normalizarRegsAtestadoSemAlmoco(regsDodia) : regsDodia;
        let horasTrabalhadasMinutos = this.calcHorasMinutos(regsCalcDia, capMs, {
          exigirIntervalo: !semAlmocoDia,
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
          toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
        });
        let saldoDiaMinutos: number;
        let jornadaDia: number;
        let obs: string | undefined;

        if (afastamentoIntegral) {
          // Afastamento dia inteiro: saldo neutro
          saldoDiaMinutos = 0;
          jornadaDia = 0;
          obs = "Afastamento";
        } else if (afastamentoParcial) {
          const jornadaDiaMin = this.jornadaDiariaParaDia(jornadaCtx, dataAtual);
          const regsMinDia = regsDodia.map((r) => ({
            tipo: r.tipo,
            minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora).substring(0, 5))
          }));
          const janelasEfetivasDia = calcularJanelasEfetivasComCreditoDeslocamento(
            janelasParciais,
            regsMinDia,
            {
              toleranciaRetornoMin: jornadaCtx.atestadoTempoRetornoMin ?? 60,
              toleranciaIdaMin: jornadaCtx.atestadoTempoIdaMin ?? 60,
              almocoMinMin: jornada.almocoMinMin ?? 60,
              almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? undefined,
              almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? undefined
            }
          );
          const jornadaMandatoria = calcularJornadaComAtestadosParciais(janelasEfetivasDia, {
            horaEntrada: jornada.horaEntrada ?? "08:00",
            horaSaida: jornada.horaSaida ?? "17:00",
            jornadaDiariaMin: jornadaDiaMin,
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
          });
          const prep = prepararRegsCalculoAtestadosParciais({
            registros: regsMinDia,
            janelas: janelasParciais,
            horaEntrada: jornada.horaEntrada ?? "08:00",
            horaSaida: jornada.horaSaida ?? "17:00",
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
            fecharVespertinoNoMarco: !eHoje
          });
          horasTrabalhadasMinutos = calcHorasTrabalhadasMinutos(prep.registros, {
            exigirIntervalo: !prep.semAlmoco,
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
            horaEntrada: jornada.horaEntrada ?? "08:00",
            horaSaida: jornada.horaSaida ?? "17:00",
            toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
            toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
          });
          /* Saldo = horas − jornada abonada pelo período solicitado (ex.: 08:00–09:30). */
          saldoDiaMinutos = aplicarMargemCalculoDiario(
            horasTrabalhadasMinutos - jornadaMandatoria,
            jornada.toleranciaCalculoMin
          );
          saldoDiaMinutos += creditoAlmocoDireitoDoDia({
            registros: regsDodia,
            horarioInicioAtestado: parciaisDia[0]?.horarioInicio,
            horarioFimAtestado: parciaisDia[0]?.horarioFim,
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
            agoraMin: eHoje
              ? horarioParaMinutos(horarioDeDataBrasilia(new Date()).substring(0, 5))
              : undefined,
            exigirIntervalo: !semAlmocoDia
          });
          jornadaDia = jornadaMandatoria;
          obs = labelAtestadosParciais(parciaisDia);
        } else if (feriadoDia) {
          const jornadaDiaMin = this.jornadaDiariaParaDia(jornadaCtx, dataAtual);
          if (feriadoDia.marcoHorario) {
            // Feriado parcial: proporcional simples
            const jornadaMandatoria = calcularJornadaParcialFeriado(
              feriadoDia.marcoHorario,
              feriadoDia.marcoLado,
              {
                horaEntrada: jornada.horaEntrada ?? "08:00",
                horaSaida: jornada.horaSaida ?? "17:00",
                jornadaDiariaMin: jornadaDiaMin
              }
            );
            saldoDiaMinutos = aplicarMargemCalculoDiario(
              horasTrabalhadasMinutos - jornadaMandatoria,
              jornada.toleranciaCalculoMin
            );
            jornadaDia = jornadaMandatoria;
            obs = `Feriado parcial: ${feriadoDia.nome} (${feriadoDia.marcoLado === "ANTES" ? "até" : "após"} ${feriadoDia.marcoHorario})`;
          } else if (regsDodia.length > 0) {
            // Feriado dia todo trabalhado: aplica multiplicador, jornadaMin = 0
            saldoDiaMinutos = Math.round((horasTrabalhadasMinutos * feriadoPct) / 100);
            jornadaDia = 0;
            obs = `Feriado trabalhado: ${feriadoDia.nome} (${feriadoPct}%)`;
          } else {
            // Feriado dia todo sem trabalho: neutro
            saldoDiaMinutos = 0;
            jornadaDia = 0;
            obs = `Feriado: ${feriadoDia.nome}`;
          }
        } else {
          // Dia útil normal — jornada conforme vigência do período
          const jornadaDiaMin = this.jornadaDiariaParaDia(jornadaCtx, dataAtual);
          saldoDiaMinutos = aplicarMargemCalculoDiario(
            horasTrabalhadasMinutos - jornadaDiaMin,
            jornada.toleranciaCalculoMin
          );
          saldoDiaMinutos += creditoAlmocoDireitoDoDia({
            registros: regsDodia,
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
            agoraMin: eHoje
              ? horarioParaMinutos(horarioDeDataBrasilia(new Date()).substring(0, 5))
              : undefined,
            exigirIntervalo: !semAlmocoDia
          });
          jornadaDia = jornadaDiaMin;
          obs = undefined;
        }

        /* Feriado trabalhado (jornada 0, multiplicador): só corta se a HE foi rejeitada. */
        const ctxHeDia = contextoDoDia(contextoHe, dataAtual);
        const heDia =
          jornadaDia > 0 || ctxHeDia.situacao === "REJEITADA" || !!ctxHeDia.semHoraExtra
            ? aplicarRegraHoraExtra(saldoDiaMinutos, ctxHeDia, jornada.horaExtraLimiteAuto)
            : { saldoDiaMin: saldoDiaMinutos, ajuste: undefined };
        saldoDiaMinutos = heDia.saldoDiaMin;
        saldoAcumulado += saldoDiaMinutos;
        dias.push({
          data: dataAtual,
          horasTrabalhadasMinutos,
          jornadaEsperadaMinutos: jornadaDia,
          saldoDiaMinutos,
          saldoAcumuladoMinutos: saldoAcumulado,
          observacao: obs,
          ...(heDia.ajuste ? { horaExtra: heDia.ajuste } : {})
        });
      } else if ((!afastamento || isAfastamentoParcial(afastamento)) && regsDodia.length > 0) {
        // Fim de semana COM registros: aplica multiplicador
        const entradaDia = regsDodia.find((r) => r.tipo === "ENTRADA");
        const exigirIntervalo =
          !semIntervaloCategoria && !observacaoForcaSemIntervalo(entradaDia?.observacoes);
        const horasTrabalhadasMinutos = this.calcHorasMinutos(regsDodia, capMs, {
          exigirIntervalo,
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
          toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
        });
        const pct = nomeFeriado ? feriadoPct : diaSemana === 6 ? sabadoPct : domingoPct;
        /* Fim de semana/feriado tem multiplicador próprio: só corta se a HE foi rejeitada. */
        const saldoFds = Math.round((horasTrabalhadasMinutos * pct) / 100);
        const ctxHeFds = contextoDoDia(contextoHe, dataAtual);
        const heFds =
          ctxHeFds.situacao === "REJEITADA" || !!ctxHeFds.semHoraExtra
            ? aplicarRegraHoraExtra(saldoFds, ctxHeFds, jornada.horaExtraLimiteAuto)
            : { saldoDiaMin: saldoFds, ajuste: undefined };
        const saldoDiaMinutos = heFds.saldoDiaMin;
        const tipoLabel = nomeFeriado
          ? `Feriado: ${nomeFeriado}`
          : diaSemana === 6
            ? "Sábado"
            : "Domingo";
        saldoAcumulado += saldoDiaMinutos;
        dias.push({
          data: dataAtual,
          horasTrabalhadasMinutos,
          jornadaEsperadaMinutos: 0,
          saldoDiaMinutos,
          saldoAcumuladoMinutos: saldoAcumulado,
          observacao: `Trabalho em ${tipoLabel} (${pct}%)`,
          ...(heFds.ajuste ? { horaExtra: heFds.ajuste } : {})
        });
      }

      // Avança um dia
      const prox = new Date(year, month - 1, day);
      prox.setDate(prox.getDate() + 1);
      dataAtual = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
    }

    const cicloComputadoInicio = cicloAlvo?.inicio ?? cicloInicioEfetivo;

    /* Tempo liberado pelo RH para abono: debita o saldo na data da liberação. */
    const liberacoesRh = await carregarLiberacoes(this.prisma, funcionarioId);
    if (liberacoesRh.length) {
      const aplicado = aplicarLiberacoesNoExtrato(
        dias,
        liberacoesRh,
        cicloComputadoInicio,
        cicloFimEfetivo
      );
      dias.splice(0, dias.length, ...aplicado.dias);
      saldoAcumulado = aplicado.saldoAtualMinutos;
    }

    let ciclosResposta = ciclos.map((c) => ({
      ...c,
      saldoMinutos: c.inicio === cicloComputadoInicio ? saldoAcumulado : (null as number | null)
    }));

    if (incluirSaldosCiclos) {
      const aBuscar = [
        ...ciclos.filter((c) => !c.atual).slice(-3),
        ...ciclos.filter((c) => c.atual)
      ].filter((c) => c.inicio !== cicloComputadoInicio);
      for (const c of aBuscar) {
        const det = await this.calcularBancoHoras(funcionarioId, inicioLogin, c.inicio, false);
        ciclosResposta = ciclosResposta.map((x) =>
          x.inicio === c.inicio ? { ...x, saldoMinutos: det.saldoAtualMinutos } : x
        );
      }
    }

    return {
      saldoAtualMinutos: saldoAcumulado,
      cicloInicio: cicloAlvo?.inicio ?? cicloInicio,
      cicloFim: cicloAlvo?.fim ?? cicloFimEfetivo,
      cicloAtual: cicloAlvo?.atual ?? true,
      inicioAtividades: inicioLogin,
      proximaZeragem,
      ciclos: ciclosResposta,
      /** Limite diário de HE positiva sem aprovação do gestor (não é teto do saldo acumulado). */
      horaExtraLimiteMinutos: jornada.horaExtraLimiteAuto,
      tipoFlexibilidade: jornada.tipoFlexibilidade,
      dias
    };
  }

  /* ─── Solicitações ─── */

  async getMeuPerfil(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.prisma.funcionario.findUnique({
      where: { id: func.id },
      select: {
        id: true,
        matricula: true,
        cargo: true,
        dataNascimento: true,
        modoHomeOffice: true,
        modoHibridoLocal: true,
        user: { select: { id: true, name: true, email: true, emailReal: true } }
      }
    });
  }

  async getSolicitacoes(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    const rows = await this.prisma.solicitacao.findMany({
      where: { funcionarioId: func.id },
      orderBy: { createdAt: "desc" }
    });
    const gestorIds = [
      ...new Set(rows.map((s) => s.gestorUserId).filter((id): id is string => !!id))
    ];
    const gestores =
      gestorIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: gestorIds } },
            select: { id: true, name: true }
          })
        : [];
    const map = new Map(gestores.map((g) => [g.id, { name: g.name }]));
    return rows.map((s) => ({
      ...s,
      gestorUser: s.gestorUserId ? (map.get(s.gestorUserId) ?? null) : null
    }));
  }

  async getLocalDoDiaHoraExtra(keycloakSub: string, data: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? "")) {
      throw new BadRequestException("Data inválida (use AAAA-MM-DD).");
    }
    const func = await this.getFuncionario(keycloakSub);
    const { inicio, fim } = intervaloDiaBrasilia(data);
    const ctx = contextoDoDia(
      await carregarContextoHoraExtra(this.prisma, func.id, inicio, fim),
      data
    );
    return { remoto: ctx.remoto, local: ctx.local ?? null };
  }

  async getRegistrosDoDia(keycloakSub: string, data: string) {
    const func = await this.getFuncionario(keycloakSub);
    const { inicio, fim } = intervaloDiaBrasilia(data);
    return this.prisma.registroPonto.findMany({
      where: { funcionarioId: func.id, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" },
      select: {
        id: true,
        tipo: true,
        dataHora: true,
        ajustado: true,
        observacao: true
      }
    });
  }

  /* Verifica se a hora extra do dia ultrapassou o limite configurado e, caso positivo,
     cria uma solicitação automática de HORA_EXTRA (se ainda não existir uma para hoje). */
  private async verificarHoraExtraAuto(funcionarioId: string) {
    const [jornada, solCfg, funcMeta] = await Promise.all([
      this.getJornadaEfetiva(funcionarioId),
      this.prisma.configuracaoSolicitacoes.findUnique({
        where: { id: "singleton" },
        select: { tipoAtivoHoraExtra: true }
      }),
      this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { categoria: true }
      })
    ]);

    if (solCfg?.tipoAtivoHoraExtra === false) return;

    const limiteMin = jornada.horaExtraLimiteAuto;
    const hoje = hojeBrasiliaISO();
    const { inicio, fim } = intervaloDiaBrasilia(hoje);

    const registros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" },
      select: { tipo: true, dataHora: true, observacoes: true }
    });
    /* Home office/híbrido fora do CFO (local apurado pelas batidas): nenhuma HE entra no
       banco sem aprovação do chefe, então qualquer HE acima da tolerância gera a solicitação. */
    const remoto = contextoDoDia(
      await carregarContextoHoraExtra(this.prisma, funcionarioId, inicio, fim),
      hoje
    ).remoto;

    // Verifica se hoje é feriado parcial para ajustar a jornada obrigatória
    const feriadoHoje = await this.prisma.feriadoConfig.findUnique({
      where: { data: new Date(`${hoje}T00:00:00.000Z`) },
      select: { marcoHorario: true, marcoLado: true }
    });
    const jornadaMandatoria = feriadoHoje?.marcoHorario
      ? calcularJornadaParcialFeriado(feriadoHoje.marcoHorario, feriadoHoje.marcoLado, {
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          jornadaDiariaMin: jornada.jornadaDiariaMin
        })
      : jornada.jornadaDiariaMin;

    const entradaHoje = registros.find((r) => r.tipo === "ENTRADA");
    const exigirIntervalo =
      !categoriaSemIntervaloAlmoco(funcMeta?.categoria) &&
      !observacaoForcaSemIntervalo(entradaHoje?.observacoes);
    const overtimeRaw =
      this.calcHorasMinutos(registros, undefined, {
        exigirIntervalo,
        almocoMinMin: jornada.almocoMinMin ?? 60,
        almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
        almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
        horaEntrada: jornada.horaEntrada ?? "08:00",
        horaSaida: jornada.horaSaida ?? "17:00",
        toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
        toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
      }) - jornadaMandatoria;
    const overtime = aplicarMargemCalculoDiario(overtimeRaw, jornada.toleranciaCalculoMin);
    // Permanência residual dentro da tolerância de HE também não dispara solicitação
    if (overtime <= (jornada.toleranciaHoraExtraMin ?? 0)) return;
    if (!remoto && overtime <= limiteMin) return;

    const jaExiste = await this.prisma.solicitacao.findFirst({
      where: {
        funcionarioId,
        tipo: "HORA_EXTRA",
        dataReferencia: { gte: inicio, lte: fim }
      }
    });
    if (jaExiste) return;

    const h = Math.floor(overtime / 60);
    const m = String(overtime % 60).padStart(2, "0");
    await this.prisma.solicitacao.create({
      data: {
        funcionarioId,
        tipo: "HORA_EXTRA",
        dataReferencia: new Date(`${hoje}T12:00:00-03:00`),
        dataInicio: inicio,
        dataFim: fim,
        descricao: remoto
          ? `Hora extra automática (home office/híbrido em casa): ${h}h${m} além da jornada diária. Só entra no banco de horas se aprovada.`
          : `Hora extra automática: ${h}h${m} além da jornada diária. O que passar do limite diário só entra no banco de horas se aprovado.`,
        metadados: { automatica: true, horasExtraMinutos: overtime, remoto }
      }
    });
  }

  async criarSolicitacao(
    keycloakSub: string,
    body: {
      tipo: string;
      dataReferencia: string;
      dataInicio?: string;
      dataFim?: string;
      descricao: string;
      metadados?: Record<string, unknown>;
    },
    opcoes?: {
      /** RH abrindo o pedido em nome do funcionário (mesmo fluxo; fica marcado). */
      origemRh?: { userId: string | null; nome: string; dispensar: boolean; justificativa: string };
    }
  ) {
    const func = await this.getFuncionario(keycloakSub);
    const dispensar = !!opcoes?.origemRh?.dispensar;
    /** Dispensas de prazo/antecedência realmente usadas (vão para o registro). */
    const dispensasUsadas: string[] = [];

    /* Abono com vários períodos: valida e normaliza (00:00–23:59 = dia inteiro, datas em
       Brasília). O intervalo da solicitação passa a ir do 1º início ao último fim. */
    if (body.tipo === "ABONO" && Array.isArray(body.metadados?.periodos)) {
      const periodosAbono = periodosDoAbono({
        dataInicio: null,
        dataFim: null,
        dataReferencia: new Date(body.dataReferencia),
        metadados: body.metadados
      });
      const errosAbono = validarPeriodosAbono(periodosAbono);
      if (errosAbono.length) throw new BadRequestException(errosAbono.join(" "));
      const primeiro = periodosAbono.map((p) => p.inicio).sort()[0];
      const ultimo = periodosAbono
        .map((p) => p.fim)
        .sort()
        .at(-1)!;
      body.metadados = {
        ...body.metadados,
        periodos: periodosAbono.map((p) => ({
          dataInicio: intervaloDiaBrasilia(p.inicio).inicio.toISOString(),
          dataFim: fimDiaCivilBrasilia(p.fim).toISOString(),
          horarioInicio: p.horarioInicio,
          horarioFim: p.horarioFim
        }))
      };
      delete (body.metadados as Record<string, unknown>).horarioInicio;
      delete (body.metadados as Record<string, unknown>).horarioFim;
      body.dataReferencia = new Date(`${primeiro}T12:00:00-03:00`).toISOString();
      body.dataInicio = intervaloDiaBrasilia(primeiro).inicio.toISOString();
      body.dataFim = fimDiaCivilBrasilia(ultimo).toISOString();
    }

    /* Abono com tempo de banco liberado pelo RH: o servidor recalcula os minutos por dia,
       confere o disponível e a validade e grava a alocação (reserva) no pedido. */
    let usaCreditoBanco = false;
    let usaCotaAbono = false;
    if (body.tipo === "ABONO") {
      const pediuCota =
        (body.metadados as Record<string, unknown> | undefined)?.usarCotaAbono === true;
      if (body.metadados) {
        delete (body.metadados as Record<string, unknown>).usarCotaAbono;
        delete (body.metadados as Record<string, unknown>).cotaAbono;
      }
      if (pediuCota) {
        /* Abono diário da cota do acordo coletivo: independe do tempo liberado e do abono livre. */
        const dias = await this.montarCotaAbono(func.id, body.metadados);
        usaCotaAbono = true;
        body.metadados = { ...body.metadados, cotaAbono: { dias } };
      }
    }
    if (body.tipo === "ABONO" && !usaCotaAbono) {
      const pediuCredito =
        (body.metadados as Record<string, unknown> | undefined)?.usarCreditoBanco === true;
      if (body.metadados) {
        delete (body.metadados as Record<string, unknown>).usarCreditoBanco;
        delete (body.metadados as Record<string, unknown>).creditoBanco;
      }
      /* O tempo liberado pelo RH é prioritário: havendo saldo disponível, o abono o consome. O
         abono comum / além do limite só vale com a opção ligada em Configurações → Solicitações. */
      const { disponivelMinutos } = await this.getCreditoBancoPorFuncionario(func.id);
      const cfgAbono = await this.configSolicitacoesService.getConfig();
      const permitirAlemCfg = !!cfgAbono.abonoAlemLimiteLiberadoRh;
      const permitirAlem = permitirAlemCfg || dispensar;
      if (pediuCredito || disponivelMinutos > 0) {
        const credito = await this.montarCreditoBancoAbono(func.id, body.metadados, permitirAlem);
        if (credito) {
          usaCreditoBanco = true;
          body.metadados = { ...body.metadados, creditoBanco: credito };
        }
      }
      if (!usaCreditoBanco && !permitirAlemCfg && dispensar) {
        dispensasUsadas.push("Abono livre (opção desligada em Configurações)");
      }
      if (!usaCreditoBanco && !permitirAlem) {
        throw new BadRequestException(
          "O abono livre está desativado. O abono só pode ser pedido com tempo de banco de horas liberado pelo RH; procure o RH."
        );
      }
    }

    /* Bloqueia nova solicitação se o período já está coberto por uma solicitação
       previamente aprovada pelo RH (evita duplicidade/conflito para o mesmo dia). */
    const novoInicio = body.dataInicio ? new Date(body.dataInicio) : new Date(body.dataReferencia);
    const novoFim = body.dataFim ? new Date(body.dataFim) : novoInicio;
    const alteracaoDeId = (body.metadados?.alteracaoDeId as string | undefined) ?? null;

    const aprovadas = await this.prisma.solicitacao.findMany({
      where: { funcionarioId: func.id, status: "APROVADA" },
      select: {
        id: true,
        tipo: true,
        dataReferencia: true,
        dataInicio: true,
        dataFim: true,
        metadados: true
      }
    });

    // Se for uma alteração, valida que a solicitação original existe e pertence ao funcionário
    if (alteracaoDeId) {
      const original = aprovadas.find((s) => s.id === alteracaoDeId);
      if (!original) {
        throw new BadRequestException(
          "A solicitação de férias original a ser alterada não foi encontrada ou não está aprovada."
        );
      }
    }

    if (body.tipo === "CORRECAO_PONTO") {
      const dataRefIsoAssin = dataCivilISO(new Date(body.dataReferencia));
      if (dataRefIsoAssin >= hojeBrasiliaISO()) {
        throw new BadRequestException(
          "Correção de ponto só pode ser solicitada para dias anteriores. O dia de hoje e datas futuras não são permitidos."
        );
      }
      const [anoAssin, mesAssin] = dataRefIsoAssin.split("-").map(Number);
      const periodoAssin = await this.prisma.periodoPonto.findUnique({
        where: {
          funcionarioId_mes_ano: { funcionarioId: func.id, mes: mesAssin, ano: anoAssin }
        },
        include: { assinatura: { select: { status: true } } }
      });
      const statusAssin = periodoAssin?.assinatura?.status;
      if (statusAssin === "PENDENTE_GESTOR" || statusAssin === "CONCLUIDA") {
        throw new BadRequestException(
          "Este período já foi assinado. Não é mais possível solicitar correção da folha de ponto."
        );
      }

      const novosTipos = new Set(extrairTiposCorrecaoPonto(body.metadados));
      if (
        categoriaSemIntervaloAlmoco(func.categoria) &&
        (novosTipos.has("INICIO_INTERVALO") || novosTipos.has("FIM_INTERVALO"))
      ) {
        const label = labelCategoriaSemIntervalo(func.categoria);
        throw new BadRequestException(
          `${label} realiza carga horária corrida e não pode solicitar correção de intervalo de almoço.`
        );
      }

      const correcoesDia = Array.isArray(
        (body.metadados as { correcoesDia?: ItemCorrecaoPonto[] } | undefined)?.correcoesDia
      )
        ? (body.metadados as { correcoesDia: ItemCorrecaoPonto[] }).correcoesDia
        : [];
      if (correcoesDia.length > 0) {
        const dataRefIso = dataCivilISO(new Date(body.dataReferencia));
        const { inicio, fim } = intervaloDiaBrasilia(dataRefIso);
        const registrosDoDia = await this.prisma.registroPonto.findMany({
          where: { funcionarioId: func.id, dataHora: { gte: inicio, lt: fim } },
          select: { tipo: true, dataHora: true },
          orderBy: { dataHora: "asc" }
        });
        const erroPausa = validarItensCorrecaoPontoPausa({
          correcoes: correcoesDia,
          dataRefIso,
          hojeIso: hojeBrasiliaISO(),
          registrosDoDia
        });
        if (erroPausa) throw new BadRequestException(erroPausa);
      }

      if (novosTipos.size > 0) {
        const correcoesExistentes = await this.prisma.solicitacao.findMany({
          where: {
            funcionarioId: func.id,
            tipo: "CORRECAO_PONTO",
            status: { in: [...STATUS_BLOQUEIO_CORRECAO_PONTO] }
          },
          select: {
            id: true,
            status: true,
            dataReferencia: true,
            dataInicio: true,
            dataFim: true,
            metadados: true
          }
        });

        const conflitoAprovada = encontrarConflitoCorrecaoPonto(
          correcoesExistentes.filter((s) => s.status === "APROVADA"),
          novosTipos,
          novoInicio,
          novoFim,
          alteracaoDeId
        );
        const conflitoRejeitada = encontrarConflitoCorrecaoPonto(
          correcoesExistentes.filter((s) => s.status !== "APROVADA"),
          novosTipos,
          novoInicio,
          novoFim,
          alteracaoDeId
        );
        const conflitoCorrecao = conflitoAprovada ?? conflitoRejeitada;

        if (conflitoCorrecao) {
          const labels = labelsTiposConflitoCorrecao(novosTipos, conflitoCorrecao);
          const dataRef = fmtDataBr(body.dataReferencia);

          if (conflitoCorrecao.status === "APROVADA") {
            throw new BadRequestException(
              `Já existe uma solicitação de correção de ponto aprovada para ${labels} no dia ${dataRef}. ` +
                "Não é possível abrir uma nova solicitação para o(s) mesmo(s) registro(s) de ponto."
            );
          }

          throw new BadRequestException(
            `Já existe uma solicitação de correção de ponto ${descricaoRejeicaoCorrecao(conflitoCorrecao.status)} para ${labels} no dia ${dataRef}. ` +
              "Não é possível abrir uma nova solicitação para o(s) mesmo(s) registro(s) de ponto."
          );
        }
      }
    } else if (body.tipo !== "ENVIO_DOCUMENTO_RH") {
      /* Envio de documento ao RH pode ocorrer várias vezes no mesmo dia.
         Estagiário pode ter várias solicitações de férias no mesmo ciclo (saldo residual),
         desde que as datas não se sobreponham. */
      /* Com vários períodos (abono, férias), compara período a período — os dias entre
         dois períodos não ficam bloqueados. */
      const novosIntervalos = intervalosDaSolicitacao({
        dataInicio: novoInicio,
        dataFim: novoFim,
        dataReferencia: novoInicio,
        metadados: body.metadados ?? null
      });
      const conflito = aprovadas.find((s) => {
        if (alteracaoDeId && s.id === alteracaoDeId) return false;
        if (s.tipo === "ENVIO_DOCUMENTO_RH") return false;
        /* Hora extra só conflita com outra hora extra (correção aprovada no dia não impede). */
        if (body.tipo === "HORA_EXTRA" && s.tipo !== "HORA_EXTRA") return false;
        return intervalosDaSolicitacao(s).some(([ie, fe]) =>
          novosIntervalos.some(([ni, nf]) => periodosSobrepostos(ni, nf, ie, fe))
        );
      });

      if (conflito) {
        throw new BadRequestException(
          `Já existe uma solicitação de ${TIPO_SOLICITACAO_LABEL[conflito.tipo] ?? conflito.tipo} aprovada cobrindo este período. Não é possível abrir uma nova solicitação para o(s) mesmo(s) dia(s).`
        );
      }
    }

    let metadados = body.metadados ?? null;

    /* Validação para HORA_EXTRA manual */
    if (body.tipo === "HORA_EXTRA") {
      const [jornada, solCfg] = await Promise.all([
        this.getJornadaEfetiva(func.id),
        this.prisma.configuracaoSolicitacoes.findUnique({
          where: { id: "singleton" },
          select: { tipoAtivoHoraExtra: true }
        })
      ]);

      if (solCfg?.tipoAtivoHoraExtra === false) {
        if (!dispensar) {
          throw new BadRequestException(
            "A solicitação de Hora Extra está desativada. Entre em contato com o RH."
          );
        }
        dispensasUsadas.push("Tipo Hora Extra desativado em Configurações");
      }

      const horasExtraMin = (body.metadados?.horasExtraMinutos as number | undefined) ?? 0;
      /* Dia em home office / híbrido em casa: nenhuma HE entra sem aprovação, então
         qualquer tempo pode ser solicitado. Presencial: só o que passa do limite diário. */
      const { inicio: iniDia, fim: fimDia } = intervaloDiaBrasilia(
        dataBrasiliaISO(new Date(body.dataReferencia))
      );
      /* Home office/híbrido fora do CFO: nenhuma HE entra sem aprovação, então qualquer
         tempo pode ser solicitado. Mesmo critério de local do banco de horas. */
      const diaRef = dataBrasiliaISO(new Date(body.dataReferencia));
      const diaRemoto = contextoDoDia(
        await carregarContextoHoraExtra(this.prisma, func.id, iniDia, fimDia),
        diaRef
      ).remoto;
      const limiteMin = diaRemoto ? 1 : jornada.horaExtraLimiteAuto;
      if (horasExtraMin < limiteMin && dispensar) {
        dispensasUsadas.push("Mínimo de tempo da hora extra");
      } else if (horasExtraMin < limiteMin) {
        const h = Math.floor(limiteMin / 60);
        const m = String(limiteMin % 60).padStart(2, "0");
        throw new BadRequestException(
          `A solicitação de hora extra requer no mínimo ${h}h${m} (configuração atual). ` +
            `Informe um tempo igual ou superior.`
        );
      }
    }

    if (body.tipo === "DAY_OFF") {
      if (!func.dataNascimento) {
        throw new BadRequestException(
          "Data de nascimento não cadastrada. Solicite ao RH que atualize seu perfil para solicitar o Day Off de aniversário."
        );
      }
      const mesAniversario = new Date(func.dataNascimento).getUTCMonth();
      const mesDataReferencia = new Date(body.dataReferencia).getUTCMonth();
      if (mesAniversario !== mesDataReferencia) {
        const nomeMes = new Date(func.dataNascimento).toLocaleDateString("pt-BR", {
          month: "long",
          timeZone: "UTC"
        });
        throw new BadRequestException(
          `O Day Off de aniversário deve ser marcado em um dia do mês de ${nomeMes}.`
        );
      }
    }

    if (body.tipo === "CORRECAO_PONTO" && metadados) {
      const horario = metadados.horarioSolicitado as string | undefined;
      if (horario) {
        const limites = await this.obterLimitesHorarioPonto();
        const validacao = validarHorarioPermitido(horario, limites.min, limites.max);
        if (!validacao.ok) {
          throw new BadRequestException(validacao.message);
        }
      }
      /* Entrada que fica abaixo do descanso de interjornada: avisa chefe e RH na análise
         (não bloqueia o pedido). */
      const aviso = await this.avisoInterjornadaCorrecao(
        func.id,
        new Date(body.dataReferencia),
        metadados
      );
      if (aviso) metadados = { ...metadados, avisoInterjornada: aviso };
    }

    if (body.tipo === "FERIAS" && func.categoria === "ESTAGIARIO") {
      const diasVendidos = Number(body.metadados?.diasVendidos ?? 0);
      if (diasVendidos > 0) {
        throw new BadRequestException(
          "Estagiários não podem vender dias de férias (abono pecuniário)."
        );
      }
    }

    if (body.tipo === "FERIAS" && !alteracaoDeId) {
      const meta = (body.metadados ?? {}) as Record<string, unknown>;
      const totalGozo = Number(meta.totalDiasGozo ?? 0);
      const diasVendidos = Number(meta.diasVendidos ?? 0);
      const total = totalGozo + diasVendidos;
      const cicloNumero =
        meta.cicloNumero != null && meta.cicloNumero !== "" ? Number(meta.cicloNumero) : null;

      const saldo = await this.calcularSaldoFeriasFuncionario(func.id);
      if (
        !saldo ||
        (saldo.diasDisponiveis <= 0 &&
          !saldo.ciclos.some((c) => c.status === "DISPONIVEL" && c.diasDisponiveis > 0))
      ) {
        throw new BadRequestException(
          "Não há dias de férias disponíveis para uma nova solicitação."
        );
      }

      const ciclo =
        cicloNumero != null
          ? saldo.ciclos.find((c) => c.numero === cicloNumero)
          : saldo.ciclos.find((c) => c.status === "DISPONIVEL" && c.diasDisponiveis > 0);

      /* Estagiário: não precisa igualar o ciclo (pode marcar parte); o fracionamento
         (blocos de 5, até 3 períodos), antecedência e vedação são conferidos adiante. */
      if (func.categoria === "ESTAGIARIO") {
        const disponivel = ciclo?.diasDisponiveis ?? saldo.diasDisponiveis;
        if (total <= 0) {
          throw new BadRequestException("Informe ao menos um período de gozo.");
        }
        if (total > disponivel) {
          throw new BadRequestException(
            `Total de dias (${total}) excede os ${disponivel} dias disponíveis neste ciclo.`
          );
        }
        if (ciclo) {
          body.metadados = { ...meta, cicloNumero: ciclo.numero };
          metadados = body.metadados;
        }
      } else if (ciclo) {
        if (ciclo.status !== "DISPONIVEL" || ciclo.diasDisponiveis <= 0) {
          throw new BadRequestException(
            `O ciclo ${ciclo.numero} já está configurado ou em análise. Solicite uma mudança, não uma nova solicitação.`
          );
        }
        if (total !== ciclo.diasDisponiveis) {
          throw new BadRequestException(
            `Na primeira solicitação do ciclo, gozo + venda deve igualar os ${ciclo.diasDisponiveis} dias disponíveis (Restam = 0).`
          );
        }
        // Garante cicloNumero nos metadados
        body.metadados = { ...meta, cicloNumero: ciclo.numero };
        metadados = body.metadados;
      } else if (total !== saldo.diasDisponiveis) {
        throw new BadRequestException(
          `Na primeira solicitação, gozo + venda deve igualar os ${saldo.diasDisponiveis} dias disponíveis (Restam = 0).`
        );
      }
    }

    /* Regras de marcação (CLT / Lei 11.788): antecedência, tamanho e número de períodos,
       venda, vedação antes de feriado/repouso e data mínima de gozo (ciclo em formação). */
    if (body.tipo === "FERIAS") {
      const meta = (body.metadados ?? {}) as Record<string, unknown>;
      const periodosMeta = Array.isArray(meta.periodos)
        ? (meta.periodos as Array<{ dataInicio?: string; dataFim?: string }>)
        : [];
      const periodosFerias = periodosMeta.map((p) => ({
        inicio: dataCivilPeriodo(String(p.dataInicio ?? "")),
        fim: dataCivilPeriodo(String(p.dataFim ?? ""))
      }));
      /* Alteração: períodos mantidos da solicitação original não são reavaliados quanto a
         antecedência e vedação (só os novos ou mudados). */
      let novos: Set<number> | undefined;
      if (alteracaoDeId) {
        const original = aprovadas.find((s) => s.id === alteracaoDeId);
        const metaOrig = (original?.metadados ?? {}) as Record<string, unknown>;
        const mantidos = new Set(
          (Array.isArray(metaOrig.periodos)
            ? (metaOrig.periodos as Array<{ dataInicio?: string; dataFim?: string }>)
            : []
          ).map(
            (p) =>
              `${dataCivilPeriodo(String(p.dataInicio ?? ""))}|${dataCivilPeriodo(String(p.dataFim ?? ""))}`
          )
        );
        novos = new Set(
          periodosFerias
            .map((p, i) => (mantidos.has(`${p.inicio}|${p.fim}`) ? -1 : i))
            .filter((i) => i >= 0)
        );
      }
      const cfgSol = await this.configSolicitacoesService.getConfig();
      const datas = periodosFerias
        .flatMap((p) => [p.inicio, p.fim])
        .filter(Boolean)
        .sort();
      const calendario = await this.calendarioFerias(
        func.id,
        datas[0] ?? hojeBrasiliaISO(),
        somarDiasIso(datas.at(-1) ?? hojeBrasiliaISO(), cfgSol.feriasVedacaoPreFeriadoDias + 1)
      );
      const regrasFerias = {
        antecedenciaMinDias: cfgSol.feriasAntecedenciaMinDias,
        vedacaoPreFeriadoDias: cfgSol.feriasVedacaoPreFeriadoDias
      };
      /* Ciclo da marcação: dá o limite por período do estagiário e a data mínima de gozo. */
      const saldoFerias = await this.calcularSaldoFeriasFuncionario(func.id);
      const cicloNumMeta =
        meta.cicloNumero != null && meta.cicloNumero !== "" ? Number(meta.cicloNumero) : null;
      const cicloFerias =
        saldoFerias?.ciclos.find((c) => c.numero === cicloNumMeta) ??
        saldoFerias?.ciclos.find((c) => c.status === "DISPONIVEL" && c.diasDisponiveis > 0);
      const liberaEm = cicloFerias?.liberaEm ?? null;
      const errosFerias =
        func.categoria === "ESTAGIARIO"
          ? validarPeriodosEstagiario({
              periodos: periodosFerias,
              maxPeriodoDias: (cicloFerias?.diasPorCiclo ?? 30) <= 15 ? 10 : 30,
              regras: regrasFerias,
              hoje: hojeBrasiliaISO(),
              calendario,
              liberaEm,
              novos
            })
          : validarPeriodosFerias({
              periodos: periodosFerias,
              diasVenda: Number(meta.diasVendidos ?? 0),
              regras: {
                antecedenciaMinDias: cfgSol.feriasAntecedenciaMinDias,
                minimoGrandePeriodo: cfgSol.feriasMinimoGrandePeriodo,
                minimoOutrosPeriodos: cfgSol.feriasMinimoOutrosPeriodos,
                maxPeriodos: cfgSol.feriasMaxPeriodos,
                maxDiasVenda: cfgSol.feriasMaxDiasVenda,
                vedacaoPreFeriadoDias: cfgSol.feriasVedacaoPreFeriadoDias
              },
              hoje: hojeBrasiliaISO(),
              calendario,
              liberaEm,
              novos
            });
      if (errosFerias.length) throw new BadRequestException(errosFerias.join(" "));
    }

    if (body.tipo === "ATESTADO") {
      body.metadados = await this.prepararCidDoAtestado(body.metadados);
      metadados = body.metadados;
    }
    if (body.tipo === "LICENCA") {
      const prep = await this.prepararLicenca(func, body);
      body.metadados = prep.metadados;
      body.dataReferencia = prep.dataReferencia;
      body.dataInicio = prep.dataInicio;
      body.dataFim = prep.dataFim;
      metadados = body.metadados;
    }

    if (body.tipo === "HORA_EXTRA" && categoriaSemHoraExtra(func.categoria)) {
      throw new BadRequestException(
        `${labelCategoriaSemIntervalo(func.categoria as string)} não faz hora extra: o que passar da jornada é apenas informativo e não vai ao banco de horas.`
      );
    }

    if (body.tipo === "ENVIO_DOCUMENTO_RH") {
      const solCfg = await this.prisma.configuracaoSolicitacoes.findUnique({
        where: { id: "singleton" },
        select: { tipoAtivoEnvioDocumentoRh: true }
      });
      if (solCfg?.tipoAtivoEnvioDocumentoRh === false) {
        if (!dispensar) {
          throw new BadRequestException(
            "O envio de documento ao RH está desativado. Entre em contato com o RH."
          );
        }
        dispensasUsadas.push("Envio de documento desativado em Configurações");
      }
      if (!body.descricao?.trim() || body.descricao.trim().length < 3) {
        throw new BadRequestException("Informe uma descrição com pelo menos 3 caracteres.");
      }
      if (!metadados || typeof metadados.documentoBase64 !== "string") {
        throw new BadRequestException("Anexe um arquivo (imagem ou PDF) para enviar ao RH.");
      }
    }

    // Salva documento de atestado / abono (opcional) / envio ao RH se enviado em base64
    if (
      (body.tipo === "ATESTADO" ||
        body.tipo === "ABONO" ||
        body.tipo === "LICENCA" ||
        body.tipo === "ENVIO_DOCUMENTO_RH") &&
      metadados &&
      typeof metadados.documentoBase64 === "string"
    ) {
      const url = await this.documentoService.salvarDocumento({
        funcionarioId: func.id,
        solicitacaoId: `${func.id}-${Date.now()}`,
        arquivoBase64: metadados.documentoBase64 as string,
        mimeType: (metadados.documentoMime as string) ?? undefined
      });
      const resto = { ...(metadados as Record<string, unknown>) };
      delete resto.documentoBase64;
      delete resto.documentoMime;
      metadados = {
        ...resto,
        documentoUrl: url,
        ...((body.tipo === "ENVIO_DOCUMENTO_RH" ||
          body.tipo === "ABONO" ||
          body.tipo === "LICENCA") &&
        typeof resto.nomeArquivo === "string"
          ? { nomeArquivo: resto.nomeArquivo }
          : {})
      };
    }

    const vaiDiretoAoRh = body.tipo === "ENVIO_DOCUMENTO_RH";

    /* Origem: pedido aberto pelo RH em nome do funcionário (mesma chave que as férias usam). */
    if (opcoes?.origemRh) {
      metadados = {
        ...(metadados ?? {}),
        origem: "RH",
        criadaPorRh: {
          userId: opcoes.origemRh.userId,
          nome: opcoes.origemRh.nome,
          em: new Date().toISOString(),
          ...(dispensar
            ? { justificativa: opcoes.origemRh.justificativa, dispensas: dispensasUsadas }
            : {})
        }
      };
    }

    const solicitacao = await this.prisma.solicitacao.create({
      data: {
        funcionarioId: func.id,
        tipo: body.tipo,
        dataReferencia: new Date(body.dataReferencia),
        dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
        dataFim: body.dataFim ? new Date(body.dataFim) : null,
        descricao: body.descricao,
        apenasInformativo:
          (funcionarioSemRegistroPonto(func) && !usaCreditoBanco && !usaCotaAbono) || vaiDiretoAoRh,
        status: vaiDiretoAoRh ? "AGUARDANDO_RH" : "PENDENTE",
        metadados: metadados ? JSON.parse(JSON.stringify(metadados)) : undefined
      },
      include: { funcionario: { include: { user: { select: { name: true } } } } }
    });

    if (vaiDiretoAoRh) {
      this.notificarEnvioDocumentoRh(solicitacao).catch((e) =>
        this.logger.error(`Falha ao notificar ENVIO_DOCUMENTO_RH: ${e}`)
      );
    } else {
      this.notificarNovaSolicitacaoGestor(solicitacao).catch((e) =>
        this.logger.error(`Falha ao notificar SOLICITACAO_NOVA_GESTOR: ${e}`)
      );
    }
    if (opcoes?.origemRh) {
      this.notificarSolicitacaoCriadaPeloRh(solicitacao, opcoes.origemRh.nome).catch((e) =>
        this.logger.error(`Falha ao notificar SOLICITACAO_CRIADA_PELO_RH: ${e}`)
      );
    }

    return solicitacao;
  }

  /** Tempo liberado pelo RH que o funcionário ainda pode usar em abono. */
  async getCreditoBanco(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.getCreditoBancoPorFuncionario(func.id);
  }

  private async getCreditoBancoPorFuncionario(funcionarioId: string) {
    const func = { id: funcionarioId };
    const cfg = await this.configSolicitacoesService.getConfig();
    const hojeIso = hojeBrasiliaISO();
    const [liberacoes, { uso }] = await Promise.all([
      carregarLiberacoes(this.prisma, func.id),
      carregarUsoCredito(this.prisma, func.id)
    ]);
    const situacoes = situacaoDasLiberacoes(liberacoes, uso, hojeIso);
    const abertas = situacoes
      .filter((x) => x.disponivelMinutos > 0)
      .sort((a, b) => a.validaAte.localeCompare(b.validaAte))
      .map((x) => ({ validaAte: x.validaAte, disponivelMinutos: x.disponivelMinutos }));
    return {
      disponivelMinutos: totalDisponivel(situacoes),
      temLiberacao: liberacoes.length > 0,
      /** Config: pode pedir abono além do tempo liberado (o liberado é usado primeiro). */
      permitirAlemLimite: !!cfg.abonoAlemLimiteLiberadoRh,
      liberacoes: abertas
    };
  }

  /** Minutos que os períodos do abono consomem (dia útil = jornada; parcial = faixa). */
  private async consumoDoAbono(
    funcionarioId: string,
    metadados: Record<string, unknown> | undefined
  ) {
    const periodos = periodosDoAbono({
      dataInicio: null,
      dataFim: null,
      dataReferencia: new Date(),
      metadados
    });
    const primeiro = periodos.map((p) => p.inicio).sort()[0];
    const ultimo = periodos
      .map((p) => p.fim)
      .sort()
      .at(-1)!;
    if (!Array.isArray(metadados?.periodos) || !primeiro) {
      throw new BadRequestException("Informe os períodos do abono para usar o tempo liberado.");
    }
    const [calendario, ctx] = await Promise.all([
      this.calendarioFerias(funcionarioId, primeiro, ultimo),
      this.getJornadaHistoricoContexto(funcionarioId)
    ]);
    const calc = calcularMinutosDoAbono({
      periodos,
      diasUteis: calendario.diasUteis,
      feriados: new Set(calendario.feriados),
      jornadaDiaMin: (iso) => jornadaEsperadaMin(iso, ctx)
    });
    return { ...calc, ultimo };
  }

  /** Prévia (tela de abono): quanto o abono consumiria do tempo liberado. */
  async simularCreditoBanco(
    keycloakSub: string,
    body: {
      periodos: Array<{
        dataInicio: string;
        dataFim?: string;
        horarioInicio?: string | null;
        horarioFim?: string | null;
      }>;
    }
  ) {
    const func = await this.getFuncionario(keycloakSub);
    const periodos = (body?.periodos ?? []).map((p) => ({
      dataInicio: p.dataInicio,
      dataFim: p.dataFim || p.dataInicio,
      horarioInicio: p.horarioInicio ?? null,
      horarioFim: p.horarioFim ?? null
    }));
    const consumo = await this.consumoDoAbono(func.id, { periodos });
    const { disponivelMinutos, permitirAlemLimite } = await this.getCreditoBanco(keycloakSub);
    return {
      permitirAlemLimite,
      minutosTotal: consumo.minutosTotal,
      dias: consumo.dias.filter((d) => d.minutos > 0),
      disponivelMinutos
    };
  }

  /**
   * Calcula e confere o consumo do crédito para os períodos do abono. Com `permitirAlem`
   * (config), o que passar do tempo liberado vira abono comum; retorna null se nada usa crédito.
   */
  private async montarCreditoBancoAbono(
    funcionarioId: string,
    metadados: Record<string, unknown> | undefined,
    permitirAlem = false
  ) {
    const calc = await this.consumoDoAbono(funcionarioId, metadados);
    const ultimo = calc.ultimo;
    if (calc.minutosTotal <= 0) {
      if (permitirAlem) return null;
      throw new BadRequestException(
        "Os dias escolhidos não consomem tempo (fim de semana ou feriado). Escolha dias úteis."
      );
    }
    const hojeIso = hojeBrasiliaISO();
    const [liberacoes, { uso }] = await Promise.all([
      carregarLiberacoes(this.prisma, funcionarioId),
      carregarUsoCredito(this.prisma, funcionarioId)
    ]);
    const situacoes = situacaoDasLiberacoes(liberacoes, uso, hojeIso);
    const disponivel = totalDisponivel(situacoes);
    const elegivel = situacoes
      .filter((x) => x.validaAte >= ultimo)
      .reduce((t, x) => t + x.disponivelMinutos, 0);
    const alem = Math.max(0, calc.minutosTotal - elegivel);
    if (alem > 0 && !permitirAlem) {
      if (calc.minutosTotal > disponivel) {
        throw new BadRequestException(
          `O abono consome ${fmtHoraMin(calc.minutosTotal)}, mas o tempo liberado disponível é de ${fmtHoraMin(disponivel)}. Reduza o abono ou peça ao RH para liberar mais tempo.`
        );
      }
      const maisLonge = situacoes
        .filter((x) => x.disponivelMinutos > 0)
        .map((x) => x.validaAte)
        .sort()
        .at(-1);
      throw new BadRequestException(
        maisLonge
          ? `O tempo liberado vale até ${maisLonge.split("-").reverse().join("/")}; ajuste as datas do abono ou o tempo solicitado.`
          : "Não há tempo liberado disponível para este abono."
      );
    }
    if (elegivel <= 0) return null;
    const usar = Math.min(calc.minutosTotal, elegivel);
    const alocacao = alocarCredito(situacoes, usar, ultimo);
    if (!alocacao) return null;
    return {
      minutosTotal: usar,
      ...(alem > 0 ? { minutosAlemLimite: alem } : {}),
      dias: calc.dias.filter((d) => d.minutos > 0),
      alocacao
    };
  }

  /** Saldo e histórico da cota de abono diário (acordo coletivo) do funcionário logado. */
  async getCotaAbono(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.getCotaAbonoPorFuncionario(func.id);
  }

  async getCotaAbonoPorFuncionario(funcionarioId: string) {
    const cfg = await this.configSolicitacoesService.getConfig();
    const marcos = await this.prisma.bancoHorasMarco.findMany();
    const tolerancia = await toleranciaFechamentoDias(this.prisma, funcionarioId);
    const janela = janelaDoDia(marcos, hojeBrasiliaISO(), tolerancia);
    const sols = await this.prisma.solicitacao.findMany({
      where: { funcionarioId, tipo: "ABONO" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, descricao: true, createdAt: true, metadados: true }
    });
    const historico = sols
      .map((s) => {
        const cota = ((s.metadados ?? {}) as Record<string, unknown>).cotaAbono as
          | { dias?: string[] }
          | undefined;
        return cota
          ? {
              id: s.id,
              status: s.status,
              descricao: s.descricao,
              createdAt: s.createdAt,
              dias: [...(cota.dias ?? [])].sort()
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const emUso = historico
      .filter((h) => (STATUS_SOLICITACAO_COTA_EM_USO as readonly string[]).includes(h.status))
      .flatMap((h) => h.dias);
    const usados = emUso.filter((d) => d >= janela.inicio && d <= janela.fim).length;
    return {
      cotaDias: cfg.abonoCotaDiasDoisCiclos,
      janela,
      usados,
      saldo: Math.max(0, cfg.abonoCotaDiasDoisCiclos - usados),
      diasEmUso: emUso.sort(),
      historico
    };
  }

  /** Valida o abono diário da cota: só dias inteiros úteis, um dia por período, dentro do saldo. */
  private async montarCotaAbono(
    funcionarioId: string,
    metadados: Record<string, unknown> | undefined
  ): Promise<string[]> {
    if (!Array.isArray(metadados?.periodos) || !metadados.periodos.length) {
      throw new BadRequestException("Informe os dias do abono.");
    }
    const periodos = periodosDoAbono({
      dataInicio: null,
      dataFim: null,
      dataReferencia: new Date(),
      metadados
    });
    if (periodos.some((p) => p.inicio !== p.fim || p.horarioInicio || p.horarioFim)) {
      throw new BadRequestException(
        "O abono da cota é apenas diário: cada período deve ser um único dia inteiro (sem horário parcial)."
      );
    }
    const dias = periodos.map((p) => p.inicio).sort();
    const calendario = await this.calendarioFerias(funcionarioId, dias[0], dias.at(-1)!);
    const feriados = new Set(calendario.feriados);
    const naoUtil = dias.find(
      (d) =>
        calendario.diasUteis[new Date(`${d}T12:00:00Z`).getUTCDay()] === false || feriados.has(d)
    );
    if (naoUtil) {
      throw new BadRequestException(
        `${naoUtil.split("-").reverse().join("/")} não é dia útil; escolha dias úteis para o abono.`
      );
    }
    const cota = await this.getCotaAbonoPorFuncionario(funcionarioId);
    const marcos = await this.prisma.bancoHorasMarco.findMany();
    const erros = validarCotaAbono({
      cotaDias: cota.cotaDias,
      marcos,
      novos: dias,
      existentes: cota.diasEmUso,
      deslocamentoDias: await toleranciaFechamentoDias(this.prisma, funcionarioId)
    });
    if (erros.length) throw new BadRequestException(erros.join(" "));
    return dias;
  }

  /**
   * CID do atestado: valida conforme a configuração e grava a categoria (1 letra + 2 números;
   * "Z136" e "Z13.6" viram "Z13") e o grupo do CID-10 a que ela pertence.
   */
  private async prepararCidDoAtestado(metadados: Record<string, unknown> | undefined) {
    const meta = { ...(metadados ?? {}) };
    const cidBruto = typeof meta.cidCodigo === "string" ? meta.cidCodigo.trim() : "";
    const grupoId = typeof meta.cidGrupoId === "string" ? meta.cidGrupoId : null;
    delete meta.cidCodigo;
    delete meta.cidGrupoId;
    delete meta.cidGrupo;
    const cfg = await this.configSolicitacoesService.getConfig();
    const modo = cfg.atestadoCidModo;
    if (modo === "DESATIVADO") return meta;
    if (cidBruto) {
      const categoria = normalizarCid(cidBruto);
      if (!categoria) {
        throw new BadRequestException(
          "CID inválido. Informe 1 letra seguida de 2 números (ex.: Z13)."
        );
      }
      const grupos = await listarCidGrupos(this.prisma, true);
      const grupo = grupoDoCid(categoria, grupos);
      meta.cidCodigo = categoria;
      if (grupo) meta.cidGrupo = { id: grupo.id, codigo: grupo.codigo, descricao: grupo.descricao };
      return meta;
    }
    if (!grupoId) {
      if (modo === "OBRIGATORIO") {
        throw new BadRequestException("Informe o CID do atestado (ex.: Z13).");
      }
      return meta;
    }
    const grupo = await this.prisma.cidGrupo.findUnique({ where: { id: grupoId } });
    if (!grupo || !grupo.ativo) {
      throw new BadRequestException("Grupo do CID inválido ou desativado.");
    }
    meta.cidGrupo = { id: grupo.id, codigo: grupo.codigo, descricao: grupo.descricao };
    return meta;
  }

  /** Tipos de licença que o funcionário pode pedir, com o saldo usado na janela de cada um. */
  async getTiposLicenca(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    const tipos = await listarTiposLicenca(this.prisma, true);
    const sols = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId: func.id,
        tipo: "LICENCA",
        status: { in: ["PENDENTE", "AGUARDANDO_RH", "APROVADA"] }
      },
      select: { metadados: true }
    });
    return tipos
      .filter((t) => !t.categorias.length || t.categorias.includes(String(func.categoria ?? "")))
      .map((t) => ({
        ...t,
        resumo: resumoRegra(t),
        datasUsadas: datasUsadasDoTipo(sols, t.id)
      }));
  }

  /** Valida o pedido de licença contra o tipo escolhido e monta o snapshot da regra. */
  private async prepararLicenca(
    func: { id: string; categoria: string | null },
    body: {
      dataReferencia: string;
      dataInicio?: string;
      dataFim?: string;
      metadados?: Record<string, unknown>;
    }
  ) {
    const meta = { ...(body.metadados ?? {}) };
    const tipoId = typeof meta.tipoLicencaId === "string" ? meta.tipoLicencaId : null;
    delete meta.tipoLicencaId;
    delete meta.tipoLicenca;
    if (!tipoId) throw new BadRequestException("Escolha o tipo de licença.");
    const tipos = await listarTiposLicenca(this.prisma, false);
    const tipo: TipoLicencaRegra | undefined = tipos.find((t) => t.id === tipoId);
    if (!tipo) throw new BadRequestException("Tipo de licença não encontrado.");

    /* Períodos: lista informada (não consecutivos/parcial) ou o intervalo único da solicitação. */
    const periodosBrutos = Array.isArray(meta.periodos)
      ? (meta.periodos as Array<Record<string, unknown>>)
      : [
          {
            dataInicio: body.dataInicio ?? body.dataReferencia,
            dataFim: body.dataFim ?? body.dataInicio ?? body.dataReferencia,
            horarioInicio: meta.horarioInicio ?? null,
            horarioFim: meta.horarioFim ?? null
          }
        ];
    const periodos = periodosDoAbono({
      dataInicio: null,
      dataFim: null,
      dataReferencia: new Date(body.dataReferencia),
      metadados: { periodos: periodosBrutos }
    });
    if (!periodos.length) throw new BadRequestException("Informe o período da licença.");
    const primeiro = periodos.map((p) => p.inicio).sort()[0];
    const ultimo = periodos
      .map((p) => p.fim)
      .sort()
      .at(-1)!;

    const [calendario, ctx, sols] = await Promise.all([
      this.calendarioFerias(func.id, primeiro, ultimo),
      this.getJornadaHistoricoContexto(func.id),
      this.prisma.solicitacao.findMany({
        where: {
          funcionarioId: func.id,
          tipo: "LICENCA",
          status: { in: ["PENDENTE", "AGUARDANDO_RH", "APROVADA"] }
        },
        select: { metadados: true }
      })
    ]);
    const comProrrogacao = meta.comProrrogacao === true;
    const r = validarPedidoLicenca({
      tipo,
      categoria: func.categoria,
      periodos,
      comProrrogacao,
      saldo: { datasUsadas: datasUsadasDoTipo(sols, tipo.id) },
      diasUteis: calendario.diasUteis,
      feriados: new Set(calendario.feriados),
      jornadaDiaMin: (iso) => jornadaEsperadaMin(iso, ctx)
    });
    if (r.erros.length) throw new BadRequestException(r.erros.join(" "));
    if (tipo.exigeDocumento && typeof meta.documentoBase64 !== "string") {
      throw new BadRequestException("Anexe o documento comprobatório desta licença.");
    }
    delete meta.comProrrogacao;
    delete meta.horarioInicio;
    delete meta.horarioFim;

    return {
      dataReferencia: new Date(`${primeiro}T12:00:00-03:00`).toISOString(),
      dataInicio: intervaloDiaBrasilia(primeiro).inicio.toISOString(),
      dataFim: fimDiaCivilBrasilia(ultimo).toISOString(),
      metadados: {
        ...meta,
        periodos: periodos.map((p) => ({
          dataInicio: intervaloDiaBrasilia(p.inicio).inicio.toISOString(),
          dataFim: fimDiaCivilBrasilia(p.fim).toISOString(),
          horarioInicio: p.horarioInicio,
          horarioFim: p.horarioFim
        })),
        /* Snapshot da regra: mudar o ACT depois não altera o que já foi pedido/aprovado. */
        tipoLicenca: {
          id: tipo.id,
          nome: tipo.nome,
          resumo: resumoRegra(tipo),
          codigoSistema: tipo.codigoSistema,
          efeito: tipo.efeito,
          comProrrogacao,
          unidades: r.unidades,
          datas: r.datas,
          limiteAplicado: r.limiteAplicado
        }
      }
    };
  }

  private async notificarEnvioDocumentoRh(solicitacao: {
    tipo: string;
    descricao: string | null;
    funcionario: { user: { name: string } | null };
  }) {
    const destinatarios = await this.notificacaoService.getUsuariosRh();
    if (!destinatarios.length) return;

    const funcNome = solicitacao.funcionario.user?.name ?? "Funcionário";
    const titulo = `Documento enviado ao RH — ${funcNome}`;
    const corpo =
      `${funcNome} enviou um documento ao RH.` +
      (solicitacao.descricao ? `\n\nDescrição: ${solicitacao.descricao}` : "") +
      "\n\nAcesse Aprovações → RH para revisar e confirmar o recebimento.";

    await this.notificacaoService.dispararEvento(
      "SOLICITACAO_AGUARDANDO_RH",
      titulo,
      corpo,
      destinatarios
    );
  }

  /** Funcionário e chefe sabem que o RH abriu o pedido em nome do funcionário. */
  private async notificarSolicitacaoCriadaPeloRh(
    solicitacao: {
      funcionarioId: string;
      tipo: string;
      descricao: string | null;
      funcionario: { user: { name: string } | null };
    },
    rhNome: string
  ) {
    const [dest, chefe] = await Promise.all([
      this.notificacaoService.getFuncionarioDestinatario(solicitacao.funcionarioId),
      this.notificacaoService.getGestorDoFuncionario(solicitacao.funcionarioId)
    ]);
    const funcNome = solicitacao.funcionario.user?.name ?? "Funcionário";
    const tipoLabel = TIPO_SOLICITACAO_LABEL[solicitacao.tipo] ?? solicitacao.tipo;
    const detalhe = solicitacao.descricao ? `\n\nDescrição: ${solicitacao.descricao}` : "";
    if (dest) {
      await this.notificacaoService.dispararEvento(
        "SOLICITACAO_CRIADA_PELO_RH",
        `O RH abriu uma solicitação de ${tipoLabel} em seu nome`,
        `O RH (${rhNome}) registrou uma solicitação de ${tipoLabel} em seu nome. Ela segue o ` +
          `fluxo normal (chefe imediato e RH).${detalhe}\n\nAcompanhe em Solicitações.`,
        [dest]
      );
    }
    if (chefe && chefe.externalId !== dest?.externalId) {
      await this.notificacaoService.dispararEvento(
        "SOLICITACAO_CRIADA_PELO_RH",
        `Solicitação de ${tipoLabel} de ${funcNome} aberta pelo RH`,
        `O RH (${rhNome}) abriu uma solicitação de ${tipoLabel} em nome de ${funcNome}; ela ` +
          `aguarda a sua análise.${detalhe}`,
        [chefe]
      );
    }
  }

  private async notificarNovaSolicitacaoGestor(solicitacao: {
    funcionarioId: string;
    tipo: string;
    descricao: string | null;
    funcionario: { user: { name: string } | null };
  }) {
    const gestor = await this.notificacaoService.getGestorDoFuncionario(solicitacao.funcionarioId);
    if (!gestor) return;

    const funcNome = solicitacao.funcionario.user?.name ?? "Funcionário";
    const tipoLabel = TIPO_SOLICITACAO_LABEL[solicitacao.tipo] ?? solicitacao.tipo;
    const titulo = `Nova solicitação de ${tipoLabel} — ${funcNome}`;
    const corpo =
      `${funcNome} abriu uma solicitação de ${tipoLabel}.` +
      (solicitacao.descricao ? `\n\nDescrição: ${solicitacao.descricao}` : "") +
      "\n\nAcesse o sistema para analisar.";

    await this.notificacaoService.dispararEvento("SOLICITACAO_NOVA_GESTOR", titulo, corpo, [
      gestor
    ]);
  }

  private async notificarRegistroPontoGestor(
    funcionarioId: string,
    funcNome: string,
    tipo: string
  ) {
    const gestor = await this.notificacaoService.getGestorDoFuncionario(funcionarioId);
    if (!gestor) return;

    let nome = funcNome;
    if (nome === "Funcionário") {
      const func = await this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { user: { select: { name: true } } }
      });
      nome = func?.user?.name ?? nome;
    }

    const tipoLabel = TIPO_PONTO_LABEL[tipo] ?? tipo;
    const horario = horarioDeDataBrasilia(new Date());
    const titulo = `Registro de ponto — ${nome}`;
    const corpo = `${nome} registrou ${tipoLabel} às ${horario}.`;

    await this.notificacaoService.dispararEvento("REGISTRO_PONTO", titulo, corpo, [gestor]);
  }

  async enviarDocumentoRetorno(
    keycloakSub: string,
    id: string,
    documentoBase64: string,
    mimeType?: string
  ) {
    const func = await this.getFuncionario(keycloakSub);
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });

    if (solicitacao.funcionarioId !== func.id) {
      throw new ForbiddenException("Esta solicitação não pertence a você.");
    }

    const statusPermitidos = ["AGUARDANDO_DOCUMENTO_FUNCIONARIO", "AGUARDANDO_RH"];
    if (!statusPermitidos.includes(solicitacao.status)) {
      throw new BadRequestException(
        STATUS_FINALIZADOS.includes(solicitacao.status)
          ? "Não é possível alterar o documento após a conclusão da análise pelo RH."
          : "Esta solicitação não está aguardando o envio de documento."
      );
    }

    if (solicitacao.documentoRetornoUrl) {
      await this.documentoService.excluirDocumento(solicitacao.documentoRetornoUrl);
    }

    const url = await this.documentoService.salvarDocumentoRetorno({
      funcionarioId: func.id,
      solicitacaoId: id,
      arquivoBase64: documentoBase64,
      mimeType
    });

    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        documentoRetornoUrl: url,
        documentoRetornoEm: new Date(),
        status:
          solicitacao.status === "AGUARDANDO_DOCUMENTO_FUNCIONARIO"
            ? "AGUARDANDO_RH"
            : solicitacao.status
      }
    });
  }

  /** Solicitação de férias do funcionário aguardando a assinatura dos documentos do RH. */
  private async feriasAguardandoAssinatura(keycloakSub: string, id: string) {
    const func = await this.getFuncionario(keycloakSub);
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });
    if (solicitacao.funcionarioId !== func.id) {
      throw new ForbiddenException("Esta solicitação não pertence a você.");
    }
    if (solicitacao.tipo !== "FERIAS") {
      throw new BadRequestException("Esta solicitação não é de férias.");
    }
    if (solicitacao.status !== "AGUARDANDO_DOCUMENTO_FUNCIONARIO") {
      throw new BadRequestException(
        "Estes documentos não estão aguardando a sua assinatura (a etapa mudou ou já foram tratados)."
      );
    }
    const meta = (solicitacao.metadados ?? {}) as Record<string, unknown>;
    const docs = Array.isArray(meta.documentosFerias)
      ? (meta.documentosFerias as DocumentoFeriasMeta[])
      : [];
    const user = await this.prisma.user.findUnique({
      where: { id: func.userId },
      select: { name: true }
    });
    return { func, solicitacao, meta, docs, nome: user?.name ?? "Funcionário" };
  }

  private documentoFeriasPendente(docs: DocumentoFeriasMeta[], indice: number) {
    const doc = docs[indice];
    if (!doc) throw new NotFoundException("Documento de férias não encontrado.");
    if (doc.urlAssinado || doc.rejeicao) {
      throw new BadRequestException(
        `${doc.rotulo ?? "Este documento"} já foi ${doc.urlAssinado ? "assinado" : "rejeitado"}.`
      );
    }
    return doc;
  }

  /**
   * Funcionário assina pelo sistema UM documento de férias (cada documento tem assinatura
   * própria). Quando todos estão assinados, a solicitação volta ao RH para aprovação.
   * Vale em Solicitações → Férias e em Minhas Requisições do RH (mesma solicitação).
   */
  async assinarDocumentoFerias(
    keycloakSub: string,
    id: string,
    indice: number,
    aceite: boolean,
    origem: { ipReal: string; ipGateway: string | null; userAgent: string | null }
  ) {
    if (!aceite) {
      throw new BadRequestException(
        "Confirme que leu e concorda com o documento antes de assinar."
      );
    }
    const { meta, docs, nome } = await this.feriasAguardandoAssinatura(keycloakSub, id);
    const doc = this.documentoFeriasPendente(docs, indice);
    const assinadoEm = new Date();
    const urlAssinado = await this.documentoService.assinarDocumentoFerias({
      documentoUrl: doc.url,
      solicitacaoId: id,
      ordem: indice + 1,
      assinatura: { gestorNome: nome, assinadoEm, ...origem }
    });
    const assinatura = {
      nome,
      em: assinadoEm.toISOString(),
      ipReal: origem.ipReal,
      ipGateway: origem.ipGateway,
      userAgent: origem.userAgent,
      codigo: codigoCienciaGestorExibido(nome, assinadoEm, origem.ipReal, origem.userAgent)
    };
    void registrarDocumentoEmitido(this.prisma, {
      tipo: "FERIAS_ASSINADO",
      referenciaId: id,
      url: urlAssinado,
      titulo: `Documento de férias assinado${doc.rotulo ? ` — ${doc.rotulo}` : ""}`,
      detalhes: {
        funcionario: mascararNome(nome),
        assinadoEm: assinadoEm.toISOString(),
        codigo: assinatura.codigo
      }
    });
    const novos = docs.map((d, i) => (i === indice ? { ...d, urlAssinado, assinatura } : d));
    const todosAssinados = novos.every((d) => !!d.urlAssinado);
    const aviso = novos.find((d) => d.tipo === "AVISO");

    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        metadados: {
          ...meta,
          documentosFerias: novos,
          /* Concluída: todos os documentos assinados (a aprovação do RH depende disso). */
          ...(todosAssinados
            ? { assinaturaFerias: { ...assinatura, documentos: novos.length } }
            : {})
        } as unknown as Prisma.InputJsonValue,
        ...(todosAssinados
          ? {
              status: "AGUARDANDO_RH" as const,
              documentoRetornoUrl: aviso?.urlAssinado ?? urlAssinado,
              documentoRetornoEm: assinadoEm
            }
          : {})
      }
    });

    if (todosAssinados) {
      this.avisarRhFerias(
        `Documentos de férias assinados — ${nome}`,
        `${nome} assinou pelo sistema todos os documentos de férias ` +
          `(${novos.map((d) => d.rotulo ?? d.tipo).join(", ")}).\n\n` +
          "A solicitação aguarda a aprovação do RH."
      );
    }
    return atualizada;
  }

  /**
   * Funcionário rejeita UM documento de férias com justificativa: a solicitação volta ao
   * RH, que corrige e reenvia os documentos (o reenvio zera as assinaturas).
   */
  async rejeitarDocumentoFerias(
    keycloakSub: string,
    id: string,
    indice: number,
    justificativaBruta: string
  ) {
    const justificativa = (justificativaBruta ?? "").trim();
    if (justificativa.length < 10) {
      throw new BadRequestException(
        "Informe a justificativa da rejeição (mínimo de 10 caracteres)."
      );
    }
    const { meta, docs, nome } = await this.feriasAguardandoAssinatura(keycloakSub, id);
    const doc = this.documentoFeriasPendente(docs, indice);
    const rejeicao = { nome, em: new Date().toISOString(), justificativa };
    const novos = docs.map((d, i) => (i === indice ? { ...d, rejeicao } : d));

    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        status: "AGUARDANDO_RH",
        metadados: {
          ...meta,
          documentosFerias: novos,
          rejeicaoDocumentoFerias: { ...rejeicao, documento: doc.rotulo ?? doc.tipo }
        } as unknown as Prisma.InputJsonValue
      }
    });

    this.avisarRhFerias(
      `Documento de férias rejeitado — ${nome}`,
      `${nome} rejeitou o documento "${doc.rotulo ?? doc.tipo}".\n\n` +
        `Justificativa: ${justificativa}\n\n` +
        "Corrija e reenvie os documentos de férias em Aprovações (etapa RH)."
    );
    return atualizada;
  }

  /** Rodada (2º/3º período) de férias aprovada, aguardando a assinatura do funcionário. */
  private async rodadaFeriasAguardandoAssinatura(keycloakSub: string, id: string, ordem: number) {
    const func = await this.getFuncionario(keycloakSub);
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });
    if (solicitacao.funcionarioId !== func.id) {
      throw new ForbiddenException("Esta solicitação não pertence a você.");
    }
    if (solicitacao.tipo !== "FERIAS" || solicitacao.status !== "APROVADA") {
      throw new BadRequestException("Esta solicitação não é de férias aprovadas.");
    }
    const meta = (solicitacao.metadados ?? {}) as Record<string, unknown>;
    const rodada = rodadasDe(meta)[String(ordem)];
    if (!rodada || rodada.situacao !== "AGUARDANDO_ASSINATURA") {
      throw new BadRequestException(
        "Estes documentos não estão aguardando a sua assinatura (a etapa mudou ou já foram tratados)."
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: func.userId },
      select: { name: true }
    });
    return { solicitacao, meta, rodada, nome: user?.name ?? "Funcionário" };
  }

  /** Funcionário assina UM documento da rodada de um período futuro das férias. */
  async assinarDocumentoRodadaFerias(
    keycloakSub: string,
    id: string,
    ordem: number,
    indice: number,
    aceite: boolean,
    origem: { ipReal: string; ipGateway: string | null; userAgent: string | null }
  ) {
    if (!aceite) {
      throw new BadRequestException(
        "Confirme que leu e concorda com o documento antes de assinar."
      );
    }
    const { meta, rodada, nome } = await this.rodadaFeriasAguardandoAssinatura(
      keycloakSub,
      id,
      ordem
    );
    const docs = rodada.documentos ?? [];
    const doc = this.documentoFeriasPendente(docs as DocumentoFeriasMeta[], indice);
    const assinadoEm = new Date();
    const urlAssinado = await this.documentoService.assinarDocumentoFerias({
      documentoUrl: doc.url,
      solicitacaoId: id,
      ordem: ordemArquivoRodada(ordem, indice),
      assinatura: { gestorNome: nome, assinadoEm, ...origem }
    });
    const assinatura = {
      nome,
      em: assinadoEm.toISOString(),
      ipReal: origem.ipReal,
      ipGateway: origem.ipGateway,
      userAgent: origem.userAgent,
      codigo: codigoCienciaGestorExibido(nome, assinadoEm, origem.ipReal, origem.userAgent)
    };
    void registrarDocumentoEmitido(this.prisma, {
      tipo: "FERIAS_ASSINADO",
      referenciaId: id,
      url: urlAssinado,
      titulo: `Documento de férias assinado${doc.rotulo ? ` — ${doc.rotulo}` : ""}`,
      detalhes: {
        funcionario: mascararNome(nome),
        assinadoEm: assinadoEm.toISOString(),
        codigo: assinatura.codigo
      }
    });
    const novos = docs.map((d, i) => (i === indice ? { ...d, urlAssinado, assinatura } : d));
    const concluida = novos.every((d) => !!d.urlAssinado);
    const novaRodada: RodadaFeriasMeta = {
      ...rodada,
      documentos: novos,
      ...(concluida
        ? { situacao: "CONCLUIDA" as const, concluidaEm: assinadoEm.toISOString() }
        : {})
    };
    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        metadados: {
          ...meta,
          rodadasFerias: { ...rodadasDe(meta), [String(ordem)]: novaRodada }
        } as unknown as Prisma.InputJsonValue
      }
    });
    if (concluida) {
      this.avisarRhFerias(
        `Documentos do ${ordem}º período de férias assinados — ${nome}`,
        `${nome} assinou pelo sistema os documentos do ${ordem}º período de férias ` +
          `(${rodada.inicio.split("-").reverse().join("/")} a ${rodada.fim.split("-").reverse().join("/")}): ` +
          `${novos.map((d) => d.rotulo ?? d.tipo).join(", ")}.`
      );
    }
    return atualizada;
  }

  /** Funcionário rejeita um documento da rodada: o RH corrige e reenvia. */
  async rejeitarDocumentoRodadaFerias(
    keycloakSub: string,
    id: string,
    ordem: number,
    indice: number,
    justificativaBruta: string
  ) {
    const justificativa = (justificativaBruta ?? "").trim();
    if (justificativa.length < 10) {
      throw new BadRequestException(
        "Informe a justificativa da rejeição (mínimo de 10 caracteres)."
      );
    }
    const { meta, rodada, nome } = await this.rodadaFeriasAguardandoAssinatura(
      keycloakSub,
      id,
      ordem
    );
    const docs = rodada.documentos ?? [];
    const doc = this.documentoFeriasPendente(docs as DocumentoFeriasMeta[], indice);
    const rejeicao = { nome, em: new Date().toISOString(), justificativa };
    const novos = docs.map((d, i) => (i === indice ? { ...d, rejeicao } : d));
    const atualizada = await this.prisma.solicitacao.update({
      where: { id },
      data: {
        metadados: {
          ...meta,
          rodadasFerias: {
            ...rodadasDe(meta),
            [String(ordem)]: { ...rodada, documentos: novos, situacao: "REJEITADA" }
          }
        } as unknown as Prisma.InputJsonValue
      }
    });
    this.avisarRhFerias(
      `Documento do ${ordem}º período de férias rejeitado — ${nome}`,
      `${nome} rejeitou o documento "${doc.rotulo ?? doc.tipo}" do ${ordem}º período.\n\n` +
        `Justificativa: ${justificativa}\n\n` +
        "Corrija e reenvie os documentos em Aprovações → Rodadas de férias."
    );
    return atualizada;
  }

  /** Aviso ao RH sobre a assinatura/rejeição dos documentos de férias. */
  private avisarRhFerias(titulo: string, corpo: string) {
    this.notificacaoService
      .getUsuariosRh()
      .then((dest) =>
        dest.length
          ? this.notificacaoService.dispararEvento("SOLICITACAO_AGUARDANDO_RH", titulo, corpo, dest)
          : undefined
      )
      .catch((e) => this.logger.error(`Falha ao notificar o RH (férias): ${e}`));
  }

  /* Permite ao funcionário substituir o documento anexado a uma solicitação
     (ex.: atestado médico) enquanto ela ainda não foi aprovada/rejeitada pelo RH.
     Após a decisão final do RH, o documento não pode mais ser alterado. */
  async editarDocumentoSolicitacao(
    keycloakSub: string,
    id: string,
    documentoBase64: string,
    mimeType?: string
  ) {
    const func = await this.getFuncionario(keycloakSub);
    const solicitacao = await this.prisma.solicitacao.findUniqueOrThrow({ where: { id } });

    if (solicitacao.funcionarioId !== func.id) {
      throw new ForbiddenException("Esta solicitação não pertence a você.");
    }

    if (STATUS_FINALIZADOS.includes(solicitacao.status)) {
      throw new BadRequestException(
        "Não é possível alterar o documento após a conclusão da análise."
      );
    }

    const metadados = (solicitacao.metadados as Record<string, unknown> | null) ?? {};
    if (typeof metadados.documentoUrl !== "string") {
      throw new BadRequestException("Esta solicitação não possui documento anexado.");
    }

    await this.documentoService.excluirDocumento(metadados.documentoUrl);

    const url = await this.documentoService.salvarDocumento({
      funcionarioId: func.id,
      solicitacaoId: id,
      arquivoBase64: documentoBase64,
      mimeType
    });

    return this.prisma.solicitacao.update({
      where: { id },
      data: {
        metadados: { ...metadados, documentoUrl: url } as unknown as Prisma.InputJsonValue
      }
    });
  }

  /* ─── Saldo de Férias ─── */

  /** Calendário da vedação de férias: dias úteis da jornada e feriados integrais (sem abono). */
  async calendarioFerias(
    funcionarioId: string,
    de: string,
    ate: string
  ): Promise<CalendarioFerias> {
    const jornada = await this.getJornadaEfetiva(funcionarioId);
    const diasUteis: boolean[] = JSON.parse(
      typeof jornada.diasUteis === "string"
        ? jornada.diasUteis
        : "[false,true,true,true,true,true,false]"
    );
    const { inicio, fim } = intervaloColunaDate(de, ate);
    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim }, marcoHorario: null, tipo: { not: "ABONO" } },
      select: { data: true }
    });
    return { diasUteis, feriados: feriados.map((f) => dataCivilISO(f.data)) };
  }

  /** Calendário + regra de vedação para o formulário de férias conferir na tela. */
  async getCalendarioFerias(keycloakSub: string, de: string, ate: string) {
    const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "");
    if (!ok(de) || !ok(ate) || de > ate) {
      throw new BadRequestException("Informe o intervalo (de/ate) no formato AAAA-MM-DD.");
    }
    if (diasCorridos(de, ate) > 800) throw new BadRequestException("Intervalo muito longo.");
    const func = await this.getFuncionario(keycloakSub);
    const cfgSol = await this.configSolicitacoesService.getConfig();
    return {
      vedacaoPreFeriadoDias: cfgSol.feriasVedacaoPreFeriadoDias,
      ...(await this.calendarioFerias(func.id, de, ate))
    };
  }

  async getSaldoFerias(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.calcularSaldoFeriasFuncionario(func.id);
  }

  async calcularSaldoFeriasFuncionario(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { dataAdmissao: true, categoria: true }
    });

    if (!func?.dataAdmissao) return null;

    const isEstagiario = func.categoria === "ESTAGIARIO";
    /* Ciclo de 12 meses para todos. Estagiário (Lei 11.788): 15 dias aos 6 meses e 30 ao
       completar 1 ano (menos o já usufruído); marcação liberada antes, gozo só após o
       período aquisitivo (`liberaEm`). */
    const duracaoCicloMeses = 12;
    const diasPorCiclo = 30;
    const maxAcumulo = 2;

    const hoje = new Date();
    const admissao = new Date(func.dataAdmissao);

    const mesesTotal =
      (hoje.getFullYear() - admissao.getFullYear()) * 12 + (hoje.getMonth() - admissao.getMonth());
    const ciclosVencidos = Math.floor(mesesTotal / duracaoCicloMeses);

    const STATUS_EM_ANALISE = [
      "PENDENTE",
      "AGUARDANDO_RH",
      "AGUARDANDO_DOCUMENTO_FUNCIONARIO"
    ] as const;

    // Aprovadas + em análise (para bloquear nova 1ª solicitação do mesmo ciclo)
    const solicitacoesFerias = await this.prisma.solicitacao.findMany({
      where: {
        funcionarioId,
        tipo: "FERIAS",
        status: { in: ["APROVADA", ...STATUS_EM_ANALISE] }
      },
      select: { id: true, status: true, metadados: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    });

    // Ignora alterações: o consumo conta na solicitação vigente (aprovada ou em análise sem alteracaoDeId,
    // ou a alteração em análise que substitui a original)
    type SolFerias = (typeof solicitacoesFerias)[number];
    const vigentes: SolFerias[] = [];
    const alteradasIds = new Set<string>();
    for (const s of solicitacoesFerias) {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      const altDe = typeof m.alteracaoDeId === "string" ? m.alteracaoDeId : null;
      if (altDe) alteradasIds.add(altDe);
    }
    for (const s of solicitacoesFerias) {
      if (alteradasIds.has(s.id) && s.status === "APROVADA") continue;
      // Se há alteração em análise da original, a original aprovada ainda conta até a alteração ser aprovada
      vigentes.push(s);
    }

    let diasGozo = 0;
    let diasVendidos = 0;
    for (const s of vigentes) {
      if (s.status !== "APROVADA") continue;
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      diasGozo += Number(m.totalDiasGozo ?? 0);
      diasVendidos += Number(m.diasVendidos ?? 0);
    }

    const totalVencido = Math.min(ciclosVencidos, maxAcumulo) * diasPorCiclo;
    const ciclosVisiveis = Math.min(ciclosVencidos, maxAcumulo);
    /* Ciclo em formação (ainda não vencido): pode ser marcado, mas só usufruído a partir de
       `liberaEm`. Efetivo: só no 1º ano; estagiário: sempre que o ciclo seguinte não passa
       do contrato (15 dias aos 6 meses). */
    const cicloFormacaoNum = ciclosVencidos + 1;
    const temFormacao = isEstagiario ? ciclosVencidos < maxAcumulo : ciclosVencidos === 0;
    const mesesNoCicloAtual = mesesTotal % duracaoCicloMeses;
    const cotaFormacao = temFormacao ? (isEstagiario ? 15 : diasPorCiclo) : 0;
    /* O saldo exibido soma o ciclo em formação só enquanto não há ciclo vencido (1º ano);
       depois o ciclo seguinte aparece em `ciclos`, mas o saldo é o que já venceu. */
    const diasDisponiveis = Math.max(
      0,
      totalVencido + (ciclosVencidos === 0 ? cotaFormacao : 0) - diasGozo - diasVendidos
    );
    const disponivelVencido = Math.max(0, totalVencido - diasGozo - diasVendidos);

    let obrigatorio: boolean;
    if (isEstagiario) {
      obrigatorio = ciclosVencidos >= 1 && disponivelVencido > 0 && mesesNoCicloAtual >= 11;
    } else {
      const mesesNoPeriodoAcumulo = mesesTotal % (maxAcumulo * 12);
      obrigatorio =
        ciclosVencidos >= maxAcumulo && diasDisponiveis > 0 && mesesNoPeriodoAcumulo >= 23;
    }

    type CicloDetalhe = {
      numero: number;
      inicio: Date;
      fim: Date;
      diasPorCiclo: number;
      diasGozo: number;
      diasVendidos: number;
      diasDisponiveis: number;
      status: "DISPONIVEL" | "EM_ANALISE" | "CONFIGURADO";
      solicitacaoId: string | null;
      solicitacaoStatus: string | null;
      /** Ciclo ainda não vencido: dá para marcar, mas só usufruir a partir de `liberaEm`. */
      emFormacao: boolean;
      liberaEm: string | null;
    };

    const ciclosBase: CicloDetalhe[] = Array.from(
      { length: ciclosVisiveis + (temFormacao ? 1 : 0) },
      (_, i) => {
        const cicloNum = ciclosVencidos - ciclosVisiveis + i + 1;
        const emFormacao = cicloNum === cicloFormacaoNum && temFormacao;
        const inicio = new Date(admissao);
        inicio.setMonth(admissao.getMonth() + (cicloNum - 1) * duracaoCicloMeses);
        const fim = new Date(inicio);
        fim.setMonth(fim.getMonth() + duracaoCicloMeses);
        fim.setDate(fim.getDate() - 1);
        const cota = emFormacao ? cotaFormacao : diasPorCiclo;
        const liberaEmData = new Date(inicio);
        liberaEmData.setMonth(liberaEmData.getMonth() + (isEstagiario ? 6 : 12));
        const liberaEm =
          emFormacao && (!isEstagiario || mesesNoCicloAtual < 6)
            ? dataCivilISO(
                emFormacao && !isEstagiario ? new Date(fim.getTime() + 86400000) : liberaEmData
              )
            : null;
        return {
          numero: cicloNum,
          inicio,
          fim,
          diasPorCiclo: cota,
          diasGozo: 0,
          diasVendidos: 0,
          diasDisponiveis: cota,
          status: "DISPONIVEL" as const,
          solicitacaoId: null,
          solicitacaoStatus: null,
          emFormacao,
          liberaEm
        };
      }
    );

    // Atribui consumo por cicloNumero explícito; demais FIFO nos ciclos livres
    const consumoPorCiclo = new Map<
      number,
      {
        diasGozo: number;
        diasVendidos: number;
        solicitacaoId: string;
        solicitacaoStatus: string;
      }
    >();

    const alocarEmCiclo = (cicloNum: number, s: SolFerias, gozo: number, venda: number) => {
      const prev = consumoPorCiclo.get(cicloNum);
      if (prev) {
        prev.diasGozo += gozo;
        prev.diasVendidos += venda;
        // Mantém a solicitação mais recente / em análise como referência
        if (s.status !== "APROVADA" || !prev.solicitacaoId) {
          prev.solicitacaoId = s.id;
          prev.solicitacaoStatus = s.status;
        }
      } else {
        consumoPorCiclo.set(cicloNum, {
          diasGozo: gozo,
          diasVendidos: venda,
          solicitacaoId: s.id,
          solicitacaoStatus: s.status
        });
      }
    };

    const comCiclo: SolFerias[] = [];
    const semCiclo: SolFerias[] = [];
    for (const s of vigentes) {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      // Alterações em análise referenciam a original — usam o ciclo da original se houver
      if (typeof m.cicloNumero === "number") comCiclo.push(s);
      else semCiclo.push(s);
    }

    for (const s of comCiclo) {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      const cicloNum = Number(m.cicloNumero);
      const gozo = Number(m.totalDiasGozo ?? 0);
      const venda = Number(m.diasVendidos ?? 0);
      if (ciclosBase.some((c) => c.numero === cicloNum)) {
        alocarEmCiclo(cicloNum, s, gozo, venda);
      } else {
        semCiclo.push(s);
      }
    }

    for (const s of semCiclo) {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      let gozoRest = Number(m.totalDiasGozo ?? 0);
      let vendaRest = Number(m.diasVendidos ?? 0);
      if (gozoRest + vendaRest <= 0) continue;
      for (const c of ciclosBase) {
        if (gozoRest + vendaRest <= 0) break;
        const usado = consumoPorCiclo.get(c.numero);
        const ocupado = usado ? usado.diasGozo + usado.diasVendidos : 0;
        const livre = Math.max(0, c.diasPorCiclo - ocupado);
        if (livre <= 0) continue;
        const gozoTake = Math.min(gozoRest, livre);
        const vendaTake = Math.min(vendaRest, livre - gozoTake);
        alocarEmCiclo(c.numero, s, gozoTake, vendaTake);
        gozoRest -= gozoTake;
        vendaRest -= vendaTake;
      }
    }

    const ciclos = ciclosBase.map((c) => {
      const uso = consumoPorCiclo.get(c.numero);
      if (!uso) return c;
      const gozo = uso.diasGozo;
      const venda = uso.diasVendidos;
      const disp = Math.max(0, c.diasPorCiclo - gozo - venda);
      const emAnalise = STATUS_EM_ANALISE.includes(
        uso.solicitacaoStatus as (typeof STATUS_EM_ANALISE)[number]
      );
      return {
        ...c,
        diasGozo: gozo,
        diasVendidos: venda,
        diasDisponiveis: emAnalise ? 0 : disp,
        status: emAnalise
          ? ("EM_ANALISE" as const)
          : disp <= 0
            ? ("CONFIGURADO" as const)
            : ("DISPONIVEL" as const),
        solicitacaoId: uso.solicitacaoId,
        solicitacaoStatus: uso.solicitacaoStatus
      };
    });

    return {
      dataAdmissao: admissao,
      ciclosVencidos,
      diasDisponiveis,
      diasGozo,
      diasVendidos,
      totalVencido,
      obrigatorio,
      mesesTotal,
      isEstagiario,
      duracaoCicloMeses,
      diasPorCiclo,
      ciclos
    };
  }

  /* ─── Requerimento de Endereço ─── */

  async getRequerimentoEndereco(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.prisma.requerimentoEndereco.findUnique({
      where: { funcionarioId: func.id },
      select: { id: true, status: true, criadoEm: true }
    });
  }

  async responderRequerimentoEndereco(
    keycloakSub: string,
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
    }
  ) {
    const func = await this.getFuncionario(keycloakSub);

    const req = await this.prisma.requerimentoEndereco.findUnique({
      where: { funcionarioId: func.id }
    });
    if (!req || req.status !== "PENDENTE") {
      throw new BadRequestException("Nenhum requerimento pendente encontrado.");
    }

    await this.prisma.$transaction(async (tx) => {
      const { lat, lng, ...addr } = data;
      await tx.enderecoResidencial.upsert({
        where: { funcionarioId: func.id },
        create: { funcionarioId: func.id, ...addr, lat: lat ?? null, lng: lng ?? null },
        update: { ...addr, lat: lat ?? null, lng: lng ?? null }
      });
      await tx.requerimentoEndereco.update({
        where: { funcionarioId: func.id },
        data: { status: "RESPONDIDO", respondidoEm: new Date() }
      });
    });

    return { ok: true };
  }

  /* ─── Requerimentos de cadastro (Dependentes / Formação / Cursos) ─── */

  /** Pendentes do funcionário, cada um com os dados atuais daquele tipo para edição. */
  async getRequerimentosCadastro(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    const pendentes = await this.prisma.requerimentoCadastro.findMany({
      where: { funcionarioId: func.id, status: "PENDENTE" },
      select: { tipo: true, status: true, criadoEm: true },
      orderBy: { tipo: "asc" }
    });
    if (!pendentes.length) return [];
    const dataIso = (d: Date | null) => (d ? dataCivilISO(d) : null);
    const [dependentes, formacoes, capacitacoes] = await Promise.all([
      this.prisma.dependente.findMany({
        where: { funcionarioId: func.id },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.formacaoAcademica.findMany({
        where: { funcionarioId: func.id },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.capacitacao.findMany({
        where: { funcionarioId: func.id },
        orderBy: { createdAt: "asc" }
      })
    ]);
    const atuais = {
      DEPENDENTES: dependentes.map((d) => ({
        nome: d.nome,
        cpf: d.cpf,
        dataNascimento: dataIso(d.dataNascimento)
      })),
      FORMACAO_ACADEMICA: formacoes.map((f) => ({
        grauEscolaridade: f.grauEscolaridade,
        curso: f.curso,
        instituicao: f.instituicao,
        conclusao: dataIso(f.conclusao)
      })),
      CAPACITACOES: capacitacoes.map((c) => ({
        nome: c.nome,
        instituicao: c.instituicao,
        conclusao: dataIso(c.conclusao)
      }))
    };
    return pendentes.map((r) => ({ ...r, itens: atuais[r.tipo] }));
  }

  async responderRequerimentoCadastro(
    keycloakSub: string,
    tipoStr: string,
    body: {
      itens?: Array<DependenteInput | FormacaoAcademicaInput | CapacitacaoInput>;
      semRegistros?: boolean;
    }
  ) {
    const tipo = tipoStr as (typeof TIPOS_REQUERIMENTO_CADASTRO)[number];
    if (!TIPOS_REQUERIMENTO_CADASTRO.includes(tipo)) {
      throw new BadRequestException("Tipo de requerimento inválido.");
    }
    const func = await this.getFuncionario(keycloakSub);
    const req = await this.prisma.requerimentoCadastro.findUnique({
      where: { funcionarioId_tipo: { funcionarioId: func.id, tipo } }
    });
    if (!req || req.status !== "PENDENTE") {
      throw new BadRequestException("Nenhum requerimento pendente encontrado.");
    }

    const itens = Array.isArray(body.itens) ? body.itens : [];
    if (!itens.length && !body.semRegistros) {
      throw new BadRequestException(
        "Adicione ao menos um registro ou marque que não possui registros."
      );
    }

    if (tipo === "DEPENDENTES") {
      const deps = itens as DependenteInput[];
      if (deps.some((d) => !d.nome?.trim())) {
        throw new BadRequestException("Informe o nome de todos os dependentes.");
      }
      if (deps.some((d) => d.cpf?.trim() && !cpfValido(d.cpf))) {
        throw new BadRequestException("Há CPF de dependente inválido.");
      }
    } else if (tipo === "FORMACAO_ACADEMICA") {
      if ((itens as FormacaoAcademicaInput[]).some((f) => !f.curso?.trim())) {
        throw new BadRequestException("Informe o curso de todas as formações.");
      }
    } else if ((itens as CapacitacaoInput[]).some((c) => !c.nome?.trim())) {
      throw new BadRequestException("Informe o nome de todos os cursos/capacitações.");
    }

    await this.prisma.$transaction(async (tx) => {
      if (tipo === "DEPENDENTES") await syncDependentes(tx, func.id, itens as DependenteInput[]);
      else if (tipo === "FORMACAO_ACADEMICA")
        await syncFormacoesAcademicas(tx, func.id, itens as FormacaoAcademicaInput[]);
      else await syncCapacitacoes(tx, func.id, itens as CapacitacaoInput[]);
      await tx.requerimentoCadastro.update({
        where: { id: req.id },
        data: { status: "RESPONDIDO", respondidoEm: new Date() }
      });
    });
    return { ok: true };
  }

  async listarDocumentosRh(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.prisma.documentoRhEnvio.findMany({
      where: { funcionarioId: func.id },
      orderBy: { createdAt: "desc" }
    });
  }

  async enviarDocumentoRh(
    keycloakSub: string,
    body: { descricao: string; arquivoBase64: string; mimeType?: string; nomeArquivo?: string }
  ) {
    const descricao = body.descricao?.trim();
    if (!descricao || descricao.length < 3) {
      throw new BadRequestException("Informe uma descrição com pelo menos 3 caracteres.");
    }
    if (!body.arquivoBase64?.trim()) {
      throw new BadRequestException("Selecione um documento para enviar.");
    }

    const func = await this.getFuncionario(keycloakSub);

    // Salva o arquivo em disco antes de criar o registro no banco,
    // para evitar registro órfão com arquivoUrl vazia em caso de falha.
    const tempId = `${func.id}-${Date.now()}`;
    const url = await this.documentoService.salvarDocumentoRhEnvio({
      funcionarioId: func.id,
      documentoId: tempId,
      arquivoBase64: body.arquivoBase64,
      mimeType: body.mimeType
    });

    return this.prisma.documentoRhEnvio.create({
      data: {
        funcionarioId: func.id,
        descricao,
        arquivoUrl: url,
        nomeArquivo: body.nomeArquivo?.trim() || null,
        mimeType: body.mimeType || null
      }
    });
  }

  /**
   * Recalcula horas/extras/faltas de todos os PeriodoPonto com a regra de
   * almoço mínimo obrigatório e atualiza saldos de assinaturas ainda pendentes.
   */
  async recalcularHistoricoAlmocoTodos(): Promise<{
    funcionarios: number;
    periodosAtualizados: number;
    assinaturasAtualizadas: number;
    erros: Array<{ funcionarioId: string; mes?: number; ano?: number; erro: string }>;
  }> {
    const funcs = await this.prisma.funcionario.findMany({
      select: {
        id: true,
        categoria: true,
        user: { select: { createdAt: true, name: true } }
      }
    });

    let periodosAtualizados = 0;
    const assinaturasAtualizadas = 0;
    const erros: Array<{ funcionarioId: string; mes?: number; ano?: number; erro: string }> = [];

    for (const func of funcs) {
      try {
        const meses = new Set<string>();

        const regsDatas = await this.prisma.registroPonto.findMany({
          where: { funcionarioId: func.id, apenasInformativo: false },
          select: { dataHora: true }
        });
        for (const r of regsDatas) {
          meses.add(dataBrasiliaISO(r.dataHora).slice(0, 7));
        }

        const periodosExistentes = await this.prisma.periodoPonto.findMany({
          where: { funcionarioId: func.id },
          select: { mes: true, ano: true }
        });
        for (const p of periodosExistentes) {
          meses.add(`${p.ano}-${String(p.mes).padStart(2, "0")}`);
        }

        /* Folhas concluídas/dispensadas são documentos assinados: o resumo gravado fica como está. */
        const congelados = new Set(
          (
            await this.prisma.periodoPonto.findMany({
              where: {
                funcionarioId: func.id,
                assinatura: { is: { status: { in: ["CONCLUIDA", "DISPENSADA"] } } }
              },
              select: { mes: true, ano: true }
            })
          ).map((p) => `${p.ano}-${String(p.mes).padStart(2, "0")}`)
        );
        for (const ym of [...meses].sort()) {
          if (congelados.has(ym)) continue;
          const [anoStr, mesStr] = ym.split("-");
          const ano = Number(anoStr);
          const mes = Number(mesStr);
          try {
            const resumo = await this.calcularResumoMensalPorFuncionarioId(func.id, mes, ano);
            await this.prisma.periodoPonto.upsert({
              where: {
                funcionarioId_mes_ano: { funcionarioId: func.id, mes, ano }
              },
              create: {
                funcionarioId: func.id,
                mes,
                ano,
                horasTrabalhadasMinutos: resumo.horasTrabalhadasMinutos,
                horasExtrasMinutos: resumo.horasExtrasMinutos,
                horasFaltaMinutos: resumo.horasFaltaMinutos,
                diasTrabalhados: resumo.diasTrabalhados
              },
              update: {
                horasTrabalhadasMinutos: resumo.horasTrabalhadasMinutos,
                horasExtrasMinutos: resumo.horasExtrasMinutos,
                horasFaltaMinutos: resumo.horasFaltaMinutos,
                diasTrabalhados: resumo.diasTrabalhados
              }
            });
            periodosAtualizados++;
          } catch (err) {
            erros.push({
              funcionarioId: func.id,
              mes,
              ano,
              erro: err instanceof Error ? err.message : String(err)
            });
          }
        }

        /* O saldo gravado em cada assinatura pendente é por MÊS (acumulado no fim daquele mês):
           é atualizado por AssinaturaService.recalcularResumosFolhas, não pelo saldo atual. */
      } catch (err) {
        erros.push({
          funcionarioId: func.id,
          erro: err instanceof Error ? err.message : String(err)
        });
      }
    }

    this.logger.log(
      `Recálculo almoço: ${funcs.length} funcionários, ${periodosAtualizados} períodos, ` +
        `${assinaturasAtualizadas} assinaturas, ${erros.length} erros`
    );

    return {
      funcionarios: funcs.length,
      periodosAtualizados,
      assinaturasAtualizadas,
      erros
    };
  }

  /** Resumo mensal por funcionário (admin) — usa a mesma regra de almoço do Histórico. */
  async calcularResumoMensalPorFuncionarioId(funcionarioId: string, mes: number, ano: number) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: {
        id: true,
        categoria: true,
        user: { select: { primeiroLoginEm: true } }
      }
    });
    if (!func) throw new NotFoundException("Funcionário não encontrado");

    const primeiroDia = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const ultimoDiaIso = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
    const { inicio } = intervaloDiaBrasilia(primeiroDia);
    const { fim } = intervaloDiaBrasilia(ultimoDiaIso);
    const inicioBuffer = new Date(inicio.getTime() - 3 * 60 * 60 * 1000);
    const fimBuffer = new Date(fim.getTime() + 3 * 60 * 60 * 1000);
    const { inicio: feriadoIni, fim: feriadoFim } = intervaloColunaDate(primeiroDia, ultimoDiaIso);

    const [registros, afastamentos, feriados, cfgMult, jornadaCtx] = await Promise.all([
      this.prisma.registroPonto.findMany({
        where: {
          funcionarioId,
          apenasInformativo: false,
          dataHora: { gte: inicio, lte: fim }
        },
        orderBy: { dataHora: "asc" },
        select: { tipo: true, dataHora: true, observacoes: true }
      }),
      this.prisma.afastamento.findMany({
        where: {
          funcionarioId,
          apenasInformativo: false,
          dataInicio: { lte: fimBuffer },
          dataFim: { gte: inicioBuffer }
        },
        select: { dataInicio: true, dataFim: true, horarioInicio: true, horarioFim: true }
      }),
      this.prisma.feriadoConfig.findMany({
        where: { data: { gte: feriadoIni, lte: feriadoFim } },
        select: { data: true, nome: true, tipo: true, marcoHorario: true, marcoLado: true }
      }),
      this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: {
          bancoHorasSabadoPct: true,
          bancoHorasDomingoPct: true,
          bancoHorasFeriadoPct: true
        }
      }),
      this.getJornadaHistoricoContexto(funcionarioId)
    ]);

    const inicioAtividades = inicioAtividadesUsuario(func.user);

    const mm2 = String(mes).padStart(2, "0");
    const inicioMes = intervaloDiaBrasilia(`${ano}-${mm2}-01`).inicio;
    const fimMes = intervaloDiaBrasilia(
      `${ano}-${mm2}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`
    ).fim;
    const cicloEmCasaMes = await diasCicloCompletoEmCasa(
      this.prisma,
      funcionarioId,
      inicioMes,
      fimMes
    );

    const quadro = montarRelatorioQuadro(
      registros,
      afastamentos,
      mes,
      ano,
      jornadaCtx,
      feriados,
      cfgMult?.bancoHorasSabadoPct ?? 100,
      cfgMult?.bancoHorasDomingoPct ?? 200,
      cfgMult?.bancoHorasFeriadoPct ?? 200,
      inicioAtividades,
      {
        forcarSemIntervalo: categoriaSemIntervaloAlmoco(func.categoria),
        diasCicloCompletoEmCasa: cicloEmCasaMes.dias,
        exigenciasCicloPresencial: (
          await exigenciasCicloPresencial(
            this.prisma,
            funcionarioId,
            inicioMes,
            fimMes,
            jornadaCtx,
            cicloEmCasaMes.dias
          )
        ).porDia,
        diaNeutro: await montarDiaNeutro(this.prisma, funcionarioId)
      }
    );

    const horasExtrasMinutos = quadro.dias
      .filter((d) => (d.saldoMin ?? 0) > 0)
      .reduce((s, d) => s + (d.saldoMin ?? 0), 0);
    const horasFaltaMinutos = quadro.dias
      .filter((d) => (d.saldoMin ?? 0) < 0)
      .reduce((s, d) => s + Math.abs(d.saldoMin ?? 0), 0);
    const diasTrabalhados = quadro.diasTrabalhados;

    return {
      horasTrabalhadasMinutos: quadro.horasTrabalhadasMinutos,
      horasExtrasMinutos,
      horasFaltaMinutos,
      diasTrabalhados
    };
  }
}
