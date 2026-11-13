/** Observação por linha de lotação: grava, lê e preserva. npx ts-node -P tsconfig.json --transpile-only scripts/teste-lotacao-observacao.ts */
import {
  adicionarVigenciaLotacao,
  atualizarVigenciaLotacao,
  ensureLotacaoHistorico
} from "../src/utils/lotacao-historico";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
type Reg = Record<string, unknown>;
const d = (iso: string) => new Date(`${iso}T12:00:00-03:00`);
let linhas: Reg[] = [
  {
    id: "v1",
    funcionarioId: "f",
    cargo: "Analista",
    gerenciaId: "g1",
    subsecao: null,
    situacaoAtiva: true,
    data: null,
    observacao: null,
    vigenciaDesde: d("2025-03-01"),
    vigenciaAte: null
  }
];
const db = {
  funcionarioLotacaoHistorico: {
    findMany: async () =>
      [...linhas].sort(
        (a, b) => (a.vigenciaDesde as Date).getTime() - (b.vigenciaDesde as Date).getTime()
      ),
    create: async (a: { data: Reg }) =>
      void linhas.push({ id: `v${linhas.length + 1}`, ...a.data }),
    update: async (a: { where: { id: string }; data: Reg }) => {
      linhas = linhas.map((l) => (l.id === a.where.id ? { ...l, ...a.data } : l));
    }
  },
  funcionario: { findUnique: async () => null }
};
(async () => {
  await adicionarVigenciaLotacao(db as never, "f", {
    cargo: "Analista",
    gerenciaId: "g2",
    subsecao: "Desenvolvimento",
    observacao: "Transferido por necessidade do serviço",
    vigenciaDesde: "2026-06-01"
  });
  const nova = linhas.find((l) => l.id === "v2");
  ok(
    "nova lotação grava a observação",
    nova?.observacao === "Transferido por necessidade do serviço"
  );
  ok(
    "a lotação anterior é encerrada no dia anterior",
    (linhas[0].vigenciaAte as Date).toISOString().startsWith("2026-05-31")
  );
  await adicionarVigenciaLotacao(db as never, "f", {
    cargo: "Analista",
    gerenciaId: "g3",
    subsecao: null,
    vigenciaDesde: "2026-09-01"
  });
  ok("sem observação informada grava null", linhas.find((l) => l.id === "v3")?.observacao === null);
  await atualizarVigenciaLotacao(db as never, "f", "v2", {
    gerenciaId: "g2",
    subsecao: "Desenvolvimento",
    observacao: "Corrigido: transferência a pedido",
    vigenciaDesde: "2026-06-01"
  });
  ok(
    "editar atualiza a observação",
    linhas.find((l) => l.id === "v2")?.observacao === "Corrigido: transferência a pedido"
  );
  await atualizarVigenciaLotacao(db as never, "f", "v2", {
    gerenciaId: "g2",
    subsecao: "Desenvolvimento",
    vigenciaDesde: "2026-06-01"
  });
  ok(
    "editar sem informar observação não apaga a existente",
    linhas.find((l) => l.id === "v2")?.observacao === "Corrigido: transferência a pedido"
  );
  await atualizarVigenciaLotacao(db as never, "f", "v2", {
    gerenciaId: "g2",
    subsecao: "Desenvolvimento",
    observacao: null,
    vigenciaDesde: "2026-06-01"
  });
  ok("limpar a observação (null) apaga", linhas.find((l) => l.id === "v2")?.observacao === null);
  const lista = await ensureLotacaoHistorico(db as never, "f");
  ok(
    "a leitura devolve a observação de cada linha",
    lista.length === 3 && lista.every((l) => "observacao" in l)
  );
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
