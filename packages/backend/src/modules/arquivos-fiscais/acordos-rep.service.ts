import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

export interface AcordoRepDto {
  tipo?: string;
  numeroProcesso?: string;
  numeroRegistroMediador?: string | null;
  ano?: number;
  vigenciaInicio?: string;
  vigenciaFim?: string;
  dataRegistro?: string | null;
  entidadeSindical?: string | null;
  clausula?: string | null;
  observacoes?: string | null;
}

export interface AcordoVigente {
  id: string;
  numeroProcesso: string;
  tipo: string;
  ano: number;
  vigenciaInicio: string;
  vigenciaFim: string;
}

export type SituacaoAcordo = "VIGENTE" | "FUTURO" | "VENCIDO" | "CANCELADO";

interface Autor {
  id: string | null;
  nome: string | null;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const hojeBr = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

function dias(inicio: string, fim: string): string[] {
  const out: string[] = [];
  for (
    let t = Date.parse(`${inicio}T12:00:00Z`);
    t <= Date.parse(`${fim}T12:00:00Z`) && out.length < 800;
    t += 86_400_000
  ) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** ACT/CCT que autoriza o REP-A (art. 77): vale só durante a vigência, sem ultratividade. */
@Injectable()
export class AcordosRepService {
  constructor(private readonly prisma: PrismaService) {}

  static situacao(
    a: { status: string; vigenciaInicio: string; vigenciaFim: string },
    hoje = hojeBr()
  ): SituacaoAcordo {
    if (a.status === "CANCELADO") return "CANCELADO";
    if (hoje < a.vigenciaInicio) return "FUTURO";
    if (hoje > a.vigenciaFim) return "VENCIDO";
    return "VIGENTE";
  }

  private validar(d: AcordoRepDto, completo: boolean) {
    const out: Record<string, unknown> = {};
    if (d.tipo !== undefined) {
      if (!["ACT", "CCT"].includes(d.tipo))
        throw new BadRequestException("Tipo deve ser ACT ou CCT.");
      out.tipo = d.tipo;
    }
    if (d.numeroProcesso !== undefined || completo) {
      const n = String(d.numeroProcesso ?? "").replace(/\D/g, "");
      if (n.length !== 17) {
        throw new BadRequestException(
          "O número do processo do acordo deve ter 17 dígitos (campo do AFD)."
        );
      }
      out.numeroProcesso = n;
    }
    if (d.ano !== undefined || completo) {
      const ano = Number(d.ano);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
        throw new BadRequestException("Ano do acordo inválido.");
      }
      out.ano = ano;
    }
    for (const k of ["vigenciaInicio", "vigenciaFim"] as const) {
      if (d[k] !== undefined || completo) {
        if (!DATA.test(String(d[k] ?? ""))) {
          throw new BadRequestException("Informe a vigência do acordo (início e fim).");
        }
        out[k] = d[k];
      }
    }
    if (d.dataRegistro !== undefined) {
      if (d.dataRegistro && !DATA.test(d.dataRegistro)) {
        throw new BadRequestException("Data de registro inválida.");
      }
      out.dataRegistro = d.dataRegistro || null;
    }
    for (const k of [
      "numeroRegistroMediador",
      "entidadeSindical",
      "clausula",
      "observacoes"
    ] as const) {
      if (d[k] !== undefined) out[k] = (d[k] ?? "").toString().trim().slice(0, 500) || null;
    }
    return out;
  }

  private checarVigencia(ini: unknown, fim: unknown) {
    if (String(fim) < String(ini)) {
      throw new BadRequestException("O fim da vigência não pode ser anterior ao início.");
    }
  }

  private async usado(id: string) {
    return (await this.prisma.extracaoArquivoFiscal.count({ where: { acordoId: id } })) > 0;
  }

  async listar() {
    const lista = await this.prisma.acordoColetivoRep.findMany({
      select: {
        id: true,
        tipo: true,
        numeroProcesso: true,
        numeroRegistroMediador: true,
        ano: true,
        vigenciaInicio: true,
        vigenciaFim: true,
        dataRegistro: true,
        entidadeSindical: true,
        clausula: true,
        observacoes: true,
        renovacaoDeId: true,
        status: true,
        canceladoEm: true,
        motivoCancelamento: true,
        migrado: true,
        pdfNome: true,
        pdfSha256: true,
        criadoPorNome: true,
        createdAt: true
      },
      orderBy: [{ vigenciaInicio: "desc" }, { createdAt: "desc" }]
    });
    const usos = await this.prisma.extracaoArquivoFiscal.groupBy({
      by: ["acordoId"],
      where: { acordoId: { not: null } },
      _count: true
    });
    const mapaUso = new Map(usos.map((u) => [u.acordoId, u._count]));
    const hoje = hojeBr();
    const acordos = lista.map((a) => ({
      ...a,
      situacao: AcordosRepService.situacao(a, hoje),
      temPdf: !!a.pdfSha256,
      extracoes: mapaUso.get(a.id) ?? 0
    }));
    const vigente = acordos.find((a) => a.situacao === "VIGENTE") ?? null;
    return { acordos, vigenteId: vigente?.id ?? null, hoje };
  }

  async criar(dto: AcordoRepDto, autor: Autor, renovacaoDeId?: string) {
    const dados = this.validar(dto, true);
    this.checarVigencia(dados.vigenciaInicio, dados.vigenciaFim);
    return this.prisma.acordoColetivoRep.create({
      data: {
        tipo: "ACT",
        ...(dados as {
          numeroProcesso: string;
          ano: number;
          vigenciaInicio: string;
          vigenciaFim: string;
        }),
        renovacaoDeId: renovacaoDeId ?? null,
        criadoPorId: autor.id,
        criadoPorNome: autor.nome
      },
      select: { id: true }
    });
  }

  async renovar(id: string, dto: AcordoRepDto, autor: Autor) {
    const base = await this.prisma.acordoColetivoRep.findUnique({ where: { id } });
    if (!base) throw new NotFoundException("Acordo não encontrado.");
    const merged: AcordoRepDto = {
      tipo: base.tipo,
      entidadeSindical: base.entidadeSindical,
      clausula: base.clausula,
      ...dto
    };
    if (String(merged.vigenciaInicio ?? "") <= base.vigenciaInicio) {
      throw new BadRequestException(
        "A renovação deve começar depois do início do acordo anterior."
      );
    }
    return this.criar(merged, autor, id);
  }

  async atualizar(id: string, dto: AcordoRepDto) {
    const a = await this.prisma.acordoColetivoRep.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Acordo não encontrado.");
    if (a.status === "CANCELADO")
      throw new BadRequestException("Acordo cancelado não pode ser editado.");
    const dados = this.validar(dto, false);
    if (await this.usado(id)) {
      const travados = ["numeroProcesso", "vigenciaInicio", "vigenciaFim", "ano", "tipo"].filter(
        (k) =>
          k in dados && (dados as Record<string, unknown>)[k] !== (a as Record<string, unknown>)[k]
      );
      if (travados.length) {
        throw new BadRequestException(
          "Este acordo já consta em arquivo (AFD/AEJ) extraído: número, ano, tipo e vigência não podem " +
            "ser alterados. Cancele-o e cadastre outro, ou registre uma renovação."
        );
      }
    }
    this.checarVigencia(
      dados.vigenciaInicio ?? a.vigenciaInicio,
      dados.vigenciaFim ?? a.vigenciaFim
    );
    await this.prisma.acordoColetivoRep.update({ where: { id }, data: dados });
    return { ok: true };
  }

  async cancelar(id: string, motivo: string) {
    if (!motivo || motivo.trim().length < 5) {
      throw new BadRequestException("Informe o motivo do cancelamento.");
    }
    const a = await this.prisma.acordoColetivoRep.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!a) throw new NotFoundException("Acordo não encontrado.");
    await this.prisma.acordoColetivoRep.update({
      where: { id },
      data: { status: "CANCELADO", canceladoEm: new Date(), motivoCancelamento: motivo.trim() }
    });
    return { ok: true };
  }

