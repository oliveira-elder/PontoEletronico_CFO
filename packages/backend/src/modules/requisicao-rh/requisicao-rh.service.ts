import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException
} from "@nestjs/common";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RequisicaoRhService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Resolução keycloakSub → IDs internos ──────────────────

  /** Converte o sub do Keycloak (externalId) para o User.id interno. */
  private async resolveUserId(keycloakSub: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { externalId: keycloakSub } });
    if (!user)
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    return user.id;
  }

  /** Converte o sub do Keycloak para o Funcionario.id interno. */
  private async resolveFuncionarioId(keycloakSub: string): Promise<string> {
    const userId = await this.resolveUserId(keycloakSub);
    const func = await this.prisma.funcionario.findUnique({ where: { userId } });
    if (!func) throw new ForbiddenException("Funcionário não encontrado para este usuário.");
    return func.id;
  }

  // ── Upload ────────────────────────────────────────────────

  private get uploadDir(): string {
    const base = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
    return join(base, "requisicoes-rh");
  }

  private async salvarArquivo(
    subDir: string,
    id: string,
    base64: string,
    suffix = ""
  ): Promise<string> {
    const dir = join(this.uploadDir, subDir);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const raw = base64.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(raw, "base64");
    const isPdf =
      base64.startsWith("data:application/pdf") ||
      base64.startsWith("data:application/octet-stream");
    const ext = isPdf ? "pdf" : "jpg";
    const filename = `${id}${suffix}.${ext}`;
    await writeFile(join(dir, filename), buf);
    return `/uploads/requisicoes-rh/${subDir}/${filename}`;
  }

  // ── RH: criar ─────────────────────────────────────────────

  async criar(
    keycloakSub: string,
    body: {
      tipo: string;
      titulo: string;
      descricao?: string;
      arquivoBase64?: string;
      prazo?: string;
      destinatarios: {
        modo: "individual" | "gerencia" | "todos" | "categoria";
        funcionarioIds?: string[];
        funcionariosComDocumentos?: { funcionarioId: string; arquivoBase64?: string }[];
        gerenciaId?: string;
        categoria?: string;
      };
    }
  ) {
    const criadoPorId = await this.resolveUserId(keycloakSub);
    const { tipo, titulo, descricao, arquivoBase64, prazo, destinatarios } = body;

    let funcionarioIds: string[] = [];
    if (destinatarios.modo === "individual") {
      if (destinatarios.funcionariosComDocumentos?.length) {
        funcionarioIds = destinatarios.funcionariosComDocumentos.map((f) => f.funcionarioId);
      } else {
        funcionarioIds = destinatarios.funcionarioIds ?? [];
      }
    } else if (destinatarios.modo === "gerencia") {
      if (!destinatarios.gerenciaId) throw new BadRequestException("gerenciaId obrigatório");
      const funcs = await this.prisma.funcionario.findMany({
        where: { gerenciaId: destinatarios.gerenciaId, ativo: true },
        select: { id: true }
      });
      funcionarioIds = funcs.map((f) => f.id);
    } else if (destinatarios.modo === "categoria") {
      if (!destinatarios.categoria) throw new BadRequestException("categoria obrigatória");
      const funcs = await this.prisma.funcionario.findMany({
        where: { categoria: destinatarios.categoria as never, ativo: true },
        select: { id: true }
      });
      funcionarioIds = funcs.map((f) => f.id);
    } else {
      const funcs = await this.prisma.funcionario.findMany({
        where: { ativo: true },
        select: { id: true }
      });
      funcionarioIds = funcs.map((f) => f.id);
    }

    if (funcionarioIds.length === 0)
      throw new BadRequestException("Nenhum destinatário encontrado.");

    const req = await this.prisma.requisicaoRh.create({
      data: {
        tipo: tipo as never,
        titulo,
        descricao: descricao ?? null,
        prazo: prazo ? new Date(prazo + "T12:00:00Z") : null,
        criadoPorId,
        destinatarios: {
          create: funcionarioIds.map((id) => ({ funcionarioId: id }))
        }
      }
    });

    if (arquivoBase64) {
      const url = await this.salvarArquivo("rh-docs", req.id, arquivoBase64);
      await this.prisma.requisicaoRh.update({ where: { id: req.id }, data: { arquivoUrl: url } });
    }

    // Salvar documentos individuais por destinatário
    if (destinatarios.modo === "individual" && destinatarios.funcionariosComDocumentos?.length) {
      const docsMap = new Map(
        destinatarios.funcionariosComDocumentos
          .filter((f) => f.arquivoBase64)
          .map((f) => [f.funcionarioId, f.arquivoBase64!])
      );
      if (docsMap.size > 0) {
        const destRecords = await this.prisma.requisicaoRhDestinatario.findMany({
          where: { requisicaoId: req.id },
          select: { id: true, funcionarioId: true }
        });
        for (const dest of destRecords) {
          const b64 = docsMap.get(dest.funcionarioId);
          if (b64) {
            const url = await this.salvarArquivo(`individuais/${req.id}`, dest.id, b64);
            await this.prisma.requisicaoRhDestinatario.update({
              where: { id: dest.id },
              data: { arquivoIndividualUrl: url }
            });
          }
        }
      }
    }

    return { ...req, totalDestinatarios: funcionarioIds.length };
  }

  // ── RH: listar ────────────────────────────────────────────

  async listarRh(params: { page?: number; limit?: number; tipo?: string; ativa?: string }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.tipo) where.tipo = params.tipo;
    if (params.ativa !== undefined) where.ativa = params.ativa === "true";

    const [total, items] = await Promise.all([
      this.prisma.requisicaoRh.count({ where }),
      this.prisma.requisicaoRh.findMany({
        where,
        orderBy: { criadaEm: "desc" },
        skip,
        take: limit,
        include: {
          criadoPor: { select: { name: true } },
          _count: { select: { destinatarios: true } },
          destinatarios: { select: { status: true } }
        }
      })
    ]);

    const data = items.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      titulo: r.titulo,
      descricao: r.descricao,
      arquivoUrl: r.arquivoUrl,
      prazo: r.prazo,
      ativa: r.ativa,
      criadaEm: r.criadaEm,
      criadoPor: r.criadoPor,
      totalDestinatarios: r._count.destinatarios,
      respondidos: r.destinatarios.filter((d) => d.status === "RESPONDIDO").length,
      visualizados: r.destinatarios.filter((d) => d.status === "VISUALIZADO").length,
      pendentes: r.destinatarios.filter((d) => d.status === "PENDENTE").length
    }));

    return { data, total, page, limit };
  }

  // ── RH: detalhe ───────────────────────────────────────────

  async detalheRh(id: string) {
    const req = await this.prisma.requisicaoRh.findUnique({
      where: { id },
      include: {
        criadoPor: { select: { name: true } },
        destinatarios: {
          orderBy: { createdAt: "asc" },
          include: {
            funcionario: {
              select: {
                id: true,
                cargo: true,
                matricula: true,
                user: { select: { name: true, email: true, emailReal: true } },
                gerencia: { select: { nome: true, sigla: true } }
              }
            }
          }
        }
      }
    });
    if (!req) throw new NotFoundException("Requisição não encontrada.");
    return req;
  }

  // ── RH: desativar ─────────────────────────────────────────

  async desativar(id: string) {
    await this.prisma.requisicaoRh.update({ where: { id }, data: { ativa: false } });
    return { ok: true };
  }

  // ── Funcionário: minhas ───────────────────────────────────

  async minhas(keycloakSub: string) {
    const userId = await this.resolveUserId(keycloakSub);
    const func = await this.prisma.funcionario.findUnique({ where: { userId } });
    if (!func) return [];

    return this.prisma.requisicaoRhDestinatario.findMany({
      where: { funcionarioId: func.id, requisicao: { ativa: true } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        status: true,
        visualizadaEm: true,
        respondidaEm: true,
        respostaTexto: true,
        respostaArquivoUrl: true,
        arquivoIndividualUrl: true,
        requisicao: {
          select: {
            id: true,
            tipo: true,
            titulo: true,
            descricao: true,
            arquivoUrl: true,
            prazo: true,
            criadaEm: true,
            criadoPor: { select: { name: true } }
          }
        }
      }
    });
  }

  // ── Funcionário: visualizar ───────────────────────────────

  async visualizar(destinatarioId: string, keycloakSub: string) {
    const funcionarioId = await this.resolveFuncionarioId(keycloakSub);

    const dest = await this.prisma.requisicaoRhDestinatario.findFirst({
      where: { id: destinatarioId, funcionarioId }
    });
    if (!dest) throw new NotFoundException();

    if (dest.status === "PENDENTE") {
      await this.prisma.requisicaoRhDestinatario.update({
        where: { id: dest.id },
        data: { status: "VISUALIZADO", visualizadaEm: new Date() }
      });
    }
    return { ok: true };
  }

  // ── Funcionário: responder ────────────────────────────────

  async responder(
    destinatarioId: string,
    keycloakSub: string,
    body: { texto?: string; arquivoBase64?: string }
  ) {
    const funcionarioId = await this.resolveFuncionarioId(keycloakSub);

    const dest = await this.prisma.requisicaoRhDestinatario.findFirst({
      where: { id: destinatarioId, funcionarioId }
    });
    if (!dest) throw new NotFoundException();
    if (dest.status === "RESPONDIDO") throw new BadRequestException("Requisição já respondida.");

    let arquivoUrl: string | undefined;
    if (body.arquivoBase64) {
      arquivoUrl = await this.salvarArquivo(
        `respostas/${funcionarioId}`,
        dest.id,
        body.arquivoBase64
      );
    }

    await this.prisma.requisicaoRhDestinatario.update({
      where: { id: dest.id },
      data: {
        status: "RESPONDIDO",
        respondidaEm: new Date(),
        respostaTexto: body.texto ?? null,
        respostaArquivoUrl: arquivoUrl ?? null
      }
    });
    return { ok: true };
  }
}
