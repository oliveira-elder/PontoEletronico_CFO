import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";
import { dataBrasiliaISO, hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { TIPOS_FERIADO, TIPO_ABONO, ehDiaAbonado } from "../../utils/feriado-rotulo";

function validarTipo(tipo: string | undefined) {
  if (tipo !== undefined && !TIPOS_FERIADO.includes(tipo)) {
    throw new BadRequestException("Tipo de feriado inválido.");
  }
}

/** Abono do RH é sempre dia inteiro e sempre bloqueia o registro de ponto. */
const REGRAS_ABONO = { bloqueiaRegistro: true, marcoHorario: null, marcoLado: null };

const DF_FIXOS: { mes: number; dia: number; nome: string }[] = [
  { mes: 4, dia: 28, nome: "Fundação de Brasília" },
  { mes: 11, dia: 30, nome: "Dia do Evangélico" }
];

@Injectable()
export class FeriadoConfigService implements OnModuleInit {
  private readonly logger = new Logger(FeriadoConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService
  ) {}

  async onModuleInit() {
    const ano = Number(hojeBrasiliaISO().slice(0, 4));
    await this.garantirCalendarioAno(ano).catch((err) =>
      this.logger.warn(`Falha ao sincronizar feriados de ${ano} na inicialização: ${String(err)}`)
    );
  }

  /** 1º de janeiro 03:00 Brasília: garante o calendário do ano corrente. */
  @Cron("0 3 1 1 *", { timeZone: "America/Sao_Paulo" })
  async cronImportarAnoCorrente() {
    const ano = Number(hojeBrasiliaISO().slice(0, 4));
    await this.garantirCalendarioAno(ano, true);
  }

  /** 1º de dezembro 03:00 Brasília: importa o ano seguinte com antecedência. */
  @Cron("0 3 1 12 *", { timeZone: "America/Sao_Paulo" })
  async cronImportarProximoAno() {
    const ano = Number(hojeBrasiliaISO().slice(0, 4)) + 1;
    await this.garantirCalendarioAno(ano, true);
  }

  async listarTodos() {
    return this.prisma.feriadoConfig.findMany({
      orderBy: { data: "asc" }
    });
  }

  async listarPorAno(ano: number) {
    const inicio = new Date(`${ano}-01-01T00:00:00.000Z`);
    const fim = new Date(`${ano}-12-31T23:59:59.999Z`);
    return this.prisma.feriadoConfig.findMany({
      where: { data: { gte: inicio, lte: fim } },
      orderBy: { data: "asc" }
    });
  }

  /** Importa da BrasilAPI + DF se o ano ainda não tiver feriados nacionais. */
  async garantirCalendarioAno(ano: number, forcar = false) {
    if (!forcar) {
      const inicio = new Date(`${ano}-01-01T00:00:00.000Z`);
      const fim = new Date(`${ano}-12-31T23:59:59.999Z`);
      const nacionais = await this.prisma.feriadoConfig.count({
        where: { data: { gte: inicio, lte: fim }, tipo: "NACIONAL" }
      });
      if (nacionais > 0) return { skipped: true, criados: 0, atualizados: 0, total: 0 };
    }
    const result = await this.importar(ano);
    this.logger.log(
      `Calendário de feriados ${ano}: ${result.criados} criados, ${result.atualizados} atualizados (total ${result.total}).`
    );
    return result;
  }

  async importar(ano: number) {
    // 1. Busca feriados nacionais via BrasilAPI
    let nacionais: { date: string; name: string; type: string }[] = [];
    try {
      const resp = (await firstValueFrom(
        this.http.get<{ date: string; name: string; type: string }[]>(
          `https://brasilapi.com.br/api/feriados/v1/${ano}`
        )
      )) as { data: { date: string; name: string; type: string }[] };
      nacionais = resp.data ?? [];
    } catch (err) {
      this.logger.warn(
        `BrasilAPI indisponível ao importar feriados de ${ano}: ${String(err)}. Seguindo só com distritais.`
      );
    }

    const upserts: Array<{
      data: Date;
      nome: string;
      tipo: string;
      origem: string;
    }> = [];

    for (const f of nacionais) {
      upserts.push({
        data: new Date(`${f.date}T00:00:00.000Z`),
        nome: f.name,
        tipo: f.type === "national" ? "NACIONAL" : "FACULTATIVO",
        origem: "API"
      });
    }

    // 2. Adiciona feriados distritais fixos (DF)
    for (const df of DF_FIXOS) {
      const mm = String(df.mes).padStart(2, "0");
      const dd = String(df.dia).padStart(2, "0");
      upserts.push({
        data: new Date(`${ano}-${mm}-${dd}T00:00:00.000Z`),
        nome: df.nome,
        tipo: "DISTRITAL",
        origem: "API"
      });
    }

    // 3. Upsert no banco (mantém bloqueiaRegistro de registros já existentes)
    let criados = 0;
    let atualizados = 0;
    for (const u of upserts) {
      const existing = await this.prisma.feriadoConfig.findUnique({
        where: { data: u.data }
      });
      /* Abono do RH configurado nesta data: a importação não sobrescreve. */
      if (existing && ehDiaAbonado(existing)) continue;
      if (existing) {
        await this.prisma.feriadoConfig.update({
          where: { data: u.data },
          data: { nome: u.nome, tipo: u.tipo, origem: u.origem }
        });
        atualizados++;
      } else {
        await this.prisma.feriadoConfig.create({
          data: { ...u, bloqueiaRegistro: true }
        });
        criados++;
      }
    }

    return { criados, atualizados, total: upserts.length };
  }

  async criar(body: {
    data: string;
    nome: string;
    tipo?: string;
    bloqueiaRegistro?: boolean;
    observacao?: string;
    marcoHorario?: string | null;
    marcoLado?: string | null;
  }) {
    validarTipo(body.tipo);
    if (body.tipo === TIPO_ABONO && !body.nome?.trim()) {
      throw new BadRequestException("Informe o nome exibido no status do abono.");
    }
    return this.prisma.feriadoConfig.create({
      data: {
        data: new Date(`${body.data}T00:00:00.000Z`),
        nome: body.nome,
        tipo: body.tipo ?? "MANUAL",
        origem: "MANUAL",
        bloqueiaRegistro: body.bloqueiaRegistro ?? true,
        observacao: body.observacao ?? null,
        marcoHorario: body.marcoHorario ?? null,
        marcoLado: body.marcoLado ?? null,
        ...(body.tipo === TIPO_ABONO ? REGRAS_ABONO : {})
      }
    });
  }

  async atualizar(
    id: string,
    body: {
      nome?: string;
      tipo?: string;
      bloqueiaRegistro?: boolean;
      observacao?: string;
      marcoHorario?: string | null;
      marcoLado?: string | null;
    }
  ) {
    const existe = await this.prisma.feriadoConfig.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException("Feriado não encontrado");
    validarTipo(body.tipo);
    const seraAbono = (body.tipo ?? existe.tipo) === TIPO_ABONO;
    if (seraAbono && body.nome !== undefined && !body.nome.trim()) {
      throw new BadRequestException("Informe o nome exibido no status do abono.");
    }
    return this.prisma.feriadoConfig.update({
      where: { id },
      data: {
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.tipo !== undefined && { tipo: body.tipo }),
        ...(body.bloqueiaRegistro !== undefined && { bloqueiaRegistro: body.bloqueiaRegistro }),
        ...(body.observacao !== undefined && { observacao: body.observacao || null }),
        ...("marcoHorario" in body && { marcoHorario: body.marcoHorario ?? null }),
        ...("marcoLado" in body && { marcoLado: body.marcoLado ?? null }),
        ...(seraAbono ? REGRAS_ABONO : {})
      }
    });
  }

  async toggleBloqueio(id: string) {
    const f = await this.prisma.feriadoConfig.findUnique({ where: { id } });
    if (!f) throw new NotFoundException("Feriado não encontrado");
    if (ehDiaAbonado(f)) {
      throw new BadRequestException("Dia abonado pelo RH sempre bloqueia o registro de ponto.");
    }
    return this.prisma.feriadoConfig.update({
      where: { id },
      data: { bloqueiaRegistro: !f.bloqueiaRegistro }
    });
  }

  async deletar(id: string) {
    await this.prisma.feriadoConfig.delete({ where: { id } });
    return { ok: true };
  }

  async isBloqueado(data: Date): Promise<{
    bloqueado: boolean;
    abono?: boolean;
    nome?: string;
    marcoHorario?: string | null;
    marcoLado?: string | null;
  }> {
    const iso = dataBrasiliaISO(data);
    const f = await this.prisma.feriadoConfig.findUnique({
      where: { data: new Date(`${iso}T00:00:00.000Z`) }
    });
    if (f?.bloqueiaRegistro)
      return {
        bloqueado: true,
        abono: ehDiaAbonado(f),
        nome: f.nome,
        marcoHorario: f.marcoHorario,
        marcoLado: f.marcoLado
      };
    return { bloqueado: false };
  }
}
