-- Correção do backfill de User.primeiroLoginEm (ver primeiro_login_backfill.sql).
--
-- O backfill anterior assumia "se já tem ultimoLoginEm, é usuário antigo, então
-- primeiroLoginEm = createdAt é uma aproximação segura". Isso falha para usuários
-- cujo PRIMEIRO login de verdade aconteceu no mesmo dia em que o backfill rodou,
-- mas cujo `createdAt` é de uma importação em lote muito anterior (ex.: sincronização
-- da API de ramais) — nesses casos o backfill grava uma data de início de atividades
-- dias/semanas ANTES do primeiro uso real, reintroduzindo falta indevida no intervalo.
--
-- Correção: para todo usuário cujo primeiroLoginEm ainda é exatamente igual a
-- createdAt (== nunca foi corrigido por um syncUser de verdade, só pelo backfill),
-- troca para a data do seu PRIMEIRO RegistroPonto — evidência concreta e muito mais
-- confiável de quando o funcionário realmente começou a usar o sistema.
-- Usuários sem nenhum registro de ponto não são afetados (mantêm createdAt).

UPDATE "User" u
SET "primeiroLoginEm" = sub.primeiro_registro
FROM (
  SELECT f."userId" AS user_id, MIN(r."dataHora") AS primeiro_registro
  FROM "RegistroPonto" r
  JOIN "Funcionario" f ON f.id = r."funcionarioId"
  GROUP BY f."userId"
) sub
WHERE u.id = sub.user_id
  AND u."primeiroLoginEm" = u."createdAt";
