import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RepPService } from "../rep/rep-p.service";
import { SeloIcpService } from "../selo-icp/selo-icp.service";
import { createHash, randomBytes } from "crypto";
import {
  buildFundoSeguranca,
  loadAssetBase64,
  marcador,
  MARCADOR_QR_PAGINA
} from "../assinatura/quadro-registro-pdf.builder";
import { AssinaturaService } from "../assinatura/assinatura.service";
import { aplicarAnotacoesVerificacao } from "../../utils/pdf-anotacoes";

const ROTULO_TIPO: Record<string, string> = {
  ENTRADA: "Entrada",
  INICIO_INTERVALO: "Início do intervalo",
  FIM_INTERVALO: "Fim do intervalo",
  SAIDA: "Saída",
  INTERROMPER_EXPEDIENTE: "Pausa",
  REINICIAR_EXPEDIENTE: "Retorno da pausa"
};

const TZ = "America/Sao_Paulo";
const NOME_DIA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado"
];

export interface DadosComprovante {
  nsr: number;
  hash: string;
  dataHoraMarcacao: Date;
  tipoPonto: string;
  trabalhador: { nome: string; cpf: string };
  empregador: { nome: string; cnpj: string; cnoCaepf: string; local: string };
  inpi: string | null;
  homologacao: boolean;
}

const fmtCnpj = (c: string) =>
  c.length === 14 ? c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : c;
const fmtCpf = (c: string) =>
  c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : c;

/** Partes de data/hora em Brasília, no mesmo minuto gravado no AFD (segundos fixos em 00). */
function partesDH(d: Date) {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {});
  const dow = new Date(
    Date.UTC(Number(f.year), Number(f.month) - 1, Number(f.day), 12)
  ).getUTCDay();
  return {
    data: `${f.day}/${f.month}/${f.year}`,
    hora: `${f.hour}:${f.minute}`,
    diaSemana: NOME_DIA[dow]
  };
}

function blocos(hash: string): string[] {
  const l: string[] = [];
  for (let i = 0; i < 64; i += 16) l.push(`${hash.slice(i, i + 8)} ${hash.slice(i + 8, i + 16)}`);
  return l;
}

/**
 * Comprovante de Registro de Ponto do Trabalhador (Portaria MTP 671/2021, arts. 79 e 80).
 * Derivado do livro imutável do REP: todo dado vem de registros até o NSR da marcação, então o
 * comprovante tem sempre o mesmo conteúdo. Gerado sob demanda, assinado em PAdES (ICP-Brasil).
 */
@Injectable()
export class ComprovanteService {
  private readonly logger = new Logger(ComprovanteService.name);
  private readonly cache = new Map<string, { pdf: Buffer; em: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repP: RepPService,
    private readonly selo: SeloIcpService,
    private readonly assinatura: AssinaturaService
  ) {}

  /** Funcionário do usuário autenticado (um trabalhador só acessa os próprios comprovantes). */
  private async funcionarioDoUsuario(sub: string) {
    const user = await this.prisma.user.findUnique({ where: { externalId: sub } });
    if (!user)
      throw new NotFoundException("Perfil não sincronizado. Faça logout e login novamente.");
    const f = await this.prisma.funcionario.findUnique({
      where: { userId: user.id },
      select: { id: true, cpf: true }
    });
    if (!f) throw new NotFoundException("Funcionário não encontrado.");
    return f;
  }

