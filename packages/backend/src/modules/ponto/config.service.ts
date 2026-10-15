import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { RepLivroService } from "../rep/rep-livro.service";
import { PrismaService } from "../../prisma/prisma.service";
import { chaveMarcoAnual } from "../../utils/banco-horas-marco";

@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly repLivro?: RepLivroService
  ) {}

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
    if (safe.repTipo !== undefined && !["REP_A", "REP_P"].includes(String(safe.repTipo))) {
      throw new BadRequestException("Tipo de REP inválido (REP_A ou REP_P).");
    }
    for (const [campo, max] of [
      ["repActProcesso", 17],
      ["repInpiRegistro", 17],
      ["repCnoCaepf", 14],
      ["repResponsavelCpf", 11],
      ["ptrpDesenvolvedorCnpj", 14]
    ] as const) {
      if (safe[campo] != null && String(safe[campo]).replace(/\D/g, "").length > max) {
        throw new BadRequestException(`${campo}: no máximo ${max} dígitos.`);
      }
    }
    if (safe.contratoAvisoAntecedenciaDias !== undefined) {
      const dias = Number(safe.contratoAvisoAntecedenciaDias);
      if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
        throw new BadRequestException(
          "A antecedência do aviso de fim de contrato deve ser um número inteiro de 1 a 365 dias."
        );
      }
      safe.contratoAvisoAntecedenciaDias = dias;
    }

    if (safe.cicloCompletoPresencialDesde !== undefined) {
      const v = safe.cicloCompletoPresencialDesde;
      if (v === null || v === "") {
        safe.cicloCompletoPresencialDesde = null;
      } else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        safe.cicloCompletoPresencialDesde = new Date(`${v.slice(0, 10)}T12:00:00-03:00`);
      } else {
        throw new BadRequestException(
          "A data de vigência do ciclo completo presencial deve estar no formato AAAA-MM-DD (ou vazia para desligar)."
        );
      }
    }
    /* Limites do intervalo conforme a jornada (CLT art. 71): inteiros em minutos; o curto não
       pode passar do longo. Valida contra o valor já gravado quando só um deles é enviado. */
    const camposIntervalo = [
      "intervaloLongoAcimaDeMin",
      "intervaloCurtoAcimaDeMin",
      "intervaloCurtoMinMin"
    ] as const;
    if (camposIntervalo.some((c) => safe[c] !== undefined)) {
      const atual = await this.prisma.configuracaoSistema.findUnique({
        where: { id: "singleton" },
        select: {
          intervaloLongoAcimaDeMin: true,
          intervaloCurtoAcimaDeMin: true,
          intervaloCurtoMinMin: true
        }
      });
      const novo = {
        intervaloLongoAcimaDeMin: atual?.intervaloLongoAcimaDeMin ?? 360,
        intervaloCurtoAcimaDeMin: atual?.intervaloCurtoAcimaDeMin ?? 240,
        intervaloCurtoMinMin: atual?.intervaloCurtoMinMin ?? 15
      };
      for (const c of camposIntervalo) {
        if (safe[c] === undefined) continue;
        const n = Number(safe[c]);
        if (!Number.isInteger(n) || n < 0 || n > 1440) {
          throw new BadRequestException(
            "Os limites do intervalo conforme a jornada devem ser números inteiros de minutos entre 0 e 1440."
          );
        }
        safe[c] = n;
        novo[c] = n;
      }
      if (novo.intervaloCurtoAcimaDeMin > novo.intervaloLongoAcimaDeMin) {
        throw new BadRequestException(
          "O limite do intervalo curto não pode ser maior que o limite do intervalo de almoço (jornada longa)."
        );
      }
    }

    if (safe.cicloCompletoEmCasaDesde !== undefined) {
      const v = safe.cicloCompletoEmCasaDesde;
      if (v === null || v === "") {
        safe.cicloCompletoEmCasaDesde = null;
      } else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        safe.cicloCompletoEmCasaDesde = new Date(`${v.slice(0, 10)}T12:00:00-03:00`);
      } else {
        throw new BadRequestException(
          "A data de vigência do ciclo completo em casa deve estar no formato AAAA-MM-DD (ou vazia para desligar)."
        );
      }
    }

    if (safe.interjornadaMin !== undefined) {
      const min = Number(safe.interjornadaMin);
      if (!Number.isInteger(min) || min < 0 || min > 1440) {
        throw new BadRequestException(
          "O descanso de interjornada deve ser um número inteiro de minutos entre 0 (desativado) e 1440 (24 h)."
        );
      }
      safe.interjornadaMin = min;
    }

    const updated = await this.prisma.configuracaoSistema.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...safe },
      update: safe
    });
    void this.repLivro?.sincronizarEmpresa();

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
  private normalizarToleranciasSimetricas(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...data };
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
      paraEstagiarios: boolean;
    }>
  ) {
    const normalized = this.aplicarJornadaEstagiario(
      this.normalizarToleranciasSimetricas({ ...data } as Record<string, unknown>)
    );
    return this.prisma.jornadaPeriodo.create({ data: normalized as never });
  }

  async updateJornada(id: string, data: Record<string, unknown>) {
    const normalized = this.aplicarJornadaEstagiario(this.normalizarToleranciasSimetricas(data));
    return this.prisma.jornadaPeriodo.update({ where: { id }, data: normalized as never });
  }

  /**
   * Jornada de estagiários/jovens aprendizes: carga corrida, sem almoço, banco de horas e hora
   * extra — esses campos não se aplicam, então voltam ao padrão (e a descrição é limpa).
   */
  private aplicarJornadaEstagiario(data: Record<string, unknown>): Record<string, unknown> {
    if (data.paraEstagiarios !== true) return data;
    return {
      ...data,
      descricao: null,
      tipoFlexibilidade: "FIXO",
      almocoPodeIniciarA: "11:30",
      almocoPodeIniciarAte: "13:00",
      almocoMinMin: 60,
      almocoMaxMin: 90,
      bancoHorasLimiteMin: 120,
      bancoHorasVigenciaDias: 30,
      horaExtraLimiteAuto: 120
    };
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
