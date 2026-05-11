import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { TipoPonto, OrigemPonto } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateRegistroDto } from "./dto/create-registro.dto";

@Injectable()
export class PontoService {
  constructor(private readonly prisma: PrismaService) {}

  /* ─── Helpers ─── */

  private async getFuncionario(userId: string) {
    const f = await this.prisma.funcionario.findUnique({ where: { userId } });
    if (!f) throw new NotFoundException("Funcionário não encontrado para este usuário.");
    return f;
  }

  private startOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(date: Date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
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

  async getStatusAtual(userId: string) {
    const func = await this.getFuncionario(userId);
    const hoje = new Date();

    const registros = await this.prisma.registroPonto.findMany({
      where: {
        funcionarioId: func.id,
        dataHora: {
          gte: this.startOfDay(hoje),
          lte: this.endOfDay(hoje)
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

  async baterPonto(userId: string, dto: CreateRegistroDto) {
    const func = await this.getFuncionario(userId);
    const status = await this.getStatusAtual(userId);

    /* Validação de sequência */
    const permitidas = status.acoesPermitidas;
    if (!permitidas.includes(dto.tipo)) {
      throw new BadRequestException(
        permitidas.length
          ? `Sequência inválida. Próxima ação esperada: ${permitidas.join(" ou ")}. Recebido: ${dto.tipo}`
          : `Jornada já encerrada. Não há novas ações permitidas hoje. Recebido: ${dto.tipo}`
      );
    }

    const registro = await this.prisma.registroPonto.create({
      data: {
        funcionarioId: func.id,
        tipo: dto.tipo as TipoPonto,
        dataHora: new Date(),
        origem: (dto.origem ?? "WEB") as OrigemPonto,
        latitude: dto.latitude,
        longitude: dto.longitude,
        observacao: dto.observacao
      }
    });

    return registro;
  }

  /* ─── Histórico (paginado por mês) ─── */

  async getHistorico(userId: string, mes: number, ano: number) {
    const func = await this.getFuncionario(userId);
    const inicio = new Date(ano, mes - 1, 1, 0, 0, 0);
    const fim = new Date(ano, mes, 0, 23, 59, 59);

    const registros = await this.prisma.registroPonto.findMany({
      where: {
        funcionarioId: func.id,
        dataHora: { gte: inicio, lte: fim }
      },
      orderBy: { dataHora: "asc" }
    });

    return { mes, ano, registros };
  }

  /* ─── Relatório mensal ─── */

  async getRelatorio(userId: string, mes: number, ano: number) {
    const func = await this.getFuncionario(userId);
    const { registros } = await this.getHistorico(userId, mes, ano);

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

  async getSolicitacoes(userId: string) {
    const func = await this.getFuncionario(userId);
    return this.prisma.solicitacao.findMany({
      where: { funcionarioId: func.id },
      orderBy: { createdAt: "desc" }
    });
  }

  async criarSolicitacao(
    userId: string,
    body: { tipo: string; dataReferencia: string; descricao: string }
  ) {
    const func = await this.getFuncionario(userId);
    return this.prisma.solicitacao.create({
      data: {
        funcionarioId: func.id,
        tipo: body.tipo,
        dataReferencia: new Date(body.dataReferencia),
        descricao: body.descricao
      }
    });
  }
}
