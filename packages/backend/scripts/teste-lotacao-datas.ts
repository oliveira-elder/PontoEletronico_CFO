/** Lotação: data inválida vira 400 (antes derrubava com 500). npx ts-node -P tsconfig.json --transpile-only scripts/teste-lotacao-datas.ts */
import { GestaoService } from "../src/modules/ponto/gestao.service";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const svc = Object.create(GestaoService.prototype) as unknown as {
  prisma: unknown;
  atualizarLotacao: (f: string, v: string, d: object) => Promise<unknown>;
};
svc.prisma = {
  gerencia: {
    findUnique: async (a: { where: { id: string } }) => (a.where.id === "g1" ? { id: "g1" } : null)
  }
};
const tenta = async (d: object) => {
  try {
    await svc.atualizarLotacao("f", "v", d);
    return "passou";
  } catch (e) {
    return e instanceof Error ? e.constructor.name + ": " + e.message : "erro";
  }
};
(async () => {
  for (const [rotulo, d] of [
    ["ano com 5 dígitos", { gerenciaId: null, subsecao: null, vigenciaDesde: "20266-11-05" }],
    ["dia inexistente", { gerenciaId: null, subsecao: null, vigenciaDesde: "2026-02-31" }],
    [
      "fim inválido",
      { gerenciaId: null, subsecao: null, vigenciaDesde: "2026-11-05", vigenciaAte: "2026-13-01" }
    ],
    [
      "lotação inexistente",
      { gerenciaId: "nao-existe", subsecao: null, vigenciaDesde: "2026-11-05" }
    ],
    ["sem início", { gerenciaId: null, subsecao: null, vigenciaDesde: "" }]
  ] as [string, object][]) {
    const r = await tenta(d);
    ok(`${rotulo}: resposta 400 (BadRequest)`, r.startsWith("BadRequestException"));
  }
  const valida = await tenta({ gerenciaId: "g1", subsecao: null, vigenciaDesde: "2026-11-05" });
  ok("data e lotação válidas passam da validação", !valida.startsWith("BadRequestException"));
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
