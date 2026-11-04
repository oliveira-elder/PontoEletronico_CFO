/**
 * Testa a senha root, o token de liberação, o bloqueio por tentativas e o selo do lacre com um banco
 * SIMULADO em memória (não toca no banco real nem em arquivos do projeto).
 *   npx ts-node -P tsconfig.json --transpile-only scripts/teste-rep-escopo-senha.ts
 */
import { mkdtempSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { RepEscopoService } from "../src/modules/rep-escopo/rep-escopo.service";

let falhas = 0;
const confere = (rotulo: string, ok: boolean) => {
  console.log(`${ok ? "OK   " : "FALHA"} ${rotulo}`);
  if (!ok) falhas++;
};
const rejeita = async (rotulo: string, fn: () => Promise<unknown>, trecho?: string) => {
  try {
    await fn();
    confere(rotulo, false);
  } catch (e) {
    confere(rotulo, !trecho || String((e as Error).message).includes(trecho));
  }
};

/* Banco simulado: só o que o serviço usa. */
const cfg: Record<string, unknown> = {
  id: "singleton",
  senhaHash: null,
  segredoToken: null,
  tentativasFalhas: 0,
  bloqueadoAte: null,
  ultimoAvisoHash: null
};
const liberacoes: Array<Record<string, unknown>> = [];
const prisma = {
  repEscopoConfig: {
    upsert: async () => ({ ...cfg }),
    update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(cfg, data)
  },
  repEscopoLiberacao: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      liberacoes.push({ ...data, createdAt: new Date() });
    },
    findFirst: async ({ where }: { where: { tipo: string } }) =>
      [...liberacoes].reverse().find((l) => l.tipo === where.tipo) ?? null,
    findMany: async () => [...liberacoes].reverse()
  },
  user: { findMany: async () => [] },
  notificacao: { create: async () => undefined }
};

