/** Detalhamento dos gráficos do dashboard. npx ts-node -P tsconfig.json --transpile-only scripts/teste-dashboard-detalhe.ts */
import { AuditoriaService } from "../src/modules/auditoria/auditoria.service";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const consultas: { modelo: string; metodo: string; where: unknown }[] = [];
const dados: Record<string, unknown> = {
  "registroPonto.findMany": [
    {
      funcionarioId: "f1",
      dataHora: new Date("2026-11-05T11:10:00Z"),
      tipo: "ENTRADA",
      origem: "MOBILE"
    },
    {
      funcionarioId: "f2",
      dataHora: new Date("2026-11-05T12:40:00Z"),
      tipo: "ENTRADA",
      origem: "DESKTOP"
    }
  ],
  "funcionario.findMany": [
    {
      id: "f1",
      matricula: "10",
      gerencia: { sigla: "DA", nome: "Dir. Adm." },
      user: { name: "Ana" }
    },
    { id: "f2", matricula: "20", gerencia: null, user: { name: "Bia" } }
  ],
  "solicitacao.findMany": [
    {
      funcionarioId: "f1",
      tipo: "ATESTADO",
      status: "PENDENTE",
      createdAt: new Date("2026-11-04T15:00:00Z")
    }
  ],
  "afastamento.findMany": [
    {
      funcionarioId: "f2",
      tipo: "FERIAS",
      dataInicio: new Date("2026-11-02T03:00:00Z"),
      dataFim: new Date("2026-11-11T03:00:00Z")
    }
  ]
};
const prisma = new Proxy(
  {},
  {
    get: (_a, modelo: string) =>
      new Proxy(
        {},
        {
          get:
            (_b, metodo: string) =>
            async (args: { where?: unknown } = {}) => {
              consultas.push({ modelo, metodo, where: args.where });
              return (
                dados[`${modelo}.${metodo}`] ??
                (metodo === "findMany" || metodo === "groupBy" ? [] : null)
              );
            }
        }
      )
  }
);
(async () => {
  const svc = Object.create(AuditoriaService.prototype) as AuditoriaService & { prisma: unknown };
  (svc as unknown as { prisma: unknown }).prisma = prisma;
  const f = { dataInicio: "2026-10-06", dataFim: "2026-11-05" };

  let r = await svc.getDashboardDetalhe({ tipo: "entradas-dia", chave: "2026-11-05", ...f });
  ok(
    "entradas do dia: filtra ENTRADA, sem alta administração",
    JSON.stringify(consultas.at(-2)?.where ?? consultas.at(-1)?.where).includes(
      "ALTA_ADMINISTRACAO"
    ) &&
      JSON.stringify(consultas.find((c) => c.modelo === "registroPonto")?.where).includes("ENTRADA")
  );
  ok(
    "linhas com nome, matrícula e gerência",
    r.linhas[0].nome === "Ana" && r.linhas[0].matricula === "10" && r.linhas[0].gerencia === "DA"
  );
  ok("data/hora em Brasília (11:10Z = 08:10)", r.linhas[0].quando.endsWith("08:10"));

  r = await svc.getDashboardDetalhe({
    tipo: "registros-hora",
    chave: "2026-11-05",
    hora: "09",
    ...f
  });
  ok(
    "registros por hora: só a hora clicada (09h = 12:40Z)",
    r.linhas.length === 1 && r.linhas[0].nome === "Bia"
  );
  r = await svc.getDashboardDetalhe({
    tipo: "registros-hora",
    chave: "2026-11-05",
    hora: "08",
    ...f
  });
  ok("registros por hora: 08h", r.linhas.length === 1 && r.linhas[0].nome === "Ana");

  r = await svc.getDashboardDetalhe({ tipo: "sol-status", chave: "PENDENTE", ...f });
  ok(
    "solicitações por status: tipo traduzido e situação",
    r.linhas[0].detalhe === "Atestado médico" && r.linhas[0].valor === "pendente"
  );
  r = await svc.getDashboardDetalhe({ tipo: "afastamento-tipo", chave: "FERIAS", ...f });
  ok(
    "afastamentos por tipo: período e dias",
    r.linhas[0].quando.includes(" a ") && r.linhas[0].valor === "10"
  );
  r = await svc.getDashboardDetalhe({ tipo: "canal", chave: "MOBILE", ...f });
  ok("canal responde sem erro", Array.isArray(r.linhas));
  ok(
    "período devolvido igual ao filtro",
    r.periodo.dataInicio === "2026-10-06" && r.periodo.dataFim === "2026-11-05"
  );

  let recusou = false;
  await svc.getDashboardDetalhe({ tipo: "inexistente", ...f }).catch(() => (recusou = true));
  ok("tipo desconhecido é recusado", recusou);
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
