import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { join } from "path";
import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { codigoCienciaGestorExibido } from "../../utils/assinatura-codigo";

type SharpChain = {
  resize(opts: {
    width: number;
    height: number;
    fit: "inside";
    withoutEnlargement: boolean;
  }): SharpChain;
  jpeg(opts: { quality: number }): SharpChain;
  toFile(path: string): Promise<{ size: number }>;
};

function tryLoadSharp(): ((input: Buffer) => SharpChain) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    return require("sharp") as (input: Buffer) => SharpChain;
  } catch {
    return null;
  }
}

export interface CienciaGestorAssinaturaMeta {
  gestorNome: string;
  assinadoEm: Date;
  ipReal: string;
  ipGateway?: string | null;
  userAgent?: string | null;
}

function loadAssetBytes(filename: string): Buffer | null {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, "src", "assets", filename),
    join(cwd, "dist", "assets", filename),
    join(cwd, "packages", "backend", "src", "assets", filename),
    join(cwd, "packages", "backend", "dist", "assets", filename)
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p);
  }
  return null;
}

function shortUserAgent(ua: string | null | undefined): string {
  if (!ua) return "—";
  let browser = "Navegador";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return os ? `${browser} • ${os}` : browser;
}

function formatDateTimeBr(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

@Injectable()
export class DocumentoService {
  private readonly logger = new Logger(DocumentoService.name);

  private get baseDir(): string {
    const dir = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
    return join(dir, "documentos");
  }

  private get urlPrefix(): string {
    return "/uploads/documentos";
  }

  async salvarDocumento(params: {
    funcionarioId: string;
    solicitacaoId: string;
    arquivoBase64: string;
    mimeType?: string;
  }): Promise<string> {
    const { funcionarioId, solicitacaoId, arquivoBase64, mimeType } = params;

    const base64Data = arquivoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const dirPath = join(this.baseDir, funcionarioId);
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    const isPdf =
      mimeType === "application/pdf" || arquivoBase64.startsWith("data:application/pdf");

    let filename: string;
    let relUrl: string;

    if (isPdf) {
      filename = `${solicitacaoId}.pdf`;
      const filePath = join(dirPath, filename);
      await writeFile(filePath, buffer);
      relUrl = `${this.urlPrefix}/${funcionarioId}/${filename}`;
    } else {
      // Imagem — processa com sharp para normalizar e limitar tamanho
      filename = `${solicitacaoId}.jpg`;
      const filePath = join(dirPath, filename);
      const sharp = tryLoadSharp();
      if (sharp) {
        await sharp(buffer)
          .resize({ width: 1600, height: 2400, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toFile(filePath);
      } else {
        await writeFile(filePath, buffer);
      }
      relUrl = `${this.urlPrefix}/${funcionarioId}/${filename}`;
    }

    this.logger.log(`Documento salvo → ${relUrl}`);
    return relUrl;
  }

  async excluirDocumento(url: string): Promise<void> {
    if (!url) return;
    const relative = url.replace(/^\/uploads\/documentos\//, "");
    const filePath = join(this.baseDir, relative);
    if (existsSync(filePath)) {
      await unlink(filePath).catch(() => {});
    }
  }

  // Salvar PDF da guia médica individual enviada pelo RH para uma solicitação específica
  async salvarGuiaMedica(solicitacaoId: string, arquivoBase64: string): Promise<string> {
    const dirPath = join(this.baseDir, "guias-medicas");
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
    const base64Data = arquivoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const filename = `${solicitacaoId}.pdf`;
    await writeFile(join(dirPath, filename), buffer);
    const relUrl = `${this.urlPrefix}/guias-medicas/${filename}`;
    this.logger.log(`Guia médica salva → ${relUrl}`);
    return relUrl;
  }

  // Salvar documento de retorno da consulta (aptidão/inaptidão) enviado pelo funcionário
  async salvarDocumentoRetorno(params: {
    funcionarioId: string;
    solicitacaoId: string;
    arquivoBase64: string;
    mimeType?: string;
  }): Promise<string> {
    const { funcionarioId, solicitacaoId, arquivoBase64, mimeType } = params;

    const base64Data = arquivoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const dirPath = join(this.baseDir, funcionarioId);
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    const isPdf =
      mimeType === "application/pdf" || arquivoBase64.startsWith("data:application/pdf");

    let filename: string;
    const filePath = (ext: string) => join(dirPath, `${solicitacaoId}-retorno.${ext}`);

    if (isPdf) {
      filename = `${solicitacaoId}-retorno.pdf`;
      await writeFile(filePath("pdf"), buffer);
    } else {
      filename = `${solicitacaoId}-retorno.jpg`;
      const sharp = tryLoadSharp();
      if (sharp) {
        await sharp(buffer)
          .resize({ width: 1600, height: 2400, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toFile(filePath("jpg"));
      } else {
        await writeFile(filePath("jpg"), buffer);
      }
    }

    const relUrl = `${this.urlPrefix}/${funcionarioId}/${filename}`;
    this.logger.log(`Documento de retorno salvo → ${relUrl}`);
    return relUrl;
  }

  /** Documento enviado pelo funcionário ao RH (fora de solicitações) */
  async salvarDocumentoRhEnvio(params: {
    funcionarioId: string;
    documentoId: string;
    arquivoBase64: string;
    mimeType?: string;
  }): Promise<string> {
    const { funcionarioId, documentoId, arquivoBase64, mimeType } = params;

    const base64Data = arquivoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const dirPath = join(this.baseDir, funcionarioId, "rh-envios");
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    const isPdf =
      mimeType === "application/pdf" || arquivoBase64.startsWith("data:application/pdf");

    const filename = isPdf ? `${documentoId}.pdf` : `${documentoId}.jpg`;
    const filePath = join(dirPath, filename);

    if (isPdf) {
      await writeFile(filePath, buffer);
    } else {
      const sharp = tryLoadSharp();
      if (sharp) {
        await sharp(buffer)
          .resize({ width: 1600, height: 2400, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 90 })
          .toFile(filePath);
      } else {
        await writeFile(filePath, buffer);
      }
    }

    const relUrl = `${this.urlPrefix}/${funcionarioId}/rh-envios/${filename}`;
    this.logger.log(`Documento RH enviado → ${relUrl}`);
    return relUrl;
  }

  /**
   * Converte o atestado (PDF ou imagem) em PDF assinado com ciência do gestor
   * no canto inferior esquerdo — selo + metadados (nome, data, IP, dispositivo).
   * Retorna a nova URL do PDF assinado.
   */
  async assinarAtestadoCienciaGestor(params: {
    documentoUrl: string;
    funcionarioId: string;
    solicitacaoId: string;
    assinatura: CienciaGestorAssinaturaMeta;
  }): Promise<string> {
    const { documentoUrl, funcionarioId, solicitacaoId, assinatura } = params;
    const filePath = this.resolveDocumentoPath(documentoUrl);
    if (!existsSync(filePath)) {
      throw new BadRequestException("Documento do atestado não encontrado para assinatura.");
    }

    const fileBuf = await readFile(filePath);
    const lower = documentoUrl.toLowerCase();
    const isPdf = lower.endsWith(".pdf");

    let pdfDoc: PDFDocument;
    if (isPdf) {
      pdfDoc = await PDFDocument.load(fileBuf, { ignoreEncryption: true });
    } else {
      pdfDoc = await this.imagemParaPdf(fileBuf, lower);
    }

    await this.aplicarSeloCienciaGestor(pdfDoc, assinatura);

    const dirPath = join(this.baseDir, funcionarioId);
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    const pdfFilename = `${solicitacaoId}.pdf`;
    const pdfPath = join(dirPath, pdfFilename);
    const pdfBytes = await pdfDoc.save();
    await writeFile(pdfPath, pdfBytes);

    // Remove arquivo anterior se o path mudou (ex.: .jpg → .pdf ou id temporário)
    if (filePath !== pdfPath) {
      await unlink(filePath).catch(() => {});
    }

    const relUrl = `${this.urlPrefix}/${funcionarioId}/${pdfFilename}`;
    this.logger.log(`Atestado assinado (ciência gestor) → ${relUrl}`);
    return relUrl;
  }

  private resolveDocumentoPath(url: string): string {
    const relative = url.replace(/^\/uploads\/documentos\//, "");
    return join(this.baseDir, relative);
  }

  private async imagemParaPdf(imageBuf: Buffer, urlLower: string): Promise<PDFDocument> {
    const pdfDoc = await PDFDocument.create();
    const isPng = urlLower.endsWith(".png");
    const embedded = isPng ? await pdfDoc.embedPng(imageBuf) : await pdfDoc.embedJpg(imageBuf);

    // A4: encaixa a imagem preservando proporção, com margem inferior para o selo
    const A4_W = 595.28;
    const A4_H = 841.89;
    const marginX = 28;
    const marginTop = 28;
    const marginBottom = 88; // espaço para selo/ciência
    const maxW = A4_W - marginX * 2;
    const maxH = A4_H - marginTop - marginBottom;
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
    const drawW = embedded.width * scale;
    const drawH = embedded.height * scale;
    const x = (A4_W - drawW) / 2;
    const y = marginBottom + (maxH - drawH) / 2;

    const page = pdfDoc.addPage([A4_W, A4_H]);
    page.drawImage(embedded, { x, y, width: drawW, height: drawH });
    return pdfDoc;
  }

  private async aplicarSeloCienciaGestor(
    pdfDoc: PDFDocument,
    assinatura: CienciaGestorAssinaturaMeta
  ): Promise<void> {
    const pages = pdfDoc.getPages();
    if (!pages.length) {
      throw new BadRequestException("PDF do atestado não possui páginas.");
    }
    // Carimba a primeira página (conteúdo do atestado)
    const page = pages[0];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const burgundy = rgb(0.42, 0.09, 0.16);
    const ink = rgb(0.2, 0.2, 0.22);
    const muted = rgb(0.4, 0.4, 0.45);

    const marginLeft = 18;
    const marginBottom = 14;
    const boxW = 210;
    const boxH = 62;

    // Fundo semi-opaco para legibilidade sobre o documento
    page.drawRectangle({
      x: marginLeft - 4,
      y: marginBottom - 4,
      width: boxW + 8,
      height: boxH + 8,
      color: rgb(1, 1, 1),
      opacity: 0.92,
      borderColor: rgb(0.85, 0.78, 0.8),
      borderWidth: 0.6
    });

    const seloBytes = loadAssetBytes("selo-assinado-digital.png");
    let textStartY = marginBottom + boxH - 12;
    if (seloBytes) {
      const selo = await pdfDoc.embedPng(seloBytes);
      const seloW = 118;
      const seloH = (selo.height / selo.width) * seloW;
      page.drawImage(selo, {
        x: marginLeft,
        y: marginBottom + boxH - seloH - 2,
        width: seloW,
        height: seloH
      });
      textStartY = marginBottom + boxH - seloH - 10;
    } else {
      page.drawText("Assinado digitalmente", {
        x: marginLeft,
        y: marginBottom + boxH - 12,
        size: 8,
        font: fontBold,
        color: burgundy
      });
      textStartY = marginBottom + boxH - 24;
    }

    const hash = codigoCienciaGestorExibido(
      assinatura.gestorNome,
      assinatura.assinadoEm,
      assinatura.ipReal,
      assinatura.userAgent
    );

    const linhas: { text: string; size: number; bold?: boolean; color: ReturnType<typeof rgb> }[] =
      [
        {
          text: `Ciência: ${assinatura.gestorNome}`,
          size: 7,
          bold: true,
          color: ink
        },
        {
          text: `Em ${formatDateTimeBr(assinatura.assinadoEm)}`,
          size: 6,
          color: muted
        },
        {
          text: `IP ${assinatura.ipReal}${assinatura.ipGateway && assinatura.ipGateway !== assinatura.ipReal ? ` · GW ${assinatura.ipGateway}` : ""}`,
          size: 5.5,
          color: muted
        },
        {
          text: `${shortUserAgent(assinatura.userAgent)} · ${hash}`,
          size: 5,
          color: muted
        }
      ];

    let y = textStartY;
    for (const linha of linhas) {
      page.drawText(linha.text.slice(0, 72), {
        x: marginLeft,
        y,
        size: linha.size,
        font: linha.bold ? fontBold : font,
        color: linha.color
      });
      y -= linha.size + 2.5;
    }
  }
}
