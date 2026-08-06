-- Migração: BancoHorasMarco de data absoluta → dia/mês (recorrente anual).
-- Executar antes do prisma db push / generate em ambientes com dados existentes.
-- Marcos antigos viram anuais (dia/mês da data original).

ALTER TABLE "BancoHorasMarco" ADD COLUMN IF NOT EXISTS "dia" INTEGER;
ALTER TABLE "BancoHorasMarco" ADD COLUMN IF NOT EXISTS "mes" INTEGER;
ALTER TABLE "BancoHorasMarco" ADD COLUMN IF NOT EXISTS "ano" INTEGER;
ALTER TABLE "BancoHorasMarco" ADD COLUMN IF NOT EXISTS "chave" TEXT;

UPDATE "BancoHorasMarco"
SET
  "dia" = EXTRACT(DAY FROM "data")::INTEGER,
  "mes" = EXTRACT(MONTH FROM "data")::INTEGER,
  "ano" = NULL,
  "chave" = 'A-' || LPAD(EXTRACT(MONTH FROM "data")::TEXT, 2, '0') || '-' || LPAD(EXTRACT(DAY FROM "data")::TEXT, 2, '0')
WHERE "dia" IS NULL AND "data" IS NOT NULL;

-- Remove duplicatas anuais (mantém a mais antiga)
DELETE FROM "BancoHorasMarco" a
USING "BancoHorasMarco" b
WHERE a."chave" = b."chave"
  AND a."id" > b."id";

ALTER TABLE "BancoHorasMarco" ALTER COLUMN "dia" SET NOT NULL;
ALTER TABLE "BancoHorasMarco" ALTER COLUMN "mes" SET NOT NULL;
ALTER TABLE "BancoHorasMarco" ALTER COLUMN "chave" SET NOT NULL;

DROP INDEX IF EXISTS "BancoHorasMarco_data_key";
ALTER TABLE "BancoHorasMarco" DROP COLUMN IF EXISTS "data";

CREATE UNIQUE INDEX IF NOT EXISTS "BancoHorasMarco_chave_key" ON "BancoHorasMarco"("chave");
CREATE INDEX IF NOT EXISTS "BancoHorasMarco_mes_dia_idx" ON "BancoHorasMarco"("mes", "dia");
