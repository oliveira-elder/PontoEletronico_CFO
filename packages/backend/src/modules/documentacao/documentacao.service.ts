import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

interface Autor {
  nome: string | null;
}

export interface AutoriaDto {
  autor?: string;
  dataEntrega?: string;
  local?: string;
  gerenteResponsavel?: string;
  solicitacao?: string;
}

export interface RevisaoDto {
  /** MAIOR | MENOR | CORRECAO — define o próximo número de versão. */
  tipoVersao?: "MAIOR" | "MENOR" | "CORRECAO";
  desenvolvedor?: string;
  revisor?: string;
  dataRevisao?: string;
  comentario?: string;
  local?: string;
  equipe?: string;
  secoesAfetadas?: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const hojeIso = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());

const PADRAO = {
  autor: "Elder Fernandes de Oliveira",
  local: "Desenvolvimento de TI (sala 203) - Conselho Federal de Odontologia (CFO)",
  gerenteResponsavel: "João Dias",
  solicitacao:
    "O Departamento de RH do CFO solicitou o sistema com o objetivo de digitalização do Registro de Ponto Eletrônico e todo o fluxo operacional da área.",
  equipe: "Desenvolvimento de TI - CFO"
};

/** Autoria e revisões (versionamento) da Documentação Técnica — acesso restrito ao Super Admin. */
@Injectable()
export class DocumentacaoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria a autoria e a revisão 1.0.0 na primeira consulta (data de criação = hoje). */
  private async garantirBase() {
    let a = await this.prisma.documentacaoAutoria.findUnique({ where: { id: "singleton" } });
    if (!a) {
      const hoje = hojeIso();
      a = await this.prisma.documentacaoAutoria.create({
        data: {
          id: "singleton",
          autor: PADRAO.autor,
          dataEntrega: hoje,
          local: PADRAO.local,
          gerenteResponsavel: PADRAO.gerenteResponsavel,
          solicitacao: PADRAO.solicitacao,
          versaoAtual: "1.0.0"
        }
      });
      await this.prisma.documentacaoRevisao.create({
        data: {
          versao: "1.0.0",
          tipo: "MANUAL",
          desenvolvedor: PADRAO.autor,
          dataRevisao: hoje,
          comentario: "Criação da Documentação Técnica do Sistema de Ponto Eletrônico.",
          local: PADRAO.local,
          equipe: PADRAO.equipe,
          criadoPorNome: PADRAO.autor
        }
      });
    }
    return a;
  }

  async autoria() {
    return this.garantirBase();
  }

  async salvarAutoria(dto: AutoriaDto, autor: Autor) {
    const atual = await this.garantirBase();
    const dados: Record<string, string> = {};
    for (const k of ["autor", "local", "gerenteResponsavel", "solicitacao"] as const) {
      if (dto[k] === undefined) continue;
      const v = String(dto[k]).trim();
      if (!v) throw new BadRequestException(`O campo "${k}" não pode ficar vazio.`);
      dados[k] = v.slice(0, 600);
    }
    if (dto.dataEntrega !== undefined) {
      if (!DATA.test(dto.dataEntrega)) throw new BadRequestException("Data de entrega inválida.");
      dados.dataEntrega = dto.dataEntrega;
    }
    const mudou = Object.keys(dados).filter(
      (k) => (atual as unknown as Record<string, unknown>)[k] !== dados[k]
    );
    if (!mudou.length) return atual;
    const nova = await this.prisma.documentacaoAutoria.update({
      where: { id: "singleton" },
      data: { ...dados, atualizadoPorNome: autor.nome }
    });
    /* Mudança na autoria fica na trilha das revisões (revisão automática, sem trocar a versão). */
    await this.prisma.documentacaoRevisao.create({
      data: {
        versao: nova.versaoAtual,
        tipo: "AUTOMATICA",
        desenvolvedor: autor.nome ?? "Sistema",
        dataRevisao: hojeIso(),
        comentario: `Autoria alterada (${mudou.join(", ")}).`,
        criadoPorNome: autor.nome
      }
    });
    return nova;
  }

  async revisoes() {
    await this.garantirBase();
    return this.prisma.documentacaoRevisao.findMany({ orderBy: { createdAt: "desc" } });
  }

  private proximaVersao(atual: string, tipo: RevisaoDto["tipoVersao"]): string {
    const [ma, mi, co] = atual.split(".").map((n) => Number(n) || 0);
    if (tipo === "MAIOR") return `${ma + 1}.0.0`;
    if (tipo === "MENOR") return `${ma}.${mi + 1}.0`;
    return `${ma}.${mi}.${co + 1}`;
  }

  async criarRevisao(dto: RevisaoDto, autor: Autor) {
    const a = await this.garantirBase();
    const comentario = (dto.comentario ?? "").trim();
    const desenvolvedor = (dto.desenvolvedor ?? "").trim();
    if (!desenvolvedor) throw new BadRequestException("Informe o desenvolvedor.");
    if (comentario.length < 5)
      throw new BadRequestException("Descreva o que foi feito na revisão.");
    const data = dto.dataRevisao || hojeIso();
    if (!DATA.test(data)) throw new BadRequestException("Data da revisão inválida.");
    const tipoVersao = dto.tipoVersao ?? "CORRECAO";
    if (!["MAIOR", "MENOR", "CORRECAO"].includes(tipoVersao)) {
      throw new BadRequestException("Tipo de versão inválido.");
    }
    const versao = this.proximaVersao(a.versaoAtual, tipoVersao);
    const [rev] = await this.prisma.$transaction([
      this.prisma.documentacaoRevisao.create({
        data: {
          versao,
          tipo: "MANUAL",
          desenvolvedor: desenvolvedor.slice(0, 160),
          revisor: dto.revisor?.trim().slice(0, 160) || null,
          dataRevisao: data,
          comentario: comentario.slice(0, 4000),
          local: dto.local?.trim().slice(0, 300) || a.local,
          equipe: dto.equipe?.trim().slice(0, 300) || PADRAO.equipe,
          secoesAfetadas: dto.secoesAfetadas?.trim().slice(0, 600) || null,
          criadoPorNome: autor.nome
        }
      }),
      this.prisma.documentacaoAutoria.update({
        where: { id: "singleton" },
        data: { versaoAtual: versao, atualizadoPorNome: autor.nome }
      })
    ]);
    return rev;
  }

  /**
   * Revisão automática: grava o resumo da diferença das partes geradas e sobe a versão de correção.
   * `primeiro` = primeira leitura (apenas guarda o retrato, sem criar revisão).
   */
  async registrarAutomatica(hash: string, conteudo: Prisma.InputJsonValue, resumo: string | null) {
    const a = await this.garantirBase();
    const ult = await this.prisma.documentacaoSnapshot.findFirst({
      orderBy: { createdAt: "desc" }
    });
    if (ult?.hash === hash) return null;
    if (!ult || !resumo) {
      await this.prisma.documentacaoSnapshot.create({ data: { hash, conteudo } });
      return null;
    }
    const versao = this.proximaVersao(a.versaoAtual, "CORRECAO");
    await this.prisma.$transaction([
      this.prisma.documentacaoSnapshot.create({ data: { hash, conteudo } }),
      this.prisma.documentacaoRevisao.create({
        data: {
          versao,
          tipo: "AUTOMATICA",
          desenvolvedor: "Sistema (atualização automática)",
          dataRevisao: hojeIso(),
          comentario: resumo.slice(0, 4000),
          local: a.local,
          equipe: PADRAO.equipe,
          hashConteudo: hash,
          criadoPorNome: "Sistema"
        }
      }),
      this.prisma.documentacaoAutoria.update({
        where: { id: "singleton" },
        data: { versaoAtual: versao }
      })
    ]);
    return versao;
  }

  async ultimoSnapshot() {
    return this.prisma.documentacaoSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  }

  /** Revisão não é excluída: é anulada com motivo e continua na trilha (riscada). */
  async anular(id: string, motivo: string, autor: Autor) {
    const r = await this.prisma.documentacaoRevisao.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("Revisão não encontrada.");
    if (r.anuladaEm) throw new BadRequestException("Esta revisão já foi anulada.");
    if ((motivo ?? "").trim().length < 5)
      throw new BadRequestException("Informe o motivo da anulação.");
    await this.prisma.documentacaoRevisao.update({
      where: { id },
      data: {
        anuladaEm: new Date(),
        motivoAnulacao: motivo.trim().slice(0, 600),
        anuladaPorNome: autor.nome
      }
    });
    return { ok: true };
  }
}
