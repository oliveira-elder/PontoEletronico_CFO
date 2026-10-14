import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const DEFAULTS = {
  atestadoDiasLimiteSimples: 3,
  atestadoDiasLimiteInss: 14,
  atestadoPrazoEnvioDias: 2,
  atestadoTempoRetornoMin: 60,
  atestadoTempoIdaMin: 60,
  atestadoMensagemOriginais: "Os originais devem ser entregues ao setor de RH.",
  feriasAntecedenciaMinDias: 30,
  feriasMinimoGrandePeriodo: 14,
  feriasMinimoOutrosPeriodos: 5,
  feriasMaxPeriodos: 3,
  feriasMaxDiasVenda: 10,
  feriasVedacaoPreFeriadoDias: 1,
  feriasRodadaAvisoDias: 45,
  tipoAtivoCorrecaoPonto: true,
  tipoAtivoAtestado: true,
  tipoAtivoFerias: true,
  tipoAtivoLicenca: true,
  tipoAtivoAbono: true,
  tipoAtivoDayOff: true,
  tipoAtivoHoraExtra: true,
  tipoAtivoEnvioDocumentoRh: true,
  abonoAlemLimiteLiberadoRh: true,
  abonoCotaDiasDoisCiclos: 0,
  atestadoCidModo: "OBRIGATORIO" as string
};

export type ConfigSolicitacoesData = typeof DEFAULTS;

@Injectable()
export class ConfigSolicitacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<ConfigSolicitacoesData> {
    const row = await this.prisma.configuracaoSolicitacoes.findUnique({
      where: { id: "singleton" }
    });
    return { ...DEFAULTS, ...(row ?? {}) } as ConfigSolicitacoesData;
  }

  async updateConfig(data: Partial<ConfigSolicitacoesData>): Promise<ConfigSolicitacoesData> {
    const allowed = Object.keys(DEFAULTS) as (keyof ConfigSolicitacoesData)[];
    const safe: Partial<ConfigSolicitacoesData> = {};
    for (const key of allowed) {
      if (key in data) (safe as Record<string, unknown>)[key] = data[key];
    }
    if ("atestadoCidModo" in safe) {
      const modo = String(safe.atestadoCidModo);
      safe.atestadoCidModo = ["OBRIGATORIO", "OPCIONAL", "DESATIVADO"].includes(modo)
        ? modo
        : "OBRIGATORIO";
    }
    if ("abonoCotaDiasDoisCiclos" in safe) {
      const n = Math.floor(Number(safe.abonoCotaDiasDoisCiclos));
      safe.abonoCotaDiasDoisCiclos = Number.isFinite(n) ? Math.min(365, Math.max(0, n)) : 0;
    }
    return this.prisma.configuracaoSolicitacoes.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...DEFAULTS, ...safe },
      update: safe
    }) as Promise<ConfigSolicitacoesData>;
  }
}
