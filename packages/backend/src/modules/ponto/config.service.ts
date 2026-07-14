import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /* ─── ConfiguracaoSistema (singleton) ─── */

  async getSistema() {
    let cfg = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" }
    });
    if (!cfg) {
      cfg = await this.prisma.configuracaoSistema.create({
        data: { id: "singleton" }
      });
    }
    return cfg;
  }

  /** Dados institucionais públicos (rodapé/login) — sem lat/lng nem regras de ponto. */
  async getBranding() {
    const cfg = await this.getSistema();
    return {
      nome: cfg.nome,
      cnpj: cfg.cnpj,
      endereco: cfg.endereco,
      numero: cfg.numero,
      bairro: cfg.bairro,
      cidade: cfg.cidade,
      uf: cfg.uf,
      cep: cfg.cep,
      telefone: cfg.telefone,
      emailInstitucional: cfg.emailInstitucional
    };
  }

  async updateSistema(data: Record<string, unknown>) {
    /* dataInicioProducao só é definida pelo fluxo Start do Sistema (Super Admin). */
    const safe = { ...(data as Record<string, unknown>) };
    delete safe.dataInicioProducao;
    const updated = await this.prisma.configuracaoSistema.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...safe },
      update: safe
    });

    /* Espelha parâmetros da aba Períodos na jornada padrão, para que o cálculo
       de histórico/banco (getJornadaEfetiva) use os mesmos valores salvos na UI. */
    const periodoKeys = [
      "horaEntrada",
      "horaSaida",
      "jornadaDiariaMin",
      "jornadaSemanalMin",
      "diasUteis",
      "tipoFlexibilidade",
      "toleranciaEntradaMin",
      "toleranciaSaidaMin",
      "toleranciaHoraExtraMin",
      "toleranciaCalculoMin",
      "almocoPodeIniciarA",
      "almocoPodeIniciarAte",
      "almocoMinMin",
      "almocoMaxMin",
      "bancoHorasLimiteMin",
      "bancoHorasVigenciaDias",
      "horaExtraLimiteAuto"
    ] as const;
    const syncData: Record<string, unknown> = {};
    for (const key of periodoKeys) {
      if (key in data && data[key] !== undefined) syncData[key] = data[key];
    }
    if (Object.keys(syncData).length > 0) {
      const padrao = await this.prisma.jornadaPeriodo.findFirst({
        where: { ePadrao: true, ativo: true }
      });
      if (padrao) {
        await this.prisma.jornadaPeriodo.update({
          where: { id: padrao.id },
          data: syncData as never
        });
      }
    }

    return updated;
  }

  /* ─── ProvedorInternet ─── */

  listProvedores() {
    return this.prisma.provedorInternet.findMany({ orderBy: { createdAt: "asc" } });
  }

  createProvedor(data: { nome: string; ip: string; isPrincipal: boolean }) {
    return this.prisma.provedorInternet.create({ data });
  }

  async toggleProvedor(id: string) {
    const p = await this.prisma.provedorInternet.findUniqueOrThrow({ where: { id } });
    return this.prisma.provedorInternet.update({ where: { id }, data: { ativo: !p.ativo } });
  }

  deleteProvedor(id: string) {
    return this.prisma.provedorInternet.delete({ where: { id } });
  }

  /* ─── SubredeConfigurada ─── */

  listSubredes() {
    return this.prisma.subredeConfigurada.findMany({ orderBy: { createdAt: "asc" } });
  }

  createSubrede(data: { cidr: string; descricao?: string }) {
    return this.prisma.subredeConfigurada.create({ data });
  }

  deleteSubrede(id: string) {
    return this.prisma.subredeConfigurada.delete({ where: { id } });
  }

  /* ─── AreaViagem ─── */

  listAreas() {
    return this.prisma.areaViagem.findMany({ orderBy: { createdAt: "asc" } });
  }

  createArea(data: {
    nome: string;
    descricao?: string;
    lat: number;
    lng: number;
    raioMetros: number;
  }) {
    return this.prisma.areaViagem.create({ data });
  }

  updateArea(
    id: string,
    data: Partial<{
      nome: string;
      descricao: string;
      lat: number;
      lng: number;
      raioMetros: number;
      ativa: boolean;
    }>
  ) {
    return this.prisma.areaViagem.update({ where: { id }, data });
  }

  async toggleArea(id: string) {
    const a = await this.prisma.areaViagem.findUniqueOrThrow({ where: { id } });
    return this.prisma.areaViagem.update({ where: { id }, data: { ativa: !a.ativa } });
  }

  deleteArea(id: string) {
    return this.prisma.areaViagem.delete({ where: { id } });
  }

  /* ─── JornadaPeriodo ─── */

  listJornadas() {
    return this.prisma.jornadaPeriodo.findMany({ orderBy: { createdAt: "asc" } });
  }

  async createJornada(
    data: Partial<{
      nome: string;
      descricao: string;
      horaEntrada: string;
      horaSaida: string;
      jornadaDiariaMin: number;
      jornadaSemanalMin: number;
      diasUteis: string;
      tipoFlexibilidade: string;
      toleranciaEntradaMin: number;
      toleranciaSaidaMin: number;
      toleranciaHoraExtraMin: number;
      toleranciaCalculoMin: number;
      almocoPodeIniciarA: string;
      almocoPodeIniciarAte: string;
      almocoMinMin: number;
      almocoMaxMin: number;
      bancoHorasLimiteMin: number;
      bancoHorasVigenciaDias: number;
      horaExtraLimiteAuto: number;
    }>
  ) {
    return this.prisma.jornadaPeriodo.create({ data: data as never });
  }

  async updateJornada(id: string, data: Record<string, unknown>) {
    return this.prisma.jornadaPeriodo.update({ where: { id }, data: data as never });
  }

  async deleteJornada(id: string) {
    const count = await this.prisma.funcionario.count({ where: { jornadaPeriodoId: id } });
    if (count > 0) {
      throw new Error(`Não é possível excluir: ${count} funcionário(s) usando esta jornada.`);
    }
    return this.prisma.jornadaPeriodo.delete({ where: { id } });
  }

  async setJornadaPadrao(id: string) {
    await this.prisma.jornadaPeriodo.updateMany({ data: { ePadrao: false } });
    return this.prisma.jornadaPeriodo.update({ where: { id }, data: { ePadrao: true } });
  }

  /* ─── Banco de Horas: datas marco ─── */

  listMarcosBancoHoras() {
    return this.prisma.bancoHorasMarco.findMany({ orderBy: { data: "desc" } });
  }

  createMarcoBancoHoras(data: { data: string; descricao?: string }) {
    return this.prisma.bancoHorasMarco.create({
      data: { data: new Date(data.data), descricao: data.descricao }
    });
  }

  deleteMarcoBancoHoras(id: string) {
    return this.prisma.bancoHorasMarco.delete({ where: { id } });
  }
}