  /** Lista as marcações do trabalhador (padrão: últimas 48 horas, mínimo do art. 80, III). */
  async listar(sub: string, opts: { horas?: number; mes?: number; ano?: number } = {}) {
    const f = await this.funcionarioDoUsuario(sub);
    let desde: Date;
    let ate: Date | undefined;
    if (opts.mes && opts.ano) {
      desde = new Date(`${opts.ano}-${String(opts.mes).padStart(2, "0")}-01T00:00:00-03:00`);
      ate = new Date(desde);
      ate.setUTCMonth(ate.getUTCMonth() + 1);
    } else {
      desde = new Date(Date.now() - Math.min(Math.max(opts.horas ?? 48, 1), 24 * 92) * 3_600_000);
    }
    const marcs = await this.prisma.marcacaoRep.findMany({
      where: {
        funcionarioId: f.id,
        reconstituida: false,
        dataHoraMarcacao: { gte: desde, ...(ate ? { lt: ate } : {}) }
      },
      orderBy: { dataHoraMarcacao: "desc" },
      take: 500
    });
    const inicio = await this.repP.inicioRepP();
    return marcs.map((m) => {
      const p = partesDH(m.dataHoraMarcacao);
      return {
        nsr: m.nsr,
        registroPontoId: m.registroPontoId,
        data: p.data,
        hora: p.hora,
        diaSemana: p.diaSemana,
        tipo: m.tipoPonto,
        rotulo: ROTULO_TIPO[m.tipoPonto] ?? m.tipoPonto,
        homologacao: !(inicio && m.dataHoraGravacao.getTime() >= inicio.getTime()),
        hash: m.hash
      };
    });
  }

  /** Monta os dados do comprovante a partir do livro (empresa e trabalhador vigentes no NSR). */
  async dados(nsr: number, sub?: string): Promise<DadosComprovante> {
    const m = await this.prisma.marcacaoRep.findUnique({ where: { nsr } });
    if (!m || m.reconstituida) throw new NotFoundException("Marcação não encontrada.");
    if (sub) {
      const f = await this.funcionarioDoUsuario(sub);
      if (f.id !== m.funcionarioId) {
        throw new ForbiddenException("Este comprovante pertence a outro trabalhador.");
      }
    }
    const [ev2, ev5, cfg, func] = await Promise.all([
      this.prisma.eventoRep.findFirst({
        where: { tipo: 2, nsr: { lt: m.nsr } },
        orderBy: { nsr: "desc" }
      }),
      this.prisma.eventoRep.findMany({
        where: { tipo: 5, nsr: { lt: m.nsr } },
        orderBy: { nsr: "desc" },
        take: 400
      }),
      this.prisma.configuracaoSistema.findUnique({ where: { id: "singleton" } }),
      this.prisma.funcionario.findUnique({
        where: { id: m.funcionarioId },
        select: { user: { select: { name: true } } }
      })
    ]);
    const d2 = (ev2?.dados ?? {}) as Record<string, unknown>;
    const d5 = (ev5.find((e) => (e.dados as Record<string, unknown>).cpf === m.cpf)?.dados ??
      {}) as Record<string, unknown>;
    const inicio = await this.repP.inicioRepP();
    const emOperacao = !!inicio && m.dataHoraGravacao.getTime() >= inicio.getTime();
    const vig = emOperacao
      ? await this.prisma.vigenciaRep.findFirst({
          where: { tipo: "REP_P" },
          orderBy: { inicio: "asc" }
        })
      : null;
    const str = (v: unknown) => (v == null ? "" : String(v));
    return {
      nsr: m.nsr,
      hash: m.hash,
      dataHoraMarcacao: m.dataHoraMarcacao,
      tipoPonto: m.tipoPonto,
      trabalhador: {
        nome: str(d5.nome) || func?.user?.name || "",
        cpf: m.cpf
      },
      empregador: {
        nome: str(d2.razaoSocial) || cfg?.nome || "",
        cnpj: str(d2.cnpj) || (cfg?.cnpj ?? "").replace(/\D/g, ""),
        cnoCaepf: str(d2.cnoCaepf),
        local:
          str(d2.localPrestacao) ||
          [cfg?.endereco, cfg?.numero, cfg?.bairro, cfg?.cidade, cfg?.uf].filter(Boolean).join(", ")
      },
      inpi: emOperacao ? (vig?.numeroRegistro ?? null) : null,
      homologacao: !emOperacao
    };
  }

