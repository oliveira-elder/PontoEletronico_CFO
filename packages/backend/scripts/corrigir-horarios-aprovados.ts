/**
 * Recalcula horários de registros ajustados via solicitações CORRECAO_PONTO já aprovadas,
 * corrigindo deslocamentos de fuso (ex.: 8h gravado como 5h) e preenchendo observacoes JSON.
 *
 * Uso: npx ts-node scripts/corrigir-horarios-aprovados.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { aplicarHorarioBrasilia, horarioDeDataBrasilia } from "../src/utils/horario-brasilia";
import {
  appendObservacao,
  criarObservacaoAjuste,
  parseObservacoes
} from "../src/utils/registro-observacoes";

const prisma = new PrismaClient();

async function main() {
  const solicitacoes = await prisma.solicitacao.findMany({
    where: { tipo: "CORRECAO_PONTO", status: "APROVADA" },
    orderBy: { rhResolvidoEm: "asc" }
  });

  let corrigidos = 0;

  for (const sol of solicitacoes) {
    const meta = (sol.metadados ?? {}) as Record<string, unknown>;
    const acao = meta.acao as string;
    const horarioNovo = meta.horarioSolicitado as string | undefined;
    const tipoRegistro = (meta.tipoRegistro as string) ?? "ENTRADA";

    if (!horarioNovo) continue;

    if (acao === "CORRIGIR" && meta.registroId) {
      const reg = await prisma.registroPonto.findUnique({
        where: { id: meta.registroId as string }
      });
      if (!reg) continue;

      const horarioAtual = horarioDeDataBrasilia(reg.dataHora);
      const horarioAnterior = (meta.horarioOriginal as string | undefined) ?? horarioAtual;
      const novaDataHora = aplicarHorarioBrasilia(reg.dataHora, horarioNovo);
      const horarioDepois = horarioDeDataBrasilia(novaDataHora);

      const jaTemObs = parseObservacoes(reg.observacoes).some((o) => o.solicitacaoId === sol.id);

      const precisaCorrigirHorario = horarioDepois !== horarioNovo || horarioAtual !== horarioNovo;
      if (!precisaCorrigirHorario && jaTemObs) continue;

      const novaObs = criarObservacaoAjuste({
        tipoRegistro,
        horarioAnterior,
        horarioNovo,
        solicitacaoId: sol.id,
        acao: "CORRIGIR"
      });

      const observacoes = jaTemObs
        ? parseObservacoes(reg.observacoes)
        : appendObservacao(reg.observacoes, novaObs);

      await prisma.registroPonto.update({
        where: { id: reg.id },
        data: {
          dataHora: novaDataHora,
          ajustado: true,
          observacoes: observacoes as unknown as Prisma.InputJsonValue
        }
      });

      console.log(
        `[CORRIGIR] registro ${reg.id}: ${horarioAtual} → ${horarioDepois} (solicitação ${sol.id})`
      );
      corrigidos++;
    }
  }

  console.log(`Concluído. ${corrigidos} registro(s) corrigido(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
