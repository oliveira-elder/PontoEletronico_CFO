// Script de uso único: prepara uma solicitação FERIAS AGUARDANDO_RH
// para testar o fluxo completo (folha enviada + devolvida assinada).
// Execução: node /app/packages/backend/fix-ferias-test.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const candidatas = await prisma.solicitacao.findMany({
  where: { tipo: "FERIAS", status: "AGUARDANDO_RH" },
  orderBy: { createdAt: "desc" },
  take: 5,
  include: { funcionario: { include: { user: true } } }
});

if (candidatas.length === 0) {
  console.log("Nenhuma solicitação FERIAS aguardando RH.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("Solicitações encontradas:");
candidatas.forEach((s, i) =>
  console.log(`  [${i}] ${s.id} — ${s.funcionario.user.name} — guia: ${s.guiaMedicoUrl ?? "não enviada"} — retorno: ${s.documentoRetornoUrl ?? "não devolvido"}`)
);

// Atualiza a mais recente (índice 0) com URLs de teste
const alvo = candidatas[0];
await prisma.solicitacao.update({
  where: { id: alvo.id },
  data: {
    guiaMedicoUrl: "teste-folha-ferias.pdf",
    guiaMedicoEnviadaEm: new Date(),
    guiaMedicoObservacao: "Folha enviada via script de teste",
    documentoRetornoUrl: "teste-folha-assinada.pdf",
    documentoRetornoEm: new Date(),
    status: "AGUARDANDO_RH"
  }
});

console.log(`\nSolicitação ${alvo.id} (${alvo.funcionario.user.name}) atualizada:`);
console.log("  guiaMedicoUrl     → teste-folha-ferias.pdf");
console.log("  documentoRetornoUrl → teste-folha-assinada.pdf");
console.log("  status              → AGUARDANDO_RH");
console.log("\nO botão 'Aprovar (RH)' deve agora estar habilitado.");

await prisma.$disconnect();
