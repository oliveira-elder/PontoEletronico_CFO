import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Links assinados para /uploads: o arquivo só é entregue com uma assinatura válida (HMAC do caminho +
 * validade). As respostas da API trazem o link já assinado para quem foi autorizado a ver o dado;
 * o que é gravado no banco continua sendo o caminho simples.
 */
const VALIDADE_SEG = 12 * 3600;
const PREFIXO = "/uploads/";
const chaveAleatoria = randomBytes(32);

function chave(): Buffer {
  const env = (process.env.UPLOADS_SIGN_SECRET ?? process.env.DOC_SEAL_SECRET ?? "").trim();
  return env ? Buffer.from(`uploads:${env}`) : chaveAleatoria;
}

const assinar = (caminho: string, exp: number) =>
  createHmac("sha256", chave()).update(`${caminho}|${exp}`).digest("hex").slice(0, 40);

export function assinarUpload(caminho: string, agora = Date.now()): string {
  const exp = Math.floor(agora / 1000) + VALIDADE_SEG;
  return `${caminho}?e=${exp}&s=${assinar(caminho, exp)}`;
}

export function removerAssinatura(valor: string): string {
  return valor.startsWith(PREFIXO) ? valor.replace(/[?&]e=\d+&s=[0-9a-f]{40}$/, "") : valor;
}

export function assinaturaValida(
  caminho: string,
  e: unknown,
  s: unknown,
  agora = Date.now()
): boolean {
  const exp = Number(e);
  if (!Number.isInteger(exp) || typeof s !== "string" || !/^[0-9a-f]{40}$/.test(s)) return false;
  if (exp * 1000 < agora) return false;
  const esperado = Buffer.from(assinar(caminho, exp));
  const recebido = Buffer.from(s);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

const ehObjetoSimples = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v));

/** Percorre JSON (objetos simples e listas) aplicando `fn` a cada texto, sem alterar o original. */
export function mapearTextos<T>(valor: T, fn: (s: string) => string, prof = 0): T {
  if (prof > 12) return valor;
  if (typeof valor === "string") return fn(valor) as unknown as T;
  if (Array.isArray(valor)) return valor.map((v) => mapearTextos(v, fn, prof + 1)) as unknown as T;
  if (ehObjetoSimples(valor)) {
    const novo: Record<string, unknown> = {};
    for (const k of Object.keys(valor)) novo[k] = mapearTextos(valor[k], fn, prof + 1);
    return novo as T;
  }
  return valor;
}

export const assinarSeUpload = (s: string) =>
  s.startsWith(PREFIXO) && !s.includes("?e=") ? assinarUpload(s) : s;
