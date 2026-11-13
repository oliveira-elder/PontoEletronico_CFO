/** Exclusão lógica de exames (RH) e bloqueio de usuários sem matrícula nas áreas do RH. npx ts-node -P tsconfig.json --transpile-only scripts/teste-saude-softdelete-semmatricula.ts */
import { Reflector } from "@nestjs/core";
import { SaudeOcupacionalService } from "../src/modules/saude-ocupacional/saude-ocupacional.service";
import { PermissaoRhGuard } from "../src/modules/auth/permissao-rh.guard";
import { RECURSO_RH_KEY } from "../src/modules/auth/recurso-rh.decorator";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const chamadas: { op: string; args: unknown }[] = [];
let exame: Record<string, unknown> | null = { id: "e1", funcionarioId: "f1", excluidoEm: null };
const prisma = {
  user: { findFirst: async () => ({ id: "u-rh", name: "Priscilla" }) },
  exameOcupacional: {
    findUnique: async () => exame,
    findMany: async (a: unknown) => (chamadas.push({ op: "findMany", args: a }), []),
    update: async (a: unknown) => (chamadas.push({ op: "update", args: a }), exame),
    delete: async (a: unknown) => (chamadas.push({ op: "delete", args: a }), exame)
  }
};
(async () => {
  const svc = Object.create(SaudeOcupacionalService.prototype) as Record<string, unknown>;
  svc.prisma = prisma;
  const s = svc as unknown as SaudeOcupacionalService;
  await s.excluirLogico("e1", "sub-rh");
  const up = chamadas.find((c) => c.op === "update")?.args as { data: Record<string, unknown> };
  ok(
    "RH: exclusão lógica grava data, nome e usuário",
    !!up.data.excluidoEm &&
      up.data.excluidoPorNome === "Priscilla" &&
      up.data.excluidoPorUserId === "u-rh"
  );
  ok("RH: nada é apagado do banco", !chamadas.some((c) => c.op === "delete"));
  exame = { id: "e1", funcionarioId: "f1", excluidoEm: new Date() };
  let jaExcluido = false;
  await s.excluirLogico("e1", "sub-rh").catch(() => (jaExcluido = true));
  ok("não exclui duas vezes", jaExcluido);
  chamadas.length = 0;
  await s.examesDoFuncionario("f1", false);
  ok(
    "histórico do RH esconde os excluídos",
    JSON.stringify((chamadas[0].args as { where: object }).where).includes('"excluidoEm":null')
  );
  chamadas.length = 0;
  await s.examesDoFuncionario("f1", true);
  ok(
    "super administrador vê também os excluídos",
    !JSON.stringify((chamadas[0].args as { where: object }).where).includes("excluidoEm")
  );
  let bloqueado = false;
  await s.editar("e1", {}).catch(() => (bloqueado = true));
  ok("exame excluído não pode ser editado", bloqueado);

  /* Guard: sem matrícula (Alta Administração) fora das áreas do RH */
  const categoria: { v: string } = { v: "ALTA_ADMINISTRACAO" };
  const prismaGuard = { funcionario: { findFirst: async () => ({ categoria: categoria.v }) } };
  const reflector = {
    getAllAndOverride: (k: unknown) => (k === RECURSO_RH_KEY ? ["saude.exames"] : ["RH_AUDITORIA"])
  } as unknown as Reflector;
  const guard = new PermissaoRhGuard(reflector, prismaGuard as never);
  const ctx = (user: object) =>
    ({
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user }) })
    }) as never;
  let barrou = false;
  await guard
    .canActivate(ctx({ sub: "alta", roles: ["ponto-admin"] }))
    .catch(() => (barrou = true));
  ok("usuário sem matrícula é barrado na área do RH", barrou);
  ok(
    "super administrador não é barrado",
    (await guard.canActivate(ctx({ sub: "super", roles: [], isSuperAdmin: true }))) === true
  );
  categoria.v = "CONCURSADO";
  ok(
    "usuário com matrícula passa (Gerente de RH)",
    (await guard.canActivate(ctx({ sub: "gerente", roles: ["ponto-admin"] }))) === true
  );
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
