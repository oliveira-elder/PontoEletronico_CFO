/**
 * Regressão do núcleo de registro de ponto (REP-P). NÃO grava nada: a simulação roda numa transação
 * que é SEMPRE revertida, e as contagens do livro são conferidas antes e depois.
 *
 * Uso (dentro de packages/backend):
 *   npx ts-node -P tsconfig.json --transpile-only scripts/regressao-rep.ts [antes|depois]
 *
 * "antes"  = usa o trecho original de baterPonto (cópia fiel, inline).
 * "depois" = usa criarRegistroComMarcacao (modules/rep/registro-ponto.core.ts), já extraído.
 * A saída é normalizada (sem ids, datas ou NSR absolutos) para comparar as duas execuções com diff.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { createHash } from "crypto";
import { PrismaClient, type Prisma, type TipoPonto } from "@prisma/client";
import { RepLivroService } from "../src/modules/rep/rep-livro.service";
import { campoN, dataHoraDH } from "../src/utils/afd-campos";

const modo = process.argv[2] === "depois" ? "depois" : "antes";
const REVERTER = new Error("__reverter__");
const TIPOS: TipoPonto[] = [
  "ENTRADA",
  "INICIO_INTERVALO",
  "FIM_INTERVALO",
  "SAIDA",
  "INTERROMPER_EXPEDIENTE",
  "REINICIAR_EXPEDIENTE"
];

const saida: string[] = [];
const linha = (t: string) => saida.push(t);
const falhas: string[] = [];
const confere = (rotulo: string, ok: boolean) => {
  linha(`${ok ? "OK " : "FALHA"} ${rotulo}`);
  if (!ok) falhas.push(rotulo);
};

/** Trecho original de PontoService.baterPonto (transação + livro), copiado sem alterações. */
async function criarInline(
  prisma: PrismaClient,
  repLivro: RepLivroService,
  d: {
    funcionarioId: string;
    cpf: string | null;
    tipo: TipoPonto;
    agora: Date;
    origemPersistida: "WEB" | "MOBILE" | "DESKTOP";
  }
) {
  return prisma.$transaction(async (tx) => {
    const criado = await tx.registroPonto.create({
      data: {
        funcionarioId: d.funcionarioId,
        tipo: d.tipo,
        dataHora: d.agora,
        origem: d.origemPersistida,
        modoRegistro: "DESKTOP",
        dentroPerimetro: false
      }
    });
    const marcacaoRep = await repLivro.registrarMarcacao(tx, {
      registroPontoId: criado.id,
      funcionarioId: d.funcionarioId,
      cpf: d.cpf,
      tipoPonto: criado.tipo,
      dataHoraMarcacao: d.agora,
      origem: d.origemPersistida
    });
    return { ...criado, nsr: marcacaoRep?.nsr ?? null };
  });
}

