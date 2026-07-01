import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ApiServidoraService {
  constructor(private readonly prisma: PrismaService) {}

  async createToken(
    name: string,
    description: string | undefined,
    createdById: string,
    expiresAt?: Date
  ) {
    const rawToken = "cfo_" + randomBytes(28).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const tokenPrefix = rawToken.slice(0, 12);

    await this.prisma.apiToken.create({
      data: { name, description, tokenHash, tokenPrefix, createdById, expiresAt: expiresAt ?? null }
    });

    // Token pleno retornado apenas nesta resposta
    return { tokenPrefix, token: rawToken, name, description };
  }

  async listTokens() {
    return this.prisma.apiToken.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        tokenPrefix: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true
      }
    });
  }

  async revokeToken(id: string) {
    const token = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!token) throw new NotFoundException("Token não encontrado.");
    await this.prisma.apiToken.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  async deleteToken(id: string) {
    const token = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!token) throw new NotFoundException("Token não encontrado.");
    await this.prisma.apiToken.delete({ where: { id } });
    return { ok: true };
  }

  async getFeriados() {
    const feriados = await this.prisma.feriadoConfig.findMany({
      orderBy: { data: "asc" },
      select: {
        id: true,
        data: true,
        nome: true,
        tipo: true,
        bloqueiaRegistro: true,
        origem: true,
        observacao: true,
        marcoHorario: true,
        marcoLado: true
      }
    });

    return {
      schemaVersion: "v1",
      geradoEm: new Date().toISOString(),
      source: process.env.API_PUBLICA_SYSTEM_KEY ?? "ponto-eletronico-cfo",
      totalFeriados: feriados.length,
      feriados: feriados.map((f) => ({
        id: f.id,
        data: f.data.toISOString().slice(0, 10),
        nome: f.nome,
        tipo: f.tipo,
        bloqueiaRegistro: f.bloqueiaRegistro,
        origem: f.origem,
        observacao: f.observacao ?? null,
        marcoHorario: f.marcoHorario ?? null,
        marcoLado: f.marcoLado ?? null
      }))
    };
  }

  async getConfiguracoes() {
    const [config, feriados, solicitacoes] = await Promise.all([
      this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } }),
      this.getFeriados(),
      this.prisma.configuracaoSolicitacoes.findUnique({ where: { id: "singleton" } })
    ]);

    return {
      schemaVersion: "v1",
      geradoEm: new Date().toISOString(),
      source: process.env.API_PUBLICA_SYSTEM_KEY ?? "ponto-eletronico-cfo",
      configuracaoSistema: config
        ? {
            horaEntrada: config.horaEntrada,
            horaSaida: config.horaSaida,
            jornadaDiariaMin: config.jornadaDiariaMin,
            jornadaSemanalMin: config.jornadaSemanalMin,
            diasUteis: config.diasUteis,
            toleranciaEntradaMin: config.toleranciaEntradaMin,
            toleranciaSaidaMin: config.toleranciaSaidaMin,
            almocoPodeIniciarA: config.almocoPodeIniciarA,
            almocoPodeIniciarAte: config.almocoPodeIniciarAte,
            almocoMinMin: config.almocoMinMin,
            almocoMaxMin: config.almocoMaxMin
          }
        : null,
      configuracaoSolicitacoes: solicitacoes
        ? {
            atestadoDiasLimiteSimples: solicitacoes.atestadoDiasLimiteSimples,
            atestadoDiasLimiteInss: solicitacoes.atestadoDiasLimiteInss,
            feriasAntecedenciaMinDias: solicitacoes.feriasAntecedenciaMinDias,
            feriasMinimoGrandePeriodo: solicitacoes.feriasMinimoGrandePeriodo,
            feriasMaxPeriodos: solicitacoes.feriasMaxPeriodos
          }
        : null,
      calendarioFeriados: feriados
    };
  }
}
