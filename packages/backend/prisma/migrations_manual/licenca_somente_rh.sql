-- Tipos de licença que só o RH registra (Auditoria → funcionário).
-- A coluna "somenteRh" é criada sozinha pelo `prisma db push` na subida do backend; este script só
-- marca os tipos já cadastrados. Rodar UMA vez depois do deploy (é idempotente) e conferir o resultado.
-- Depois disso, o RH pode ligar/desligar "Somente RH" em Configurações → Solicitações → Tipos de licença.

UPDATE "TipoLicenca"
SET "somenteRh" = true
WHERE "nome" ILIKE '%inss%'
   OR "nome" ILIKE '%militar%'
   OR "nome" ILIKE '%n_o remunerada%'
   OR lower(btrim("nome")) IN ('outros', 'outro');

SELECT "nome", "somenteRh" FROM "TipoLicenca" ORDER BY "ordem";
