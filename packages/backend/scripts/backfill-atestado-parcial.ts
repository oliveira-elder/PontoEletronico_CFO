/**
 * Backfill: copia horarioInicio/horarioFim das solicitações ATESTADO/ABONO aprovadas
 * para os Afastamentos correspondentes (corrige histórico de atestado parcial).
 *
 * Uso:
 *   cd packages/backend && npx ts-node --transpile-only scripts/backfill-atestado-parcial.ts
 *   DRY_RUN=1 npx ts-node --transpile-only scripts/backfill-atestado-parcial.ts
 */
import { PrismaClient } from "@prisma/client";
import { dataCivilISO } from "../src/utils/horario-brasilia";

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

function diaValido(iso: string): boolean {
  const y = Number(iso.slice(0, 4));
  return y >= 2000 && y <= 2100;
}

async function main() {
  const solicitacoes = await prisma.solicitacao.findMany({
    where: { tipo: { in: ["ATESTADO", "ABONO"] }, status: "APROVADA" },
    select: {
      id: true,
      tipo: true,
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

    const diaInicio = dataCivilISO(sol.dataInicio ?? sol.dataReferencia);
    const diaFimRaw = dataCivilISO(sol.dataFim ?? sol.dataInicio ?? sol.dataReferencia);
    const diaFim = diaValido(diaFimRaw) ? diaFimRaw : diaInicio;

    const afastamentos = await prisma.afastamento.findMany({
      where: {
        funcionarioId: sol.funcionarioId,
        tipo: sol.tipo === "ABONO" ? "ABONO" : "ATESTADO",
        OR: [{ horarioInicio: null }, { horarioFim: null }]
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
      const aIni = dataCivilISO(a.dataInicio);
      const aFimRaw = dataCivilISO(a.dataFim);
      const aFim = diaValido(aFimRaw) ? aFimRaw : aIni;
      if (aIni === diaInicio && aFim === diaFim) return true;
      /* Fallback: mesmo dia de início quando dataFim histórica está corrompida */
      return aIni === diaInicio && diaInicio === diaFim;
    });

    if (!match) {
      naoEncontrado++;
      console.log(
        `[skip] sol=${sol.id} tipo=${sol.tipo} func=${sol.funcionarioId} ${diaInicio}→${diaFim} ${horarioInicio}-${horarioFim}: afastamento não encontrado`
      );
      continue;
    }

    if (match.horarioInicio && match.horarioFim) {
      ignorados++;
      continue;
    }

    console.log(
      `[${DRY ? "dry" : "upd"}] afast=${match.id} ← ${horarioInicio}–${horarioFim} (${diaInicio}) tipo=${sol.tipo}`
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
