-- Alta Administração (sem matrícula, sem ponto). Aplicado automaticamente por `prisma db push` na subida do backend;
-- este arquivo documenta o que muda no banco (somente acréscimos).
ALTER TYPE "CategoriaFuncional" ADD VALUE IF NOT EXISTS 'ALTA_ADMINISTRACAO';
-- Novos tipos: SubcategoriaAltaAdministracao, StatusEntradaSemMatricula
-- Nova coluna: "Funcionario"."subcategoria" (nullable)
-- Nova tabela: "EntradaSemMatricula" (só inclusão)
