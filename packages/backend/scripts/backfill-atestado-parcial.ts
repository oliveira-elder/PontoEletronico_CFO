/**
 * Backfill: copia horarioInicio/horarioFim das solicitações ATESTADO aprovadas
 * para os Afastamentos correspondentes (corrige histórico de atestado parcial).
 *
 * Uso:
 *   cd packages/backend && npx ts-node --transpile-only scripts/backfill-atestado-parcial.ts
 *   DRY_RUN=1 npx ts-node --transpile-only scripts/backfill-atestado-parcial.ts
 */
import { PrismaClient } from "@prisma/client";
import { dataBrasiliaISO } from "../src/utils/horario-brasilia";

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

async function main() {
  const solicitacoes = await prisma.solicitacao.findMany({
    where: { tipo: "ATESTADO", status: "APROVADA" },
    select: {
      id: true,
      funcionarioId: true,
      dataInicio: true,
      dataFim: true,
      dataReferencia: true,
      metadados: true
    }
  });

  let atualizados = 0;
  let ignorados = 0;
  let semHorario = 0;
  let naoEncontrado = 0;

  for (const sol of solicitacoes) {
    const meta =
      sol.metadados && typeof sol.metadados === "object"
        ? (sol.metadados as Record<string, unknown>)
        : {};
    const horarioInicio =
      typeof meta.horarioInicio === "string" && meta.horarioInicio.trim()
        ? meta.horarioInicio.trim()
        : null;
    const horarioFim =
      typeof meta.horarioFim === "string" && meta.horarioFim.trim() ? meta.horarioFim.trim() : null;

    if (!horarioInicio || !horarioFim) {
      semHorario++;
      continue;
    }

    const diaInicio = dataBrasiliaISO(sol.dataInicio ?? sol.dataReferencia);
    const diaFim = dataBrasiliaISO(sol.dataFim ?? sol.dataInicio ?? sol.dataReferencia);

    const afastamentos = await prisma.afastamento.findMany({
      where: {
        funcionarioId: sol.funcionarioId,
        tipo: "ATESTADO",
        horarioInicio: null
      },
      select: {
        id: true,
        dataInicio: true,
        dataFim: true,
        horarioInicio: true,
        horarioFim: true
      }
    });

    const match = afastamentos.find((a) => {
      const aIni = dataBrasiliaISO(a.dataInicio);
      const aFim = dataBrasiliaISO(a.dataFim);
      return aIni === diaInicio && aFim === diaFim;
    });

    if (!match) {
      naoEncontrado++;
      console.log(
        `[skip] sol=${sol.id} func=${sol.funcionarioId} ${diaInicio}→${diaFim} ${horarioInicio}-${horarioFim}: afastamento não encontrado`
      );
      continue;
    }

    if (match.horarioInicio && match.horarioFim) {
      ignorados++;
      continue;
    }

    console.log(
      `[${DRY ? "dry" : "upd"}] afast=${match.id} ← ${horarioInicio}–${horarioFim} (${diaInicio})`
    );
    if (!DRY) {
      await prisma.afastamento.update({
        where: { id: match.id },
        data: { horarioInicio, horarioFim }
      });
    }
    atualizados++;
  }

  console.log(
    `\nConcluído${DRY ? " (DRY_RUN)" : ""}. atualizados=${atualizados} jaTinham=${ignorados} semHorario=${semHorario} naoEncontrado=${naoEncontrado}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