  /** PDF (A6) do comprovante, assinado em PAdES quando o e-CNPJ A1 estiver instalado. */
  async pdf(nsr: number, sub?: string): Promise<{ buffer: Buffer; nome: string }> {
    const d = await this.dados(nsr, sub);
    const chave = `${d.nsr}:${d.hash}:${d.homologacao ? "H" : "P"}`;
    const hit = this.cache.get(chave);
    if (hit && Date.now() - hit.em < 10 * 60_000) {
      return { buffer: hit.pdf, nome: this.nomeArquivo(d) };
    }
    const status = this.selo.status();
    const assinavel = !!status.caminhoCertificado && !!status.validadeAte;
    let buffer = await this.renderizar(d, assinavel);
    if (assinavel) {
      let selado = false;
      try {
        const r = await this.selo.selarPdf(buffer, {
          razaoSocial: d.empregador.nome,
          motivo: `Comprovante de Registro de Ponto do Trabalhador — NSR ${String(d.nsr).padStart(9, "0")}`
        });
        selado = r.selado;
        if (selado) buffer = r.pdf;
      } catch (e) {
        this.logger.error(`Assinatura PAdES do comprovante falhou: ${(e as Error).message}`);
      }
      /* O rodapé só afirma "assinado" quando a assinatura foi realmente aplicada. */
      if (!selado) buffer = await this.renderizar(d, false);
    }
    /* Impressão digital do arquivo emitido: permite provar depois que um PDF é o original. */
    await this.prisma.comprovanteEmitido
      .createMany({
        data: [{ nsr: d.nsr, sha256: createHash("sha256").update(buffer).digest("hex") }],
        skipDuplicates: true
      })
      .catch((e) =>
        this.logger.warn(`Registro da impressão digital falhou: ${(e as Error).message}`)
      );
    if (this.cache.size > 300) this.cache.clear();
    this.cache.set(chave, { pdf: buffer, em: Date.now() });
    return { buffer, nome: this.nomeArquivo(d) };
  }

  /** Nº de registro do comprovante: fixo por marcação (NSR + início do hash). */
  private registroDe(d: { nsr: number; hash: string }) {
    return `CRP-${String(d.nsr).padStart(9, "0")}-${d.hash.slice(0, 8).toUpperCase()}`;
  }

  private nomeArquivo(d: DadosComprovante) {
    return `Comprovante-NSR-${String(d.nsr).padStart(9, "0")}.pdf`;
  }