  async salvarPdf(id: string, base64: string, nome?: string) {
    const a = await this.prisma.acordoColetivoRep.findUnique({
      where: { id },
      select: { id: true, status: true, pdfSha256: true }
    });
    if (!a) throw new NotFoundException("Acordo não encontrado.");
    if (a.status === "CANCELADO") throw new BadRequestException("Acordo cancelado.");
    if (a.pdfSha256 && (await this.usado(id))) {
      throw new BadRequestException(
        "Este acordo já consta em arquivo extraído: o PDF não pode ser substituído."
      );
    }
    const buf = Buffer.from(String(base64).replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buf.length < 100 || buf.subarray(0, 5).toString() !== "%PDF-") {
      throw new BadRequestException("Envie um arquivo PDF válido.");
    }
    if (buf.length > 10 * 1024 * 1024) throw new BadRequestException("PDF acima de 10 MB.");
    const sha = createHash("sha256").update(buf).digest("hex");
    await this.prisma.acordoColetivoRep.update({
      where: { id },
      data: {
        pdfDados: buf,
        pdfSha256: sha,
        pdfNome: (nome || "acordo.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 120)
      }
    });
    return { ok: true, sha256: sha };
  }

  async baixarPdf(id: string) {
    const a = await this.prisma.acordoColetivoRep.findUnique({
      where: { id },
      select: { pdfDados: true, pdfNome: true }
    });
    if (!a?.pdfDados) throw new NotFoundException("Acordo sem PDF anexado.");
    return { buffer: Buffer.from(a.pdfDados), nome: a.pdfNome ?? "acordo.pdf" };
  }

  /** Acordo ativo cuja vigência cobre a data (o mais recente, se houver sobreposição). */
  async vigentePara(data: string): Promise<AcordoVigente | null> {
    const lista = await this.prisma.acordoColetivoRep.findMany({
      where: { status: "ATIVO", vigenciaInicio: { lte: data }, vigenciaFim: { gte: data } },
      orderBy: { vigenciaInicio: "desc" },
      select: {
        id: true,
        numeroProcesso: true,
        tipo: true,
        ano: true,
        vigenciaInicio: true,
        vigenciaFim: true
      }
    });
    return lista.length ? lista[0] : null;
  }

  /** Cobertura do período: acordos que o tocam e dias sem nenhum acordo vigente. */
  async cobertura(inicio: string, fim: string) {
    const acordos = await this.prisma.acordoColetivoRep.findMany({
      where: { status: "ATIVO", vigenciaInicio: { lte: fim }, vigenciaFim: { gte: inicio } },
      orderBy: { vigenciaInicio: "asc" },
      select: {
        id: true,
        numeroProcesso: true,
        tipo: true,
        ano: true,
        vigenciaInicio: true,
        vigenciaFim: true
      }
    });
    const descobertos = dias(inicio, fim).filter(
      (d) => !acordos.some((a) => a.vigenciaInicio <= d && d <= a.vigenciaFim)
    );
    return {
      acordos,
      diasSemAcordo: descobertos.length,
      primeiroDiaSemAcordo: descobertos[0] ?? null
    };
  }

  /** Migra o campo legado (repActProcesso) para o primeiro registro do histórico. */
  async migrarLegado() {
    if ((await this.prisma.acordoColetivoRep.count()) > 0) return;
    const c = await this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } });
    const n = (c?.repActProcesso ?? "").replace(/\D/g, "");
    if (n.length !== 17 || n === "99999999999999999") return;
    const ano = new Date().getFullYear();
    await this.prisma.acordoColetivoRep.create({
      data: {
        numeroProcesso: n,
        ano,
        vigenciaInicio: `${ano}-01-01`,
        vigenciaFim: `${ano}-12-31`,
        migrado: true,
        observacoes: "Migrado do campo antigo; confira o ano e a vigência reais do acordo."
      }
    });
  }
}
