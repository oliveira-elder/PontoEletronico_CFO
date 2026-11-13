/** Tipos de licença "somente RH" somem das Solicitações do funcionário. npx ts-node -P tsconfig.json --transpile-only scripts/teste-licenca-somente-rh.ts */
import { PontoService } from "../src/modules/ponto/ponto.service";
import {
  TIPOS_LICENCA_PADRAO,
  nomeDeTipoSomenteRh,
  normalizarTipoLicenca
} from "../src/utils/licenca-regras";
import { garantirTiposSomenteRh } from "../src/utils/licenca-db";
let falhas = 0;
const ok = (r: string, c: boolean) => {
  console.log(`${c ? "OK   " : "FALHA"} ${r}`);
  if (!c) falhas++;
};
const tipos = [
  { id: "t1", nome: "Licença Nojo", somenteRh: false },
  { id: "t2", nome: "Afastamento INSS", somenteRh: true },
  { id: "t3", nome: "Serviço Militar Obrigatório", somenteRh: true },
  { id: "t4", nome: "Licença não Remunerada", somenteRh: true },
  { id: "t5", nome: "Outros", somenteRh: true },
  { id: "t6", nome: "Serviço Militar", somenteRh: false } /* cadastro antigo, sem a marcação */
].map((t, i) => ({
  ...t,
  ativo: true,
  ordem: i,
  categorias: [],
  modoDuracao: "LIVRE",
  limiteDias: null,
  prorrogacaoDias: null,
  contagem: "CORRIDOS",
  consecutivos: true,
  unidade: "DIAS",
  janelaMeses: null,
  limiteNaJanela: null,
  permiteParcial: false,
  exigeDocumento: false,
  orientacao: null,
  efeito: "AFASTAMENTO",
  reducaoMaxPct: null,
  codigoSistema: null
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = Object.create(PontoService.prototype) as any;
svc.prisma = {
  tipoLicenca: {
    count: async () => tipos.length,
    findMany: async () => tipos,
    aggregate: async () => ({ _max: { ordem: 10 } }),
    create: async () => ({}),
    update: async () => ({})
  },
  solicitacao: { findMany: async () => [] }
};
svc.getFuncionario = async () => ({ id: "f", categoria: "CONCURSADO" });
(async () => {
  const doFunc = (await svc.getTiposLicenca("sub-func")) as Array<{ id: string }>;
  ok(
    "funcionário só vê os tipos comuns (mesmo o Serviço Militar sem marcação)",
    doFunc.length === 1 && doFunc[0].id === "t1"
  );
  const doRh = (await svc.getTiposLicenca("@func:f")) as Array<{ id: string }>;
  ok("RH (em nome do funcionário) vê todos", doRh.length === 6);
  const pedir = async (id: string, comoRh: boolean) => {
    try {
      await svc.prepararLicenca(
        { id: "f", categoria: "CONCURSADO" },
        { dataReferencia: "2026-12-01", metadados: { tipoLicencaId: id } },
        comoRh
      );
      return "passou";
    } catch (e) {
      return (e as Error).constructor.name + ": " + (e as Error).message;
    }
  };
  for (const id of ["t2", "t3", "t4", "t5", "t6"]) {
    const r = await pedir(id, false);
    ok(
      `funcionário não consegue pedir ${tipos.find((t) => t.id === id)!.nome} (400)`,
      r.startsWith("BadRequestException") && r.includes("só pode ser registrada pelo RH")
    );
  }
  const r = await pedir("t2", true);
  ok("RH passa da checagem de 'somente RH'", !r.includes("só pode ser registrada pelo RH"));
  const padrao = TIPOS_LICENCA_PADRAO.filter((t) => t.somenteRh).map((t) => t.nome);
  ok(
    "padrões novos marcam INSS, Serviço Militar, Não Remunerada e Outros como somente RH",
    padrao.length === 4
  );
  ok(
    "normalizar guarda somenteRh",
    normalizarTipoLicenca({ ...TIPOS_LICENCA_PADRAO[0], somenteRh: true }).somenteRh === true &&
      normalizarTipoLicenca({ ...TIPOS_LICENCA_PADRAO[0], somenteRh: false }).somenteRh === false
  );
  ok(
    "reconhece pelo nome (sem depender da marcação): Serviço Militar, INSS, Não Remunerada e Outros",
    [
      "Serviço Militar",
      "Afastamento INSS",
      "Licença não Remunerada",
      "Licença Nao Remunerada",
      "Outros"
    ].every(nomeDeTipoSomenteRh)
  );
  ok(
    "não confunde tipos comuns",
    [
      "Licença Nojo",
      "Licença Gala",
      "Licença Maternidade",
      "Doação de Sangue",
      "Alistamento Eleitoral",
      "Licença remunerada especial"
    ].every((n) => !nomeDeTipoSomenteRh(n))
  );
  /* Criação automática dos tipos só-RH que faltam (banco antigo só tinha "Serviço Militar") */
  const banco: Array<Record<string, unknown>> = [
    { id: "x1", nome: "Licença Nojo", ordem: 1, ativo: true, categorias: [], somenteRh: false },
    { id: "x2", nome: "Serviço Militar", ordem: 2, ativo: true, categorias: [], somenteRh: false },
    /* cadastro antigo: INSS desativado e restrito a uma categoria (por isso sumia da lista do RH) */
    {
      id: "x3",
      nome: "Afastamento INSS",
      ordem: 3,
      ativo: false,
      categorias: ["ESTAGIARIO"],
      somenteRh: false
    }
  ];
  const dbFalso = {
    tipoLicenca: {
      findMany: async () => banco.map((b) => ({ ...b })),
      aggregate: async () => ({
        _max: { ordem: Math.max(...banco.map((b) => b.ordem as number)) }
      }),
      create: async (a: { data: Record<string, unknown> }) =>
        void banco.push({ id: `n${banco.length}`, ...a.data }),
      update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        const l = banco.find((b) => b.id === a.where.id);
        if (l) Object.assign(l, a.data);
      }
    }
  };
  await garantirTiposSomenteRh(dbFalso as never);
  const nomesBanco = banco.map((b) => b.nome);
  ok(
    "cria os que faltam: Licença não Remunerada e Outros (INSS já existia, não duplica)",
    ["Licença não Remunerada", "Outros"].every((n) => nomesBanco.includes(n)) &&
      nomesBanco.filter((n) => n === "Afastamento INSS").length === 1
  );
  ok(
    "renomeia 'Serviço Militar' para 'Serviço Militar Obrigatório' sem duplicar",
    nomesBanco.includes("Serviço Militar Obrigatório") &&
      !nomesBanco.includes("Serviço Militar") &&
      nomesBanco.length === 5
  );
  ok(
    "os criados já nascem como somente RH",
    banco.filter((b) => b.somenteRh === true).length === 4
  );
  const antes = banco.length;
  await garantirTiposSomenteRh(dbFalso as never);
  ok("rodar de novo não duplica", banco.length === antes);
  console.log(falhas ? `RESULTADO: ${falhas} falha(s)` : "RESULTADO: tudo OK");
  process.exit(falhas ? 1 : 0);
})();
