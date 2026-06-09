import { Injectable, BadRequestException, NotFoundException, Logger } from "@nestjs/common";
import { TipoPonto, OrigemPonto } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { FotoService } from "./foto.service";
import { DocumentoService } from "./documento.service";
import { CreateRegistroDto } from "./dto/create-registro.dto";
import {
  horarioDeDataBrasilia,
  hojeBrasiliaISO,
  intervaloDiaBrasilia,
  validarHorarioPermitido
} from "../../utils/horario-brasilia";

@Injectable()
export class PontoService {
  private readonly logger = new Logger(PontoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fotoService: FotoService,
    private readonly documentoService: DocumentoService
  ) {}

  /* ─── Helpers ─── */

  /* Resolve Keycloak sub → User (via externalId) → Funcionario.
     Auto-cria o Funcionario se não existir (User já deve existir via /api/auth/me). */
  private async getFuncionario(keycloakSub: string) {
    const user = await this.prisma.user.findUnique({ where: { externalId: keycloakSub } });
    if (!user) {
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    }

    let f = await this.prisma.funcionario.findUnique({ where: { userId: user.id } });
    if (!f) {
      f = await this.prisma.funcionario.create({
        data: { userId: user.id, matricula: user.id.slice(0, 12), cargo: "A definir", ativo: true }
      });
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

  private validarHorarioAtualPonto() {
    return this.obterLimitesHorarioPonto().then((limites) => {
      const agora = horarioDeDataBrasilia(new Date());
      const validacao = validarHorarioPermitido(agora, limites.min, limites.max);
      if (!validacao.ok) {
        throw new BadRequestException(validacao.message);
      }
    });
  }

  private getAcoesPermitidas(registros: { tipo: string }[]) {
    const ultimo = registros[registros.length - 1];
    if (!ultimo) return ["ENTRADA"];
    if (ultimo.tipo === "ENTRADA") return ["INICIO_INTERVALO", "SAIDA"];
    if (ultimo.tipo === "INICIO_INTERVALO") return ["FIM_INTERVALO"];
    if (ultimo.tipo === "FIM_INTERVALO") return ["SAIDA"];
    return [];
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
    let estado: "FORA" | "TRABALHANDO" | "INTERVALO" = "FORA";

    if (ultimo) {
      if (ultimo.tipo === "ENTRADA" || ultimo.tipo === "FIM_INTERVALO") estado = "TRABALHANDO";
      else if (ultimo.tipo === "INICIO_INTERVALO") estado = "INTERVALO";
      else if (ultimo.tipo === "SAIDA") estado = "FORA";
    }

    const horasTrabalhadasMinutos = this.calcHorasMinutos(registros);

    const acoesPermitidas = this.getAcoesPermitidas(registros);

    return {
      estado,
      ultimoRegistro: ultimo ?? null,
      registrosHoje: registros,
      horasTrabalhadasMinutos,
      jornadaMinutos: func.jornadaHorasDia * 60,
      proximaAcao: acoesPermitidas[0] ?? null,
      acoesPermitidas
    };
  }

  /* ─── Calcular horas trabalhadas em minutos ─── */

  private calcHorasMinutos(registros: { tipo: string; dataHora: Date }[]) {
    let totalMinutos = 0;
    let entradaTs: Date | null = null;
    for (const r of registros) {
      if (r.tipo === "ENTRADA") {
        entradaTs = r.dataHora;
      } else if (r.tipo === "INICIO_INTERVALO" && entradaTs) {
        totalMinutos += Math.round((r.dataHora.getTime() - entradaTs.getTime()) / 60000);
        entradaTs = null;
      } else if (r.tipo === "FIM_INTERVALO") {
        entradaTs = r.dataHora;
      } else if (r.tipo === "SAIDA" && entradaTs) {
        totalMinutos += Math.round((r.dataHora.getTime() - entradaTs.getTime()) / 60000);
        entradaTs = null;
      }
    }

    /* Se ainda está trabalhando, conta até agora */
    if (entradaTs) {
      totalMinutos += Math.round((Date.now() - entradaTs.getTime()) / 60000);
    }

    return totalMinutos;
  }

  /* ─── Bater ponto ─── */

  async baterPonto(keycloakSub: string, dto: CreateRegistroDto) {
    const func = await this.getFuncionario(keycloakSub);
    await this.validarHorarioAtualPonto();
    const status = await this.getStatusAtual(keycloakSub);

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
    let dentroPerimetro = false;
    const origemEhMobile = (dto.origem ?? "WEB") === "MOBILE";

    if (origemEhMobile && sysConfig?.mobileCheckGeo) {
      /* Mobile com geo obrigatório: coordenadas são mandatórias */
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

    const registro = await this.prisma.registroPonto.create({
      data: {
        funcionarioId: func.id,
        tipo: dto.tipo as TipoPonto,
        dataHora: new Date(),
        origem: (dto.origem ?? "WEB") as OrigemPonto,
        latitude: dto.latitude,
        longitude: dto.longitude,
        dentroPerimetro,
        observacao: dto.observacao,
        fotoUrl: fotoUrl ?? null
      }
    });

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

    return { mes, ano, registros };
  }

  /* ─── Relatório mensal ─── */

  async getRelatorio(keycloakSub: string, mes: number, ano: number) {
    const func = await this.getFuncionario(keycloakSub);
    const { registros } = await this.getHistorico(keycloakSub, mes, ano);

    const diasTrabalhados = new Set(
      registros
        .filter((r: { tipo: string; dataHora: Date }) => r.tipo === "ENTRADA")
        .map((r: { tipo: string; dataHora: Date }) => r.dataHora.toDateString())
    ).size;

    const horasTrabalhadasMinutos = this.calcHorasMinutos(registros);
    const horasEsperadasMinutos = diasTrabalhados * func.jornadaHorasDia * 60;
    const saldoMinutos = horasTrabalhadasMinutos - horasEsperadasMinutos;

    return {
      mes,
      ano,
      funcionario: { id: func.id, matricula: func.matricula, cargo: func.cargo },
      diasTrabalhados,
      horasTrabalhadasMinutos,
      horasEsperadasMinutos,
      horasExtrasMinutos: Math.max(0, saldoMinutos),
      horasFaltaMinutos: Math.max(0, -saldoMinutos),
      saldoMinutos
    };
  }

  /* ─── Solicitações ─── */

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

    let metadados = body.metadados ?? null;

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
}
