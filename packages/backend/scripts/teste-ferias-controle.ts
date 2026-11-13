/** Controle geral de férias (CLT). TZ=America/Sao_Paulo npx ts-node -P tsconfig.json --transpile-only scripts/teste-ferias-controle.ts */
import { calcularControleFerias, fracionamentoIrregular } from "../src/utils/ferias-controle";
import { FeriasControleService } from "../src/modules/ferias-controle/ferias-controle.service";

let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const H = "2026-11-06";
const sol = (status: string, p: Array<[string, string]>, extra: Record<string, unknown> = {}) => ({
  id: Math.random().toString(36).slice(2),
  status,
  metadados: {
    totalDiasGozo: p.reduce((a, [i, f]) => a + (Date.parse(f) - Date.parse(i)) / 86400000 + 1, 0),
    periodos: p.map(([i, f]) => ({ dataInicio: i, dataFim: f })),
    ...extra
  }
});
const calc = (
  adm: string | null,
  solicitacoes: ReturnType<typeof sol>[] = [],
  cat = "CONCURSADO",
  marco: string | null = null
) => calcularControleFerias({ dataAdmissao: adm, categoria: cat, solicitacoes }, H, marco);

let r = calc("2025-01-21");
ok(
  "ciclo 1: 21/01/2025 a 20/01/2026, concessivo até 20/01/2027",
  r.ciclos[0].inicio === "2025-01-21" &&
    r.ciclos[0].fim === "2026-01-20" &&
    r.ciclos[0].concessivoFim === "2027-01-20"
);
ok(
  "concessivo em 75 dias, sem nada: VENCE_EM_BREVE",
  r.gravidade === "VENCE_EM_BREVE" && r.status === "NAO_PROGRAMADO"
);
r = calc("2025-03-21");
ok(
  "vencido sem nada, concessivo longe: NAO_PROGRAMADO",
  r.gravidade === "NAO_PROGRAMADO" && r.status === "NAO_PROGRAMADO"
);

r = calc("2024-01-10");
ok(
  "concessivo do ciclo 1 encerrado em 09/01/2026 sem gozo: EM_DOBRO",
  r.gravidade === "EM_DOBRO" && r.diasEmDobro === 30 && r.ciclos[0].concessivoFim === "2026-01-09"
);

r = calc("2024-12-01");
ok(
  "concessivo vence em 30/11/2026 (24 dias): VENCE_CRITICO",
  r.ciclos[0].concessivoFim === "2026-11-30" && r.gravidade === "VENCE_CRITICO"
);
r = calc("2025-02-20");
ok("concessivo em 19/02/2027 já não vence em 90: NAO_PROGRAMADO", r.gravidade === "NAO_PROGRAMADO");
r = calc("2024-12-20");
ok("concessivo em 19/12/2026 (43 dias): VENCE_EM_BREVE", r.gravidade === "VENCE_EM_BREVE");

r = calc("2025-01-21", [sol("APROVADA", [["2026-12-01", "2026-12-30"]], { cicloNumero: 1 })]);
ok(
  "agendado 30 dias: PROGRAMADO",
  r.gravidade === "PROGRAMADO" && r.status === "PROGRAMADO" && r.agendados === 30 && r.gozados === 0
);

r = calc("2025-01-21", [sol("APROVADA", [["2026-10-01", "2026-10-30"]], { cicloNumero: 1 })]);
ok(
  "gozou 30 dias: USUFRUIDO / EM_DIA",
  r.status === "USUFRUIDO" && r.gravidade === "EM_DIA" && r.gozados === 30
);

r = calc("2025-01-21", [sol("APROVADA", [["2026-11-01", "2026-11-30"]], { cicloNumero: 1 })]);
ok(
  "em gozo hoje (6 gozados, 24 agendados): EM_GOZO",
  r.gravidade === "EM_GOZO" && r.gozados === 6 && r.agendados === 24
);

r = calc("2025-03-21", [sol("APROVADA", [["2026-10-01", "2026-10-14"]], { cicloNumero: 1 })]);
ok(
  "gozou 14 dias, faltam 16 sem programar: PARCIAL",
  r.gravidade === "PARCIAL" && r.naoProgramados === 16
);

r = calc("2025-01-21", [
  sol("APROVADA", [["2026-10-01", "2026-10-20"]], { cicloNumero: 1, diasVendidos: 10 })
]);
ok(
  "20 gozados + 10 vendidos: usufruído com abono",
  r.status === "USUFRUIDO" && r.abono && r.vendidos === 10
);

r = calc("2025-01-21", [
  sol("APROVADA", [["2026-12-01", "2026-12-30"]], { cicloNumero: 1, adiantamento13: true })
]);
ok("adiantamento do 13º true", r.adiantamento13 === true);
ok(
  "13º não informado = null",
  calc("2025-01-21", [sol("APROVADA", [["2026-12-01", "2026-12-30"]], { cicloNumero: 1 })])
    .adiantamento13 === null
);

