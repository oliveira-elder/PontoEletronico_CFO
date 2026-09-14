/**
 * Backfill: para atestados médicos parciais já aprovados (horarioInicio/horarioFim
 * definidos), verifica se o funcionário já registrou o retorno ao trabalho (ENTRADA,
 * FIM_INTERVALO ou REINICIAR_EXPEDIENTE) depois do horarioFim declarado, dentro da
 * tolerância configurada (atestadoTempoRetornoMin). Quando é o caso, anexa uma
 * observação nesse registro de retorno documentando o tempo de deslocamento
 * creditado — para aparecer em "Observações do dia" no Histórico/Auditoria.
 *
 * Não recalcula saldo/banco de horas persistido (isso já é derivado dinamicamente
 * a cada leitura pela lógica de calcularJanelasEfetivasComCreditoDeslocamento).
 * Este script só documenta, retroativamente, casos que já aconteceram antes da
 * funcionalidade existir.
 *
 * Fase 0 (limpeza): remove observações "tempo de deslocamento" gravadas por uma
 * versão anterior/com bug deste script (que podia apontar uma pausa/almoço comum
 * bem depois do atestado como se fosse o retorno) — reaplica do zero com a lógica
 * corrigida (encontrarRetornoAposAtestado: só credita a PRIMEIRA atividade do dia
 * após o fim do atestado).
 *
 * Uso:
 *   cd packages/backend && npx ts-node --transpile-only scripts/backfill-observacao-deslocamento.ts
 *   DRY_RUN=1 npx ts-node --transpile-only scripts/backfill-observacao-deslocamento.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  dataBrasiliaISO,
  horarioDeDataBrasilia,
  horarioParaMinutos
} from "../src/utils/horario-brasilia";
import { encontrarRetornoAposAtestado } from "../src/utils/jornada-historico";
import { appendObservacao, parseObservacoes } from "../src/utils/registro-observacoes";

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const MARCADOR = "tempo de deslocamento";

function diaValido(iso: string): boolean {
  const y = Number(iso.slice(0, 4));
  return y >= 2000 && y <= 2100;
}

function proximoDiaIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

async function limparObservacoesAnteriores() {
  const candidatos = await prisma.registroPonto.findMany({
    where: { tipo: { in: ["ENTRADA", "FIM_INTERVALO", "REINICIAR_EXPEDIENTE"] } },
    select: { id: true, observacoes: true }
  });
  let removidos = 0;
  for (const r of candidatos) {
    const obs = parseObservacoes(r.observacoes);
    if (!obs.length) continue;
    const restantes = obs.filter((o) => !o.texto?.includes(MARCADOR));
    if (restantes.length !== obs.length) {
      console.log(`[${DRY ? "dry" : "clean"}] removendo observação antiga de reg=${r.id}`);
      if (!DRY) {
        await prisma.registroPonto.update({
          where: { id: r.id },
          data: { observacoes: restantes as unknown as Prisma.InputJsonValue }
        });
      }
      removidos++;
    }
  }
  console.log(`Limpeza: ${removidos} registro(s) com observação antiga removida.\n`);
}

async function main() {
  await limparObservacoesAnteriores();

  const cfgSolicitacoes = await prisma.configuracaoSolicitacoes.findUnique({
    where: { id: "singleton" },
    select: { atestadoTempoRetornoMin: true }
  });
  const tolerancia = cfgSolicitacoes?.atestadoTempoRetornoMin ?? 60;
  console.log(`Tolerância configurada: ${tolerancia} min\n`);

  const afastamentos = await prisma.afastamento.findMany({
    where: {
      apenasInformativo: false,
      horarioInicio: { not: null },
      horarioFim: { not: null }
    },
    select: {
      id: true,
      funcionarioId: true,
      dataInicio: true,
      dataFim: true,
      horarioInicio: true,
      horarioFim: true
    }
  });

  let diasVerificados = 0;
  let creditados = 0;
  let semRetornoValido = 0;

  for (const a of afastamentos) {
    const horarioInicio = a.horarioInicio!;
    const horarioFim = a.horarioFim!;
    const diaIni = dataBrasiliaISO(a.dataInicio);
    const diaFimRaw = dataBrasiliaISO(a.dataFim);
    const diaFim = diaValido(diaFimRaw) ? diaFimRaw : diaIni;

    let dia = diaIni;
    let guard = 0;
    while (dia <= diaFim && guard < 400) {
      guard++;
      diasVerificados++;

      const inicioJs = new Date(`${dia}T00:00:00.000-03:00`);
      const fimJs = new Date(`${dia}T23:59:59.999-03:00`);
      const regs = await prisma.registroPonto.findMany({
        where: { funcionarioId: a.funcionarioId, dataHora: { gte: inicioJs, lte: fimJs } },
        orderBy: { dataHora: "asc" }
      });

      if (regs.length > 0) {
        const regsMin = regs.map((r) => ({
          tipo: r.tipo,
          minuto: horarioParaMinutos(horarioDeDataBrasilia(r.dataHora))
        }));
        const retorno = encontrarRetornoAposAtestado(regsMin, horarioFim);

        if (retorno) {
          const hfMin = horarioParaMinutos(horarioFim);
          const atrasoReal = retorno.minuto - hfMin;
          const credito = Math.max(0, Math.min(atrasoReal, tolerancia));
          const regRetorno = regs.find(
            (r) =>
              r.tipo === retorno.tipo &&
              horarioParaMinutos(horarioDeDataBrasilia(r.dataHora)) === retorno.minuto
          );

          if (credito > 0 && regRetorno) {
            const horaRetorno = horarioDeDataBrasilia(regRetorno.dataHora).substring(0, 5);
            const texto =
              `Atestado médico das ${horarioInicio} às ${horarioFim} — ` +
              `retorno registrado às ${horaRetorno}` +
              (atrasoReal > credito ? ` (atraso real de ${atrasoReal} min)` : "") +
              `. Creditados ${credito} min de tempo de deslocamento` +
              (atrasoReal > credito ? " (limitado pela tolerância configurada)." : ".");
            console.log(
              `[${DRY ? "dry" : "upd"}] func=${a.funcionarioId} dia=${dia} afast=${a.id} retorno=${regRetorno.tipo}@${horaRetorno} credito=${credito}min`
            );
            if (!DRY) {
              const novasObs = appendObservacao(regRetorno.observacoes, {
                data: regRetorno.dataHora.toISOString(),
                tipo: "AJUSTE_AUTOMATICO",
                texto
              });
              await prisma.registroPonto.update({
                where: { id: regRetorno.id },
                data: { observacoes: novasObs as unknown as Prisma.InputJsonValue }
              });
            }
            creditados++;
          } else {
            semRetornoValido++;
          }
        } else {
          semRetornoValido++;
        }
      }

      dia = proximoDiaIso(dia);
    }
  }

  console.log(
    `\nConcluído${DRY ? " (DRY_RUN)" : ""}. diasVerificados=${diasVerificados} creditados=${creditados} semRetornoValido=${semRetornoValido}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
