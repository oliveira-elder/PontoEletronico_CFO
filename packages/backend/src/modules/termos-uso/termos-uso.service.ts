import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit
} from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { groupCodigoAssinatura } from "../../utils/assinatura-codigo";
import type { MetaRequisicao } from "../../utils/ip-requisicao";
import { TEXTO_TERMO_PADRAO, TITULO_TERMO_PADRAO } from "./termos-uso.texto-padrao";

interface Autor {
  id: string | null;
  nome: string | null;
}

const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

/**
 * Termos de Uso: versões (rascunho → publicado → substituído), aceite por usuário e versão
 * (somente inclusão) e pendência de aceite usada para bloquear o sistema (sem bloquear o ponto).
 */
@Injectable()
export class TermosUsoService implements OnModuleInit {
  private readonly logger = new Logger(TermosUsoService.name);
  /** Pendência por usuário (sub) — cache curto; zerado ao aceitar e ao publicar. */
  private readonly pendenciaCache = new Map<string, { pendente: boolean; em: number }>();
  private vigenteCache: { id: string | null; em: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION termos_aceite_somente_inclusao() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'Aceite dos Termos de Uso é somente inclusão.';
        END; $$ LANGUAGE plpgsql;`);
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_AceiteTermoUso_imutavel') THEN
            CREATE TRIGGER "trg_AceiteTermoUso_imutavel" BEFORE UPDATE OR DELETE ON "AceiteTermoUso"
              FOR EACH ROW EXECUTE FUNCTION termos_aceite_somente_inclusao();
          END IF;
        END $$;`);
      /* Versão 1 (modelo) em rascunho, para o RH revisar e publicar. */
      if ((await this.prisma.termoUso.count()) === 0) {
        await this.prisma.termoUso.create({
          data: {
            versao: 1,
            titulo: TITULO_TERMO_PADRAO,
            conteudo: TEXTO_TERMO_PADRAO,
            status: "RASCUNHO",
            criadoPorNome: "Sistema (modelo inicial)"
          }
        });
        this.logger.log("Termos de Uso: versão 1 criada em rascunho para revisão do RH.");
      }
    } catch (e) {
      this.logger.error(`Termos de Uso: inicialização falhou: ${(e as Error).message}`);
    }
  }

  /* ─── Identificação do usuário ─── */

  private async usuario(sub: string) {
    const user = await this.prisma.user.findUnique({
      where: { externalId: sub },
      select: { id: true, name: true }
    });
    if (!user)
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    const func = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      select: { id: true, matricula: true }
    });
    return {
      userId: user.id,
      nome: user.name,
      funcionarioId: func?.id ?? null,
      matricula: func?.matricula ?? null
    };
  }

  private async vigenteId(): Promise<string | null> {
    if (this.vigenteCache && Date.now() - this.vigenteCache.em < 60_000)
      return this.vigenteCache.id;
    const v = await this.prisma.termoUso.findFirst({
      where: { status: "PUBLICADO" },
      select: { id: true }
    });
    this.vigenteCache = { id: v?.id ?? null, em: Date.now() };
    return this.vigenteCache.id;
  }

  private limparCaches() {
    this.pendenciaCache.clear();
    this.vigenteCache = null;
  }

  /** Há versão publicada sem aceite deste usuário? (usado pelo bloqueio da API) */
  async pendente(sub: string): Promise<boolean> {
    const c = this.pendenciaCache.get(sub);
    if (c && Date.now() - c.em < 60_000) return c.pendente;
    const termoId = await this.vigenteId();
    let pendente = false;
    if (termoId) {
      const user = await this.prisma.user.findUnique({
        where: { externalId: sub },
        select: { id: true }
      });
      if (user) {
        const aceite = await this.prisma.aceiteTermoUso.findUnique({
          where: { termoId_userId: { termoId, userId: user.id } },
          select: { id: true }
        });
        pendente = !aceite;
      }
    }
    if (this.pendenciaCache.size > 5000) this.pendenciaCache.clear();
    this.pendenciaCache.set(sub, { pendente, em: Date.now() });
    return pendente;
  }

  /* ─── Usuário ─── */

  async vigente(sub: string) {
    const u = await this.usuario(sub);
    const termo = await this.prisma.termoUso.findFirst({ where: { status: "PUBLICADO" } });
    if (!termo)
      return { termo: null, aceite: null, usuario: { nome: u.nome, matricula: u.matricula } };
    const aceite = await this.prisma.aceiteTermoUso.findUnique({
      where: { termoId_userId: { termoId: termo.id, userId: u.userId } }
    });
    return {
      termo: {
        id: termo.id,
        versao: termo.versao,
        titulo: termo.titulo,
        conteudo: termo.conteudo,
        resumoAlteracoes: termo.resumoAlteracoes,
        publicadoEm: termo.publicadoEm
      },
      aceite: aceite
        ? {
            aceitoEm: aceite.aceitoEm,
            codigo: aceite.codigo,
            nome: aceite.nome,
            matricula: aceite.matricula
          }
        : null,
      usuario: { nome: u.nome, matricula: u.matricula }
    };
  }

  async aceitar(sub: string, termoId: string, confirmacao: boolean, meta: MetaRequisicao) {
    if (!confirmacao) {
      throw new BadRequestException("Confirme que leu e aceita os Termos de Uso.");
    }
    const termo = await this.prisma.termoUso.findUnique({ where: { id: termoId } });
    if (!termo || termo.status !== "PUBLICADO") {
      throw new BadRequestException(
        "Esta versão dos Termos de Uso não está vigente. Recarregue a página."
      );
    }
    const u = await this.usuario(sub);
    const existente = await this.prisma.aceiteTermoUso.findUnique({
      where: { termoId_userId: { termoId, userId: u.userId } }
    });
    if (existente)
      return { aceitoEm: existente.aceitoEm, codigo: existente.codigo, versao: termo.versao };
    const aceitoEm = new Date();
    const sha256Termo = termo.sha256 ?? sha256(termo.conteudo);
    const codigo = groupCodigoAssinatura(
      sha256(
        [
          u.userId,
          u.matricula ?? "",
          termo.id,
          sha256Termo,
          aceitoEm.toISOString(),
          meta.ipReal
        ].join("|")
      ).toUpperCase(),
      32
    );
    const a = await this.prisma.aceiteTermoUso.create({
      data: {
        termoId,
        userId: u.userId,
        funcionarioId: u.funcionarioId,
        nome: u.nome,
        matricula: u.matricula,
        aceitoEm,
        ip: meta.ipReal,
        ipGateway: meta.ipGateway,
        userAgent: meta.userAgent,
        sha256Termo,
        codigo
      }
    });
    this.pendenciaCache.delete(sub);
    return {
      aceitoEm: a.aceitoEm,
      codigo: a.codigo,
      versao: termo.versao,
      nome: a.nome,
      matricula: a.matricula
    };
  }

  async meusAceites(sub: string) {
    const u = await this.usuario(sub);
    return this.prisma.aceiteTermoUso.findMany({
      where: { userId: u.userId },
      orderBy: { aceitoEm: "desc" },
      select: {
        aceitoEm: true,
        codigo: true,
        nome: true,
        matricula: true,
        termo: { select: { versao: true, titulo: true, status: true } }
      }
    });
  }

  /* ─── RH: versões ─── */

  async listar() {
    const termos = await this.prisma.termoUso.findMany({
      orderBy: { versao: "desc" },
      select: {
        id: true,
        versao: true,
        titulo: true,
        status: true,
        resumoAlteracoes: true,
        versaoAnteriorId: true,
        criadoPorNome: true,
        publicadoPorNome: true,
        publicadoEm: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { aceites: true } }
      }
    });
    const totalUsuarios = await this.prisma.user.count();
    const versaoDe = new Map(termos.map((t) => [t.id, t.versao]));
    return {
      totalUsuarios,
      termos: termos.map((t) => ({
        ...t,
        aceites: t._count.aceites,
        derivadaDaVersao: t.versaoAnteriorId ? (versaoDe.get(t.versaoAnteriorId) ?? null) : null
      }))
    };
  }

  async obter(id: string) {
    const t = await this.prisma.termoUso.findUnique({ where: { id } });
    if (!t) throw new NotFoundException("Versão dos Termos de Uso não encontrada.");
    const anterior = t.versaoAnteriorId
      ? await this.prisma.termoUso.findUnique({
          where: { id: t.versaoAnteriorId },
          select: { id: true, versao: true, conteudo: true }
        })
      : await this.prisma.termoUso.findFirst({
          where: { versao: { lt: t.versao } },
          orderBy: { versao: "desc" },
          select: { id: true, versao: true, conteudo: true }
        });
    return { ...t, anterior };
  }

  private async proximaVersao() {
    const ult = await this.prisma.termoUso.aggregate({ _max: { versao: true } });
    return (ult._max.versao ?? 0) + 1;
  }

  private validarTexto(titulo?: string, conteudo?: string) {
    if (titulo !== undefined && !titulo.trim()) throw new BadRequestException("Informe o título.");
    if (conteudo !== undefined && conteudo.trim().length < 50) {
      throw new BadRequestException("O texto dos Termos de Uso está muito curto.");
    }
  }

  /** Novo termo em rascunho (em branco ou a partir do modelo padrão). */
  async criar(dto: { titulo?: string; conteudo?: string; usarModelo?: boolean }, autor: Autor) {
    const titulo = dto.titulo?.trim() || TITULO_TERMO_PADRAO;
    const conteudo = dto.usarModelo || !dto.conteudo ? TEXTO_TERMO_PADRAO : dto.conteudo;
    this.validarTexto(titulo, conteudo);
    return this.prisma.termoUso.create({
      data: {
        versao: await this.proximaVersao(),
        titulo: titulo.slice(0, 200),
        conteudo,
        status: "RASCUNHO",
        criadoPorNome: autor.nome
      },
      select: { id: true, versao: true }
    });
  }

  /** "Editar" uma versão publicada (ou substituída): cria um rascunho novo a partir dela — a original fica intacta. */
  async editar(id: string, autor: Autor) {
    const base = await this.prisma.termoUso.findUnique({ where: { id } });
    if (!base) throw new NotFoundException("Versão dos Termos de Uso não encontrada.");
    if (base.status === "RASCUNHO") return { id: base.id, versao: base.versao };
    const ja = await this.prisma.termoUso.findFirst({
      where: { status: "RASCUNHO", versaoAnteriorId: id },
      select: { id: true, versao: true }
    });
    if (ja) return ja;
    return this.prisma.termoUso.create({
      data: {
        versao: await this.proximaVersao(),
        titulo: base.titulo,
        conteudo: base.conteudo,
        status: "RASCUNHO",
        versaoAnteriorId: base.id,
        criadoPorNome: autor.nome
      },
      select: { id: true, versao: true }
    });
  }

  async atualizarRascunho(
    id: string,
    dto: { titulo?: string; conteudo?: string; resumoAlteracoes?: string }
  ) {
    const t = await this.prisma.termoUso.findUnique({ where: { id } });
    if (!t) throw new NotFoundException("Versão dos Termos de Uso não encontrada.");
    if (t.status !== "RASCUNHO") {
      throw new BadRequestException(
        "Versão publicada não se edita: use Editar para criar uma nova versão."
      );
    }
    this.validarTexto(dto.titulo, dto.conteudo);
    await this.prisma.termoUso.update({
      where: { id },
      data: {
        ...(dto.titulo !== undefined ? { titulo: dto.titulo.trim().slice(0, 200) } : {}),
        ...(dto.conteudo !== undefined ? { conteudo: dto.conteudo } : {}),
        ...(dto.resumoAlteracoes !== undefined
          ? { resumoAlteracoes: dto.resumoAlteracoes.trim().slice(0, 1000) || null }
          : {})
      }
    });
    return { ok: true };
  }

  async publicar(id: string, resumoAlteracoes: string | undefined, autor: Autor) {
    const t = await this.prisma.termoUso.findUnique({ where: { id } });
    if (!t) throw new NotFoundException("Versão dos Termos de Uso não encontrada.");
    if (t.status !== "RASCUNHO")
      throw new BadRequestException("Só um rascunho pode ser publicado.");
    const haPublicada = (await this.prisma.termoUso.count({ where: { status: "PUBLICADO" } })) > 0;
    const resumo = (resumoAlteracoes ?? t.resumoAlteracoes ?? "").trim();
    if (haPublicada && !resumo) {
      throw new BadRequestException("Informe o resumo das alterações desta versão.");
    }
    this.validarTexto(t.titulo, t.conteudo);
    await this.prisma.$transaction([
      this.prisma.termoUso.updateMany({
        where: { status: "PUBLICADO" },
        data: { status: "SUBSTITUIDO" }
      }),
      this.prisma.termoUso.update({
        where: { id },
        data: {
          status: "PUBLICADO",
          resumoAlteracoes: resumo || "Versão inicial.",
          sha256: sha256(t.conteudo),
          publicadoEm: new Date(),
          publicadoPorNome: autor.nome
        }
      })
    ]);
    this.limparCaches();
    return { ok: true };
  }

  async excluirRascunho(id: string) {
    const t = await this.prisma.termoUso.findUnique({ where: { id }, select: { status: true } });
    if (!t) throw new NotFoundException("Versão dos Termos de Uso não encontrada.");
    if (t.status !== "RASCUNHO") throw new BadRequestException("Só um rascunho pode ser excluído.");
    await this.prisma.termoUso.delete({ where: { id } });
    return { ok: true };
  }

  /** Aceites de uma versão e quem ainda não aceitou (usuários com login). */
  async aceites(id: string) {
    const t = await this.prisma.termoUso.findUnique({
      where: { id },
      select: { id: true, versao: true }
    });
    if (!t) throw new NotFoundException("Versão dos Termos de Uso não encontrada.");
    const [aceites, usuarios] = await Promise.all([
      this.prisma.aceiteTermoUso.findMany({
        where: { termoId: id },
        orderBy: { aceitoEm: "desc" },
        select: {
          userId: true,
          nome: true,
          matricula: true,
          aceitoEm: true,
          ip: true,
          codigo: true
        }
      }),
      this.prisma.user.findMany({
        select: { id: true, name: true, funcionario: { select: { matricula: true, ativo: true } } },
        orderBy: { name: "asc" }
      })
    ]);
    const aceitaram = new Set(aceites.map((a) => a.userId));
    const pendentes = usuarios
      .filter((u) => !aceitaram.has(u.id) && u.funcionario?.ativo !== false)
      .map((u) => ({ nome: u.name, matricula: u.funcionario?.matricula ?? null }));
    return { versao: t.versao, aceites, pendentes };
  }
}
