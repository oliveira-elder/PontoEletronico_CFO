-- Migração: "Chefe" deixa de ser a categoria própria GERENTE e passa a ser uma
-- característica (Funcionario.isManager), combinável com qualquer categoria real
-- (Empregado/CONCURSADO, Comissionado/ASSESSOR, Estagiário/ESTAGIARIO, Jovem
-- Aprendiz/MENOR_APRENDIZ).
--
-- Executar ANTES do `prisma db push` / `prisma generate`, com o schema.prisma já
-- atualizado (GERENTE removido do enum CategoriaFuncional, coluna "isManager"
-- adicionada em FuncionarioCategoriaHistorico). Sem este backfill, o `db push`
-- falha ao tentar re-tipar a coluna "categoria" para o novo enum: não é possível
-- fazer cast de linhas com valor 'GERENTE' para um enum que não tem mais esse valor.
--
-- Idempotente: pode ser executado mais de uma vez sem efeito colateral (todas as
-- condições WHERE já excluem linhas já migradas).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 0) Pré-requisito: coluna "isManager" já deve existir em FuncionarioCategoriaHistorico
--    (adicionada aqui via IF NOT EXISTS para o caso deste script rodar antes do
--    schema.prisma ainda não ter sido aplicado ao banco por qualquer via).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "FuncionarioCategoriaHistorico"
  ADD COLUMN IF NOT EXISTS "isManager" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Funcionario.isManager = true para quem está em categoria = 'GERENTE'.
--    Preserva o comportamento atual: aprovação (GESTOR_APROVACAO) e hierarquia de
--    equipe já dependem de isManager, não da categoria (auth.service.ts,
--    auditoria.service.ts) — este passo só formaliza para os casos que ainda
--    dependiam apenas da categoria.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE "Funcionario"
SET "isManager" = true
WHERE "categoria" = 'GERENTE' AND "isManager" = false;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Checagem defensiva: GerenteSubstituicao.categoriaAnteriorSubstituto nunca
--    deveria ser 'GERENTE' (a regra de elegibilidade de gestao.service.ts já
--    exige que o substituto seja CONCURSADO/ASSESSOR antes de assumir). Se
--    aparecer, é uma inconsistência de dados pré-existente — força CONCURSADO e
--    deixa registrado para revisão manual do RH.
-- ─────────────────────────────────────────────────────────────────────────
UPDATE "GerenteSubstituicao"
SET "categoriaAnteriorSubstituto" = 'CONCURSADO'
WHERE "categoriaAnteriorSubstituto" = 'GERENTE';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Resolve a categoria "real" de quem está em GERENTE, nesta ordem de
--    prioridade:
--    a) categoria anterior gravada na substituição mais recente em que a pessoa
--       figura como "substituto" (GerenteSubstituicao.categoriaAnteriorSubstituto)
--       — é o valor mais confiável, gravado no momento em que assumiu a gerência;
--    b) última vigência não-GERENTE em FuncionarioCategoriaHistorico;
--    c) fallback: CONCURSADO (perfil mais comum de titular de gerência aqui).
-- ─────────────────────────────────────────────────────────────────────────
WITH alvo AS (
  SELECT id FROM "Funcionario" WHERE "categoria" = 'GERENTE'
),
origem_substituicao AS (
  SELECT DISTINCT ON (gs."substitutoId")
    gs."substitutoId" AS "funcionarioId",
    gs."categoriaAnteriorSubstituto" AS categoria
  FROM "GerenteSubstituicao" gs
  WHERE gs."substitutoId" IN (SELECT id FROM alvo)
  ORDER BY gs."substitutoId", gs."createdAt" DESC
),
origem_historico AS (
  SELECT DISTINCT ON (h."funcionarioId")
    h."funcionarioId",
    h."categoria"
  FROM "FuncionarioCategoriaHistorico" h
  WHERE h."categoria" <> 'GERENTE'
    AND h."funcionarioId" IN (SELECT id FROM alvo)
  ORDER BY h."funcionarioId", h."vigenciaDesde" DESC
),
resolvido AS (
  SELECT
    alvo.id,
    COALESCE(os.categoria, oh.categoria, 'CONCURSADO'::"CategoriaFuncional") AS nova_categoria
  FROM alvo
  LEFT JOIN origem_substituicao os ON os."funcionarioId" = alvo.id
  LEFT JOIN origem_historico oh ON oh."funcionarioId" = alvo.id
)
UPDATE "Funcionario" f
SET "categoria" = r.nova_categoria
FROM resolvido r
WHERE f.id = r.id;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) FuncionarioCategoriaHistorico: linhas com categoria = 'GERENTE' viram
--    isManager = true + categoria = (mesma resolução por funcionário do passo 3,
--    recalculada aqui pois o passo 3 já sobrescreveu Funcionario.categoria).
--    Simplificação assumida para a Fase 1 (sem histórico de cargo/lotação ainda):
--    aplica a MESMA categoria real resolvida a TODAS as vigências GERENTE daquele
--    funcionário — não é 100% precisa para quem trocou de categoria real mais de
--    uma vez antes de virar GERENTE, mas preserva corretamente a isenção de ponto
--    histórica (isManager=true carrega essa informação por vigência).
-- ─────────────────────────────────────────────────────────────────────────
WITH origem_substituicao AS (
  SELECT DISTINCT ON (gs."substitutoId")
    gs."substitutoId" AS "funcionarioId",
    gs."categoriaAnteriorSubstituto" AS categoria
  FROM "GerenteSubstituicao" gs
  ORDER BY gs."substitutoId", gs."createdAt" DESC
),
origem_historico AS (
  SELECT DISTINCT ON (h."funcionarioId")
    h."funcionarioId",
    h."categoria"
  FROM "FuncionarioCategoriaHistorico" h
  WHERE h."categoria" <> 'GERENTE'
  ORDER BY h."funcionarioId", h."vigenciaDesde" DESC
),
resolvido AS (
  SELECT DISTINCT
    h."funcionarioId",
    COALESCE(os.categoria, oh.categoria, 'CONCURSADO'::"CategoriaFuncional") AS nova_categoria
  FROM "FuncionarioCategoriaHistorico" h
  LEFT JOIN origem_substituicao os ON os."funcionarioId" = h."funcionarioId"
  LEFT JOIN origem_historico oh ON oh."funcionarioId" = h."funcionarioId"
  WHERE h."categoria" = 'GERENTE'
)
UPDATE "FuncionarioCategoriaHistorico" h
SET "categoria" = r.nova_categoria,
    "isManager" = true
FROM resolvido r
WHERE h."funcionarioId" = r."funcionarioId"
  AND h."categoria" = 'GERENTE';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Conferência manual (rodar antes de aplicar `prisma db push`): as duas
--    consultas abaixo devem retornar 0 linhas.
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT id, matricula FROM "Funcionario" WHERE "categoria" = 'GERENTE';
-- SELECT id, "funcionarioId" FROM "FuncionarioCategoriaHistorico" WHERE "categoria" = 'GERENTE';
