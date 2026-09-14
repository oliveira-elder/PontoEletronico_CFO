/**
 * Corrige matrículas "fantasma" geradas por uma versão antiga da sincronização com o AD
 * (Extensions API): quando o funcionário não tinha staffId (matrícula real), o sync antigo
 * inventava uma matrícula derivada do id/UUID interno da API (ex.: "ea95a0d1eeae").
 * Sem matrícula real, o acesso ao sistema deve ficar bloqueado
 * (ver AuthService.syncUser / exceção SEM_MATRICULA).
 *
 * Uso:
 *   cd packages/backend && node scripts/corrigir-matricula-fantasma.js           # dry-run (lista)
 *   cd packages/backend && node scripts/corrigir-matricula-fantasma.js --apply   # aplica (limpa matrícula)
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function matriculaFantasmaDoId(apiId) {
  return apiId.replace(/-/g, "").slice(0, 12);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const candidatos = await prisma.funcionario.findMany({
    where: { extensionsId: { not: null }, matricula: { not: null } },
    select: {
      id: true,
      matricula: true,
      extensionsId: true,
      cargo: true,
      user: { select: { name: true, email: true } }
    }
  });

  const afetados = candidatos.filter(
    (f) => f.extensionsId && f.matricula === matriculaFantasmaDoId(f.extensionsId)
  );

  if (afetados.length === 0) {
    console.log("Nenhum registro com matrícula fantasma encontrado.");
    return;
  }

  console.log(`Encontrados ${afetados.length} registro(s) com matrícula fantasma:`);
  for (const f of afetados) {
    console.log(
      `- ${f.user?.name ?? "(sem nome)"} <${f.user?.email ?? "?"}> — matrícula atual: ${f.matricula} (extensionsId: ${f.extensionsId})`
    );
  }

  if (!apply) {
    console.log(
      "\nModo dry-run. Rode novamente com --apply para limpar a matrícula desses registros."
    );
    return;
  }

  for (const f of afetados) {
    await prisma.funcionario.update({ where: { id: f.id }, data: { matricula: null } });
  }
  console.log(
    `\n${afetados.length} registro(s) corrigido(s): matrícula removida. Acesso ao sistema fica bloqueado ` +
      `até a próxima sincronização com staffId real no AD ou cadastro manual pelo RH.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
