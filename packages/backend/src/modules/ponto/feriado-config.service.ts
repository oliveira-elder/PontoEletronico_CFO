import { Injectable, NotFoundException } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../prisma/prisma.service";

const DF_FIXOS: { mes: number; dia: number; nome: string }[] = [
  { mes: 4, dia: 28, nome: "Fundação de Brasília" },
  { mes: 11, dia: 30, nome: "Dia do Evangélico" }
];

@Injectable()
export class FeriadoConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService
  ) {}

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
    } catch {
      // Prossegue sem nacionais se a API falhar
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
    return this.prisma.feriadoConfig.create({
      data: {
        data: new Date(`${body.data}T00:00:00.000Z`),
        nome: body.nome,
        tipo: body.tipo ?? "MANUAL",
        origem: "MANUAL",
        bloqueiaRegistro: body.bloqueiaRegistro ?? true,
        observacao: body.observacao ?? null,
        marcoHorario: body.marcoHorario ?? null,
        marcoLado: body.marcoLado ?? null
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
    return this.prisma.feriadoConfig.update({
      where: { id },
      data: {
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.tipo !== undefined && { tipo: body.tipo }),
        ...(body.bloqueiaRegistro !== undefined && { bloqueiaRegistro: body.bloqueiaRegistro }),
        ...(body.observacao !== undefined && { observacao: body.observacao || null }),
        ...("marcoHorario" in body && { marcoHorario: body.marcoHorario ?? null }),
        ...("marcoLado" in body && { marcoLado: body.marcoLado ?? null })
      }
    });
  }

  async toggleBloqueio(id: string) {
    const f = await this.prisma.feriadoConfig.findUnique({ where: { id } });
    if (!f) throw new NotFoundException("Feriado não encontrado");
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
    nome?: string;
    marcoHorario?: string | null;
    marcoLado?: string | null;
  }> {
    const inicio = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
    const f = await this.prisma.feriadoConfig.findUnique({ where: { data: inicio } });
    if (f?.bloqueiaRegistro)
      return {
        bloqueado: true,
        nome: f.nome,
        marcoHorario: f.marcoHorario,
        marcoLado: f.marcoLado
      };
    return { bloqueado: false };
  }
}
