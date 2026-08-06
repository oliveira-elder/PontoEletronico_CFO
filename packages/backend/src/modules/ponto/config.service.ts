import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { chaveMarcoAnual } from "../../utils/banco-horas-marco";

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
    /* Tolerância simétrica: entrada e saída sempre iguais; margem diária desligada. */
    const safe = this.normalizarToleranciasSimetricas({
      ...(data as Record<string, unknown>)
    });
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

  /** Entrada/saída sempre iguais; margem diária desligada. */
  private normalizarToleranciasSimetricas<T extends Record<string, unknown>>(data: T): T {
    const out = { ...data };
    if (out.toleranciaEntradaMin !== undefined || out.toleranciaSaidaMin !== undefined) {
      const n = Math.max(
        0,
        Number(
          out.toleranciaEntradaMin !== undefined ? out.toleranciaEntradaMin : out.toleranciaSaidaMin
        ) || 0
      );
      out.toleranciaEntradaMin = n;
      out.toleranciaSaidaMin = n;
    }
    if ("toleranciaCalculoMin" in out || "toleranciaEntradaMin" in out) {
      out.toleranciaCalculoMin = 0;
    }
    return out;
  }

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
    const normalized = this.normalizarToleranciasSimetricas({ ...data } as Record<string, unknown>);
    return this.prisma.jornadaPeriodo.create({ data: normalized as never });
  }

  async updateJornada(id: string, data: Record<string, unknown>) {
    const normalized = this.normalizarToleranciasSimetricas(data);
    return this.prisma.jornadaPeriodo.update({ where: { id }, data: normalized as never });
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

  /* ─── Banco de Horas: datas marco (dia/mês recorrente) ─── */

  listMarcosBancoHoras() {
    return this.prisma.bancoHorasMarco.findMany({
      orderBy: [{ mes: "asc" }, { dia: "asc" }, { ano: "asc" }]
    });
  }

  async createMarcoBancoHoras(body: { dia: number; mes: number; descricao?: string }) {
    const dia = Math.trunc(Number(body.dia));
    const mes = Math.trunc(Number(body.mes));
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) {
      throw new BadRequestException("Dia inválido (use 1–31).");
    }
    if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
      throw new BadRequestException("Mês inválido (use 1–12).");
    }
    const chave = chaveMarcoAnual(mes, dia);
    const existente = await this.prisma.bancoHorasMarco.findUnique({ where: { chave } });
    if (existente) {
      throw new BadRequestException("Já existe uma data marco para esse dia e mês.");
    }
    return this.prisma.bancoHorasMarco.create({
      data: {
        dia,
        mes,
        ano: null,
        chave,
        descricao: body.descricao?.trim() || null
      }
    });
  }

  deleteMarcoBancoHoras(id: string) {
    return this.prisma.bancoHorasMarco.delete({ where: { id } });
  }
}
