-- Envio de Documento ao RH (via chefe). Aplicado automaticamente por `prisma db push` na subida do backend;
-- este arquivo documenta o que muda no banco (somente acréscimos).
ALTER TYPE "StatusSolicitacao" ADD VALUE IF NOT EXISTS 'DEVOLVIDA';
ALTER TABLE "ConfiguracaoSolicitacoes" ADD COLUMN IF NOT EXISTS "tipoAtivoDocumentoViaChefe" BOOLEAN NOT NULL DEFAULT true;
-- Solicitacao.tipo é texto: o novo tipo "DOCUMENTO_VIA_CHEFE" não exige alteração de coluna.
