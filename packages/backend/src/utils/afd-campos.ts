/**
 * Campos do AFD/AEJ (Portaria MTP nº 671/2021, leiautes do portal gov.br):
 * texto ISO-8859-1, uma linha por registro terminada em CR+LF, campos de posição fixa no AFD.
 */

/** CRC-16/KERMIT (CCITT-TRUE): poly 0x1021 refletido (0x8408), init 0, sem XOR final.
 *  "123456789" → 0x2189, gravado como "2189". */
export function crc16Kermit(texto: string): string {
  const bytes = Buffer.from(texto, "latin1");
  let crc = 0x0000;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  /* O leiaute grava os 4 hexadecimais na ordem "2189" para o valor 0x2189. */
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove o que não existe em ISO-8859-1 (mantém acentos do português). */
export function latin1(s: string): string {
  return [...String(s ?? "")]
    .map((c) => (c.charCodeAt(0) <= 255 ? c : "?"))
    .join("")
    .replace(/[\r\n|]/g, " ");
}

/** Alfanumérico: alinhado à esquerda, completado com espaços, cortado no tamanho. */
export function campoA(valor: string | null | undefined, tamanho: number): string {
  return latin1(valor ?? "")
    .slice(0, tamanho)
    .padEnd(tamanho, " ");
}

/** Numérico: só dígitos, zeros à esquerda; vazio → espaços (campo opcional). */
export function campoN(valor: string | number | null | undefined, tamanho: number): string {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (!d) return " ".repeat(tamanho);
  return d.slice(-tamanho).padStart(tamanho, "0");
}

/** Deslocamento de Brasília no instante (hoje -0300; sem horário de verão desde 2019). */
function deslocamentoBrasilia(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    timeZoneName: "longOffset"
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-03:00"
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(partes ?? "");
  return m ? `${m[1]}${m[2]}${m[3] ?? "00"}` : "-0300";
}

/** DH "AAAA-MM-ddThh:mm:00ZZZZZ" — segundos SEMPRE "00", fuso de Brasília. */
export function dataHoraDH(d: Date): string {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(d); // "2026-08-03 06:55"
  return `${f.replace(" ", "T")}:00${deslocamentoBrasilia(d)}`;
}

/** D "AAAA-MM-dd" (dia civil de Brasília). */
export function dataD(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Linha de registro com CRC (AFD tipos 1 a 5). */
export function comCrc(semCrc: string): string {
  return semCrc + crc16Kermit(semCrc);
}

export const LINHA_ASSINATURA = "ASSINATURA_DIGITAL_EM_ARQUIVO_P7S".padEnd(100, " ");

/** Junta as linhas com CR+LF e codifica em ISO-8859-1. */
export function arquivoTexto(linhas: string[]): Buffer {
  return Buffer.from(linhas.join("\r\n") + "\r\n", "latin1");
}
