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

  async updateSistema(data: Record<string, unknown>) {
    return this.prisma.configuracaoSistema.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...data },
      update: data
    });
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
}
