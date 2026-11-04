/**
 * Lacre do hash do código-fonte do REP-P (só o núcleo de registro de ponto, ver rep-escopo.json).
 *
 *   npm run rep:verificar              confere os arquivos com o lacre (sai com erro se divergir)
 *   npm run rep:proteger               deixa os arquivos do escopo somente leitura (o editor não salva)
 *   npm run rep:liberar -- <token>     libera a edição (token gerado em Sistema → Integridade do código,
 *                                      com a senha root do Super Admin; vale 30 min)
 *   npm run rep:selar -- --motivo "…"  grava o novo lacre (exige a liberação) e trava os arquivos de novo
 *   npm run rep:selar -- --inicial     só para o primeiro lacre (quando ainda não existe rep-escopo.lock.json)
 *   rep-escopo.ts pacote <pasta>       copia os arquivos do escopo (normalizados) para <pasta> e imprime o hash
 *                                      (usado por scripts/inpi-hash.sh; não altera nada no projeto)
 *
 * O servidor é consultado em REP_ESCOPO_API (padrão http://localhost:12003/api).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import {
  NOME_LOCK,
  NOME_MANIFESTO,
  calcularEscopo,
  compararComLock,
  extrairModeloPrisma,
  normalizarTexto,
  lerLock,
  lerManifesto,
  raizBackend,
  type LockEscopo
} from "../src/modules/rep/escopo-hash";

const raiz = raizBackend();
const ARQUIVO_LIBERACAO = join(resolve(raiz, "../.."), ".rep-liberacao");
const API = (process.env.REP_ESCOPO_API ?? "http://localhost:12003/api").replace(/\/$/, "");

const falhar = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

/** Arquivos que o editor não pode alterar: o escopo, o manifesto e o lacre. O schema.prisma NÃO entra
 *  (só 6 de seus modelos estão no escopo; o resto é livre). Esses 6 são conferidos pelo verificar. */
function arquivosProtegidos(): string[] {
  const m = lerManifesto(raiz);
  return [...m.arquivos, NOME_MANIFESTO, NOME_LOCK]
    .map((rel) => join(raiz, rel))
    .filter((c) => existsSync(c));
}

function permissao(somenteLeitura: boolean) {
  for (const c of arquivosProtegidos()) {
    try {
      chmodSync(c, somenteLeitura ? 0o444 : 0o644);
    } catch {
      /* sem permissão para mudar o modo: o verificar continua valendo */
    }
  }
}

function lerLiberacao(): { token: string; expiraEm: string } | null {
  if (!existsSync(ARQUIVO_LIBERACAO)) return null;
  try {
    return JSON.parse(readFileSync(ARQUIVO_LIBERACAO, "utf8"));
  } catch {
    return null;
  }
}

async function post<T>(caminho: string, corpo: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    });
  } catch {
    return falhar(
      `Servidor indisponível em ${API}. Suba o backend (docker compose up -d backend).`
    );
  }
  const dados = (await r.json().catch(() => ({}))) as T & { message?: string };
  if (!r.ok) return falhar(dados.message ?? `Erro ${r.status} do servidor.`);
  return dados;
}

function verificar(silencioso = false): boolean {
  const lock = lerLock(raiz);
  if (!lock) {
    console.error(
      "Sem lacre (rep-escopo.lock.json). Gere o primeiro com: npm run rep:selar -- --inicial"
    );
    return false;
  }
  const atual = calcularEscopo(raiz);
  const divergencias = compararComLock(atual, lock);
  if (!divergencias.length && !atual.ausentes.length && atual.hash === lock.hash) {
    if (!silencioso)
      console.log(
        `REP-P: escopo íntegro (${atual.hash.slice(0, 16)}…, ${atual.itens.length} itens).`
      );
    return true;
  }
  console.error("\n⛔ ARQUIVOS PROTEGIDOS DO REP-P FORAM ALTERADOS");
  console.error(
    "   (núcleo de registro de ponto; o hash do código-fonte registrado no INPI mudaria)\n"
  );
  for (const d of divergencias) console.error(`   - ${d.id}: ${d.situacao}`);
  for (const a of atual.ausentes) console.error(`   - ${a}: ausente`);
  console.error(
    "\nSe a alteração é INTENCIONAL: peça ao Super Admin o token (Sistema → Integridade do código),\n" +
      'rode `npm run rep:liberar -- <token>`, faça a alteração e depois `npm run rep:selar -- --motivo "…"`.\n' +
      "Se foi ACIDENTAL: desfaça a alteração (git checkout -- <arquivo>).\n"
  );
  return false;
}

