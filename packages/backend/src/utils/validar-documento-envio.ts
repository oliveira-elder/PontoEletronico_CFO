/**
 * Validação do arquivo enviado em "Envio de Documento - Home Office": mime permitido, tamanho e conferência dos
 * primeiros bytes (assinatura do arquivo), para não aceitar um arquivo qualquer só porque o mime foi declarado.
 */
export const TAMANHO_MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;

type MimePermitido = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

function mimeDosBytes(b: Buffer): MimePermitido | null {
  if (b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return null;
}

/** Devolve a mensagem de erro, ou `null` se o arquivo é aceitável. */
export function validarDocumentoEnvio(base64: unknown, mimeDeclarado?: unknown): string | null {
  if (typeof base64 !== "string" || !base64) return "Anexe um arquivo (imagem ou PDF).";
  const dados = base64.replace(/^data:[^;]*;base64,/, "");
  const bytes = Buffer.from(dados, "base64");
  if (bytes.length === 0) return "O arquivo está vazio.";
  if (bytes.length > TAMANHO_MAX_DOCUMENTO_BYTES) return "O arquivo excede o limite de 10 MB.";
  const real = mimeDosBytes(bytes);
  if (!real) return "Formato não permitido. Envie PDF, JPG, PNG ou WebP.";
  if (typeof mimeDeclarado === "string" && mimeDeclarado && mimeDeclarado !== real) {
    const jpg = mimeDeclarado === "image/jpg" && real === "image/jpeg";
    if (!jpg) return "O conteúdo do arquivo não corresponde ao tipo informado.";
  }
  return null;
}