r = calc("2019-03-15");
ok(
  "5+ anos sem férias: todos os ciclos gerados e EM_DOBRO",
  r.ciclos.length === 8 && r.gravidade === "EM_DOBRO" && r.diasEmDobro >= 150
);
r = calc("2019-03-15", [], "CONCURSADO", "2025-06-01");
ok(
  "marco inicial ignora ciclos antigos",
  r.ciclos.filter((c) => c.anteriorAoControle).length >= 5 && r.diasEmDobro < r.ciclos.length * 30
);

r = calc(null);
ok("sem admissão: SEM_ADMISSAO", r.gravidade === "SEM_ADMISSAO" && r.ciclos.length === 0);
r = calc("2026-03-01");
ok("1º ano: ciclo em formação, EM_DIA", r.gravidade === "EM_DIA" && !r.ciclos[0].vencido);
r = calc("2025-01-21", [sol("PENDENTE", [["2026-12-01", "2026-12-30"]], { cicloNumero: 1 })]);
ok(
  "pedido em análise conta como agendado e marca o ciclo",
  r.agendados === 30 && r.ciclos[0].emAnalise
);
r = calc("2025-01-21", [
  sol("APROVADA", [["2026-12-01", "2026-12-30"]], { cicloNumero: 1 }),
  sol("PENDENTE", [["2026-12-10", "2026-12-30"]], { cicloNumero: 1, alteracaoDeId: "x" })
]);
ok("alteração em análise não duplica dias", r.agendados === 30 && r.ciclos[0].emAnalise);

ok(
  "fracionamento: 2 períodos de 10 dias é irregular (nenhum ≥14)",
  fracionamentoIrregular([{ dias: 10 }, { dias: 10 }])
);
ok(
  "fracionamento: 14+10+6 é regular",
  !fracionamentoIrregular([{ dias: 14 }, { dias: 10 }, { dias: 6 }])
);
ok(
  "fracionamento: período de 4 dias é irregular",
  fracionamentoIrregular([{ dias: 20 }, { dias: 4 }])
);
r = calc("2025-01-21", [
  sol(
    "APROVADA",
    [
      ["2026-12-01", "2026-12-10"],
      ["2027-01-05", "2027-01-14"],
      ["2027-02-01", "2027-02-10"]
    ],
    { cicloNumero: 1 }
  )
]);
ok(
  "aprovada com fracionamento irregular: sinalizado",
  r.fracionamentoIrregular && r.gravidade === "FRACIONAMENTO_IRREGULAR"
);
r = calc("2025-03-21", [], "ESTAGIARIO");
ok(
  "estagiário usa a mesma classificação e é sinalizado",
  r.estagiario && r.gravidade === "NAO_PROGRAMADO"
);

/* Serviço: exclui Alta Administração e inativos na consulta; ordena do pior ao melhor. */
const chamadas: Record<string, unknown>[] = [];
const prisma = {
  solicitacao: {
    aggregate: async () => ({ _min: { createdAt: new Date("2024-01-02T15:00:00Z") } }),
    findMany: async () => []
  },
  funcionario: {
    findMany: async (a: Record<string, unknown>) => {
      chamadas.push(a);
      const mk = (id: string, nome: string, adm: string | null) => ({
        id,
        matricula: id,
        categoria: "CONCURSADO",
        dataAdmissao: adm ? new Date(adm + "T00:00:00Z") : null,
        gerencia: { sigla: "G", nome: "G" },
        gerenciaId: "g",
        user: { name: nome }
      });
      return [
        mk("a", "Ana", "2026-03-01"),
        mk("b", "Bia", "2024-01-10"),
        mk("c", "Caio", "2025-01-21"),
        mk("d", "Aaron", null)
      ];
    }
  }
};
(async () => {
  const svc = new FeriasControleService(prisma as never);
  const p = await svc.painel({});
  const w = JSON.stringify(chamadas[0]?.where);
  ok(
    "consulta: só ativos e sem Alta Administração",
    w.includes('"ativo":true') && w.includes("ALTA_ADMINISTRACAO")
  );
  ok(
    "ordem: pior primeiro e sem admissão por último (Bia, Caio, Ana, Aaron)",
    p.itens.map((i) => i.nome).join() === "Bia,Caio,Ana,Aaron"
  );
  ok(
    "resumo conta por gravidade",
    p.resumo.total === 4 &&
      p.resumo.SEM_ADMISSAO === 1 &&
      p.resumo.EM_DOBRO === 1 &&
      p.resumo.EM_DIA === 1
  );
  /* Documentos de férias pendentes/vencidos na coluna do quadro */
  const comDocs = calc("2024-12-01", [
    sol("APROVADA", [["2026-11-01", "2026-11-10"]], {
      cicloNumero: 1,
      documentosFerias: [
        { tipo: "AVISO", url: "a" },
        { tipo: "RECIBO", url: "b", urlAssinado: "c" }
      ]
    })
  ]);
  ok(
    "Controle: Aviso enviado sem assinatura e já vencido conta como pendente e vencido",
    comDocs.docsPendentes === 1 && comDocs.docsVencidos === 1
  );
  const semDocs = calc("2024-12-01", [
    sol("APROVADA", [["2026-12-01", "2026-12-10"]], { cicloNumero: 1 })
  ]);
  ok(
    "Controle: sem documentos, nada pendente",
    semDocs.docsPendentes === 0 && semDocs.docsVencidos === 0
  );

  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
