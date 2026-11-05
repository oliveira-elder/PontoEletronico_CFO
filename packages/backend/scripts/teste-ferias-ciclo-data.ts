/** Ciclo de férias nasce na data de admissão (sem -1 dia). TZ=America/Sao_Paulo npx ts-node -P tsconfig.json --transpile-only scripts/teste-ferias-ciclo-data.ts */
import { PontoService } from "../src/modules/ponto/ponto.service";
const svc = Object.create(PontoService.prototype) as PontoService & { prisma: unknown };
(svc as unknown as { prisma: unknown }).prisma = {
  funcionario: {
    findUnique: async () => ({
      dataAdmissao: new Date("2025-01-21T00:00:00.000Z"),
      categoria: "CONCURSADO"
    })
  },
  solicitacao: { findMany: async () => [] }
};
(async () => {
  const s = await svc.calcularSaldoFeriasFuncionario("x");
  const c = s!.ciclos[0];
  const ok =
    c.inicio === "2025-01-21" && c.fim === "2026-01-20" && s!.dataAdmissao === "2025-01-21";
  console.log(
    ok ? "OK    ciclo 1 = 2025-01-21 a 2026-01-20" : `FALHA ${c.inicio} ${c.fim} ${s!.dataAdmissao}`
  );
  process.exit(ok ? 0 : 1);
})();
