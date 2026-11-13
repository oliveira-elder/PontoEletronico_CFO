/** Tipo "Mudança de risco" aceito na criação/edição de exame. npx ts-node -P tsconfig.json --transpile-only scripts/teste-saude-tipo-risco.ts */
import { SaudeOcupacionalService } from "../src/modules/saude-ocupacional/saude-ocupacional.service";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const exame = {
  id: "e1",
  funcionarioId: "f1",
  dataRealizacao: new Date("2026-10-01T12:00:00Z"),
  situacao: "CONFIRMADO",
  resultado: "APTO",
  tipo: "PERIODICO",
  arquivoCaminho: null
};
let gravado: Record<string, unknown> | null = null;
const prisma = {
  exameOcupacional: {
    findUnique: async () => exame,
    update: async (a: { data: Record<string, unknown> }) => {
      gravado = a.data;
      return { ...exame, ...a.data };
    }
  }
};
(async () => {
  const svc = Object.create(SaudeOcupacionalService.prototype) as {
    prisma: unknown;
    getConfig: () => Promise<unknown>;
    editar: (id: string, b: object) => Promise<unknown>;
  };
  svc.prisma = prisma;
  svc.getConfig = async () => ({ periodicidadeMeses: 12, avisoDias: 30 });
  await svc.editar("e1", { tipo: "MUDANCA_DE_RISCO", dataRealizacao: "2026-10-01" });
  ok(
    "edição aceita MUDANCA_DE_RISCO e grava o tipo",
    (gravado as unknown as { tipo?: string })?.tipo === "MUDANCA_DE_RISCO"
  );
  let recusou = false;
  await svc
    .editar("e1", { tipo: "OUTRO", dataRealizacao: "2026-10-01" })
    .catch(() => (recusou = true));
  ok("tipo inválido continua recusado", recusou);
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
