/** Solicitações levam o afastamento que geraram (estado final) e filtram por ele. npx ts-node -P tsconfig.json --transpile-only scripts/teste-solicitacoes-afastamento.ts */
import { AuditoriaService } from "../src/modules/auditoria/auditoria.service";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const dia = (n: number) => new Date(Date.now() + n * 86400000);
const f = {
  matricula: "1",
  cargo: "A",
  fotoPerfilUrl: null,
  user: { name: "Ana" },
  gerencia: null
};
const sols = [
  {
    id: "s1",
    tipo: "ATESTADO",
    status: "APROVADA",
    descricao: "",
    createdAt: dia(-5),
    funcionario: f
  },
  {
    id: "s2",
    tipo: "LICENCA",
    status: "APROVADA",
    descricao: "",
    createdAt: dia(-4),
    funcionario: f
  },
  { id: "s3", tipo: "ABONO", status: "PENDENTE", descricao: "", createdAt: dia(-3), funcionario: f }
];
const afs = [
  {
    id: "a1",
    solicitacaoId: "s1",
    tipo: "ATESTADO",
    rotulo: null,
    dataInicio: dia(-1),
    dataFim: dia(1),
    horarioInicio: null,
    horarioFim: null
  },
  {
    id: "a2",
    solicitacaoId: "s2",
    tipo: "LICENCA_MEDICA",
    rotulo: "Licença Nojo",
    dataInicio: dia(10),
    dataFim: dia(12),
    horarioInicio: null,
    horarioFim: null
  }
];
let whereSol: Record<string, unknown> = {};
let whereAfFiltro: Record<string, unknown> = {};
const prisma = {
  solicitacao: {
    findMany: async (a: { where?: { id?: { in: string[] } } }) => {
      whereSol = (a.where ?? {}) as Record<string, unknown>;
      return a.where?.id?.in ? sols.filter((s) => a.where!.id!.in.includes(s.id)) : sols;
    },
    count: async () => sols.length
  },
  afastamento: {
    findMany: async (a: { where?: Record<string, unknown>; distinct?: unknown }) => {
      if (a.distinct) {
        whereAfFiltro = a.where ?? {};
        /* filtro por estado: devolve só os que casam */
        const w = a.where as {
          dataInicio?: { lte?: Date; gt?: Date };
          dataFim?: { gte?: Date; lt?: Date };
        };
        return afs.filter((x) => {
          if (w.dataInicio?.lte && w.dataFim?.gte)
            return x.dataInicio <= w.dataInicio.lte && x.dataFim >= w.dataFim.gte;
          if (w.dataInicio?.gt) return x.dataInicio > w.dataInicio.gt;
          return false;
        });
      }
      const ids = (a.where as { solicitacaoId?: { in: string[] } }).solicitacaoId?.in ?? [];
      return afs.filter((x) => ids.includes(x.solicitacaoId));
    },
    count: async () => 0
  }
};
(async () => {
  const svc = Object.create(AuditoriaService.prototype) as Record<string, unknown> & {
    getSolicitacoes: (
      x: object
    ) => Promise<{ solicitacoes: Array<{ id: string; afastamentos: unknown[] }> }>;
  };
  svc.prisma = prisma;
  svc.solicitacaoFuncionarioInclude = {};
  svc.TIPO_LABEL = {};
  svc.enriquecerSolicitacoesComGestor = async (rows: unknown[]) => rows;
  svc.startOfDay = (d: Date) => new Date(new Date(d).setHours(0, 0, 0, 0));
  svc.endOfDay = (d: Date) => new Date(new Date(d).setHours(23, 59, 59, 999));
  svc.semAcento = (t: string) => t.toLowerCase();

  const r = await svc.getSolicitacoes({});
  const por = new Map(r.solicitacoes.map((s) => [s.id, s.afastamentos]));
  ok(
    "cada solicitação leva o afastamento que gerou",
    por.get("s1")?.length === 1 && por.get("s2")?.length === 1
  );
  ok("solicitação sem afastamento (pendente) vem com lista vazia", por.get("s3")?.length === 0);
  ok("o afastamento não vaza o solicitacaoId", !("solicitacaoId" in (por.get("s1")![0] as object)));

  const ativo = await svc.getSolicitacoes({ afastamento: "ATIVO" });
  ok(
    "filtro 'em vigor' restringe às solicitações com afastamento ativo",
    JSON.stringify((whereSol as { id?: { in: string[] } }).id) === JSON.stringify({ in: ["s1"] }) &&
      ativo.solicitacoes.length === 1
  );
  const prog = await svc.getSolicitacoes({ afastamento: "PROGRAMADO" });
  ok(
    "filtro 'programado' restringe às solicitações com afastamento futuro",
    JSON.stringify((whereSol as { id?: { in: string[] } }).id) === JSON.stringify({ in: ["s2"] }) &&
      prog.solicitacoes.length === 1
  );
  ok(
    "o filtro só considera afastamentos gerados por solicitação",
    JSON.stringify(whereAfFiltro).includes('"not":null')
  );

  await svc.getSolicitacoes({ afastamento: "INVALIDO" });
  ok("estado inválido é ignorado (sem restrição)", (whereSol as { id?: unknown }).id === undefined);
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
