/**
 * Garante que a Alta Administração NÃO entra em estatísticas (dashboards, totais, rankings) e que as FILAS de
 * trabalho do RH continuam enxergando essa categoria. Banco simulado por "espião": registra cada consulta feita.
 *   npx ts-node -P tsconfig.json --transpile-only scripts/teste-estatisticas-alta-adm.ts
 */
import { AuditoriaService } from "../src/modules/auditoria/auditoria.service";
import { GestaoService } from "../src/modules/ponto/gestao.service";
import { SaudeOcupacionalService } from "../src/modules/saude-ocupacional/saude-ocupacional.service";

let falhas = 0;
const confere = (rotulo: string, ok: boolean) => {
  console.log(`${ok ? "OK   " : "FALHA"} ${rotulo}`);
  if (!ok) falhas++;
};

type Chamada = { modelo: string; metodo: string; args: Record<string, unknown> };
const chamadas: Chamada[] = [];
let respostas: Record<string, unknown> = {};

/** Qualquer model/método devolve vazio/zero e registra a chamada; `respostas["modelo.metodo"]` sobrescreve. */
const prisma = new Proxy(
  {},
  {
    get: (_a, modelo: string) =>
      new Proxy(
        {},
        {
          get:
            (_b, metodo: string) =>
            async (args: Record<string, unknown> = {}) => {
              chamadas.push({ modelo, metodo, args });
              const chave = `${modelo}.${metodo}`;
              if (chave in respostas) return respostas[chave];
              if (metodo === "count") return 0;
              if (metodo === "findMany" || metodo === "groupBy") return [];
              if (metodo === "aggregate") return { _count: 0, _max: {}, _min: {}, _sum: {} };
              return null;
            }
        }
      )
  }
);

const SEM_ALTA = JSON.stringify({ not: "ALTA_ADMINISTRACAO" });
const filtraCategoria = (where: unknown) =>
  JSON.stringify((where as Record<string, unknown> | undefined)?.categoria) === SEM_ALTA;
const filtraViaFuncionario = (where: unknown) =>
  filtraCategoria((where as { funcionario?: Record<string, unknown> } | undefined)?.funcionario);
const filtraViaPeriodo = (where: unknown) =>
  filtraViaFuncionario((where as { periodo?: Record<string, unknown> } | undefined)?.periodo);
const de = (modelo: string, metodo: string) =>
  chamadas.filter((c) => c.modelo === modelo && c.metodo === metodo);
/** Consultas de agregação "soltas" (sem restringir por funcionarioId: as que usam a lista já filtrada ficam de fora). */
const soltas = (modelo: string, metodo: string) =>
  de(modelo, metodo).filter(
    (c) =>
      !("funcionarioId" in ((c.args.where as object) ?? {})) &&
      !("funcionarioId" in ((c.args.select as object) ?? {}))
  );

