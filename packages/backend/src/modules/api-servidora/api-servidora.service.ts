import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes, createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

export type FeriadoSyncAction = "create" | "update" | "delete" | "import" | "toggle";

@Injectable()
export class ApiServidoraService {
  private readonly logger = new Logger(ApiServidoraService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getApiBaseUrl(): string {
    return (process.env.PUBLIC_API_BASE_URL ?? "http://192.168.161.50:12003/api").replace(
      /\/$/,
      ""
    );
  }

  getPublicApiConfig() {
    const apiBaseUrl = this.getApiBaseUrl();
    const endpointBase = `${apiBaseUrl}/api-publica/v1`;
    const apiHost = apiBaseUrl.replace(/\/api$/, "");

    return {
      schemaVersion: "v1",
      systemKey: process.env.API_PUBLICA_SYSTEM_KEY ?? "ponto-eletronico-cfo",
      apiBaseUrl,
      apiHost,
      endpointBase,
      feriadoSyncMode: "automatic" as const,
      endpoints: {
        feriados: `${endpointBase}/feriados`,
        configuracoes: `${endpointBase}/configuracoes`
      },
      instructions:
        "Alterações manuais no calendário de feriados são publicadas automaticamente na API pública com todos os anos configurados (sem filtro de ano). Sistemas externos devem consultar GET /feriados (pull) ou configurar FERIADO_SYNC_WEBHOOK_URLS para receber notificações push."
    };
  }

  /** Publica alterações de feriados para webhooks configurados e registra log de sync. */
  async notifyFeriadosChanged(
    action: FeriadoSyncAction,
    meta?: Record<string, unknown>
  ): Promise<{ ok: boolean; webhooksNotified: number }> {
    const payload = await this.getFeriados();
    const event = {
      event: "feriados.updated",
      action,
      ...payload,
      meta: meta ?? null
    };

    const urls = (process.env.FERIADO_SYNC_WEBHOOK_URLS ?? "")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);

    let webhooksNotified = 0;
    for (const url of urls) {
      try {
        const ok = await this.postWebhook(url, event);
        if (ok) webhooksNotified++;
      } catch (err) {
        this.logger.warn(`Webhook feriados falhou (${url}): ${String(err)}`);
      }
    }

    await this.prisma.syncLog.create({
      data: {
        source: "feriados-api",
        status: "success",
        details: {
          action,
          totalFeriados: payload.totalFeriados,
          anosDisponiveis: payload.anosDisponiveis,
          webhooksNotified,
          geradoEm: payload.geradoEm
        }
      }
    });

    return { ok: true, webhooksNotified };
  }

  private async postWebhook(url: string, body: Record<string, unknown>): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const webhookKey = process.env.FERIADO_SYNC_WEBHOOK_KEY?.trim();
      if (webhookKey) headers["x-feriado-sync-key"] = webhookKey;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      return res.ok || res.status === 202;
    } finally {
      clearTimeout(timeout);
    }
  }

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

    const anosDisponiveis = [...new Set(feriados.map((f) => f.data.getUTCFullYear()))].sort(
      (a, b) => a - b
    );

    return {
      schemaVersion: "v1",
      geradoEm: new Date().toISOString(),
      source: process.env.API_PUBLICA_SYSTEM_KEY ?? "ponto-eletronico-cfo",
      totalFeriados: feriados.length,
      anosDisponiveis,
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
            atestadoPrazoEnvioDias: solicitacoes.atestadoPrazoEnvioDias,
            feriasAntecedenciaMinDias: solicitacoes.feriasAntecedenciaMinDias,
            feriasMinimoGrandePeriodo: solicitacoes.feriasMinimoGrandePeriodo,
            feriasMaxPeriodos: solicitacoes.feriasMaxPeriodos
          }
        : null,
      calendarioFeriados: feriados
    };
  }
}
