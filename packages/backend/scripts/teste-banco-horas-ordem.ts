/** Banco de horas (Auditoria) ordenado do pior ao melhor saldo. npx ts-node -P tsconfig.json --transpile-only scripts/teste-banco-horas-ordem.ts */
import { AuditoriaService } from "../src/modules/auditoria/auditoria.service";
const saldos: Record<string, number> = { a: 93, b: -1663, c: -1543, d: -840, e: -1543 };
const nomes: Record<string, string> = {
  a: "Edna",
  b: "Elder",
  c: "Priscilla",
  d: "Lucca",
  e: "Ana"
};
const svc = Object.create(AuditoriaService.prototype) as Record<string, unknown>;
svc.prisma = {
  configuracaoSistema: { findUnique: async () => ({ bancoHorasLimiteMin: 120 }) },
  funcionario: {
    findMany: async () =>
      Object.keys(saldos).map((id) => ({
        id,
        matricula: id,
        user: { name: nomes[id], email: "" },
        gerencia: null
      }))
  }
};
svc.getCicloBancoHoras = async () => ({
  cicloInicio: "2026-08-19",
  proximaZeragem: "2026-12-31",
  hojeIso: "2026-11-06"
});
svc.calcularBancoHoras = async (id: string) => ({ saldoAtualMinutos: saldos[id] });
svc.formatMinutes = (m: number) => String(m);
(async () => {
  const r = await (svc as unknown as AuditoriaService).getBancoHorasGeral({ limit: 3 });
  const ordem = r.itens.map((i) => i.funcionario.nome).join();
  const ok = ordem === "Elder,Ana,Priscilla" && r.total === 5;
  console.log(
    ok ? "OK    pior saldo primeiro, empate por nome, ordenado antes de paginar" : `FALHA ${ordem}`
  );
  process.exit(ok ? 0 : 1);
})();
