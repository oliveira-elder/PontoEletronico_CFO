-- Migração: User.primeiroLoginEm (marco real de início de atividades).
-- Executar após o `prisma db push` que cria a coluna.
--
-- Sem este backfill, todo usuário que já logou no sistema antes desta
-- mudança ficaria com primeiroLoginEm = NULL, e a nova lógica trataria
-- isso como "nunca logou" — zerando retroativamente faltas/saldo negativo
-- já corretos no histórico. Para preservar o comportamento já existente
-- (que usava User.createdAt como proxy de início de atividades), todo
-- usuário que já possui ultimoLoginEm preenchido recebe
-- primeiroLoginEm = createdAt.
--
-- Usuários que nunca logaram (ultimoLoginEm IS NULL) ficam com
-- primeiroLoginEm = NULL mesmo — é exatamente o caso que este ajuste
-- corrige: só passam a ter dias contabilizados como falta a partir do
-- primeiro login de verdade (gravado por AuthService.syncUser).

UPDATE "User"
SET "primeiroLoginEm" = "createdAt"
WHERE "ultimoLoginEm" IS NOT NULL
  AND "primeiroLoginEm" IS NULL;
