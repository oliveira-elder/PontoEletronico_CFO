/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const { calcHorasTrabalhadasMinutos } = require("../../shared/dist/calc-horas-trabalhadas.js");
const p = new PrismaClient();

(async () => {
  const f = await p.funcionario.findFirst({
    where: { user: { name: { contains: "Elder", mode: "insensitive" } } },
    select: { id: true, categoria: true, user: { select: { name: true } } }
  });
  console.log("func", f);

  const inicio = new Date("2026-07-13T03:00:00.000Z");
  const fim = new Date("2026-07-14T02:59:59.999Z");
  const regs = await p.registroPonto.findMany({
    where: { funcionarioId: f.id, dataHora: { gte: inicio, lte: fim } },
    orderBy: { dataHora: "asc" },
    select: { tipo: true, dataHora: true, observacoes: true }
  });
  for (const r of regs) {
    const br = r.dataHora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    console.log(r.tipo, br, r.observacoes);
  }

  const minutos = regs.map((r) => {
    const h = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(r.dataHora);
    const [hh, mm] = h.split(":").map(Number);
    return { tipo: r.tipo, minuto: hh * 60 + mm };
  });
  console.log("minutos", minutos);
  console.log(
    "calc exigir=true",
    calcHorasTrabalhadasMinutos(minutos, { exigirIntervalo: true, almocoMinMin: 60 })
  );
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