async function liberar(token: string | undefined) {
  if (!token) falhar("Informe o token: npm run rep:liberar -- <token>");
  const r = await post<{ valido: boolean }>("/sistema/rep-escopo-cli/verificar", { token });
  if (!r.valido)
    falhar("Token inválido ou expirado. Gere outro em Sistema → Integridade do código.");
  const expiraEm = new Date(
    JSON.parse(Buffer.from(String(token).split(".")[0], "base64url").toString("utf8")).exp
  ).toISOString();
  writeFileSync(ARQUIVO_LIBERACAO, JSON.stringify({ token, expiraEm }), { mode: 0o600 });
  permissao(false);
  console.log(
    `Liberado até ${expiraEm}. Altere os arquivos e rode: npm run rep:selar -- --motivo "…"`
  );
}

async function selar(motivo: string | undefined, inicial: boolean) {
  if (inicial) {
    if (lerLock(raiz)) falhar("Já existe lacre. Use rep:liberar e rep:selar --motivo.");
    const atual = calcularEscopo(raiz);
    if (atual.ausentes.length)
      falhar(`Itens do escopo não encontrados: ${atual.ausentes.join(", ")}`);
    gravarLock({
      versao: versaoDoSistema(),
      algoritmo: "SHA-256",
      hash: atual.hash,
      selado_em: new Date().toISOString(),
      motivo: motivo?.trim() || "Lacre inicial do escopo mínimo do REP-P",
      itens: atual.itens
    });
    permissao(true);
    console.log(`Lacre inicial gravado: ${atual.hash}`);
    return;
  }
  const lib = lerLiberacao();
  if (!lib) falhar("Sem liberação ativa. Rode: npm run rep:liberar -- <token>");
  if (!motivo || motivo.trim().length < 10)
    falhar('Informe o motivo (mín. 10 caracteres): --motivo "…"');
  const lock = await post<LockEscopo>("/sistema/rep-escopo-cli/selar", {
    token: lib!.token,
    motivo
  });
  const local = calcularEscopo(raiz);
  if (local.hash !== lock.hash) {
    falhar(
      "O servidor calculou um hash diferente do local: ele enxerga arquivos diferentes dos seus.\n" +
        "Confirme que o backend usa esta mesma pasta (volume do Docker)."
    );
  }
  gravarLock(lock);
  rmSync(ARQUIVO_LIBERACAO, { force: true });
  permissao(true);
  console.log(
    `Novo lacre gravado: ${lock.hash}\nRegistre este hash no INPI se o código-fonte registrado mudou.`
  );
}

function gravarLock(lock: LockEscopo) {
  const caminho = join(raiz, NOME_LOCK);
  if (existsSync(caminho)) chmodSync(caminho, 0o644);
  writeFileSync(caminho, JSON.stringify(lock, null, 2) + "\n");
}

function versaoDoSistema(): string {
  try {
    return JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).version ?? "desconhecida";
  } catch {
    return "desconhecida";
  }
}

/** Pacote do código-fonte do escopo para o INPI: os mesmos bytes que entram no hash (LF, sem BOM). */
function pacote(destino: string | undefined) {
  if (!destino) falhar("Informe a pasta de destino.");
  const alvo = resolve(String(destino));
  const m = lerManifesto(raiz);
  const atual = calcularEscopo(raiz);
  if (atual.ausentes.length)
    falhar(`Itens do escopo não encontrados: ${atual.ausentes.join(", ")}`);
  for (const rel of m.arquivos) {
    const saida = join(alvo, rel);
    mkdirSync(dirname(saida), { recursive: true });
    writeFileSync(saida, normalizarTexto(readFileSync(join(raiz, rel), "utf8")));
  }
  const schema = normalizarTexto(readFileSync(join(raiz, m.modelosPrisma.arquivo), "utf8"));
  const modelos = m.modelosPrisma.modelos
    .map((n) => extrairModeloPrisma(schema, n))
    .filter((b): b is string => b !== null)
    .join("\n\n");
  const saidaSchema = join(alvo, "prisma/modelos-rep.prisma");
  mkdirSync(dirname(saidaSchema), { recursive: true });
  writeFileSync(saidaSchema, modelos + "\n");
  console.log(JSON.stringify({ hash: atual.hash, itens: atual.itens }));
}

async function main() {
  const [cmd, ...resto] = process.argv.slice(2);
  const opcao = (nome: string) => {
    const i = resto.indexOf(nome);
    return i >= 0 ? resto[i + 1] : undefined;
  };
  switch (cmd) {
    case "verificar":
      process.exit(verificar() ? 0 : 1);
      break;
    case "proteger":
      permissao(true);
      console.log("Arquivos do escopo do REP-P: somente leitura.");
      break;
    case "pacote":
      pacote(resto[0]);
      break;
    case "liberar":
      await liberar(resto.find((a) => !a.startsWith("--")));
      break;
    case "selar":
      await selar(opcao("--motivo"), resto.includes("--inicial"));
      break;
    default:
      falhar('Uso: rep-escopo.ts verificar | proteger | liberar <token> | selar --motivo "…"');
  }
}

main().catch((e) => falhar(`Erro: ${(e as Error).message}`));