async function main() {
  const prisma = new PrismaClient();
  const repP = { relogioForaDoLimite: () => null, verificarNtp: async () => undefined };
  const repLivro = new RepLivroService(prisma as never, repP as never);

  linha(`# regressão REP — modo: ${modo}`);

  /* 1) Estado do livro e integridade da cadeia (somente leitura). */
  const [contador, marcacoes0, eventos0] = await Promise.all([
    prisma.contadorNsr.findUnique({ where: { id: "singleton" } }),
    prisma.marcacaoRep.count(),
    prisma.eventoRep.count()
  ]);
  const registros0 = await prisma.registroPonto.count();
  const nsr0 = contador?.ultimo ?? 0;
  const cadeia = await repLivro.verificarCadeia();
  confere("cadeia de hash do livro íntegra", cadeia.ok);
  confere("NSR do contador cobre as marcações e eventos", nsr0 >= marcacoes0);

  /* 2) Simulação de cada tipo de batida, na mesma transação do sistema, sempre revertida. */
  const func = await prisma.funcionario.findFirst({
    where: { ativo: true, cpf: { not: null } },
    select: { id: true, cpf: true }
  });
  if (!func) throw new Error("Nenhum funcionário ativo com CPF para a simulação.");

  let criarCom: typeof criarInline = criarInline;
  if (modo === "depois") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require("../src/modules/rep/registro-ponto.core");
    criarCom = async (p, livro, d) => {
      const r = await core.criarRegistroComMarcacao(p, livro, {
        funcionarioId: d.funcionarioId,
        cpf: d.cpf,
        tipo: d.tipo,
        dataHora: d.agora,
        origem: d.origemPersistida,
        modoRegistro: "DESKTOP",
        dentroPerimetro: false
      });
      return { ...r.registro, nsr: r.marcacaoRep?.nsr ?? null };
    };
  }

  /* O `$transaction` do script abraça as chamadas, mas o trecho sob teste abre a sua própria transação;
     por isso a reversão é feita numa transação externa e a função recebe um cliente "dentro" dela. */
  const resultados: Array<Record<string, unknown>> = [];
  await prisma
    .$transaction(
      async (tx) => {
        /* Cliente-ponte: repassa `$transaction` do trecho sob teste para a transação externa. */
        const ponte = new Proxy(tx as unknown as PrismaClient, {
          get(alvo, prop, receptor) {
            if (prop === "$transaction") {
              return async (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => fn(tx);
            }
            return Reflect.get(alvo, prop, receptor);
          }
        });
        let anteriorHash: string | null =
          (await tx.marcacaoRep.findFirst({ orderBy: { nsr: "desc" }, select: { hash: true } }))
            ?.hash ?? null;
        let nsrEsperado = nsr0;
        for (const tipo of TIPOS) {
          const agora = new Date();
          const r = await criarCom(ponte, repLivro, {
            funcionarioId: func.id,
            cpf: func.cpf,
            tipo,
            agora,
            origemPersistida: "WEB"
          });
          const marc = await tx.marcacaoRep.findUnique({ where: { nsr: r.nsr as number } });
          nsrEsperado += 1;
          const base =
            campoN(marc!.nsr, 9) +
            "7" +
            dataHoraDH(marc!.dataHoraMarcacao) +
            campoN(marc!.cpf, 12) +
            dataHoraDH(marc!.dataHoraGravacao) +
            marc!.coletor +
            (marc!.offline ? "1" : "0") +
            (anteriorHash ?? "");
          const hashEsperado = createHash("sha256").update(base, "latin1").digest("hex");
          resultados.push({
            tipo,
            registroTipo: r.tipo,
            nsrSequencial: r.nsr === nsrEsperado,
            marcacaoVinculada: marc?.registroPontoId === r.id,
            hashConfere: marc?.hash === hashEsperado,
            encadeado: (marc?.hashAnterior ?? null) === anteriorHash,
            coletor: marc?.coletor,
            fuso: marc?.fusoMarcacao,
            reconstituida: marc?.reconstituida
          });
          anteriorHash = marc!.hash;
        }
        throw REVERTER;
      },
      { timeout: 30_000 }
    )
    .catch((e) => {
      if (e !== REVERTER) throw e;
    });

  for (const r of resultados) linha(`batida ${JSON.stringify(r)}`);
  for (const r of resultados) {
    confere(`${r.tipo}: NSR sequencial`, r.nsrSequencial === true);
    confere(`${r.tipo}: marcação vinculada ao registro`, r.marcacaoVinculada === true);
    confere(`${r.tipo}: hash SHA-256 confere`, r.hashConfere === true);
    confere(`${r.tipo}: encadeado ao hash anterior`, r.encadeado === true);
  }

  /* 3) Nada ficou gravado: contagens e contador idênticos ao início. */
  const [contador1, marcacoes1, eventos1, registros1] = await Promise.all([
    prisma.contadorNsr.findUnique({ where: { id: "singleton" } }),
    prisma.marcacaoRep.count(),
    prisma.eventoRep.count(),
    prisma.registroPonto.count()
  ]);
  confere("rollback: NSR do contador inalterado", (contador1?.ultimo ?? 0) === nsr0);
  confere("rollback: marcações inalteradas", marcacoes1 === marcacoes0);
  confere("rollback: eventos inalterados", eventos1 === eventos0);
  confere("rollback: registros de ponto inalterados", registros1 === registros0);
  const cadeia2 = await repLivro.verificarCadeia();
  confere(
    "cadeia de hash íntegra depois da simulação",
    cadeia2.ok && cadeia2.marcacoes === marcacoes1
  );

  linha(falhas.length ? `RESULTADO: ${falhas.length} falha(s)` : "RESULTADO: tudo OK");
  console.log(saida.join("\n"));
  await prisma.$disconnect();
  process.exit(falhas.length ? 1 : 0);
}

main().catch((e) => {
  console.error("ERRO NA REGRESSÃO:", e);
  process.exit(2);
});
