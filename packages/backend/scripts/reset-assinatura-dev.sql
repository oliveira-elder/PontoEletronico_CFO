-- Reset de assinatura para testes em desenvolvimento.
-- Uso: ajuste matricula/mes/ano abaixo e execute:
--   Get-Content packages/backend/scripts/reset-assinatura-dev.sql | docker exec -i pontoeletronico_cfo-postgres-1 psql -U pontoeletronico -d pontoeletronico

UPDATE "AssinaturaQuadro" aq
SET
  status = 'PENDENTE_FUNCIONARIO',
  "assinadoFuncionarioEm" = NULL,
  "assinadoFuncionarioIp" = NULL,
  "assinadoFuncionarioIpGateway" = NULL,
  "assinadoFuncionarioUserAgent" = NULL,
  "assinadoFuncionarioUserId" = NULL,
  "assinadoGestorEm" = NULL,
  "assinadoGestorIp" = NULL,
  "assinadoGestorIpGateway" = NULL,
  "assinadoGestorUserAgent" = NULL,
  "assinadoGestorUserId" = NULL,
  "assinadoGestorNome" = NULL
FROM "PeriodoPonto" pp
JOIN "Funcionario" f ON f.id = pp."funcionarioId"
WHERE aq."periodoId" = pp.id
  AND f.matricula = 'elder.oliveira'
  AND pp.mes = 5
  AND pp.ano = 2026;

SELECT aq.id, aq.status, pp.mes, pp.ano, f.matricula
FROM "AssinaturaQuadro" aq
JOIN "PeriodoPonto" pp ON pp.id = aq."periodoId"
JOIN "Funcionario" f ON f.id = pp."funcionarioId"
WHERE f.matricula = 'elder.oliveira' AND pp.mes = 5 AND pp.ano = 2026;
