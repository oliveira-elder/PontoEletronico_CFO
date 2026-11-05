/** Gozado x agendado. npx ts-node -P tsconfig.json --transpile-only scripts/teste-ferias-gozo.ts */
import { separarGozoPorData, feriasJaIniciadas } from "../src/utils/ferias-regras";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const m = (p: Array<[string, string]>) => ({
  totalDiasGozo: 30,
  periodos: p.map(([a, b]) => ({ dataInicio: a, dataFim: b }))
});
const H = "2026-11-05";
let r = separarGozoPorData(m([["2026-12-01", "2026-12-30"]]), H);
ok("futuro: tudo agendado", r.gozados === 0 && r.agendados === 30);
r = separarGozoPorData(m([["2026-10-01", "2026-10-30"]]), H);
ok("passado: tudo gozado", r.gozados === 30 && r.agendados === 0);
r = separarGozoPorData(m([["2026-11-01", "2026-11-30"]]), H);
ok("em andamento: 5 gozados (hoje conta), 25 agendados", r.gozados === 5 && r.agendados === 25);
r = separarGozoPorData(
  m([
    ["2026-10-01", "2026-10-15"],
    ["2026-12-01", "2026-12-15"]
  ]),
  H
);
ok("misto: 15 e 15", r.gozados === 15 && r.agendados === 15);
r = separarGozoPorData({ totalDiasGozo: 20 }, H);
ok("sem períodos: agendado", r.gozados === 0 && r.agendados === 20);
ok("iniciada", feriasJaIniciadas(m([["2026-11-05", "2026-12-04"]]), H));
ok("não iniciada", !feriasJaIniciadas(m([["2026-11-06", "2026-12-05"]]), H));
console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
process.exit(falhas ? 1 : 0);
