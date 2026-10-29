import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { existsSync } from "fs";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificacaoService } from "../notificacao/notificacao.service";
import { dataCivilISO, hojeBrasiliaISO } from "../../utils/horario-brasilia";
import { situacaoDoExame, vencimentoPeriodico } from "../../utils/exame-ocupacional";
import { inteiroConfig } from "../../utils/licenca-regras";

const RESULTADOS = ["APTO", "INAPTO"] as const;
const TIPOS_EXAME = ["ADMISSIONAL", "PERIODICO", "RETORNO_AO_TRABALHO"] as const;
const TAMANHO_MAX_BYTES = 8 * 1024 * 1024;
const MIME_PERMITIDOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png"
};

const fmtBr = (iso: string) => iso.split("-").reverse().join("/");

export interface ConfigExames {
  periodicidadeMeses: number;
  avisoDias: number;
}

type ExameRow = Awaited<ReturnType<PrismaService["exameOcupacional"]["findFirstOrThrow"]>>;

/**
 * Exame médico ocupacional PERIÓDICO (ASO): controle do RH, envio pelo funcionário em
 * "Minhas Requisições" e conferência. Dado de saúde (LGPD): só RH autorizado e o dono.
 */
@Injectable()
export class SaudeOcupacionalService {
  private readonly logger = new Logger(SaudeOcupacionalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacao: NotificacaoService
  ) {}

  /* ─── Configuração ─── */

  async getConfig(): Promise<ConfigExames> {
    const c = await this.prisma.configuracaoSistema.findUnique({
      where: { id: "singleton" },
      select: { exameOcupacionalPeriodicidadeMeses: true, exameOcupacionalAvisoDias: true }
    });
    return {
      periodicidadeMeses: c?.exameOcupacionalPeriodicidadeMeses ?? 12,
      avisoDias: c?.exameOcupacionalAvisoDias ?? 30
    };
  }