async function main() {
  /* 1) Dashboard consolidado (gestão) */
  const gestao = new GestaoService(prisma as never, {} as never, {} as never, undefined);
  chamadas.length = 0;
  await gestao.getDashboardStats().catch(() => undefined);
  const fm = de("funcionario", "findMany")[0];
  confere(
    "Dashboard consolidado: a consulta de funcionários exclui a Alta Administração",
    !!fm && filtraCategoria(fm.args.where)
  );

  /* 2) Contagem de funcionários por gerência (tela de Gerências) */
  chamadas.length = 0;
  await gestao.listGerencias();
  const inc = JSON.stringify(de("gerencia", "findMany")[0]?.args.include ?? {});
  confere(
    "Gerências: a contagem de funcionários exclui a Alta Administração",
    inc.includes("ALTA_ADMINISTRACAO")
  );

  /* 3) Dashboard de auditoria: totais, solicitações, afastamentos, assinaturas, rankings */
  const auditoria = Object.create(AuditoriaService.prototype) as AuditoriaService & {
    prisma: unknown;
  };
  (auditoria as unknown as { prisma: unknown }).prisma = prisma;
  chamadas.length = 0;
  await auditoria
    .getDashboard({ dataInicio: "2026-10-01", dataFim: "2026-10-31" })
    .catch(() => undefined);
  const counts = de("funcionario", "count");
  confere(
    "Auditoria: total de funcionários exclui a Alta Administração",
    counts.length >= 2 && counts.every((c) => filtraCategoria(c.args.where))
  );
  confere(
    "Auditoria: solicitações pendentes (card) excluem a Alta Administração",
    de("solicitacao", "count").some((c) => filtraViaFuncionario(c.args.where))
  );
  confere(
    "Auditoria: afastamentos ativos excluem a Alta Administração",
    de("afastamento", "count").every((c) => filtraViaFuncionario(c.args.where)) &&
      de("afastamento", "count").length > 0
  );
  confere(
    "Auditoria: afastamentos por tipo e por categoria excluem a Alta Administração",
    de("afastamento", "groupBy").every((c) => filtraViaFuncionario(c.args.where)) &&
      de("afastamento", "groupBy").length > 0
  );
  confere(
    "Auditoria: séries de atestado/férias e solicitações do período excluem a Alta Administração",
    soltas("solicitacao", "findMany").every((c) => filtraViaFuncionario(c.args.where)) &&
      soltas("afastamento", "findMany").every((c) => filtraViaFuncionario(c.args.where))
  );
  confere(
    "Auditoria: assinaturas por status excluem a Alta Administração",
    de("assinaturaQuadro", "groupBy").every((c) => filtraViaPeriodo(c.args.where)) &&
      de("assinaturaQuadro", "groupBy").length > 0
  );
  confere(
    "Auditoria: rankings (funcionários ativos) excluem a Alta Administração",
    de("funcionario", "findMany").some((c) => filtraCategoria(c.args.where))
  );

  /* 4) Banco de horas geral */
  chamadas.length = 0;
  await auditoria.getBancoHorasGeral({} as never).catch(() => undefined);
  confere(
    "Banco de horas geral exclui a Alta Administração",
    de("funcionario", "findMany").some((c) => filtraCategoria(c.args.where))
  );

  /* 5) Saúde ocupacional: estatística exclui; fila mantém */
  const hoje = new Date();
  const mk = (id: string, categoria: string) => ({
    id,
    cpf: "1",
    matricula: categoria === "ALTA_ADMINISTRACAO" ? null : id,
    categoria,
    user: { name: `Pessoa ${id}` },
    gerencia: null,
    ativo: true
  });
  const funcs = [mk("e1", "CONCURSADO"), mk("a1", "ALTA_ADMINISTRACAO")];
  respostas = {
    "funcionario.findMany": funcs,
    "exameOcupacional.findMany": [
      {
        id: "x1",
        funcionarioId: "a1",
        situacao: "AGUARDANDO_CONFERENCIA",
        dataRealizacao: hoje,
        proximoVencimento: null,
        resultado: null,
        createdAt: hoje
      }
    ],
    "configuracaoSistema.findUnique": null
  };
  const saude = Object.create(SaudeOcupacionalService.prototype) as {
    prisma: unknown;
    getConfig: () => Promise<unknown>;
    painel: (f: Record<string, unknown>) => Promise<{
      resumo: { total: number; semExame: number; aguardandoConferencia: number };
      itens: { funcionarioId: string }[];
    }>;
  };
  saude.prisma = prisma;
  saude.getConfig = async () => ({ periodicidadeMeses: 12, avisoDias: 30 });
  const p = await saude.painel({});
  confere(
    "Saúde: os cartões de resumo NÃO contam a Alta Administração (total = 1)",
    p.resumo.total === 1 && p.resumo.semExame === 1
  );
  confere(
    "Saúde: a Alta Administração continua na lista (cadastro/ação do RH)",
    p.itens.some((i) => i.funcionarioId === "a1")
  );
  confere(
    "Saúde: a fila 'aguardando conferência' continua contando a Alta Administração",
    p.resumo.aguardandoConferencia === 1
  );

  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(2);
});