async function main() {
  /* A chave que cifra a senha vai para uma pasta temporária (não toca em packages/backend/instance). */
  const dirChave = mkdtempSync(join(tmpdir(), "rep-escopo-chave-"));
  process.env.INSTANCE_DIR = dirChave;
  const svc = new RepEscopoService(prisma as never);
  const ator = "teste";

  await rejeita(
    "senha curta é recusada",
    () => svc.definirSenha(ator, { senha: "curta" }, null),
    "pelo menos"
  );
  await svc.definirSenha(ator, { senha: "senha-root-de-teste-1" }, null);
  confere(
    "senha definida é guardada só como hash scrypt",
    String(cfg.senhaHash).startsWith("scrypt$") && !String(cfg.senhaHash).includes("senha-root")
  );
  await rejeita(
    "alterar sem a senha atual é recusado",
    () => svc.definirSenha(ator, { senha: "outra-senha-root-2" }, null),
    "Senha incorreta"
  );

  await rejeita(
    "liberar com senha errada é recusado",
    () => svc.liberar(ator, "errada", null),
    "Senha incorreta"
  );
  const lib = await svc.liberar(ator, "senha-root-de-teste-1", null);
  confere("senha correta emite token", typeof lib.token === "string" && lib.token.includes("."));
  confere("token válido é aceito", await svc.tokenValido(lib.token));
  confere("token adulterado é recusado", !(await svc.tokenValido(lib.token.slice(0, -2) + "00")));
  confere("token vazio é recusado", !(await svc.tokenValido(undefined)));

  /* Estado do lacre real do projeto (rep-escopo.lock.json). */
  const st = await svc.status();
  confere(`estado do lacre real é OK (veio: ${st.estado})`, st.estado === "OK");
  confere(
    "status não expõe a senha nem o segredo",
    !JSON.stringify(st).includes("scrypt$") &&
      !JSON.stringify(st).includes(String(cfg.segredoToken))
  );

  /* Selo: exige motivo e token; o token é descartado depois (uso único). */
  await rejeita(
    "selar sem motivo suficiente é recusado",
    () => svc.selar(lib.token, "curto", null),
    "motivo"
  );
  await rejeita(
    "selar sem token válido é recusado",
    () => svc.selar("x.y", "motivo de teste completo", null),
    "inválida"
  );
  const lock = await svc.selar(lib.token, "teste do fluxo de selo (simulado)", null);
  confere(
    "selo devolve o lacre com o hash do escopo atual",
    lock.hash === st.hashAtual && lock.itens.length === st.itens.length
  );
  confere(
    "selo registrado no histórico",
    liberacoes.some((l) => l.tipo === "SELO" && l.hashNovo === lock.hash)
  );
  confere("token é descartado após o selo (uso único)", !(await svc.tokenValido(lib.token)));

  /* Lacre adulterado: o servidor tem outro hash selado que o arquivo do lacre. */
  liberacoes.push({
    tipo: "SELO",
    hashNovo: "0".repeat(64),
    createdAt: new Date(Date.now() + 1000)
  });
  confere(
    "lacre diferente do último selo do servidor = LACRE_ADULTERADO",
    (await svc.status()).estado === "LACRE_ADULTERADO"
  );
  liberacoes.pop();

  /* Bloqueio após 5 erros. */
  const svc2 = new RepEscopoService(prisma as never);
  for (let i = 0; i < 4; i++) await svc2.liberar(ator, "errada", null).catch(() => undefined);
  await rejeita(
    "5ª senha errada bloqueia o acesso",
    () => svc2.liberar(ator, "errada", null),
    "bloqueado"
  );
  await rejeita(
    "com bloqueio ativo, nem a senha certa entra",
    () => svc2.liberar(ator, "senha-root-de-teste-1", null),
    "Muitas tentativas"
  );
  cfg.bloqueadoAte = new Date(Date.now() - 1000);
  const depois = await svc2.liberar(ator, "senha-root-de-teste-1", null);
  confere("depois do bloqueio, a senha certa volta a funcionar", !!depois.token);

  /* Trocar a senha invalida o token em andamento. */
  await svc2.definirSenha(
    ator,
    { senhaAtual: "senha-root-de-teste-1", senha: "senha-root-nova-2025" },
    null
  );
  confere(
    "trocar a senha invalida liberações em andamento",
    !(await svc2.tokenValido(depois.token))
  );

  /* Token expirado. */
  const real = Date.now;
  const lib3 = await svc2.liberar(ator, "senha-root-nova-2025", null);
  Date.now = () => real() + 31 * 60_000;
  const expirou = !(await svc2.tokenValido(lib3.token));
  Date.now = real;
  confere("token expira em 30 minutos", expirou && (await svc2.tokenValido(lib3.token)));

  /* Visualização da senha (cifrada), olho e logs. */
  const svc3 = new RepEscopoService(prisma as never);
  const tipos = () => liberacoes.map((l) => l.tipo);
  cfg.bloqueadoAte = null;
  cfg.senhaHash = null;
  cfg.senhaCifrada = null;
  liberacoes.length = 0;
  await rejeita(
    "senha curta é recusada e registrada em log",
    () => svc3.definirSenha("ana", { senha: "curta" }, "10.0.0.1"),
    "pelo menos"
  );
  confere(
    "recusa por senha curta gravou SENHA_REJEITADA com ator e IP",
    liberacoes.some((l) => l.tipo === "SENHA_REJEITADA" && l.ator === "ana" && l.ip === "10.0.0.1")
  );
  await svc3.definirSenha("ana", { senha: "root-visivel-2025" }, "10.0.0.1");
  confere(
    "definição registrada (SENHA_DEFINIDA, com ator e IP)",
    liberacoes.some((l) => l.tipo === "SENHA_DEFINIDA" && l.ator === "ana" && l.ip === "10.0.0.1")
  );
  confere(
    "senha cifrada (aes) e sem o texto puro no banco",
    String(cfg.senhaCifrada).startsWith("aes$") &&
      !String(cfg.senhaCifrada).includes("root-visivel")
  );
  confere(
    "status informa que a senha é visualizável",
    (await svc3.status()).senhaVisualizavel === true
  );
  const r1 = await svc3.revelarSenha("ana", "10.0.0.1");
  confere(
    "senha atual é entregue (campo preenchido em pontinhos)",
    r1.senha === "root-visivel-2025"
  );
  confere("carga da senha registrada (SENHA_CARREGADA)", tipos().includes("SENHA_CARREGADA"));
  await svc3.registrarExibicao("ana", "10.0.0.1");
  confere(
    "clique no olho registrado (SENHA_EXIBIDA, com ator e IP)",
    liberacoes.some((l) => l.tipo === "SENHA_EXIBIDA" && l.ator === "ana" && l.ip === "10.0.0.1")
  );
  await svc3.definirSenha("ana", { senhaAtual: r1.senha, senha: "root-visivel-2026" }, "10.0.0.1");
  confere("troca registrada (SENHA_ALTERADA)", tipos().includes("SENHA_ALTERADA"));
  confere(
    "depois da troca, a senha mostrada é a nova",
    (await svc3.revelarSenha("ana", null)).senha === "root-visivel-2026"
  );
  await rejeita(
    "troca com senha atual errada é recusada",
    () => svc3.definirSenha("ana", { senhaAtual: "errada", senha: "root-visivel-2027" }, null),
    "Senha incorreta"
  );
  confere("tentativa falha da troca registrada", tipos().includes("TENTATIVA_FALHA"));

  /* Senha antiga (sem versão cifrada): a primeira liberação correta habilita a visualização. */
  cfg.senhaCifrada = null;
  confere(
    "sem versão cifrada, a senha não é visualizável",
    (await svc3.status()).senhaVisualizavel === false
  );
  await rejeita(
    "sem versão cifrada, ver a senha é recusado",
    () => svc3.revelarSenha("ana", null),
    "não está disponível"
  );
  await svc3.liberar("ana", "root-visivel-2026", null);
  confere(
    "liberar habilita a visualização e registra SENHA_VISUALIZAVEL",
    tipos().includes("SENHA_VISUALIZAVEL") && (await svc3.status()).senhaVisualizavel === true
  );

  /* Botão "Habilitar visualização": confere a senha digitada e passa a guardá-la cifrada. */
  cfg.senhaCifrada = null;
  await rejeita(
    "habilitar visualização com senha errada é recusado",
    () => svc3.habilitarVisualizacao("ana", "errada", "10.0.0.2"),
    "Senha incorreta"
  );
  confere(
    "senha errada ao habilitar registrou TENTATIVA_FALHA",
    liberacoes.some((l) => l.tipo === "TENTATIVA_FALHA" && l.ip === "10.0.0.2")
  );
  confere(
    "e a visualização continua desabilitada",
    (await svc3.status()).senhaVisualizavel === false
  );
  await svc3.habilitarVisualizacao("ana", "root-visivel-2026", "10.0.0.2");
  confere("senha certa habilita a visualização", (await svc3.status()).senhaVisualizavel === true);
  confere(
    "habilitação registrada em log com ator e IP",
    liberacoes.some(
      (l) =>
        l.tipo === "SENHA_VISUALIZAVEL" &&
        l.ator === "ana" &&
        l.ip === "10.0.0.2" &&
        String(l.motivo).includes("informando a senha atual")
    )
  );
  confere(
    "depois de habilitar, a senha atual é mostrada",
    (await svc3.revelarSenha("ana", null)).senha === "root-visivel-2026"
  );

  /* Chave do servidor perdida: não revela nada (não inventa a senha). */
  unlinkSync(join(dirChave, "rep_escopo.key"));
  await rejeita(
    "sem a chave do servidor, ver a senha é recusado",
    () => svc3.revelarSenha("ana", null),
    "não está disponível"
  );

  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(2);
});
