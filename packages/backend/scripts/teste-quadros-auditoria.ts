/** Auditoria — Solicitações/Afastamentos: busca sem acento e ordem alfabética. npx ts-node -P tsconfig.json --transpile-only scripts/teste-quadros-auditoria.ts */
import { AuditoriaService } from "../src/modules/auditoria/auditoria.service";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const func = (nome: string, setor: string, mat: string) => ({
  matricula: mat,
  cargo: "Analista",
  fotoPerfilUrl: null,
  user: { name: nome, email: "" },
  gerencia: { nome: setor, sigla: setor.slice(0, 3).toUpperCase() }
});
const sols = [
  {
    id: "s1",
    tipo: "ATESTADO",
    status: "PENDENTE",
    descricao: "consulta",
    createdAt: new Date("2026-11-03"),
    funcionario: func("Zélia Souza", "Departamento de TI", "1")
  },
  {
    id: "s2",
    tipo: "FERIAS",
    status: "APROVADA",
    descricao: "",
    createdAt: new Date("2026-11-02"),
    funcionario: func("Ana Guimarães", "Gestão de Pessoas", "2")
  },
  {
    id: "s3",
    tipo: "ABONO",
    status: "PENDENTE",
    descricao: "",
    createdAt: new Date("2026-11-04"),
    funcionario: func("Ana Guimarães", "Gestão de Pessoas", "2")
  }
];
const consultas: Record<string, unknown>[] = [];
const prisma = {
  solicitacao: {
    findMany: async (a: { where?: { id?: { in: string[] } }; orderBy?: unknown }) => {
      consultas.push({ orderBy: a.orderBy });
      return a.where?.id ? sols.filter((s) => a.where!.id!.in.includes(s.id)) : sols;
    },
    count: async () => sols.length
  },
  afastamento: {
    findMany: async () => [],
    count: async () => 0
  }
};
(async () => {
  const svc = Object.create(AuditoriaService.prototype) as Record<string, unknown>;
  svc.prisma = prisma;
  svc.solicitacaoFuncionarioInclude = {};
  svc.TIPO_LABEL = { ATESTADO: "Atestado médico", FERIAS: "Férias", ABONO: "Abono" };
  svc.enriquecerSolicitacoesComGestor = async (rows: unknown[]) => rows;
  const a = svc as unknown as AuditoriaService;

  let r = await a.getSolicitacoes({ ordem: "nome" });
  ok(
    "sem busca: pede ordem alfabética por nome e depois mais recente",
    JSON.stringify(consultas.at(-1)?.orderBy).includes('"name":"asc"') &&
      JSON.stringify(consultas.at(-1)?.orderBy).includes("createdAt")
  );

  r = await a.getSolicitacoes({ busca: "guimaraes", ordem: "nome" });
  ok("busca sem acento encontra 'Guimarães' (2 solicitações)", r.total === 2);
  ok(
    "ordem: Ana antes; dentro dela a mais recente primeiro",
    r.solicitacoes.map((s) => s.id).join() === "s3,s2"
  );

  r = await a.getSolicitacoes({ busca: "gestao pessoas" });
  ok("busca por setor (sem acento, várias palavras)", r.total === 2);
  r = await a.getSolicitacoes({ busca: "atestado" });
  ok("busca pelo tipo da solicitação", r.total === 1 && r.solicitacoes[0].id === "s1");
  r = await a.getSolicitacoes({ busca: "pendente", ordem: "nome" });
  ok("busca pela situação; Ana antes de Zélia", r.solicitacoes.map((s) => s.id).join() === "s3,s1");
  r = await a.getSolicitacoes({ busca: "zelia", ordem: "nome", page: 1, limit: 1 });
  ok("paginação aplicada depois do filtro", r.total === 1 && r.solicitacoes.length === 1);
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