  /** ZIP com os comprovantes das últimas 48 horas do trabalhador (art. 80, III). */
  async zipUltimas48h(sub: string) {
    const itens = await this.listar(sub, { horas: 48 });
    if (!itens.length) throw new NotFoundException("Nenhuma marcação nas últimas 48 horas.");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require("jszip") as typeof import("jszip");
    const zip = new JSZip();
    const linhas = ["Comprovantes de Registro de Ponto do Trabalhador — últimas 48 horas", ""];
    for (const it of [...itens].reverse()) {
      const { buffer, nome } = await this.pdf(it.nsr, sub);
      zip.file(nome, buffer);
      linhas.push(
        `${it.data} ${it.hora} · ${it.rotulo} · NSR ${String(it.nsr).padStart(9, "0")} · ${nome}`
      );
    }
    zip.file("LEIA-ME.txt", linhas.join("\r\n"));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  /** Dados públicos mínimos (sem dados pessoais do trabalhador) de uma marcação. */
  private async resumoPublico(nsr: number) {
    const d = await this.dados(nsr);
    const p = partesDH(d.dataHoraMarcacao);
    return {
      encontrado: true as const,
      nsr: String(d.nsr).padStart(9, "0"),
      registro: this.registroDe(d),
      data: p.data,
      hora: p.hora,
      empregador: { nome: d.empregador.nome, cnpj: fmtCnpj(d.empregador.cnpj) },
      inpi: d.inpi,
      homologacao: d.homologacao
    };
  }

  /** Verificação pública pelo hash da marcação e, quando houver, pelo QR selado da página. */
  async verificarPorHash(hashRaw: string, qr?: { r?: string; p?: string; t?: string; s?: string }) {
    const hash = (hashRaw ?? "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
    if (hash.length !== 64) return { encontrado: false };
    const m = await this.prisma.marcacaoRep.findFirst({ where: { hash, reconstituida: false } });
    if (!m) return { encontrado: false };
    const resumo = await this.resumoPublico(m.nsr);
    let selo: "VALIDO" | "SELO_INVALIDO" | "REGISTRO_DIFERENTE" | null = null;
    if (qr?.r) {
      const p = Number(qr.p);
      const t = Number(qr.t);
      const ok =
        Number.isInteger(p) &&
        Number.isInteger(t) &&
        (await this.assinatura.seloDocumentoValido(qr.r, p, t, qr.s));
      selo = !ok ? "SELO_INVALIDO" : qr.r === resumo.registro ? "VALIDO" : "REGISTRO_DIFERENTE";
    }
    return { ...resumo, selo };
  }

  /** O arquivo enviado é um PDF emitido pelo sistema? (impressão digital SHA-256 do arquivo) */
  async verificarArquivo(sha256Raw: string) {
    const sha256 = (sha256Raw ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) return { encontrado: false, arquivoNaoReconhecido: true };
    const e = await this.prisma.comprovanteEmitido.findUnique({ where: { sha256 } });
    if (!e) return { encontrado: false, arquivoNaoReconhecido: true };
    return { ...(await this.resumoPublico(e.nsr)), arquivoOriginal: true };
  }

  /**
   * Conferência do CONTEÚDO (texto do PDF ou OCR da foto) com o comprovante original: nome, CPF, CNPJ,
   * NSR, data, hora e hash. Pega cópias convertidas/editadas, que não têm a impressão digital do original.
   */
  async compararConteudo(body: {
    hash?: string;
    registro?: string;
    linhas?: string[];
    origem?: "pdf" | "ocr";
  }) {
    const linhas = (Array.isArray(body.linhas) ? body.linhas : [])
      .slice(0, 400)
      .map((l) => String(l ?? "").slice(0, 600))
      .filter((l) => l.trim());
    if (!linhas.length)
      return { encontrado: false, veredito: "NAO_IDENTIFICADO" as const, divergencias: [] };
    const ocr = body.origem === "ocr";
    const texto = linhas.join(" ");
    const norm = (v: string) =>
      v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    const t = norm(texto);

    /* 1. Qual comprovante: nº de registro (lido do arquivo) ou hash informado. */
    const reg =
      (body.registro ?? "").toUpperCase().match(/CRP-\d{9}-[0-9A-F]{8}/)?.[0] ??
      texto.toUpperCase().match(/CRP-\d{9}-[0-9A-F]{8}/)?.[0] ??
      null;
    let m = null as Awaited<ReturnType<typeof this.prisma.marcacaoRep.findFirst>>;
    if (reg) {
      const nsr = Number(reg.slice(4, 13));
      const achada = await this.prisma.marcacaoRep.findUnique({ where: { nsr } });
      if (achada && !achada.reconstituida && achada.hash.startsWith(reg.slice(14).toLowerCase()))
        m = achada;
    }
    const hashCodigo = (body.hash ?? "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
    if (!m && hashCodigo.length === 64) {
      m = await this.prisma.marcacaoRep.findFirst({
        where: { hash: hashCodigo, reconstituida: false }
      });
    }
    if (!m) return { encontrado: false, veredito: "NAO_IDENTIFICADO" as const, divergencias: [] };

    /* 2. Campos do original que precisam aparecer no arquivo. */
    const d = await this.dados(m.nsr);
    const p = partesDH(d.dataHoraMarcacao);
    const divergencias: string[] = [];
    const exige = (rotulo: string, valor: string) => {
      if (!t.includes(norm(valor))) divergencias.push(rotulo);
    };
    exige("NSR", String(d.nsr).padStart(9, "0"));
    exige("Horário", p.hora);
    exige("Data", p.data);
    exige("Nome do trabalhador", d.trabalhador.nome);
    exige("CPF", d.trabalhador.cpf);
    exige("CNPJ do empregador", d.empregador.cnpj);
    const blocosHash = [0, 16, 32, 48].map((i) => d.hash.slice(i, i + 16));
    const ausentes = blocosHash.filter((b) => !t.toLowerCase().includes(b)).length;
    /* No OCR tolera-se um bloco do hash mal lido; no PDF, nenhum. */
    if (ausentes > (ocr ? 1 : 0)) divergencias.push("Código hash da marcação");
    return {
      encontrado: true,
      registro: this.registroDe(d),
      veredito: divergencias.length ? ("DIVERGENTE" as const) : ("CONFERE" as const),
      divergencias
    };
  }

  /* ─── PDF ─── */

  private async renderizar(d: DadosComprovante, assinado: boolean): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PdfPrinter = require("pdfmake/src/printer");
    const printer = new PdfPrinter({
      Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique"
      },
      Courier: {
        normal: "Courier",
        bold: "Courier-Bold",
        italics: "Courier-Oblique",
        bolditalics: "Courier-BoldOblique"
      }
    });
    const VINHO = "#6B0F1A";
    const CINZA = "#6B7280";
    const base = (
      process.env.APP_BASE_URL ??
      process.env.VITE_APP_BASE_URL ??
      "https://ponto.cfo.org.br"
    ).replace(/\/$/, "");
    const registro = this.registroDe(d);
    const selo = await this.assinatura.seloDocumento(registro, 1, 1);
    /* QR selado (registro + página + total, HMAC do sistema): não dá para forjar um QR válido. */
    const url = `${base}/verificar/${d.hash}?r=${registro}&p=1&t=1&s=${selo}`;
    const p = partesDH(d.dataHoraMarcacao);
    const logo = loadAssetBase64("logo-comprovante.png");
    const rotulo = (t: string) => ({
      text: t,
      fontSize: 6.8,
      bold: true,
      color: CINZA,
      characterSpacing: 0.6
    });
    const linhaSep = {
      canvas: [
        { type: "line", x1: 0, y1: 0, x2: 263, y2: 0, lineWidth: 0.5, lineColor: "#E5D5D7" }
      ],
      margin: [0, 5, 0, 5]
    };
    const nsr9 = String(d.nsr).padStart(9, "0");
    const doc = {
      pageSize: { width: 297.64, height: 419.53 },
      pageMargins: [17, 14, 17, 12],
      defaultStyle: { font: "Helvetica", fontSize: 9, lineHeight: 1.1 },
      info: {
        title: "Comprovante de Registro de Ponto do Trabalhador",
        subject: `NSR ${nsr9}`,
        author: d.empregador.nome
      },
      /* Fundo de segurança (ondas + microtexto com o registro) e marca d'água, como no Espelho. */
      background: buildFundoSeguranca(registro),
      watermark: d.homologacao
        ? {
            text: "HOMOLOGAÇÃO — SEM VALIDADE",
            color: "#B42318",
            opacity: 0.12,
            bold: true,
            fontSize: 26
          }
        : { text: registro, color: "#6B0F1A", opacity: 0.05, bold: true, fontSize: 17, angle: -38 },
      /* Impressão liberada; cópia, edição, montagem e conversão bloqueadas. Com a assinatura PAdES,
         a proteção passa a ser a própria assinatura (PDF criptografado não pode ser assinado). */
      ...(assinado
        ? {}
        : {
            ownerPassword: randomBytes(24).toString("hex"),
            permissions: {
              printing: "highResolution",
              modifying: false,
              copying: false,
              annotating: false,
              fillingForms: false,
              contentAccessibility: true,
              documentAssembly: false
            }
          }),
      content: [
        ...(logo
          ? [
              {
                image: `data:image/png;base64,${logo}`,
                width: 118,
                alignment: "center",
                margin: [0, 0, 0, 5]
              }
            ]
          : []),
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  text: "COMPROVANTE DE REGISTRO DE PONTO DO TRABALHADOR",
                  color: "#FFFFFF",
                  bold: true,
                  fontSize: 10.5,
                  lineHeight: 1.15,
                  alignment: "center"
                }
              ]
            ]
          },
          layout: {
            fillColor: () => VINHO,
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 6,
            paddingBottom: () => 6
          }
        },
        ...(d.homologacao
          ? [
              {
                text: "HOMOLOGAÇÃO — documento de teste, sem validade jurídica",
                alignment: "center",
                bold: true,
                fontSize: 7.5,
                color: "#B42318",
                margin: [0, 3, 0, 0]
              }
            ]
          : []),
        {
          columns: [
            {
              stack: [
                rotulo("NSR"),
                { text: nsr9, bold: true, fontSize: 13, characterSpacing: 0.4 }
              ],
              width: "*"
            },
            {
              stack: [
                rotulo("MARCAÇÃO"),
                {
                  text: ROTULO_TIPO[d.tipoPonto] ?? d.tipoPonto,
                  bold: true,
                  fontSize: 10,
                  color: VINHO
                }
              ],
              width: "auto",
              alignment: "right"
            }
          ],
          margin: [0, 7, 0, 0]
        },
        {
          text: p.hora,
          alignment: "center",
          bold: true,
          fontSize: 38,
          color: VINHO,
          margin: [0, 3, 0, 0]
        },
        {
          text: `${p.data}  ·  ${p.diaSemana}`,
          alignment: "center",
          fontSize: 9.5,
          color: "#374151",
          margin: [0, 0, 0, 0]
        },
        linhaSep,
        rotulo("TRABALHADOR"),
        { text: d.trabalhador.nome, bold: true, fontSize: 10, margin: [0, 1, 0, 0] },
        { text: `CPF ${fmtCpf(d.trabalhador.cpf)}`, fontSize: 9 },
        linhaSep,
        rotulo("EMPREGADOR"),
        { text: d.empregador.nome, bold: true, fontSize: 9.5, margin: [0, 1, 0, 0] },
        {
          text: `CNPJ ${fmtCnpj(d.empregador.cnpj)}${d.empregador.cnoCaepf ? `  ·  CNO/CAEPF ${d.empregador.cnoCaepf}` : ""}`,
          fontSize: 9
        },
        { text: d.empregador.local, fontSize: 8, color: "#374151" },
        linhaSep,
        {
          columns: [
            {
              stack: [
                rotulo("REGISTRO DO PROGRAMA NO INPI"),
                {
                  text: d.inpi ?? "em processo de registro",
                  fontSize: 9,
                  bold: !!d.inpi,
                  margin: [0, 1, 0, 0]
                }
              ]
            }
          ]
        },
        linhaSep,
        rotulo("CÓDIGO HASH SHA-256 DA MARCAÇÃO"),
        {
          text: blocos(d.hash).join("\n"),
          font: "Courier",
          fontSize: 8.4,
          lineHeight: 1.12,
          margin: [0, 2, 0, 0]
        },
        {
          columns: [
            { ...marcador(MARCADOR_QR_PAGINA, 60, 60), width: 62, margin: [0, 6, 0, 0] },
            {
              stack: [
                { text: "Verifique a autenticidade", bold: true, fontSize: 8, color: VINHO },
                {
                  text: "Leia o QR Code ou acesse o endereço e informe o hash da marcação.",
                  fontSize: 7,
                  color: CINZA
                },
                {
                  text: `${base.replace(/^https?:\/\//, "")}/verificar`,
                  fontSize: 7.5,
                  color: "#1D4ED8"
                },
                {
                  text: assinado
                    ? "Assinado eletronicamente (PAdES, ICP-Brasil)."
                    : "Sem assinatura ICP-Brasil (certificado não instalado).",
                  fontSize: 7,
                  color: assinado ? "#15803D" : "#B42318",
                  margin: [0, 3, 0, 0]
                }
              ],
              margin: [6, 8, 0, 0]
            }
          ]
        },
        {
          text: `Emitido em ${partesDH(new Date()).data} ${partesDH(new Date()).hora}  ·  Registro nº ${registro}`,
          alignment: "center",
          bold: true,
          fontSize: 7.2,
          color: "#1F2937",
          margin: [0, 4, 0, 0]
        }
      ]
    };
    /* bufferPages: a página fica aberta para receber o QR como ANOTAÇÃO (Word e conversores a descartam). */
    const pdf = printer.createPdfKitDocument(doc, { bufferPages: true });
    aplicarAnotacoesVerificacao(pdf, {
      urlPagina: () => url,
      urlDeclaracao: null,
      codigo: null
    });
    return new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = [];
      pdf.on("data", (c: Buffer) => partes.push(c));
      pdf.on("end", () => resolve(Buffer.concat(partes)));
      pdf.on("error", reject);
      pdf.end();
    });
  }
}
