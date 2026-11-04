import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

/**
 * Hash do código-fonte do REP-P (Portaria MTP 671/2021): só o NÚCLEO de registro de ponto, listado em
 * rep-escopo.json. O cálculo é determinístico: não depende de git, commit, datas, fim de linha (CRLF/LF) nem
 * de BOM. Mesmo módulo usado pelo CLI (scripts/rep-escopo.ts) e pelo backend (aba Integridade do código).
 */

export interface ManifestoEscopo {
  descricao?: string;
  arquivos: string[];
  modelosPrisma: { arquivo: string; modelos: string[] };
}

export interface ItemEscopo {
  /** Caminho relativo a packages/backend ou "prisma:Modelo" para um modelo do schema. */
  id: string;
  sha256: string;
  bytes: number;
}

export interface EscopoCalculado {
  algoritmo: "SHA-256";
  hash: string;
  itens: ItemEscopo[];
  /** Itens listados no manifesto que não foram encontrados (não entram no hash). */
  ausentes: string[];
}

export interface LockEscopo {
  versao: string;
  algoritmo: "SHA-256";
  hash: string;
  selado_em: string;
  motivo: string;
  itens: ItemEscopo[];
}

export interface Divergencia {
  id: string;
  situacao: "alterado" | "removido" | "novo";
}

export const NOME_MANIFESTO = "rep-escopo.json";
export const NOME_LOCK = "rep-escopo.lock.json";

/** packages/backend (a pasta que contém rep-escopo.json), a partir de src/ ou dist/. */
export function raizBackend(): string {
  const candidatas = [
    resolve(__dirname, "../../.."),
    process.cwd(),
    join(process.cwd(), "packages/backend")
  ];
  return candidatas.find((c) => existsSync(join(c, NOME_MANIFESTO))) ?? candidatas[0];
}

/** Marca de ordem de bytes UTF-8 (BOM), removida só no início do arquivo. */
const BOM = /^\ufeff/;

/** Sem BOM e com fim de linha LF: o hash não muda por causa do sistema operacional ou do editor. */
export function normalizarTexto(texto: string): string {
  return texto.replace(/\r\n?/g, "\n").replace(BOM, "");
}

const sha256 = (texto: string) => createHash("sha256").update(texto, "utf8").digest("hex");

/** Texto do bloco `model Nome { ... }` do schema Prisma, ou null se não existir. */
export function extrairModeloPrisma(schema: string, nome: string): string | null {
  const re = new RegExp(`^model ${nome} \\{[\\s\\S]*?^\\}`, "m");
  return re.exec(schema)?.[0] ?? null;
}

export function lerManifesto(raiz = raizBackend()): ManifestoEscopo {
  return JSON.parse(readFileSync(join(raiz, NOME_MANIFESTO), "utf8")) as ManifestoEscopo;
}

export function lerLock(raiz = raizBackend()): LockEscopo | null {
  const caminho = join(raiz, NOME_LOCK);
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8")) as LockEscopo;
}

export function calcularEscopo(raiz = raizBackend()): EscopoCalculado {
  const manifesto = lerManifesto(raiz);
  const itens: ItemEscopo[] = [];
  const ausentes: string[] = [];

  for (const rel of manifesto.arquivos) {
    const caminho = join(raiz, rel);
    if (!existsSync(caminho)) {
      ausentes.push(rel);
      continue;
    }
    const texto = normalizarTexto(readFileSync(caminho, "utf8"));
    itens.push({ id: rel, sha256: sha256(texto), bytes: Buffer.byteLength(texto, "utf8") });
  }

  const { arquivo, modelos } = manifesto.modelosPrisma;
  const caminhoSchema = join(raiz, arquivo);
  const schema = existsSync(caminhoSchema)
    ? normalizarTexto(readFileSync(caminhoSchema, "utf8"))
    : "";
  for (const modelo of modelos) {
    const bloco = extrairModeloPrisma(schema, modelo);
    if (bloco === null) {
      ausentes.push(`prisma:${modelo}`);
      continue;
    }
    itens.push({
      id: `prisma:${modelo}`,
      sha256: sha256(bloco),
      bytes: Buffer.byteLength(bloco, "utf8")
    });
  }

  itens.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hash = sha256(itens.map((i) => `${i.id}\0${i.bytes}\0${i.sha256}\n`).join(""));
  return { algoritmo: "SHA-256", hash, itens, ausentes };
}

/** Compara o escopo atual com o lacre: lista o que foi alterado, removido ou incluído. */
export function compararComLock(atual: EscopoCalculado, lock: LockEscopo): Divergencia[] {
  const d: Divergencia[] = [];
  const mapaAtual = new Map(atual.itens.map((i) => [i.id, i]));
  const mapaLock = new Map(lock.itens.map((i) => [i.id, i]));
  for (const [id, item] of mapaLock) {
    const a = mapaAtual.get(id);
    if (!a) d.push({ id, situacao: "removido" });
    else if (a.sha256 !== item.sha256) d.push({ id, situacao: "alterado" });
  }
  for (const id of mapaAtual.keys()) if (!mapaLock.has(id)) d.push({ id, situacao: "novo" });
  return d.sort((x, y) => (x.id < y.id ? -1 : 1));
}
