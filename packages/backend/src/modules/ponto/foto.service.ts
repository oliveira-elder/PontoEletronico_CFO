import { Injectable, Logger } from "@nestjs/common";
import { join } from "path";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";

/* sharp usa bindings nativos (libvips). Carregado de forma lazy para que uma
   falha de instalação/plataforma não impeça o backend de inicializar. */
type SharpResizeOptions = {
  width: number;
  height: number;
  fit: "inside";
  withoutEnlargement: boolean;
};
type SharpChain = {
  resize(opts: SharpResizeOptions): SharpChain;
  jpeg(opts: { quality: number }): SharpChain;
  toFile(path: string): Promise<{ size: number }>;
};

function loadSharp(): (input: Buffer) => SharpChain {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    return require("sharp") as (input: Buffer) => SharpChain;
  } catch {
    throw new Error(
      "Módulo 'sharp' não encontrado. Execute 'npm install' no container e reinicie o backend."
    );
  }
}

/* Parâmetros de compressão adequados para reconhecimento facial via ML.
   - 640×640 px máx: FaceNet/DeepFace operam bem a partir de 160×160 px.
   - JPEG q=88: preserva detalhes faciais; modelos tolerantes até q=70.
   - Sem metadados EXIF: privacidade + tamanho reduzido. */
const RESIZE_MAX = 640;
const JPEG_QUALITY = 88;

@Injectable()
export class FotoService {
  private readonly logger = new Logger(FotoService.name);

  private get baseDir(): string {
    const dir = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
    return join(dir, "fotos-ponto");
  }

  private get urlPrefix(): string {
    return "/uploads/fotos-ponto";
  }

  async salvarFoto(params: {
    matricula: string;
    tipo: string;
    fotoBase64: string;
  }): Promise<string> {
    const { matricula, tipo, fotoBase64 } = params;

    const base64Data = fotoBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Data, "base64");

    const agora = new Date();
    const dateStr = agora.toISOString().slice(0, 10); // YYYY-MM-DD
    const dirPath = join(this.baseDir, matricula, dateStr);

    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
      this.logger.log(`Diretório criado: ${dirPath}`);
    }

    const p = (n: number, d = 2) => String(n).padStart(d, "0");
    const timeStr = [
      p(agora.getHours()),
      p(agora.getMinutes()),
      p(agora.getSeconds()),
      p(agora.getMilliseconds(), 3)
    ].join("-");
    const filename = `${timeStr}_${tipo}.jpg`;
    const filePath = join(dirPath, filename);

    const sharp = loadSharp();
    await sharp(inputBuffer)
      .resize({ width: RESIZE_MAX, height: RESIZE_MAX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(filePath);

    const relUrl = `${this.urlPrefix}/${matricula}/${dateStr}/${filename}`;
    this.logger.log(`Foto salva → ${relUrl}`);
    return relUrl;
  }
}
