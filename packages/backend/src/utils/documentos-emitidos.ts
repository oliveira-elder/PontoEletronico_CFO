import { createHash } from "crypto";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import type { PrismaClient } from "@prisma/client";

/**
 * Registro de documentos assinados pelo sistema pela impressão digital (SHA-256) do arquivo:
 * permite validar, por upload, qualquer documento emitido (ciclo de banco de horas, ciência de
 * atestado, documentos de férias assinados), além do Espelho, comprovantes e AFD/AEJ.
 */
export type TipoDocumentoEmitido = "CICLO_BANCO_HORAS" | "CIENCIA_ATESTADO" | "FERIAS_ASSINADO";

type Db = Pick<PrismaClient, "documentoEmitido">;

/** Caminho em disco de um documento salvo em /uploads/documentos/… (mesma regra do DocumentoService). */
export function caminhoDocumentoUpload(url: string): string {
  const dir = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");
  return join(dir, "documentos", url.replace(/^\/uploads\/documentos\//, ""));
}

export function sha256Buffer(b: Buffer | Uint8Array): string {
  return createHash("sha256").update(b).digest("hex");
}

export async function sha256DocumentoUpload(url: string): Promise<string | null> {
  const p = caminhoDocumentoUpload(url);
  if (!existsSync(p)) return null;
  return sha256Buffer(await readFile(p));
}

/** Registra (idempotente pela impressão digital) um documento assinado emitido pelo sistema. */
export async function registrarDocumentoEmitido(
  db: Db,
  d: {
    tipo: TipoDocumentoEmitido;
    referenciaId: string;
    titulo: string;
    detalhes?: Record<string, unknown>;
    buffer?: Buffer | Uint8Array;
    url?: string;
  }
): Promise<string | null> {
  try {
    const sha = d.buffer
      ? sha256Buffer(d.buffer)
      : d.url
        ? await sha256DocumentoUpload(d.url)
        : null;
    if (!sha) return null;
    await db.documentoEmitido.createMany({
      data: [
        {
          tipo: d.tipo,
          referenciaId: d.referenciaId,
          sha256: sha,
          titulo: d.titulo.slice(0, 200),
          detalhes: (d.detalhes ?? {}) as object
        }
      ],
      skipDuplicates: true
    });
    return sha;
  } catch {
    return null;
  }
}

/** Nome mascarado para a verificação pública (LGPD): "Priscilla G." */
export function mascararNome(nome: string): string {
  return nome
    .split(" ")
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : `${p[0]}.`))
    .join(" ");
}