  async setConfig(body: { periodicidadeMeses?: unknown; avisoDias?: unknown }) {
    let periodicidade: number | null;
    let aviso: number | null;
    try {
      periodicidade = inteiroConfig(body.periodicidadeMeses, "Periodicidade (meses)");
      aviso = inteiroConfig(body.avisoDias, "Aviso (dias)");
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (!periodicidade || periodicidade < 1 || periodicidade > 60) {
      throw new BadRequestException("Periodicidade: informe de 1 a 60 meses.");
    }
    if (aviso === null || aviso < 0 || aviso > 365) {
      throw new BadRequestException("Aviso: informe de 0 a 365 dias.");
    }
    await this.prisma.configuracaoSistema.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        exameOcupacionalPeriodicidadeMeses: periodicidade,
        exameOcupacionalAvisoDias: aviso
      },
      update: {
        exameOcupacionalPeriodicidadeMeses: periodicidade,
        exameOcupacionalAvisoDias: aviso
      }
    });
    return this.getConfig();
  }

  /* ─── Arquivos (fora da pasta pública) ─── */

  private get dirPrivado() {
    return join(process.env.UPLOAD_PRIVATE_DIR ?? join(process.cwd(), "uploads-privado"), "exames");
  }

  /** Confere tipo e tamanho do ASO ANTES de criar qualquer registro. */
  private validarArquivo(base64: string) {
    const m = /^data:([^;]+);base64,/.exec(base64);
    const mime = m?.[1] ?? "application/pdf";
    const ext = MIME_PERMITIDOS[mime];
    if (!ext) throw new BadRequestException("Anexe o ASO em PDF, JPG ou PNG.");
    const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!buf.length) throw new BadRequestException("Arquivo vazio.");
    if (buf.length > TAMANHO_MAX_BYTES) throw new BadRequestException("Arquivo acima de 8 MB.");
    return { mime, ext, buf };
  }

  private async salvarArquivo(funcionarioId: string, exameId: string, base64: string) {
    const { mime, ext, buf } = this.validarArquivo(base64);
    const dir = join(this.dirPrivado, funcionarioId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const caminho = join(dir, `${exameId}.${ext}`);
    await writeFile(caminho, buf);
    return { caminho, mime };
  }

  async lerArquivo(exameId: string, user: { funcionarioId?: string; rh: boolean }) {
    const ex = await this.prisma.exameOcupacional.findUnique({ where: { id: exameId } });
    if (!ex || !ex.arquivoCaminho) throw new NotFoundException("Arquivo não encontrado.");
    if (!user.rh && ex.funcionarioId !== user.funcionarioId) {
      throw new ForbiddenException("Sem acesso a este documento.");
    }
    return {
      buffer: await readFile(ex.arquivoCaminho),
      mime: ex.mimeType ?? "application/pdf",
      nome: ex.nomeArquivo ?? "ASO.pdf"
    };
  }

  /* ─── Utilitários ─── */

  private validarEntrada(body: {
    dataRealizacao?: string;
    resultado?: string | null;
    tipo?: string | null;
  }) {
    const hoje = hojeBrasiliaISO();
    const data = String(body.dataRealizacao ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new BadRequestException("Informe a data do exame.");
    }
    if (data > hoje) throw new BadRequestException("A data do exame não pode ser futura.");
    if (body.resultado && !(RESULTADOS as readonly string[]).includes(body.resultado)) {
      throw new BadRequestException("Resultado inválido.");
    }
    if (body.tipo && !(TIPOS_EXAME as readonly string[]).includes(body.tipo)) {
      throw new BadRequestException("Tipo de exame inválido.");
    }
    return data;
  }

  private async nomeUsuario(sub: string) {
    const u = await this.prisma.user.findFirst({
      where: { externalId: sub },
      select: { id: true, name: true }
    });
    return { id: u?.id ?? null, nome: u?.name ?? "RH" };
  }

  async funcionarioDoUsuario(sub: string) {
    const user = await this.prisma.user.findFirst({ where: { externalId: sub } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    const f = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      select: { id: true, categoria: true }
    });
    if (!f) throw new NotFoundException("Funcionário não encontrado.");
    return f;
  }

  private serializar(e: ExameRow) {
    return {
      id: e.id,
      funcionarioId: e.funcionarioId,
      dataRealizacao: dataCivilISO(e.dataRealizacao),
      situacao: e.situacao,
      resultado: e.resultado,
      tipo: e.tipo,
      medico: e.medico,
      clinica: e.clinica,
      proximoVencimento: e.proximoVencimento ? dataCivilISO(e.proximoVencimento) : null,
      temArquivo: !!e.arquivoCaminho,
      nomeArquivo: e.nomeArquivo,
      origem: e.origem,
      requisicaoDestinatarioId: e.requisicaoDestinatarioId,
      motivoDevolucao: e.motivoDevolucao,
      observacao: e.observacao,
      registradoPorNome: e.registradoPorNome,
      conferidoPorNome: e.conferidoPorNome,
      conferidoEm: e.conferidoEm,
      createdAt: e.createdAt
    };
  }

  /* ─── Painel do RH ─── */

  async painel(filtros: { busca?: string; gerenciaId?: string; situacao?: string }) {
    const cfg = await this.getConfig();
    const hoje = hojeBrasiliaISO();
    const funcs = await this.prisma.funcionario.findMany({
      where: {
        ativo: true,
        /* Estagiários não participam da saúde ocupacional. */
        categoria: { not: "ESTAGIARIO" },
        ...(filtros.gerenciaId ? { gerenciaId: filtros.gerenciaId } : {})
      },
      select: {
        id: true,
        matricula: true,
        categoria: true,
        cargo: true,
        gerencia: { select: { nome: true, sigla: true } },
        user: { select: { name: true } }
      },
      orderBy: { user: { name: "asc" } }
    });
    const exames = await this.prisma.exameOcupacional.findMany({
      where: { funcionarioId: { in: funcs.map((f) => f.id) } },
      orderBy: [{ dataRealizacao: "desc" }, { createdAt: "desc" }]
    });
    const porFunc = new Map<string, ExameRow[]>();
    for (const e of exames)
      porFunc.set(e.funcionarioId, [...(porFunc.get(e.funcionarioId) ?? []), e]);

    const busca = filtros.busca?.trim().toLowerCase();
    let itens = funcs.map((f) => {
      const lista = porFunc.get(f.id) ?? [];
      const ultimo = lista.find((e) => e.situacao === "CONFIRMADO");
      const pendente = lista.find((e) => e.situacao === "AGUARDANDO_CONFERENCIA");
      const venc = ultimo?.proximoVencimento ? dataCivilISO(ultimo.proximoVencimento) : null;
      const sit = situacaoDoExame(venc, hoje, cfg.avisoDias);
      return {
        funcionarioId: f.id,
        nome: f.user.name,
        matricula: f.matricula,
        categoria: f.categoria,
        gerencia: f.gerencia?.sigla ?? f.gerencia?.nome ?? null,
        ultimoExame: ultimo ? dataCivilISO(ultimo.dataRealizacao) : null,
        resultado: ultimo?.resultado ?? null,
        proximoVencimento: venc,
        situacao: sit.situacao,
        diasParaVencer: sit.diasParaVencer,
        aguardandoConferencia: pendente
          ? { id: pendente.id, dataRealizacao: dataCivilISO(pendente.dataRealizacao) }
          : null
      };
    });
    const resumo = {
      total: itens.length,
      emDia: itens.filter((i) => i.situacao === "EM_DIA").length,
      aVencer: itens.filter((i) => i.situacao === "A_VENCER").length,
      vencidos: itens.filter((i) => i.situacao === "VENCIDO").length,
      semExame: itens.filter((i) => i.situacao === "SEM_EXAME").length,
      aguardandoConferencia: itens.filter((i) => i.aguardandoConferencia).length
    };
    if (busca) {
      itens = itens.filter(
        (i) =>
          i.nome.toLowerCase().includes(busca) || (i.matricula ?? "").toLowerCase().includes(busca)
      );
    }
    if (filtros.situacao === "AGUARDANDO_CONFERENCIA") {
      itens = itens.filter((i) => i.aguardandoConferencia);
    } else if (filtros.situacao) {
      itens = itens.filter((i) => i.situacao === filtros.situacao);
    }
    const peso = (i: (typeof itens)[number]) =>
      i.proximoVencimento ?? (i.situacao === "SEM_EXAME" ? "9999-12-31" : "9999-12-30");
    itens.sort((a, b) => peso(a).localeCompare(peso(b)) || a.nome.localeCompare(b.nome));
    return { config: cfg, resumo, itens };
  }

  async examesDoFuncionario(funcionarioId: string) {
    const rows = await this.prisma.exameOcupacional.findMany({
      where: { funcionarioId },
      orderBy: [{ dataRealizacao: "desc" }, { createdAt: "desc" }]
    });
    return rows.map((r) => this.serializar(r));
  }

  /* ─── RH: lançar, editar, conferir, devolver, excluir ─── */

  async registrarPeloRh(
    funcionarioId: string,
    body: {
      dataRealizacao?: string;
      resultado?: string;
      tipo?: string;
      medico?: string;
      clinica?: string;
      observacao?: string;
      arquivoBase64?: string;
      nomeArquivo?: string;
    },
    sub: string
  ) {
    const data = this.validarEntrada(body);
    if (!body.tipo) throw new BadRequestException("Informe o tipo do exame.");
    if (!body.resultado) throw new BadRequestException("Informe o resultado do exame.");
    if (body.arquivoBase64) this.validarArquivo(body.arquivoBase64);
    await this.prisma.funcionario.findUniqueOrThrow({ where: { id: funcionarioId } });
    const cfg = await this.getConfig();
    const ator = await this.nomeUsuario(sub);
    const criado = await this.prisma.exameOcupacional.create({
      data: {
        funcionarioId,
        dataRealizacao: new Date(`${data}T12:00:00Z`),
        situacao: "CONFIRMADO",
        resultado: body.resultado,
        tipo: body.tipo,
        medico: body.medico?.trim() || null,
        clinica: body.clinica?.trim() || null,
        observacao: body.observacao?.trim() || null,
        proximoVencimento: new Date(
          `${vencimentoPeriodico(data, cfg.periodicidadeMeses)}T12:00:00Z`
        ),
        origem: "RH",
        registradoPorNome: ator.nome,
        registradoPorUserId: ator.id,
        conferidoPorNome: ator.nome,
        conferidoPorUserId: ator.id,
        conferidoEm: new Date()
      }
    });
    if (body.arquivoBase64) {
      const a = await this.salvarArquivo(funcionarioId, criado.id, body.arquivoBase64);
      await this.prisma.exameOcupacional.update({
        where: { id: criado.id },
        data: { arquivoCaminho: a.caminho, mimeType: a.mime, nomeArquivo: body.nomeArquivo ?? null }
      });
    }
    return this.serializar(
      await this.prisma.exameOcupacional.findUniqueOrThrow({ where: { id: criado.id } })
    );
  }

  async editar(
    id: string,
    body: {
      dataRealizacao?: string;
      resultado?: string | null;
      tipo?: string;
      medico?: string | null;
      clinica?: string | null;
      observacao?: string | null;
      arquivoBase64?: string;
      nomeArquivo?: string;
    }
  ) {
    const ex = await this.prisma.exameOcupacional.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException("Exame não encontrado.");
    const data = this.validarEntrada({
      dataRealizacao: body.dataRealizacao ?? dataCivilISO(ex.dataRealizacao),
      resultado: body.resultado === undefined ? ex.resultado : body.resultado,
      tipo: body.tipo
    });
    if (body.arquivoBase64) this.validarArquivo(body.arquivoBase64);
    const cfg = await this.getConfig();
    const dados: Record<string, unknown> = {
      dataRealizacao: new Date(`${data}T12:00:00Z`),
      ...(body.resultado !== undefined ? { resultado: body.resultado || null } : {}),
      ...(body.tipo ? { tipo: body.tipo } : {}),
      ...(body.medico !== undefined ? { medico: body.medico?.trim() || null } : {}),
      ...(body.clinica !== undefined ? { clinica: body.clinica?.trim() || null } : {}),
      ...(body.observacao !== undefined ? { observacao: body.observacao?.trim() || null } : {})
    };
    if (ex.situacao === "CONFIRMADO") {
      dados.proximoVencimento = new Date(
        `${vencimentoPeriodico(data, cfg.periodicidadeMeses)}T12:00:00Z`
      );
      /* Data mudou: os avisos valem de novo. */
      dados.avisoAVencerEm = null;
      dados.avisoVencidoEm = null;
    }
    if (body.arquivoBase64) {
      const a = await this.salvarArquivo(ex.funcionarioId, ex.id, body.arquivoBase64);
      dados.arquivoCaminho = a.caminho;
      dados.mimeType = a.mime;
      dados.nomeArquivo = body.nomeArquivo ?? ex.nomeArquivo;
    }
    const up = await this.prisma.exameOcupacional.update({ where: { id }, data: dados });
    return this.serializar(up);
  }

  async confirmar(
    id: string,
    body: { resultado?: string; dataRealizacao?: string; medico?: string; clinica?: string },
    sub: string
  ) {
    const ex = await this.prisma.exameOcupacional.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException("Exame não encontrado.");
    if (ex.situacao !== "AGUARDANDO_CONFERENCIA") {
      throw new BadRequestException("Este exame não está aguardando conferência.");
    }
    if (!body.resultado) throw new BadRequestException("Informe o resultado do ASO.");
    const data = this.validarEntrada({
      dataRealizacao: body.dataRealizacao ?? dataCivilISO(ex.dataRealizacao),
      resultado: body.resultado
    });
    const cfg = await this.getConfig();
    const ator = await this.nomeUsuario(sub);
    const up = await this.prisma.exameOcupacional.update({
      where: { id },
      data: {
        situacao: "CONFIRMADO",
        resultado: body.resultado,
        dataRealizacao: new Date(`${data}T12:00:00Z`),
        ...(body.medico !== undefined ? { medico: body.medico.trim() || null } : {}),
        ...(body.clinica !== undefined ? { clinica: body.clinica.trim() || null } : {}),
        proximoVencimento: new Date(
          `${vencimentoPeriodico(data, cfg.periodicidadeMeses)}T12:00:00Z`
        ),
        motivoDevolucao: null,
        conferidoPorNome: ator.nome,
        conferidoPorUserId: ator.id,
        conferidoEm: new Date(),
        avisoAVencerEm: null,
        avisoVencidoEm: null
      }
    });
    if (ex.requisicaoDestinatarioId) {
      await this.prisma.requisicaoRhDestinatario
        .update({
          where: { id: ex.requisicaoDestinatarioId },
          data: {
            status: "RESPONDIDO",
            respondidaEm: new Date(),
            respostaTexto: `Exame periódico de ${fmtBr(data)} confirmado pelo RH.`
          }
        })
        .catch(() => undefined);
    }
    return this.serializar(up);
  }

  async devolver(id: string, motivoBruto: string | undefined, sub: string) {
    const motivo = (motivoBruto ?? "").trim();
    if (motivo.length < 5) throw new BadRequestException("Informe o motivo da devolução.");
    const ex = await this.prisma.exameOcupacional.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException("Exame não encontrado.");
    if (ex.situacao !== "AGUARDANDO_CONFERENCIA") {
      throw new BadRequestException("Este exame não está aguardando conferência.");
    }
    const ator = await this.nomeUsuario(sub);
    const up = await this.prisma.exameOcupacional.update({
      where: { id },
      data: {
        situacao: "DEVOLVIDO",
        motivoDevolucao: motivo,
        conferidoPorNome: ator.nome,
        conferidoPorUserId: ator.id,
        conferidoEm: new Date()
      }
    });
    if (ex.requisicaoDestinatarioId) {
      /* Reabre a requisição para o funcionário reenviar. */
      await this.prisma.requisicaoRhDestinatario
        .update({
          where: { id: ex.requisicaoDestinatarioId },
          data: { status: "VISUALIZADO", respondidaEm: null, respostaTexto: null }
        })
        .catch(() => undefined);
    }
    const dest = await this.notificacao.getFuncionarioDestinatario(ex.funcionarioId);
    if (dest) {
      await this.notificacao
        .dispararEvento(
          "EXAME_OCUPACIONAL_DEVOLVIDO",
          "Seu exame médico periódico foi devolvido",
          `O RH devolveu o exame médico periódico enviado. Motivo: ${motivo}\n\n` +
            "Reenvie em Minhas Requisições do RH.",
          [dest]
        )
        .catch((e) => this.logger.error(`EXAME_OCUPACIONAL_DEVOLVIDO: ${e}`));
    }
    return this.serializar(up);
  }

  async excluir(id: string) {
    const ex = await this.prisma.exameOcupacional.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException("Exame não encontrado.");
    await this.prisma.exameOcupacional.delete({ where: { id } });
    if (ex.arquivoCaminho) await unlink(ex.arquivoCaminho).catch(() => undefined);
    return { ok: true };
  }

  /* ─── RH: solicitar exame (cria Requisição do RH tipo EXAME_MEDICO) ─── */

  async solicitar(
    body: {
      funcionarioIds?: string[];
      modo?: "SELECIONADOS" | "TODOS" | "VENCIDOS_E_A_VENCER";
      prazo?: string;
      mensagem?: string;
      /** Documento opcional do RH (orientações, guia, encaminhamento) anexado ao pedido. */
      arquivoBase64?: string;
      nomeArquivo?: string;
    },
    sub: string
  ) {
    const ator = await this.nomeUsuario(sub);
    if (!ator.id) throw new ForbiddenException("Usuário do RH não encontrado.");
    if (body.arquivoBase64) this.validarArquivo(body.arquivoBase64);
    let ids = Array.isArray(body.funcionarioIds) ? [...new Set(body.funcionarioIds)] : [];
    if (body.modo === "TODOS" || body.modo === "VENCIDOS_E_A_VENCER") {
      const p = await this.painel({});
      ids = p.itens
        .filter(
          (i) => body.modo === "TODOS" || i.situacao === "VENCIDO" || i.situacao === "A_VENCER"
        )
        .map((i) => i.funcionarioId);
    }
    if (!ids.length) throw new BadRequestException("Nenhum funcionário selecionado.");
    if (body.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(body.prazo)) {
      throw new BadRequestException("Prazo inválido.");
    }
    /* Quem já tem pedido de exame em aberto não recebe outro. */
    const abertos = await this.prisma.requisicaoRhDestinatario.findMany({
      where: {
        funcionarioId: { in: ids },
        status: { not: "RESPONDIDO" },
        requisicao: { tipo: "EXAME_MEDICO", ativa: true }
      },
      select: { funcionarioId: true }
    });
    const jaTem = new Set(abertos.map((a) => a.funcionarioId));
    const alvo = ids.filter((i) => !jaTem.has(i));
    if (!alvo.length) {
      throw new BadRequestException("Todos os selecionados já têm um pedido de exame em aberto.");
    }
    const titulo = "Exame médico ocupacional periódico";
    const req = await this.prisma.requisicaoRh.create({
      data: {
        tipo: "EXAME_MEDICO",
        titulo,
        descricao:
          (body.mensagem?.trim() ? `${body.mensagem.trim()}\n\n` : "") +
          "Informe a data do exame e anexe o ASO em Minhas Requisições do RH.",
        prazo: body.prazo ? new Date(`${body.prazo}T12:00:00Z`) : null,
        criadoPorId: ator.id,
        destinatarios: { create: alvo.map((funcionarioId) => ({ funcionarioId })) }
      }
    });
    if (body.arquivoBase64) {
      const { mime, ext, buf } = this.validarArquivo(body.arquivoBase64);
      void mime;
      const dir = join(
        process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"),
        "requisicoes-rh",
        "rh-docs"
      );
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${req.id}.${ext}`), buf);
      await this.prisma.requisicaoRh.update({
        where: { id: req.id },
        data: { arquivoUrl: `/uploads/requisicoes-rh/rh-docs/${req.id}.${ext}` }
      });
    }
    const dests = await this.notificacao.getDestinatariosFuncionarios(alvo);
    if (dests.length) {
      await this.notificacao
        .dispararEvento(
          "REQUISICAO_RH",
          titulo,
          (body.prazo ? `Prazo: ${fmtBr(body.prazo)}\n\n` : "") +
            "O RH solicitou o seu exame médico periódico. Acesse Minhas Requisições do RH para enviar.",
          dests
        )
        .catch((e) => this.logger.error(`REQUISICAO_RH exame: ${e}`));
    }
    return { requisicaoId: req.id, criadas: alvo.length, ignoradas: ids.length - alvo.length };
  }

  /* ─── Funcionário ─── */

  async meusExames(sub: string) {
    const f = await this.funcionarioDoUsuario(sub);
    const cfg = await this.getConfig();
    const rows = await this.prisma.exameOcupacional.findMany({
      where: { funcionarioId: f.id },
      orderBy: [{ dataRealizacao: "desc" }, { createdAt: "desc" }]
    });
    const ultimo = rows.find((r) => r.situacao === "CONFIRMADO");
    const venc = ultimo?.proximoVencimento ? dataCivilISO(ultimo.proximoVencimento) : null;
    const sit = situacaoDoExame(venc, hojeBrasiliaISO(), cfg.avisoDias);
    return {
      config: cfg,
      situacao: sit.situacao,
      diasParaVencer: sit.diasParaVencer,
      proximoVencimento: venc,
      ultimoExame: ultimo ? dataCivilISO(ultimo.dataRealizacao) : null,
      aguardandoConferencia: rows.some((r) => r.situacao === "AGUARDANDO_CONFERENCIA"),
      exames: rows.map((r) => this.serializar(r))
    };
  }

  async enviarMeuExame(
    sub: string,
    body: {
      dataRealizacao?: string;
      medico?: string;
      clinica?: string;
      observacao?: string;
      arquivoBase64?: string;
      nomeArquivo?: string;
      destinatarioId?: string;
    }
  ) {
    const f = await this.funcionarioDoUsuario(sub);
    const data = this.validarEntrada(body);
    if (!body.arquivoBase64) throw new BadRequestException("Anexe o ASO (PDF, JPG ou PNG).");
    this.validarArquivo(body.arquivoBase64);
    const pendente = await this.prisma.exameOcupacional.findFirst({
      where: { funcionarioId: f.id, situacao: "AGUARDANDO_CONFERENCIA" }
    });
    if (pendente) {
      throw new BadRequestException(
        "Você já tem um exame aguardando conferência do RH. Aguarde a análise antes de enviar outro."
      );
    }
    if (body.destinatarioId) {
      const d = await this.prisma.requisicaoRhDestinatario.findFirst({
        where: {
          id: body.destinatarioId,
          funcionarioId: f.id,
          requisicao: { tipo: "EXAME_MEDICO", ativa: true }
        }
      });
      if (!d) throw new NotFoundException("Requisição de exame não encontrada.");
      if (d.status === "RESPONDIDO") {
        throw new BadRequestException("Esta requisição já foi respondida.");
      }
    }
    const criado = await this.prisma.exameOcupacional.create({
      data: {
        funcionarioId: f.id,
        dataRealizacao: new Date(`${data}T12:00:00Z`),
        situacao: "AGUARDANDO_CONFERENCIA",
        medico: body.medico?.trim() || null,
        clinica: body.clinica?.trim() || null,
        observacao: body.observacao?.trim() || null,
        origem: "FUNCIONARIO",
        requisicaoDestinatarioId: body.destinatarioId ?? null
      }
    });
    const a = await this.salvarArquivo(f.id, criado.id, body.arquivoBase64);
    await this.prisma.exameOcupacional.update({
      where: { id: criado.id },
      data: { arquivoCaminho: a.caminho, mimeType: a.mime, nomeArquivo: body.nomeArquivo ?? null }
    });
    if (body.destinatarioId) {
      await this.prisma.requisicaoRhDestinatario.update({
        where: { id: body.destinatarioId },
        data: { status: "VISUALIZADO", visualizadaEm: new Date() }
      });
    }
    const [rh, func] = await Promise.all([
      this.notificacao.getUsuariosRh(),
      this.prisma.funcionario.findUnique({
        where: { id: f.id },
        select: { user: { select: { name: true } } }
      })
    ]);
    if (rh.length) {
      await this.notificacao
        .dispararEvento(
          "EXAME_OCUPACIONAL_ENVIADO",
          `${func?.user.name ?? "Funcionário"} enviou o exame periódico`,
          `Exame realizado em ${fmtBr(data)} aguardando conferência em Saúde Ocupacional.`,
          rh
        )
        .catch((e) => this.logger.error(`EXAME_OCUPACIONAL_ENVIADO: ${e}`));
    }
    return this.serializar(
      await this.prisma.exameOcupacional.findUniqueOrThrow({ where: { id: criado.id } })
    );
  }

  /* ─── Avisos diários ─── */

  @Cron("30 7 * * *", { timeZone: "America/Sao_Paulo" })
  async avisarVencimentos() {
    try {
      const cfg = await this.getConfig();
      const hoje = hojeBrasiliaISO();
      const confirmados = await this.prisma.exameOcupacional.findMany({
        where: {
          situacao: "CONFIRMADO",
          funcionario: { ativo: true, categoria: { not: "ESTAGIARIO" } }
        },
        orderBy: [{ dataRealizacao: "desc" }, { createdAt: "desc" }],
        include: { funcionario: { select: { user: { select: { name: true } } } } }
      });
      const vistos = new Set<string>();
      const rh = await this.notificacao.getUsuariosRh();
      for (const ex of confirmados) {
        if (vistos.has(ex.funcionarioId)) continue; /* só o último de cada um vale */
        vistos.add(ex.funcionarioId);
        if (!ex.proximoVencimento) continue;
        const venc = dataCivilISO(ex.proximoVencimento);
        const { situacao } = situacaoDoExame(venc, hoje, cfg.avisoDias);
        const nome = ex.funcionario.user.name;
        const dest = await this.notificacao.getFuncionarioDestinatario(ex.funcionarioId);
        if (situacao === "A_VENCER" && !ex.avisoAVencerEm) {
          const alvo = [...(dest ? [dest] : []), ...rh];
          if (alvo.length) {
            await this.notificacao.dispararEvento(
              "EXAME_OCUPACIONAL_A_VENCER",
              `Exame médico periódico de ${nome} vence em ${fmtBr(venc)}`,
              `O exame médico ocupacional periódico de ${nome} vence em ${fmtBr(venc)}. ` +
                "Providencie o novo exame e envie o ASO em Minhas Requisições do RH.",
              alvo
            );
          }
          await this.prisma.exameOcupacional.update({
            where: { id: ex.id },
            data: { avisoAVencerEm: new Date() }
          });
        } else if (situacao === "VENCIDO" && !ex.avisoVencidoEm) {
          const alvo = [...(dest ? [dest] : []), ...rh];
          if (alvo.length) {
            await this.notificacao.dispararEvento(
              "EXAME_OCUPACIONAL_VENCIDO",
              `Exame médico periódico de ${nome} está vencido`,
              `O exame médico ocupacional periódico de ${nome} venceu em ${fmtBr(venc)}. ` +
                "É preciso realizar o exame e enviar o ASO.",
              alvo
            );
          }
          await this.prisma.exameOcupacional.update({
            where: { id: ex.id },
            data: { avisoVencidoEm: new Date() }
          });
        }
      }
    } catch (e) {
      this.logger.error(`Falha no aviso de exames ocupacionais: ${e}`);
    }
  }
}
