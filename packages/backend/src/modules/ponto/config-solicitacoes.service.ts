import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const DEFAULTS = {
  atestadoDiasLimiteSimples: 3,
  atestadoDiasLimiteInss: 14,
  atestadoMensagemOriginais: "Os originais devem ser entregues ao setor de RH.",
  feriasAntecedenciaMinDias: 30,
  feriasMinimoGrandePeriodo: 14,
  feriasMinimoOutrosPeriodos: 5,
  feriasMaxPeriodos: 3,
  feriasMaxDiasVenda: 10,
  feriasVedacaoPreFeriadoDias: 2,
  tipoAtivoCorrecaoPonto: true,
  tipoAtivoAtestado: true,
  tipoAtivoFerias: true,
  tipoAtivoLicenca: true,
  tipoAtivoAbono: true,
  tipoAtivoDayOff: true,
  tipoAtivoHoraExtra: true
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
    const allowed = Object.keys(DEFAULTS) as (keyof ConfigSolicitacoesData)[];
    const safe: Partial<ConfigSolicitacoesData> = {};
    for (const key of allowed) {
      if (key in data) (safe as Record<string, unknown>)[key] = data[key];
    }
    return this.prisma.configuracaoSolicitacoes.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...DEFAULTS, ...safe },
      update: safe
    }) as Promise<ConfigSolicitacoesData>;
  }
}
