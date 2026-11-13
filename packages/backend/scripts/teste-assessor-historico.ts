/** Nível/período do assessor e observação da lotação. npx ts-node -P tsconfig.json --transpile-only scripts/teste-assessor-historico.ts */
import { GestaoService } from "../src/modules/ponto/gestao.service";
import { nivelRomano, validarPeriodoAssessor } from "../src/utils/assessor-historico";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};

/* ── funções puras ── */
ok(
  "romanos: 1=I, 4=IV, 9=IX, 14=XIV, 15=XV",
  [1, 4, 9, 14, 15].map(nivelRomano).join(",") === "I,IV,IX,XIV,XV"
);
const ja = [{ id: "a", nivel: 2, vigenciaDesde: "2025-01-01", vigenciaAte: "2025-12-31" }];
ok(
  "período válido passa",
  validarPeriodoAssessor({ nivel: 3, vigenciaDesde: "2026-01-01", vigenciaAte: null }, ja) === null
);
ok(
  "nível 0, 16 e texto são recusados",
  [0, 16, "x", 2.5].every(
    (n) => !!validarPeriodoAssessor({ nivel: n, vigenciaDesde: "2026-01-01" }, [])
  )
);
ok(
  "data inexistente é recusada",
  !!validarPeriodoAssessor({ nivel: 2, vigenciaDesde: "2026-02-31" }, [])
);
ok("sem início é recusado", !!validarPeriodoAssessor({ nivel: 2, vigenciaDesde: "" }, []));
ok(
  "fim antes do início é recusado",
  !!validarPeriodoAssessor({ nivel: 2, vigenciaDesde: "2026-05-01", vigenciaAte: "2026-04-01" }, [])
);
ok(
  "sobreposição é recusada",
  !!validarPeriodoAssessor({ nivel: 3, vigenciaDesde: "2025-06-01", vigenciaAte: null }, ja)
);
ok(
  "em aberto também colide com período posterior",
  !!validarPeriodoAssessor({ nivel: 3, vigenciaDesde: "2024-01-01", vigenciaAte: null }, ja)
);
ok(
  "editar o próprio período não conta como sobreposição",
  validarPeriodoAssessor(
    { nivel: 4, vigenciaDesde: "2025-01-01", vigenciaAte: "2025-12-31" },
    ja,
    "a"
  ) === null
);
ok(
  "dia seguinte ao fim não colide",
  validarPeriodoAssessor({ nivel: 3, vigenciaDesde: "2026-01-01" }, ja) === null
);

/* ── service ── */
type Reg = Record<string, unknown>;
let isFiscal = true;
let linhas: Reg[] = [];
const criados: Reg[] = [];
const svc = Object.create(GestaoService.prototype) as unknown as {
  prisma: unknown;
  adicionarAssessor: (f: string, b: object) => Promise<unknown>;
  atualizarAssessor: (f: string, p: string, b: object) => Promise<unknown>;
  removerAssessor: (f: string, p: string) => Promise<unknown>;
  atualizarLotacao: (f: string, v: string, d: object) => Promise<unknown>;
};
svc.prisma = {
  funcionario: { findUnique: async () => ({ id: "f", isFiscal }) },
  gerencia: { findUnique: async () => ({ id: "g1" }) },
  funcionarioAssessorHistorico: {
    findMany: async () => linhas,
    findFirst: async (a: { where: { id: string } }) =>
      linhas.find((l) => l.id === a.where.id) ?? null,
    create: async (a: { data: Reg }) => (
      criados.push(a.data),
      linhas.push({ id: `n${linhas.length}`, ...a.data }),
      a.data
    ),
    update: async (a: { where: { id: string }; data: Reg }) => {
      linhas = linhas.map((l) => (l.id === a.where.id ? { ...l, ...a.data } : l));
    },
    delete: async (a: { where: { id: string } }) => {
      linhas = linhas.filter((l) => l.id !== a.where.id);
    }
  }
};
const tenta = async (p: Promise<unknown>) => {
  try {
    await p;
    return "passou";
  } catch (e) {
    return e instanceof Error ? e.constructor.name : "erro";
  }
};
(async () => {
  isFiscal = false;
  ok(
    "sem 'É assessor?' ligado o cadastro do período é recusado (400)",
    (await tenta(svc.adicionarAssessor("f", { nivel: 2, vigenciaDesde: "2026-01-01" }))) ===
      "BadRequestException"
  );
  isFiscal = true;
  ok(
    "nível inválido: 400",
    (await tenta(svc.adicionarAssessor("f", { nivel: 99, vigenciaDesde: "2026-01-01" }))) ===
      "BadRequestException"
  );
  ok(
    "data inválida: 400 (não 500)",
    (await tenta(svc.adicionarAssessor("f", { nivel: 2, vigenciaDesde: "2026-02-31" }))) ===
      "BadRequestException"
  );
  const lista = (await svc.adicionarAssessor("f", {
    nivel: 2,
    vigenciaDesde: "2025-01-01",
    vigenciaAte: "2025-12-31"
  })) as Reg[];
  ok("período válido é gravado", criados.length >= 1 && Array.isArray(lista));
  ok(
    "sobreposição: 400",
    (await tenta(svc.adicionarAssessor("f", { nivel: 3, vigenciaDesde: "2025-06-01" }))) ===
      "BadRequestException"
  );
  await svc.atualizarAssessor("f", "n0", {
    nivel: 5,
    vigenciaDesde: "2025-01-01",
    vigenciaAte: "2025-12-31"
  });
  ok("editar o nível mantém o período", linhas[0].nivel === 5);
  ok(
    "editar período inexistente: 400",
    (await tenta(svc.atualizarAssessor("f", "zzz", { nivel: 5, vigenciaDesde: "2025-01-01" }))) ===
      "BadRequestException"
  );
  await svc.removerAssessor("f", "n0");
  ok("remover apaga o período", linhas.length === 0);

  /* observação da lotação */
  const r = await tenta(
    svc.atualizarLotacao("f", "v", {
      gerenciaId: null,
      subsecao: null,
      vigenciaDesde: "2026-11-05",
      observacao: "x".repeat(501)
    })
  );
  ok("observação acima de 500 caracteres: 400", r === "BadRequestException");
  const r2 = await tenta(
    svc.atualizarLotacao("f", "v", {
      gerenciaId: "g1",
      subsecao: null,
      vigenciaDesde: "2026-11-05",
      observacao: "  Transferido por necessidade do serviço  "
    })
  );
  ok("observação dentro do limite passa da validação", r2 !== "BadRequestException");
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
