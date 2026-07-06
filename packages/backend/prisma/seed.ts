import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  /* Cria o usuário e funcionário de desenvolvimento (dev-user-001).
     Só roda no ambiente de desenvolvimento. */

  const user = await prisma.user.upsert({
    where: { id: "dev-user-001" },
    create: {
      id: "dev-user-001",
      email: "dev@cfo.org.br",
      name: "Desenvolvedor CFO",
      externalId: "dev-user-001"
    },
    update: {}
  });

  await prisma.funcionario.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      matricula: "DEV001",
      cargo: "Desenvolvedor CFO",
      categoria: "CONCURSADO"
    },
    update: {}
  });

  console.log("✅ Seed: dev-user-001 criado/atualizado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
