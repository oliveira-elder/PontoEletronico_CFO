import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger
} from "@nestjs/common";
import { TipoPonto, OrigemPonto, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { FotoService } from "./foto.service";
import { DocumentoService } from "./documento.service";
import { FeriadoConfigService } from "./feriado-config.service";
import { NotificacaoService } from "../notificacao/notificacao.service";
import { CreateRegistroDto } from "./dto/create-registro.dto";
import {
  dataBrasiliaISO,
  horarioDeDataBrasilia,
  horarioParaMinutos,
  hojeBrasiliaISO,
  intervaloDiaBrasilia,
  validarHorarioPermitido
} from "../../utils/horario-brasilia";
import { appendObservacao } from "../../utils/registro-observacoes";
import { montarRelatorioQuadro } from "../../utils/historico-quadro";
import { previsaoInicioAlmoco } from "../../utils/previsao-registros";
import { assertMesAposGoLive, getDataInicioProducao } from "../../utils/inicio-producao";
import {
  jornadaEsperadaMin,
  resolverJornadaHistoricoContexto,
  calcularJornadaParcialFeriado,
  calcularJornadaComAtestadoParcial,
  calcularSaldoAtestadoParcialPorExpediente,
  prepararRegsCalculoAtestadoParcial,
  isAfastamentoParcial,
  dispensarAlmocoPorAtestadoParcial,
  atestadoParcialEhMatutino,
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
  categoriaSemRegistroPonto,
  categoriaSemVisibilidadeBancoHoras,
  diaSemObrigacaoPonto,
  labelCategoriaSemIntervalo,
  labelCategoriaSemRegistroPonto,
  periodosSemObrigacaoPonto,
  type CategoriaSemIntervaloAlmoco
} from "../../utils/categoria-jornada";
import { ensureCategoriaHistorico } from "../../utils/categoria-historico";
import { calcHorasTrabalhadasMinutos } from "../../utils/calc-horas-trabalhadas";
import { resolverCicloBancoHoras } from "../../utils/banco-horas-marco";
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
  LICENCA: "Licença",
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
      return "rejeitada pelo gestor";
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

@Injectable()
export class PontoService {
  private readonly logger = new Logger(PontoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fotoService: FotoService,
    private readonly documentoService: DocumentoService,
    private readonly feriadoConfigService: FeriadoConfigService,
    private readonly notificacaoService: NotificacaoService
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
    return resolverJornadaHistoricoContexto({
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
    });
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
  private async getFuncionario(keycloakSub: string) {
    const user = await this.prisma.user.findUnique({ where: { externalId: keycloakSub } });
    if (!user) {
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    }

    let f = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      include: { enderecoResidencial: true }
    });
    if (!f) {
      const criado = await this.prisma.funcionario.create({
        data: { userId: user.id, matricula: user.id.slice(0, 12), cargo: "A definir", ativo: true },
        include: { enderecoResidencial: true }
      });
      f = criado;
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

    const diasUnicos = new Set(entradas.map((r) => r.dataHora.toISOString().slice(0, 10)));
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
      ? dataBrasiliaISO(func.pontoObrigatorioDesde)
      : null;
    const isentoHoje = diaSemObrigacaoPonto(hojeIso, {
      historico: historicoCat,
      categoriaAtual: func.categoria,
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
    const almocoPodeIniciarA = jornada.almocoPodeIniciarA ?? "11:30";
    const almocoPodeIniciarAte = jornada.almocoPodeIniciarAte ?? "13:00";
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
    const { fase, acoesPermitidas: acoesPorFase } = this.getFaseEAcoes(registros, {
      forcarSemIntervalo: semIntervaloCategoria || atestadoMatutino,
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
      jornadaMinutos = calcularJornadaComAtestadoParcial(
        afastamento.horarioInicio,
        afastamento.horarioFim,
        {
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          jornadaDiariaMin: jornada.jornadaDiariaMin,
          almocoMinMin: jornada.almocoMinMin ?? 60,
          almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
          almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
          horaEntrada: jornada.horaEntrada ?? "08:00",
          horaSaida: jornada.horaSaida ?? "17:00",
          toleranciaEntradaMin: jornada.toleranciaEntradaMin ?? 5,
          toleranciaSaidaMin: jornada.toleranciaEntradaMin ?? jornada.toleranciaSaidaMin ?? 5
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
      proximaAcao: acoesPermitidas[0] ?? null,
      acoesPermitidas,
      afastamentoHoje,
      categoria: func.categoria,
      semRegistroPonto: isentoHoje || categoriaSemRegistroPonto(func.categoria),
      isentoHoje,
      modoHomeOffice: func.modoHomeOffice,
      modoHibridoLocal: func.modoHibridoLocal,
      semIntervalo,
      turno: obsTurno?.turno ?? (atestadoMatutino ? "VESPERTINO" : entradaHoje ? "MATUTINO" : null),
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
            lat: func.enderecoResidencial.lat,
            lng: func.enderecoResidencial.lng,
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
      const fim = dataBrasiliaISO(a.dataFim);
      return diaISO >= inicio && diaISO <= fim;
    });
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

  /* ─── Bater ponto ─── */

  async baterPonto(keycloakSub: string, dto: CreateRegistroDto) {
    const func = await this.getFuncionario(keycloakSub);
    const hojeIso = hojeBrasiliaISO();

    if (categoriaSemRegistroPonto(func.categoria)) {
      throw new BadRequestException(
        `Funcionários na categoria ${labelCategoriaSemRegistroPonto(func.categoria)} não registram ponto eletrônico.`
      );
    }

    const historicoCat = await ensureCategoriaHistorico(this.prisma, func.id);
    const pontoObrigatorioDesde = func.pontoObrigatorioDesde
      ? dataBrasiliaISO(func.pontoObrigatorioDesde)
      : null;
    if (
      diaSemObrigacaoPonto(hojeIso, {
        historico: historicoCat,
        categoriaAtual: func.categoria,
        pontoObrigatorioDesde
      })
    ) {
      throw new BadRequestException(
        "Hoje ainda não há obrigação de registro de ponto. " +
          "Após retorno de Assessor/Gerente para categoria com ponto, " +
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

    /* Validação de sequência */
    const permitidas = status.acoesPermitidas;
    if (!permitidas.includes(dto.tipo)) {
      const janelaIni = status.almocoPodeIniciarA ?? "11:30";
      const janelaFim = status.almocoPodeIniciarAte ?? "13:00";
      if (
        ACOES_BLOQUEADAS_NA_JANELA_ALMOCO.includes(dto.tipo) &&
        (permitidas.includes("INICIO_INTERVALO") || permitidas.includes("FIM_INTERVALO"))
      ) {
        throw new BadRequestException(
          `Neste horário (${janelaIni}–${janelaFim}) registre o intervalo de almoço. ` +
            `Pausa e encerramento não estão disponíveis durante a janela.`
        );
      }
      throw new BadRequestException(
        permitidas.length
          ? `Sequência inválida. Próxima ação esperada: ${permitidas.join(" ou ")}. Recebido: ${dto.tipo}`
          : `Jornada já encerrada. Não há novas ações permitidas hoje. Recebido: ${dto.tipo}`
      );
    }

    /* Valida geo e calcula dentroPerimetro com base na configuração vigente.
       O backend é a camada autoritativa — o frontend não pode ser confiado sozinho. */
    const sysConfig = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" }
    });

    let dentroPerimetro = false;
    let modoRegistroEfetivo = (dto.modoRegistro ?? dto.origem ?? "MOBILE") as string;
    const origemEhMobile = ["MOBILE", "HIBRIDO", "HOME_OFFICE"].includes(dto.origem ?? "WEB");

    /* ── Validação de geo remoto (Home Office / Híbrido) ── */
    if (origemEhMobile && (func.modoHomeOffice || func.modoHibridoLocal)) {
      if (dto.latitude == null || dto.longitude == null) {
        throw new BadRequestException(
          "Localização GPS não compartilhada. Para registrar o ponto, ative o GPS e permita o acesso à localização no navegador.\n\n" +
            "• Android Chrome: toque no ícone 🔒 na barra de endereço → Permissões → Localização → Permitir\n" +
            "• iPhone Safari: Ajustes → Privacidade → Serviços de Localização → Safari → Ao usar o app"
        );
      }

      const endereco = func.enderecoResidencial;
      let dentroResidencial = false;

      if (endereco?.lat && endereco?.lng) {
        const distRes = this.haversineMetros(
          dto.latitude,
          dto.longitude,
          endereco.lat,
          endereco.lng
        );
        dentroResidencial = distRes <= (endereco.raioMetros ?? 20);
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
          dto.latitude,
          dto.longitude,
          sysConfig.lat,
          sysConfig.lng
        );
        if (!sysConfig.mobileCheckGeo || distSede <= sysConfig.raioMetros) {
          dentroPerimetro = distSede <= sysConfig.raioMetros;
          modoRegistroEfetivo = "MOBILE";
        } else if (sysConfig.modoViagem) {
          /* 3. Tenta áreas de viagem */
          const areas = await this.prisma.areaViagem.findMany({ where: { ativa: true } });
          let dentroArea = false;
          for (const area of areas) {
            if (area.lat != null && area.lng != null) {
              const d = this.haversineMetros(dto.latitude, dto.longitude, area.lat, area.lng);
              if (d <= area.raioMetros) {
                dentroArea = true;
                break;
              }
            }
          }
          if (dentroArea) {
            modoRegistroEfetivo = "VIAGEM";
            dentroPerimetro = true;
          } else {
            const raioRes = endereco?.raioMetros ?? 20;
            const msgRes =
              endereco?.lat && endereco?.lng
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
            endereco?.lat && endereco?.lng
              ? `, ou a mais de ${raioRes}m do endereço residencial`
              : "";
          throw new BadRequestException(
            `Você está a ${Math.round(distSede)}m do CFO${msgRes}. ` +
              `Deve estar na sede ou em casa para registrar o ponto.`
          );
        }
      }
    } else if (origemEhMobile && sysConfig?.mobileCheckGeo) {
      /* Mobile regular: validação contra sede */
      if (dto.latitude == null || dto.longitude == null) {
        throw new BadRequestException(
          "Registro mobile exige localização GPS. Ative o GPS no dispositivo e tente novamente."
        );
      }
      const dist = this.haversineMetros(dto.latitude, dto.longitude, sysConfig.lat, sysConfig.lng);
      if (dist > sysConfig.raioMetros) {
        throw new BadRequestException(
          `Fora do perímetro permitido. Você está a ${Math.round(dist)}m ` +
            `(máximo permitido: ${sysConfig.raioMetros}m).`
        );
      }
      dentroPerimetro = true;
    } else if (dto.latitude != null && dto.longitude != null && sysConfig) {
      /* Outros modos com coordenadas: calcula mas não rejeita */
      const dist = this.haversineMetros(dto.latitude, dto.longitude, sysConfig.lat, sysConfig.lng);
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
            origem: (dto.origem ?? "WEB") as OrigemPonto,
            observacoes: appendObservacao([], observacaoAjuste) as unknown as Prisma.InputJsonValue
          },
          {
            funcionarioId: func.id,
            tipo: "FIM_INTERVALO",
            dataHora: new Date(agora.getTime() - 1),
            origem: (dto.origem ?? "WEB") as OrigemPonto,
            observacoes: appendObservacao([], observacaoAjuste) as unknown as Prisma.InputJsonValue
          }
        ]
      });
    }

    /* Entrada sem intervalo de almoço:
       - Estagiário (carga horária corrida), ou
       - Turno vespertino/noturno (durante ou após a janela de almoço).
       Anota observação na própria ENTRADA — sem criar registros de intervalo. */
    let observacoesEntrada: Prisma.InputJsonValue | undefined;
    if (dto.tipo === "ENTRADA") {
      if (categoriaSemIntervaloAlmoco(func.categoria)) {
        const jornada = await this.getJornadaEfetiva(func.id);
        const horaAgora = horarioDeDataBrasilia(agora);
        const classificacao = classificarTurnoEntrada(
          horaAgora,
          jornada.almocoPodeIniciarA,
          jornada.almocoPodeIniciarAte
        );
        observacoesEntrada = appendObservacao(
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
        /* Atestado matutino: retorno à tarde segue o fluxo de início de jornada vespertina */
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
          classificacao = {
            turno: "VESPERTINO",
            semIntervalo: true,
            motivo: "APOS_JANELA",
            janelaAlmoco: `${jornada.almocoPodeIniciarA}–${jornada.almocoPodeIniciarAte}`
          };
        }
        if (classificacao.semIntervalo) {
          observacoesEntrada = appendObservacao(
            [],
            criarObservacaoTurnoSemIntervalo(classificacao)
          ) as unknown as Prisma.InputJsonValue;
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
          origem: (dto.origem ?? "WEB") as OrigemPonto,
          modoRegistro: modoRegistroEfetivo as import("@prisma/client").ModoRegistro,
          observacoes: observacoesAlmoco
        }
      });
    }

    const registro = await this.prisma.registroPonto.create({
      data: {
        funcionarioId: func.id,
        tipo: dto.tipo as TipoPonto,
        dataHora: agora,
        origem: (dto.origem ?? "WEB") as OrigemPonto,
        modoRegistro: modoRegistroEfetivo as import("@prisma/client").ModoRegistro,
        latitude: dto.latitude,
        longitude: dto.longitude,
        dentroPerimetro,
        observacao: dto.observacao,
        fotoUrl: fotoUrl ?? null,
        ...(observacoesEntrada ? { observacoes: observacoesEntrada } : {})
      }
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
      select: { createdAt: true }
    });
    if (!user) {
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    }
    const func = await this.getFuncionario(keycloakSub);
    const inicioAtividades = dataBrasiliaISO(user.createdAt);
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
        horarioFim: true
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

    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, nome: true, tipo: true, marcoHorario: true, marcoLado: true }
    });

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasSabadoPct: true, bancoHorasDomingoPct: true, bancoHorasFeriadoPct: true }
    });

    const jornada = await this.getJornadaHistoricoContexto(func.id);

    const banco = await this.calcularBancoHoras(func.id, inicioAtividades);
    const bancoMes = banco.dias.filter((d) => d.data.startsWith(mesPrefix));
    const bancoPorDia: Record<
      string,
      {
        horasTrabalhadasMinutos: number;
        saldoDiaMinutos: number;
        saldoAcumuladoMinutos: number;
        jornadaEsperadaMinutos: number;
        observacao?: string;
        neutro: boolean;
      }
    > = {};
    for (const d of bancoMes) {
      bancoPorDia[d.data] = {
        horasTrabalhadasMinutos: d.horasTrabalhadasMinutos,
        saldoDiaMinutos: d.saldoDiaMinutos,
        saldoAcumuladoMinutos: d.saldoAcumuladoMinutos,
        jornadaEsperadaMinutos: d.jornadaEsperadaMinutos,
        observacao: d.observacao,
        /* Neutro só quando o saldo não deve aparecer (afastamento integral / isento /
           feriado sem trabalho). Atestado parcial e feriado parcial mostram saldo. */
        neutro:
          !!d.observacao &&
          (d.observacao === "Afastamento" ||
            d.observacao.startsWith("Isento") ||
            (d.observacao.startsWith("Feriado:") && d.horasTrabalhadasMinutos === 0))
      };
    }
    const saldoMesBanco = bancoMes.reduce((s, d) => s + d.saldoDiaMinutos, 0);
    const saldoAcumuladoMes = bancoMes.at(-1)?.saldoAcumuladoMinutos ?? 0;
    const mesPrefixInicio = `${mesPrefix}-01`;
    const diasAntesDoMes = banco.dias
      .filter((d) => d.data < mesPrefixInicio)
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    /* Fim do mês anterior no ciclo; se o ciclo começa no mês atual, deriva do 1º dia. */
    const saldoAcumuladoMesAnterior =
      diasAntesDoMes.length > 0
        ? (diasAntesDoMes.at(-1)?.saldoAcumuladoMinutos ?? 0)
        : bancoMes.length > 0
          ? bancoMes[0].saldoAcumuladoMinutos - bancoMes[0].saldoDiaMinutos
          : 0;

    const pontoObrigatorioDesde = func.pontoObrigatorioDesde
      ? dataBrasiliaISO(func.pontoObrigatorioDesde)
      : null;

    const historicoCat = await ensureCategoriaHistorico(this.prisma, func.id);
    const periodosSemObrigacao = periodosSemObrigacaoPonto(historicoCat, {
      pontoObrigatorioDesde,
      categoriaAtual: func.categoria
    });

    const ocultarBancoHoras = categoriaSemVisibilidadeBancoHoras(func.categoria);
    const exporBancoHoras = opts?.exporBancoHoras === true || !ocultarBancoHoras;

    return {
      mes,
      ano,
      inicioAtividades,
      dataInicioProducao,
      periodoTeste,
      pontoObrigatorioDesde,
      semRegistroPonto: categoriaSemRegistroPonto(func.categoria),
      categoria: func.categoria,
      periodosSemObrigacao,
      categoriaHistorico: historicoCat,
      funcionario: { id: func.id, matricula: func.matricula, cargo: func.cargo },
      bancoPorDia: exporBancoHoras ? bancoPorDia : {},
      saldoMesBanco: exporBancoHoras ? saldoMesBanco : 0,
      saldoAcumuladoMes: exporBancoHoras ? saldoAcumuladoMes : 0,
      saldoAcumuladoMesAnterior: exporBancoHoras ? saldoAcumuladoMesAnterior : 0,
      ocultarBancoHoras,
      registros,
      afastamentos,
      feriados,
      multiplicadores: {
        sabadoPct: cfg?.bancoHorasSabadoPct ?? 100,
        domingoPct: cfg?.bancoHorasDomingoPct ?? 200,
        feriadoPct: cfg?.bancoHorasFeriadoPct ?? 200
      },
      jornada
    };
  }

  /* ─── Relatório mensal ─── */

  async getRelatorio(keycloakSub: string, mes: number, ano: number, isSuperAdmin = false) {
    const historico = await this.getHistorico(keycloakSub, mes, ano, isSuperAdmin, {
      exporBancoHoras: true
    });

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
      { forcarSemIntervalo: categoriaSemIntervaloAlmoco(historico.categoria) }
    );

    const diasMesBanco = Object.entries(historico.bancoPorDia).map(([data, d]) => ({
      data,
      ...d
    }));

    const horasEsperadasMinutos = diasMesBanco.reduce((s, d) => s + d.jornadaEsperadaMinutos, 0);
    const horasExtrasMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos > 0)
      .reduce((s, d) => s + d.saldoDiaMinutos, 0);
    const horasFaltaMinutos = diasMesBanco
      .filter((d) => d.saldoDiaMinutos < 0)
      .reduce((s, d) => s + Math.abs(d.saldoDiaMinutos), 0);
    const saldoMinutos = historico.saldoMesBanco;
    const diasTrabalhados = diasMesBanco.filter(
      (d) => d.horasTrabalhadasMinutos > 0 && d.observacao !== "Afastamento"
    ).length;

    const ocultarBancoHoras = !!historico.ocultarBancoHoras;

    return {
      mes,
      ano,
      funcionario: historico.funcionario,
      diasTrabalhados,
      horasTrabalhadasMinutos: quadro.horasTrabalhadasMinutos,
      horasEsperadasMinutos,
      horasExtrasMinutos: ocultarBancoHoras ? 0 : horasExtrasMinutos,
      horasFaltaMinutos: ocultarBancoHoras ? 0 : horasFaltaMinutos,
      saldoMinutos: ocultarBancoHoras ? 0 : saldoMinutos,
      ocultarBancoHoras
    };
  }

  /* ─── Banco de Horas ─── */

  async getBancoHoras(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    if (categoriaSemVisibilidadeBancoHoras(func.categoria)) {
      throw new ForbiddenException(
        "Banco de horas não está disponível para consulta nesta categoria funcional."
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: func.userId },
      select: { createdAt: true }
    });
    const inicioAtividades = user?.createdAt ? dataBrasiliaISO(user.createdAt) : hojeBrasiliaISO();
    return this.calcularBancoHoras(func.id, inicioAtividades);
  }

  /** Ciclo de banco de horas para auditoria/admin (mesmas regras de /ponto/banco-horas). */
  async calcularBancoHorasAdmin(funcionarioId: string) {
    const func = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { user: { select: { createdAt: true } } }
    });
    const inicioAtividades = func?.user?.createdAt
      ? dataBrasiliaISO(func.user.createdAt)
      : undefined;
    return this.calcularBancoHoras(funcionarioId, inicioAtividades);
  }

  /** Calcula o saldo do banco de horas do ciclo atual, iterando todos os dias
   *  úteis (seg–sex conforme diasUteis) e contabilizando feriados e afastamentos
   *  como saldo neutro (0), e faltas como saldo negativo. */
  private async calcularBancoHoras(funcionarioId: string, inicioAtividades?: string) {
    const funcMeta = await this.prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { categoria: true, pontoObrigatorioDesde: true }
    });
    const pontoObrigatorioDesde = funcMeta?.pontoObrigatorioDesde
      ? dataBrasiliaISO(funcMeta.pontoObrigatorioDesde)
      : null;
    const historicoCat = await ensureCategoriaHistorico(this.prisma, funcionarioId);
    const optsObrigacao = {
      historico: historicoCat,
      categoriaAtual: funcMeta?.categoria,
      pontoObrigatorioDesde
    };

    const jornada = await this.getJornadaEfetiva(funcionarioId);
    const jornadaCtx = await this.getJornadaHistoricoContexto(funcionarioId);

    const diasUteisCfg: boolean[] = JSON.parse(
      typeof jornada.diasUteis === "string"
        ? jornada.diasUteis
        : "[false,true,true,true,true,true,false]"
    );

    const marcos = await this.prisma.bancoHorasMarco.findMany();
    const hojeIso = hojeBrasiliaISO();
    const { cicloInicio, proximaZeragem } = resolverCicloBancoHoras(marcos, hojeIso);

    let inicioLogin = inicioAtividades;
    if (!inicioLogin) {
      const funcUser = await this.prisma.funcionario.findUnique({
        where: { id: funcionarioId },
        select: { user: { select: { createdAt: true } } }
      });
      inicioLogin = funcUser?.user?.createdAt ? dataBrasiliaISO(funcUser.user.createdAt) : hojeIso;
    }

    /* Sem marco: inicia do primeiro login no sistema (alinhado ao Histórico). */
    let cicloInicioEfetivo: string = cicloInicio ?? inicioLogin;
    if (cicloInicioEfetivo < inicioLogin) {
      cicloInicioEfetivo = inicioLogin;
    }
    /* Não antecipa o ciclo para pontoObrigatorioDesde: períodos intercalados
       (concursado → assessor → concursado) precisam iterar o meio e zerar só nele. */

    const { inicio } = intervaloDiaBrasilia(cicloInicioEfetivo);
    const { fim } = intervaloDiaBrasilia(hojeIso);

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

    // Todos os feriados do ciclo (inclusive os que não bloqueiam registro)
    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
    });
    const feriadoMap = new Map(
      feriados.map((f) => [
        dataBrasiliaISO(f.data),
        { nome: f.nome, marcoHorario: f.marcoHorario, marcoLado: f.marcoLado }
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
    }[] = [];

    let saldoAcumulado = 0;

    // Itera cada dia civil do ciclo usando aritmética de strings (evita DST)
    let dataAtual = cicloInicioEfetivo;
    while (dataAtual <= hojeIso) {
      const [year, month, day] = dataAtual.split("-").map(Number);
      const diaSemana = new Date(year, month - 1, day).getDay();
      const eDiaUtil = diasUteisCfg[diaSemana];
      const feriadoDia = feriadoMap.get(dataAtual);
      const nomeFeriado = feriadoDia?.nome;
      const afastamento = afastamentos.find((a) => {
        const aInicio = dataBrasiliaISO(a.dataInicio);
        const aFim = dataBrasiliaISO(a.dataFim);
        return dataAtual >= aInicio && dataAtual <= aFim;
      });
      const afastamentoParcial = afastamento ? isAfastamentoParcial(afastamento) : false;
      const regsDodia = porDia.get(dataAtual) ?? [];
      const eHoje = dataAtual === hojeIso;
      /* Mesma regra do Histórico: em dias passados o trecho aberto (ex. retorno
         sem saída) NÃO conta; no dia corrente usa o horário atual como teto. */
      const capMs = eHoje ? Date.now() : undefined;

      /* Antes do primeiro login: não entra no banco de horas (sincronizado com Histórico). */
      if (dataAtual < inicioLogin) {
        const prox = new Date(year, month - 1, day);
        prox.setDate(prox.getDate() + 1);
        dataAtual = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
        continue;
      }

      /* Período como assessor/gerente (ou pré-obrigação): neutro — não falta nem crédito.
         Preserva saldos dos períodos como concursado antes/depois. */
      if (diaSemObrigacaoPonto(dataAtual, optsObrigacao)) {
        if (eDiaUtil || regsDodia.length > 0) {
          dias.push({
            data: dataAtual,
            horasTrabalhadasMinutos: 0,
            jornadaEsperadaMinutos: 0,
            saldoDiaMinutos: 0,
            saldoAcumuladoMinutos: saldoAcumulado,
            observacao: "Isento — Assessor/Gerente"
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
          horarioInicio: afastamento?.horarioInicio,
          horarioFim: afastamento?.horarioFim,
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

        if (afastamento && !afastamentoParcial) {
          // Afastamento dia inteiro: saldo neutro
          saldoDiaMinutos = 0;
          jornadaDia = 0;
          obs = "Afastamento";
        } else if (afastamento && afastamentoParcial) {
          const jornadaDiaMin = this.jornadaDiariaParaDia(jornadaCtx, dataAtual);
          const jornadaMandatoria = calcularJornadaComAtestadoParcial(
            afastamento.horarioInicio!,
            afastamento.horarioFim!,
            {
              horaEntrada: jornada.horaEntrada ?? "08:00",
              horaSaida: jornada.horaSaida ?? "17:00",
              jornadaDiariaMin: jornadaDiaMin,
              almocoMinMin: jornada.almocoMinMin ?? 60,
              almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
              almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00"
            }
          );
          const regsMinDia = regsDodia.map((r) => ({
            tipo: r.tipo,
            minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora).substring(0, 5))
          }));
          const prep = prepararRegsCalculoAtestadoParcial({
            registros: regsMinDia,
            horarioInicio: afastamento.horarioInicio!,
            horarioFim: afastamento.horarioFim!,
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
          saldoDiaMinutos = calcularSaldoAtestadoParcialPorExpediente({
            horarioInicioAtestado: afastamento.horarioInicio!,
            horarioFimAtestado: afastamento.horarioFim!,
            horaEntrada: jornada.horaEntrada ?? "08:00",
            horaSaida: jornada.horaSaida ?? "17:00",
            fimTrabalhoMin: prep.fimTrabalhoMin,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoMinMin: jornada.almocoMinMin ?? 60,
            toleranciaCalculoMin: jornada.toleranciaCalculoMin ?? 0,
            horaExtraLimiteMin: jornada.horaExtraLimiteAuto ?? 120
          });
          saldoDiaMinutos += creditoAlmocoDireitoDoDia({
            registros: regsDodia,
            horarioInicioAtestado: afastamento.horarioInicio,
            horarioFimAtestado: afastamento.horarioFim,
            almocoMinMin: jornada.almocoMinMin ?? 60,
            almocoPodeIniciarA: jornada.almocoPodeIniciarA ?? "11:30",
            almocoPodeIniciarAte: jornada.almocoPodeIniciarAte ?? "13:00",
            agoraMin: eHoje
              ? horarioParaMinutos(horarioDeDataBrasilia(new Date()).substring(0, 5))
              : undefined,
            exigirIntervalo: !semAlmocoDia
          });
          jornadaDia = jornadaMandatoria;
          obs =
            afastamento.tipo === "ABONO"
              ? `Abono parcial ${afastamento.horarioInicio}–${afastamento.horarioFim}`
              : `Atestado parcial ${afastamento.horarioInicio}–${afastamento.horarioFim}`;
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

        saldoAcumulado += saldoDiaMinutos;
        dias.push({
          data: dataAtual,
          horasTrabalhadasMinutos,
          jornadaEsperadaMinutos: jornadaDia,
          saldoDiaMinutos,
          saldoAcumuladoMinutos: saldoAcumulado,
          observacao: obs
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
        const saldoDiaMinutos = Math.round((horasTrabalhadasMinutos * pct) / 100);
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
          observacao: `Trabalho em ${tipoLabel} (${pct}%)`
        });
      }

      // Avança um dia
      const prox = new Date(year, month - 1, day);
      prox.setDate(prox.getDate() + 1);
      dataAtual = `${prox.getFullYear()}-${String(prox.getMonth() + 1).padStart(2, "0")}-${String(prox.getDate()).padStart(2, "0")}`;
    }

    return {
      saldoAtualMinutos: saldoAcumulado,
      cicloInicio,
      inicioAtividades: inicioLogin,
      proximaZeragem,
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
        user: { select: { id: true, name: true, email: true, emailReal: true } }
      }
    });
  }

  async getSolicitacoes(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.prisma.solicitacao.findMany({
      where: { funcionarioId: func.id },
      orderBy: { createdAt: "desc" }
    });
  }

  async getRegistrosDoDia(keycloakSub: string, data: string) {
    const func = await this.getFuncionario(keycloakSub);
    const { inicio, fim } = intervaloDiaBrasilia(data);
    return this.prisma.registroPonto.findMany({
      where: { funcionarioId: func.id, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" },
      select: { id: true, tipo: true, dataHora: true, ajustado: true, observacao: true }
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
    if (overtime <= limiteMin) return;

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
        descricao: `Hora extra automática: ${h}h${m} além da jornada diária.`,
        metadados: { automatica: true, horasExtraMinutos: overtime }
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
    }
  ) {
    const func = await this.getFuncionario(keycloakSub);

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
      const dataRefIsoAssin = dataBrasiliaISO(new Date(body.dataReferencia));
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
        const dataRefIso = dataBrasiliaISO(new Date(body.dataReferencia));
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
      const conflito = aprovadas.find((s) => {
        if (alteracaoDeId && s.id === alteracaoDeId) return false;
        if (s.tipo === "ENVIO_DOCUMENTO_RH") return false;
        const inicioExist = s.dataInicio ?? s.dataReferencia;
        const fimExist = s.dataFim ?? inicioExist;
        return periodosSobrepostos(novoInicio, novoFim, inicioExist, fimExist);
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
        throw new BadRequestException(
          "A solicitação de Hora Extra está desativada. Entre em contato com o RH."
        );
      }

      const limiteMin = jornada.horaExtraLimiteAuto;
      const horasExtraMin = (body.metadados?.horasExtraMinutos as number | undefined) ?? 0;
      if (horasExtraMin < limiteMin) {
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
      if (!saldo || saldo.diasDisponiveis <= 0) {
        throw new BadRequestException(
          "Não há dias de férias disponíveis para uma nova solicitação."
        );
      }

      const ciclo =
        cicloNumero != null
          ? saldo.ciclos.find((c) => c.numero === cicloNumero)
          : saldo.ciclos.find((c) => c.status === "DISPONIVEL" && c.diasDisponiveis > 0);

      /* Estagiário: sem regras de fracionamento/antecedência/igualar o ciclo;
         só não pode exceder o saldo nem vender dias (já bloqueado acima). */
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

    if (body.tipo === "ENVIO_DOCUMENTO_RH") {
      const solCfg = await this.prisma.configuracaoSolicitacoes.findUnique({
        where: { id: "singleton" },
        select: { tipoAtivoEnvioDocumentoRh: true }
      });
      if (solCfg?.tipoAtivoEnvioDocumentoRh === false) {
        throw new BadRequestException(
          "O envio de documento ao RH está desativado. Entre em contato com o RH."
        );
      }
      if (!body.descricao?.trim() || body.descricao.trim().length < 3) {
        throw new BadRequestException("Informe uma descrição com pelo menos 3 caracteres.");
      }
      if (!metadados || typeof metadados.documentoBase64 !== "string") {
        throw new BadRequestException("Anexe um arquivo (imagem ou PDF) para enviar ao RH.");
      }
    }

    // Salva documento de atestado / envio ao RH se enviado em base64
    if (
      (body.tipo === "ATESTADO" || body.tipo === "ENVIO_DOCUMENTO_RH") &&
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
        ...(body.tipo === "ENVIO_DOCUMENTO_RH" && typeof resto.nomeArquivo === "string"
          ? { nomeArquivo: resto.nomeArquivo }
          : {})
      };
    }

    const vaiDiretoAoRh = body.tipo === "ENVIO_DOCUMENTO_RH";

    const solicitacao = await this.prisma.solicitacao.create({
      data: {
        funcionarioId: func.id,
        tipo: body.tipo,
        dataReferencia: new Date(body.dataReferencia),
        dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
        dataFim: body.dataFim ? new Date(body.dataFim) : null,
        descricao: body.descricao,
        apenasInformativo: categoriaSemRegistroPonto(func.categoria) || vaiDiretoAoRh,
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

    return solicitacao;
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
    const duracaoCicloMeses = isEstagiario ? 6 : 12;
    const diasPorCiclo = 30; // Estagiário e CLT: 30 dias por ciclo (única regra do estagiário)
    // Estagiário não acumula ciclos; demais funcionários acumulam até 2
    const maxAcumulo = isEstagiario ? 1 : 2;

    const hoje = new Date();
    const admissao = new Date(func.dataAdmissao);

    const mesesTotal =
      (hoje.getFullYear() - admissao.getFullYear()) * 12 + (hoje.getMonth() - admissao.getMonth());
    const ciclosVencidos = Math.floor(mesesTotal / duracaoCicloMeses);

    if (ciclosVencidos === 0) {
      return {
        dataAdmissao: admissao,
        ciclosVencidos: 0,
        diasDisponiveis: 0,
        diasGozo: 0,
        diasVendidos: 0,
        totalVencido: 0,
        obrigatorio: false,
        isEstagiario,
        duracaoCicloMeses,
        diasPorCiclo,
        ciclos: []
      };
    }

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
    const diasDisponiveis = Math.max(0, totalVencido - diasGozo - diasVendidos);

    let obrigatorio: boolean;
    if (isEstagiario) {
      const mesesNoCicloAtual = mesesTotal % duracaoCicloMeses;
      obrigatorio = ciclosVencidos >= 1 && diasDisponiveis > 0 && mesesNoCicloAtual >= 5;
    } else {
      const mesesNoPeriodoAcumulo = mesesTotal % (maxAcumulo * 12);
      obrigatorio =
        ciclosVencidos >= maxAcumulo && diasDisponiveis > 0 && mesesNoPeriodoAcumulo >= 23;
    }

    const ciclosVisiveis = Math.min(ciclosVencidos, maxAcumulo);
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
    };

    const ciclosBase: CicloDetalhe[] = Array.from({ length: ciclosVisiveis }, (_, i) => {
      const cicloNum = ciclosVencidos - ciclosVisiveis + i + 1;
      const inicio = new Date(admissao);
      inicio.setMonth(admissao.getMonth() + (cicloNum - 1) * duracaoCicloMeses);
      const fim = new Date(inicio);
      fim.setMonth(fim.getMonth() + duracaoCicloMeses);
      fim.setDate(fim.getDate() - 1);
      return {
        numero: cicloNum,
        inicio,
        fim,
        diasPorCiclo,
        diasGozo: 0,
        diasVendidos: 0,
        diasDisponiveis: diasPorCiclo,
        status: "DISPONIVEL" as const,
        solicitacaoId: null,
        solicitacaoStatus: null
      };
    });

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
        const livre = Math.max(0, diasPorCiclo - ocupado);
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
      const disp = Math.max(0, diasPorCiclo - gozo - venda);
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
    let assinaturasAtualizadas = 0;
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

        for (const ym of [...meses].sort()) {
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

        try {
          const bh = await this.calcularBancoHorasAdmin(func.id);
          const saldo = bh.saldoAtualMinutos ?? 0;
          const pendentes = await this.prisma.assinaturaQuadro.findMany({
            where: {
              status: "PENDENTE_FUNCIONARIO",
              periodo: { funcionarioId: func.id }
            },
            select: { id: true }
          });
          for (const a of pendentes) {
            await this.prisma.assinaturaQuadro.update({
              where: { id: a.id },
              data: { bancoHorasSaldoTotalMinutos: saldo }
            });
            assinaturasAtualizadas++;
          }
        } catch (err) {
          erros.push({
            funcionarioId: func.id,
            erro: `BH: ${err instanceof Error ? err.message : String(err)}`
          });
        }
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
        user: { select: { createdAt: true } }
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
        select: { dataInicio: true, dataFim: true }
      }),
      this.prisma.feriadoConfig.findMany({
        where: { data: { gte: inicio, lte: fim } },
        select: { data: true, nome: true, marcoHorario: true, marcoLado: true }
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

    const inicioAtividades = func.user?.createdAt ? dataBrasiliaISO(func.user.createdAt) : null;

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
      { forcarSemIntervalo: categoriaSemIntervaloAlmoco(func.categoria) }
    );

    const horasExtrasMinutos = quadro.dias
      .filter((d) => (d.saldoMin ?? 0) > 0)
      .reduce((s, d) => s + (d.saldoMin ?? 0), 0);
    const horasFaltaMinutos = quadro.dias
      .filter((d) => (d.saldoMin ?? 0) < 0)
      .reduce((s, d) => s + Math.abs(d.saldoMin ?? 0), 0);
    const diasTrabalhados = quadro.dias.filter((d) => d.statusInterno === "OK").length;

    return {
      horasTrabalhadasMinutos: quadro.horasTrabalhadasMinutos,
      horasExtrasMinutos,
      horasFaltaMinutos,
      diasTrabalhados
    };
  }
}
