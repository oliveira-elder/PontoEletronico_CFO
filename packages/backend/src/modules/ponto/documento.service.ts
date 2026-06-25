import { Injectable, Logger } from "@nestjs/common";
import { join } from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";

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
}
