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
import { CreateRegistroDto } from "./dto/create-registro.dto";
import {
  dataBrasiliaISO,
  horarioDeDataBrasilia,
  hojeBrasiliaISO,
  intervaloDiaBrasilia,
  validarHorarioPermitido
} from "../../utils/horario-brasilia";
import { appendObservacao } from "../../utils/registro-observacoes";
import { montarRelatorioQuadro } from "../../utils/historico-quadro";
import {
  jornadaEsperadaMin,
  resolverJornadaHistoricoContexto
} from "../../utils/jornada-historico";

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
  HORA_EXTRA: "Hora Extra"
};

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
  PAUSA_MANHA: ["REINICIAR_EXPEDIENTE", "INICIO_INTERVALO"],
  ALMOCO: ["FIM_INTERVALO"],
  TARDE: ["INTERROMPER_EXPEDIENTE", "SAIDA"],
  PAUSA_TARDE: ["REINICIAR_EXPEDIENTE"],
  ENCERRADA: []
};

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
    private readonly feriadoConfigService: FeriadoConfigService
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
        jornadaPeriodo: { select: { jornadaDiariaMin: true } }
      }
    });
    return resolverJornadaHistoricoContexto(func);
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
      toleranciaEntradaMin: cfg?.toleranciaEntradaMin ?? 15,
      toleranciaSaidaMin: cfg?.toleranciaSaidaMin ?? 15,
      toleranciaHoraExtraMin: cfg?.toleranciaHoraExtraMin ?? 10,
      toleranciaCalculoMin: cfg?.toleranciaCalculoMin ?? 5,
      almocoPodeIniciarA: cfg?.almocoPodeIniciarA ?? "11:30",
      almocoPodeIniciarAte: cfg?.almocoPodeIniciarAte ?? "13:00",
      almocoMinMin: cfg?.almocoMinMin ?? 60,
      almocoMaxMin: cfg?.almocoMaxMin ?? 90,
      bancoHorasLimiteMin: cfg?.bancoHorasLimiteMin ?? 120,
      bancoHorasVigenciaDias: cfg?.bancoHorasVigenciaDias ?? 30,
      horaExtraLimiteAuto: cfg?.horaExtraLimiteAuto ?? 120
    };
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
     dentro dos períodos da manhã (antes do almoço) e da tarde (depois). */
  private getFaseEAcoes(registros: { tipo: string }[]): {
    fase: FaseJornada;
    acoesPermitidas: string[];
  } {
    let fase: FaseJornada = "NENHUMA";
    for (const r of registros) {
      switch (r.tipo) {
        case "ENTRADA":
          fase = "MANHA";
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
    return { fase, acoesPermitidas: ACOES_POR_FASE[fase] };
  }

  /* ─── Status atual (hoje) ─── */

  async getStatusAtual(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    const { inicio, fim } = intervaloDiaBrasilia(hojeBrasiliaISO());

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

    const horasTrabalhadasMinutos = this.calcHorasMinutos(registros);

    const afastamento = await this.getAfastamentoDoDia(func.id, hojeBrasiliaISO());
    const afastamentoHoje = afastamento
      ? {
          tipo: afastamento.tipo,
          label: TIPO_AFASTAMENTO_LABEL[afastamento.tipo] ?? afastamento.tipo,
          dataInicio: dataBrasiliaISO(afastamento.dataInicio),
          dataFim: dataBrasiliaISO(afastamento.dataFim)
        }
      : null;

    const { fase, acoesPermitidas: acoesPorFase } = this.getFaseEAcoes(registros);
    const acoesPermitidas = afastamentoHoje ? [] : acoesPorFase;
    const estado = afastamentoHoje ? "FORA" : ESTADO_POR_FASE[fase];

    const jornada = await this.getJornadaEfetiva(func.id);

    return {
      estado,
      fase,
      ultimoRegistro: ultimo ?? null,
      registrosHoje: registros,
      horasTrabalhadasMinutos,
      jornadaMinutos: jornada.jornadaDiariaMin,
      proximaAcao: acoesPermitidas[0] ?? null,
      acoesPermitidas,
      afastamentoHoje,
      categoria: func.categoria,
      modoHomeOffice: func.modoHomeOffice,
      modoHibridoLocal: func.modoHibridoLocal,
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
        dataInicio: { lte: diaSeguinte },
        dataFim: { gte: diaAnterior }
      },
      select: { tipo: true, dataInicio: true, dataFim: true }
    });

    return candidatos.find((a) => {
      const inicio = dataBrasiliaISO(a.dataInicio);
      const fim = dataBrasiliaISO(a.dataFim);
      return diaISO >= inicio && diaISO <= fim;
    });
  }

  /* ─── Calcular horas trabalhadas em minutos ─── */

  /**
   * @param capMs  Timestamp máximo para contar tempo em aberto (entrada sem saída).
   *               Se omitido, usa Date.now() — adequado para o dia de hoje.
   *               Para dias históricos passe o fim-do-dia para evitar contagem
   *               acumulada de dias anteriores sem registro de saída.
   */
  private calcHorasMinutos(registros: { tipo: string; dataHora: Date }[], capMs?: number) {
    let totalMinutos = 0;
    let entradaTs: Date | null = null;
    for (const r of registros) {
      if (r.tipo === "ENTRADA" || r.tipo === "REINICIAR_EXPEDIENTE") {
        entradaTs = r.dataHora;
      } else if (
        (r.tipo === "INICIO_INTERVALO" || r.tipo === "INTERROMPER_EXPEDIENTE") &&
        entradaTs
      ) {
        totalMinutos += Math.round((r.dataHora.getTime() - entradaTs.getTime()) / 60000);
        entradaTs = null;
      } else if (r.tipo === "FIM_INTERVALO") {
        entradaTs = r.dataHora;
      } else if (r.tipo === "SAIDA" && entradaTs) {
        totalMinutos += Math.round((r.dataHora.getTime() - entradaTs.getTime()) / 60000);
        entradaTs = null;
      }
    }

    /* Entrada sem saída: conta até o cap (fim do dia histórico) ou até agora (hoje) */
    if (entradaTs) {
      const fim = capMs ?? Date.now();
      totalMinutos += Math.round((fim - entradaTs.getTime()) / 60000);
    }

    return totalMinutos;
  }

  /* ─── Bater ponto ─── */

  async baterPonto(keycloakSub: string, dto: CreateRegistroDto) {
    const func = await this.getFuncionario(keycloakSub);

    const categoriasNaoPermitidas = ["ASSESSOR", "GERENTE"] as const;
    if (categoriasNaoPermitidas.includes(func.categoria as never)) {
      throw new BadRequestException(
        `Funcionários na categoria ${func.categoria === "ASSESSOR" ? "Assessor" : "Gerente"} não registram ponto eletrônico.`
      );
    }

    await this.validarHorarioAtualPonto();

    const hoje = new Date();
    const feriadoBloq = await this.feriadoConfigService.isBloqueado(hoje);
    if (feriadoBloq.bloqueado) {
      throw new BadRequestException(
        `Registro de ponto bloqueado: hoje é feriado (${feriadoBloq.nome ?? ""}). Entre em contato com o RH se precisar registrar.`
      );
    }

    const status = await this.getStatusAtual(keycloakSub);

    if (status.afastamentoHoje) {
      throw new BadRequestException(
        `Você está em ${status.afastamentoHoje.label} hoje. Não é possível registrar ponto.`
      );
    }

    /* Validação de sequência */
    const permitidas = status.acoesPermitidas;
    if (!permitidas.includes(dto.tipo)) {
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

    /* Pulo direto de "pausado de manhã" para "início do almoço": só permitido
       dentro da janela de almoço configurada (defesa em profundidade — o
       frontend já só exibe esse botão dentro da janela). */
    if (dto.tipo === "INICIO_INTERVALO" && status.fase === "PAUSA_MANHA") {
      const jornada = await this.getJornadaEfetiva(func.id);
      const agora = horarioDeDataBrasilia(new Date());
      const validacao = validarHorarioPermitido(
        agora,
        jornada.almocoPodeIniciarA,
        jornada.almocoPodeIniciarAte
      );
      if (!validacao.ok) {
        throw new BadRequestException(
          `Início do almoço só é permitido entre ${jornada.almocoPodeIniciarA} e ${jornada.almocoPodeIniciarAte}. ` +
            `Use "Reiniciar Expediente" para retomar o trabalho.`
        );
      }
    }

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

    /* Encerrar a jornada sem ter feito o intervalo de almoço (ex.: após
       Interromper/Reiniciar Expediente pela manhã): completa as posições
       de Início/Fim do Almoço no histórico com o mesmo horário da Saída
       (1–2ms antes, só para preservar a ordenação) e registra o motivo
       nas observações de cada um. */
    if (dto.tipo === "SAIDA" && status.fase === "MANHA") {
      const observacaoAjuste = {
        data: agora.toISOString(),
        tipo: "AJUSTE_AUTOMATICO" as const,
        texto: "Intervalo de almoço não realizado — jornada encerrada antes do horário de almoço."
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
        fotoUrl: fotoUrl ?? null
      }
    });

    /* Verifica hora extra acima do limite configurado e cria solicitação automática */
    if (dto.tipo === "SAIDA") {
      this.verificarHoraExtraAuto(func.id).catch(() => {});
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

  async getHistorico(keycloakSub: string, mes: number, ano: number) {
    const func = await this.getFuncionario(keycloakSub);
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
        observacoes: true
      }
    });

    /* Janela com folga de 1 dia para evitar perder afastamentos cujo dataInicio/dataFim
       (gravados em UTC à meia-noite) caem fora do intervalo Brasília do mês por causa
       do fuso horário (ex.: afastamento no dia 1 do mês). */
    const inicioBuffer = new Date(inicio);
    inicioBuffer.setUTCDate(inicioBuffer.getUTCDate() - 1);
    const fimBuffer = new Date(fim);
    fimBuffer.setUTCDate(fimBuffer.getUTCDate() + 1);

    const afastamentos = await this.prisma.afastamento.findMany({
      where: {
        funcionarioId: func.id,
        dataInicio: { lte: fimBuffer },
        dataFim: { gte: inicioBuffer }
      },
      orderBy: { dataInicio: "asc" },
      select: { tipo: true, dataInicio: true, dataFim: true, justificativa: true }
    });

    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, nome: true, tipo: true }
    });

    const cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { bancoHorasSabadoPct: true, bancoHorasDomingoPct: true, bancoHorasFeriadoPct: true }
    });

    const jornada = await this.getJornadaHistoricoContexto(func.id);

    return {
      mes,
      ano,
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

  async getRelatorio(keycloakSub: string, mes: number, ano: number) {
    const [func, historico] = await Promise.all([
      this.getFuncionario(keycloakSub),
      this.getHistorico(keycloakSub, mes, ano)
    ]);

    const quadro = montarRelatorioQuadro(
      historico.registros,
      historico.afastamentos,
      mes,
      ano,
      historico.jornada,
      historico.feriados,
      historico.multiplicadores.sabadoPct,
      historico.multiplicadores.domingoPct,
      historico.multiplicadores.feriadoPct
    );

    const jornadaCtx = historico.jornada;
    const horasEsperadasMinutos = quadro.dias.reduce((s, d) => {
      if (d.statusInterno === "FALTA") return s + jornadaEsperadaMin(d.iso, jornadaCtx);
      if ((d.statusInterno === "OK" || d.statusInterno === "PENDENTE") && !d.multiplicadorPct) {
        return s + jornadaEsperadaMin(d.iso, jornadaCtx);
      }
      return s;
    }, 0);

    const saldoMinutos = quadro.saldoMinutos;

    return {
      mes,
      ano,
      funcionario: { id: func.id, matricula: func.matricula, cargo: func.cargo },
      diasTrabalhados: quadro.diasTrabalhados,
      horasTrabalhadasMinutos: quadro.horasTrabalhadasMinutos,
      horasEsperadasMinutos,
      horasExtrasMinutos: Math.max(0, saldoMinutos),
      horasFaltaMinutos: Math.max(0, -saldoMinutos),
      saldoMinutos
    };
  }

  /* ─── Banco de Horas ─── */

  async getBancoHoras(keycloakSub: string) {
    const func = await this.getFuncionario(keycloakSub);
    return this.calcularBancoHoras(func.id);
  }

  /** Calcula o saldo do banco de horas do ciclo atual, iterando todos os dias
   *  úteis (seg–sex conforme diasUteis) e contabilizando feriados e afastamentos
   *  como saldo neutro (0), e faltas como saldo negativo. */
  private async calcularBancoHoras(funcionarioId: string) {
    const jornada = await this.getJornadaEfetiva(funcionarioId);
    const jornadaCtx = await this.getJornadaHistoricoContexto(funcionarioId);

    const diasUteisCfg: boolean[] = JSON.parse(
      typeof jornada.diasUteis === "string"
        ? jornada.diasUteis
        : "[false,true,true,true,true,true,false]"
    );

    const marcos = await this.prisma.bancoHorasMarco.findMany({ orderBy: { data: "asc" } });
    const hojeIso = hojeBrasiliaISO();
    const marcosIso = marcos.map((m) => dataBrasiliaISO(m.data));
    const marcosPassados = marcosIso.filter((d) => d <= hojeIso);
    const marcosFuturos = marcosIso.filter((d) => d > hojeIso);

    let cicloInicio: string | null = null;
    if (marcosPassados.length > 0) {
      const ultimaMarco = marcosPassados[marcosPassados.length - 1];
      const d = new Date(`${ultimaMarco}T00:00:00-03:00`);
      d.setUTCDate(d.getUTCDate() + 1);
      cicloInicio = dataBrasiliaISO(d);
    }
    const proximaZeragem = marcosFuturos.length > 0 ? marcosFuturos[0] : null;

    // Sem marco: inicia do primeiro registro do funcionário (evita iterar desde 1970)
    let cicloInicioEfetivo = cicloInicio;
    if (!cicloInicioEfetivo) {
      const primeiroRegistro = await this.prisma.registroPonto.findFirst({
        where: { funcionarioId },
        orderBy: { dataHora: "asc" },
        select: { dataHora: true }
      });
      cicloInicioEfetivo = primeiroRegistro ? dataBrasiliaISO(primeiroRegistro.dataHora) : hojeIso;
    }

    const { inicio } = intervaloDiaBrasilia(cicloInicioEfetivo);
    const { fim } = intervaloDiaBrasilia(hojeIso);

    // Todos os registros do ciclo, agrupados por dia civil (Brasília)
    const registros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" },
      select: { tipo: true, dataHora: true }
    });

    const porDia = new Map<string, { tipo: string; dataHora: Date }[]>();
    for (const r of registros) {
      const key = dataBrasiliaISO(r.dataHora);
      if (!porDia.has(key)) porDia.set(key, []);
      porDia.get(key)!.push(r);
    }

    // Afastamentos aprovados que interceptam o ciclo
    const afastamentos = await this.prisma.afastamento.findMany({
      where: { funcionarioId, dataInicio: { lte: fim }, dataFim: { gte: inicio } },
      select: { dataInicio: true, dataFim: true }
    });

    // Todos os feriados do ciclo (inclusive os que não bloqueiam registro)
    const feriados = await this.prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, nome: true }
    });
    const feriadoMap = new Map(feriados.map((f) => [dataBrasiliaISO(f.data), f.nome]));

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
      const nomeFeriado = feriadoMap.get(dataAtual);
      const afastamento = afastamentos.find((a) => {
        const aInicio = dataBrasiliaISO(a.dataInicio);
        const aFim = dataBrasiliaISO(a.dataFim);
        return dataAtual >= aInicio && dataAtual <= aFim;
      });
      const regsDodia = porDia.get(dataAtual) ?? [];
      const eHoje = dataAtual === hojeIso;
      const capMs = eHoje ? undefined : new Date(`${dataAtual}T23:59:59-03:00`).getTime();

      if (eDiaUtil) {
        // Dia útil normal
        const horasTrabalhadasMinutos = this.calcHorasMinutos(regsDodia, capMs);
        let saldoDiaMinutos: number;
        let jornadaDia: number;
        let obs: string | undefined;

        if (afastamento) {
          // Afastamento: saldo neutro
          saldoDiaMinutos = 0;
          jornadaDia = 0;
          obs = "Afastamento";
        } else if (nomeFeriado && regsDodia.length > 0) {
          // Feriado trabalhado: aplica multiplicador, jornadaMin = 0
          saldoDiaMinutos = Math.round((horasTrabalhadasMinutos * feriadoPct) / 100);
          jornadaDia = 0;
          obs = `Feriado trabalhado: ${nomeFeriado} (${feriadoPct}%)`;
        } else if (nomeFeriado) {
          // Feriado sem trabalho: neutro
          saldoDiaMinutos = 0;
          jornadaDia = 0;
          obs = `Feriado: ${nomeFeriado}`;
        } else {
          // Dia útil normal — jornada conforme vigência do período
          const jornadaDiaMin = this.jornadaDiariaParaDia(jornadaCtx, dataAtual);
          saldoDiaMinutos = horasTrabalhadasMinutos - jornadaDiaMin;
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
      } else if (!afastamento && regsDodia.length > 0) {
        // Fim de semana COM registros: aplica multiplicador
        const horasTrabalhadasMinutos = this.calcHorasMinutos(regsDodia, capMs);
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
      proximaZeragem,
      limiteMinutos: jornada.bancoHorasLimiteMin,
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
    const [jornada, solCfg] = await Promise.all([
      this.getJornadaEfetiva(funcionarioId),
      this.prisma.configuracaoSolicitacoes.findUnique({
        where: { id: "singleton" },
        select: { tipoAtivoHoraExtra: true }
      })
    ]);

    if (solCfg?.tipoAtivoHoraExtra === false) return;

    const limiteMin = jornada.horaExtraLimiteAuto;
    const hoje = hojeBrasiliaISO();
    const { inicio, fim } = intervaloDiaBrasilia(hoje);

    const registros = await this.prisma.registroPonto.findMany({
      where: { funcionarioId, dataHora: { gte: inicio, lte: fim } },
      orderBy: { dataHora: "asc" },
      select: { tipo: true, dataHora: true }
    });

    const overtime = this.calcHorasMinutos(registros) - jornada.jornadaDiariaMin;
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
      select: { id: true, tipo: true, dataReferencia: true, dataInicio: true, dataFim: true }
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

    const conflito = aprovadas.find((s) => {
      // Pula o conflito com a solicitação que está sendo substituída
      if (alteracaoDeId && s.id === alteracaoDeId) return false;
      const inicioExist = s.dataInicio ?? s.dataReferencia;
      const fimExist = s.dataFim ?? inicioExist;
      return novoInicio <= fimExist && novoFim >= inicioExist;
    });

    if (conflito) {
      throw new BadRequestException(
        `Já existe uma solicitação de ${TIPO_SOLICITACAO_LABEL[conflito.tipo] ?? conflito.tipo} aprovada cobrindo este período. Não é possível abrir uma nova solicitação para o(s) mesmo(s) dia(s).`
      );
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

    // Salva documento de atestado se enviado em base64
    if (body.tipo === "ATESTADO" && metadados && typeof metadados.documentoBase64 === "string") {
      const url = await this.documentoService.salvarDocumento({
        funcionarioId: func.id,
        solicitacaoId: `${func.id}-${Date.now()}`,
        arquivoBase64: metadados.documentoBase64 as string,
        mimeType: (metadados.documentoMime as string) ?? undefined
      });
      const resto = { ...(metadados as Record<string, unknown>) };
      delete resto.documentoBase64;
      delete resto.documentoMime;
      metadados = { ...resto, documentoUrl: url };
    }

    return this.prisma.solicitacao.create({
      data: {
        funcionarioId: func.id,
        tipo: body.tipo,
        dataReferencia: new Date(body.dataReferencia),
        dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
        dataFim: body.dataFim ? new Date(body.dataFim) : null,
        descricao: body.descricao,
        metadados: metadados ? JSON.parse(JSON.stringify(metadados)) : undefined
      }
    });
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
    const diasPorCiclo = isEstagiario ? 15 : 30;
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
        obrigatorio: false,
        isEstagiario,
        duracaoCicloMeses,
        ciclos: []
      };
    }

    // Dias já consumidos (aprovados)
    const aprovadas = await this.prisma.solicitacao.findMany({
      where: { funcionarioId, tipo: "FERIAS", status: "APROVADA" },
      select: { metadados: true }
    });

    let diasGozo = 0;
    let diasVendidos = 0;
    for (const s of aprovadas) {
      const m = (s.metadados ?? {}) as Record<string, unknown>;
      diasGozo += Number(m.totalDiasGozo ?? 0);
      diasVendidos += Number(m.diasVendidos ?? 0);
    }

    const totalVencido = Math.min(ciclosVencidos, maxAcumulo) * diasPorCiclo;
    const diasDisponiveis = Math.max(0, totalVencido - diasGozo - diasVendidos);

    let obrigatorio: boolean;
    if (isEstagiario) {
      // Estagiário: obrigatório a partir do 5º mês do ciclo atual (ciclo dura 6 meses)
      const mesesNoCicloAtual = mesesTotal % duracaoCicloMeses;
      obrigatorio = ciclosVencidos >= 1 && diasDisponiveis > 0 && mesesNoCicloAtual >= 5;
    } else {
      // Demais: obrigatório no 23º+ mês do período de acúmulo (2 ciclos = 24 meses)
      const mesesNoPeriodoAcumulo = mesesTotal % (maxAcumulo * 12);
      obrigatorio =
        ciclosVencidos >= maxAcumulo && diasDisponiveis > 0 && mesesNoPeriodoAcumulo >= 23;
    }

    const ciclosVisiveis = Math.min(ciclosVencidos, maxAcumulo);
    const ciclos = Array.from({ length: ciclosVisiveis }, (_, i) => {
      const cicloNum = ciclosVencidos - ciclosVisiveis + i + 1;
      const inicio = new Date(admissao);
      inicio.setMonth(admissao.getMonth() + (cicloNum - 1) * duracaoCicloMeses);
      const fim = new Date(inicio);
      fim.setMonth(fim.getMonth() + duracaoCicloMeses);
      fim.setDate(fim.getDate() - 1);
      return { numero: cicloNum, inicio, fim };
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
}
