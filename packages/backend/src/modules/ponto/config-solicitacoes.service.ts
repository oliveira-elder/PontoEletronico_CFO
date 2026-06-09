import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const DEFAULTS = {
  atestadoDiasLimiteSimples: 3,
  atestadoDiasLimiteInss: 14,
  atestadoGuiaUrl: null as string | null,
  atestadoMensagemOriginais: "Os originais devem ser entregues ao setor de RH.",
  feriasAntecedenciaMinDias: 30,
  feriasMinimoGrandePeriodo: 14,
  feriasMinimoOutrosPeriodos: 5,
  feriasMaxPeriodos: 3,
  feriasMaxDiasVenda: 10,
  feriasVedacaoPreFeriadoDias: 2
};

export type ConfigSolicitacoesData = typeof DEFAULTS;

@Injectable()
export class ConfigSolicitacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<ConfigSolicitacoesData> {
    const row = await this.prisma.configuracaoSolicitacoes.findUnique({
      where: { id: "singleton" }
    });
    return (row ?? DEFAULTS) as ConfigSolicitacoesData;
  }

  async updateConfig(data: Partial<ConfigSolicitacoesData>): Promise<ConfigSolicitacoesData> {
    return this.prisma.configuracaoSolicitacoes.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...DEFAULTS, ...data },
      update: data
    }) as Promise<ConfigSolicitacoesData>;
  }
}
