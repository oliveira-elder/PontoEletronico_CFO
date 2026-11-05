/**
 * Testa, com banco SIMULADO, que a sincronização com a API de ramais (1) não recria quem o Super Admin
 * excluiu e (2) não cria matrícula duplicada com sufixo ("534-1"). Não toca no banco real.
 *   npx ts-node -P tsconfig.json --transpile-only scripts/teste-sync-excluidos.ts
 */
import { ExtensionsService } from "../src/modules/extensions/extensions.service";

let falhas = 0;
const confere = (rotulo: string, ok: boolean) => {
  console.log(`${ok ? "OK   " : "FALHA"} ${rotulo}`);
  if (!ok) falhas++;
};

const chamadas: string[] = [];
const usuarioExistente = { id: "u1", name: "Bráulio Santos", email: "braulio.silva@cfo.org.br" };
const prisma = {
  user: {
    findFirst: async () => {
      chamadas.push("user.findFirst");
      return null;
    },
    create: async () => {
      chamadas.push("user.create");
      return { id: "novo" };
    }
  },
  funcionario: {
    findUnique: async ({ where }: { where: { matricula?: string; userId?: string } }) => {
      chamadas.push("funcionario.findUnique");
      return where.matricula === "534" ? { user: usuarioExistente } : null;
    },
    create: async () => {
      chamadas.push("funcionario.create");
      return { id: "f" };
    }
  }
};

const api = {
  id: "abb441e7",
  name: "Braulio Santos",
  email: "braulio.santos@cfo.org.br",
  staffId: 534,
  extension: "",
  room: "",
  floor: ""
};

async function main() {
  const svc = new ExtensionsService(prisma as never, {} as never, {} as never) as unknown as {
    ignorados: { ids: Set<string>; emails: Set<string>; entradas: Set<string> } | null;
    syncUser: (...a: unknown[]) => Promise<string>;
    criarFuncionarioDaApi: (...a: unknown[]) => Promise<string>;
  };

  /* 1) Excluído pelo Super Admin (por id da API ou por e-mail): não recria, não toca em nada. */
  svc.ignorados = { ids: new Set(["abb441e7"]), emails: new Set(), entradas: new Set() };
  chamadas.length = 0;
  confere(
    "excluído (id da API na lista) → pulado",
    (await svc.syncUser(api, "g", "diretoria", null, [])) === "skipped"
  );
  confere("e nada foi criado nem consultado", chamadas.length === 0);

  svc.ignorados = {
    ids: new Set(),
    emails: new Set(["braulio.santos@cfo.org.br"]),
    entradas: new Set()
  };
  chamadas.length = 0;
  confere(
    "excluído (e-mail na lista, maiúsculas ignoradas) → pulado",
    (await svc.syncUser(
      { ...api, email: "Braulio.Santos@cfo.org.br" },
      "g",
      "diretoria",
      null,
      []
    )) === "skipped"
  );
  confere(
    "sem consultar usuário nem criar funcionário",
    !chamadas.includes("user.create") && !chamadas.includes("funcionario.create")
  );

  /* 2) Matrícula já pertence a outro cadastro: não cria "534-1". */
  svc.ignorados = null;
  chamadas.length = 0;
  const r = await svc.criarFuncionarioDaApi("u-novo", api, "g", "diretoria", null, false);
  confere(
    "matrícula 534 já em uso → conflito_matricula (sem criar duplicata)",
    r === "conflito_matricula"
  );
  confere("nenhum funcionário foi criado", !chamadas.includes("funcionario.create"));

  /* 3) Matrícula livre continua sendo cadastrada normalmente (chega até a criação). */
  chamadas.length = 0;
  await svc
    .criarFuncionarioDaApi("u-novo", { ...api, staffId: 777 }, "g", "diretoria", null, false)
    .catch(() => undefined);
  confere(
    "matrícula livre segue o fluxo normal de cadastro",
    chamadas.includes("funcionario.create")
  );

  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(2);
});
