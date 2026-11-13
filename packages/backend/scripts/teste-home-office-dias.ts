/** Ícone de home office: dias com batida gravada como HOME_OFFICE/HIBRIDO. npx ts-node -P tsconfig.json --transpile-only scripts/teste-home-office-dias.ts */
import { localModalidadePorDia, rotulosModalidadePorDia } from "../src/utils/hora-extra-decisao";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
const regs = [
  { dataHora: d("2026-11-03"), modoRegistro: "HOME_OFFICE", ajustado: false },
  { dataHora: d("2026-11-03"), modoRegistro: "HOME_OFFICE", ajustado: false },
  { dataHora: d("2026-11-04"), modoRegistro: "HIBRIDO", ajustado: false },
  { dataHora: d("2026-11-05"), modoRegistro: "HOME_OFFICE", ajustado: false },
  { dataHora: d("2026-11-05"), modoRegistro: "MOBILE", ajustado: false },
  { dataHora: d("2026-11-06"), modoRegistro: "DESKTOP", ajustado: false },
  { dataHora: d("2026-11-09"), modoRegistro: "HOME_OFFICE", ajustado: false },
  { dataHora: d("2026-11-09"), modoRegistro: "DESKTOP", ajustado: true }
];
let vigencias: { desde: Date; homeOffice: boolean; hibrido: boolean }[] = [
  { desde: d("2000-01-01"), homeOffice: false, hibrido: true }
];
const prisma = new Proxy(
  {},
  {
    get: (_a, m: string) =>
      new Proxy(
        {},
        {
          get: (_b, f: string) => async () => {
            if (m === "registroPonto" && f === "findMany") return regs;
            if (m === "funcionarioModalidadeHistorico" && f === "findMany") return vigencias;
            return f === "findMany" ? [] : null;
          }
        }
      )
  }
);
(async () => {
  const r = await localModalidadePorDia(prisma as never, "f", d("2026-11-01"), d("2026-11-30"));
  ok("03/11 só HOME_OFFICE: casinha", r["2026-11-03"] === "HOME_OFFICE");
  ok("04/11 modo HIBRIDO (em casa): casinha", r["2026-11-04"] === "HOME_OFFICE");
  ok("05/11 misto (casa + presencial): sem casinha", !r["2026-11-05"]);
  ok("06/11 presencial: sem casinha", !r["2026-11-06"]);
  ok("09/11 batida ajustada à mão não conta: casinha", r["2026-11-09"] === "HOME_OFFICE");
  ok("fim de semana sem batida: sem casinha", !r["2026-11-07"] && !r["2026-11-08"]);
  /* Regime de home office vigente: o dia com batidas é home office, mesmo com batida presencial no meio (caso da Edna em 06/11) */
  vigencias = [
    { desde: d("2000-01-01"), homeOffice: false, hibrido: false },
    { desde: d("2026-11-05"), homeOffice: true, hibrido: false },
    { desde: d("2026-11-06"), homeOffice: false, hibrido: false }
  ];
  const r2 = await localModalidadePorDia(prisma as never, "f", d("2026-11-01"), d("2026-11-30"));
  ok(
    "regime home office vigente (05/11): casinha mesmo com batida MOBILE no dia",
    r2["2026-11-05"] === "HOME_OFFICE"
  );
  ok("fora do regime (06/11, presencial): sem casinha", !r2["2026-11-06"]);
  /* Rótulo do PDF/espelho: mesmo critério do ícone da tela */
  const rot = await rotulosModalidadePorDia(prisma as never, "f", d("2026-11-01"), d("2026-11-30"));
  ok(
    "PDF: regime home office com batida presencial no dia (05/11) recebe o rótulo Home Office",
    rot["2026-11-05"] === "Home Office"
  );
  ok("PDF: dia presencial (06/11) sem rótulo", !rot["2026-11-06"]);
  vigencias = [{ desde: d("2000-01-01"), homeOffice: false, hibrido: true }];
  const rot2 = await rotulosModalidadePorDia(
    prisma as never,
    "f",
    d("2026-11-01"),
    d("2026-11-30")
  );
  ok(
    "PDF: híbrido que bateu em casa (04/11) recebe o rótulo Híbrido",
    rot2["2026-11-04"] === "Híbrido"
  );
  ok(
    "PDF: dia misto (05/11) e presencial (06/11) sem rótulo",
    !rot2["2026-11-05"] && !rot2["2026-11-06"]
  );
  ok(
    "PDF e tela concordam nos mesmos dias",
    JSON.stringify(Object.keys(rot2).sort()) ===
      JSON.stringify(
        Object.entries(
          await localModalidadePorDia(prisma as never, "f", d("2026-11-01"), d("2026-11-30"))
        )
          .filter(([, v]) => v === "HOME_OFFICE")
          .map(([k]) => k)
          .sort()
      )
  );
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
