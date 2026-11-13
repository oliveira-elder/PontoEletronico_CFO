# Envio de Documento - Home Office (`DOCUMENTO_VIA_CHEFE`)

**Exclusivo de quem está em home office** (`Funcionario.modoHomeOffice`): o card só aparece em Solicitações para essas pessoas (e quando o tipo está ativado em Configurações), e o servidor recusa a criação por quem não está em home office (o RH, ao abrir em nome do funcionário, pode dispensar com justificativa).

Solicitação `tipo = DOCUMENTO_VIA_CHEFE`, que convive com o "Envio de Documento ao RH" direto (`ENVIO_DOCUMENTO_RH`, que pula o chefe e continua igual).

## Fluxo

Funcionário envia → `PENDENTE` (chefe imediato) → o chefe pode:

- **Encaminhar** → `AGUARDANDO_RH`;
- **Rejeitar** → `REJEITADA_GESTOR` (motivo obrigatório);
- **Devolver** → `DEVOLVIDA` (motivo ≥ 10 caracteres; histórico em `metadados.devolucoes[]`).

Na devolução o funcionário corrige (descrição e/ou arquivo) e reenvia (`PATCH /ponto/solicitacoes/:id/reenviar`), voltando a `PENDENTE` (`metadados.reenvios[]`). O RH **confirma o recebimento** (`APROVADA`, sem efeito além do status) ou rejeita (`REJEITADA_RH`).

**Sem chefe imediato** (ou o próprio funcionário é o chefe) a solicitação nasce `AGUARDANDO_RH` (`PontoService.semChefeImediato`).

## Cancelamento pelo funcionário

Vale para **qualquer tipo de solicitação** (`PATCH /ponto/solicitacoes/:id/cancelar`): o dono cancela enquanto o chefe ainda não decidiu (`PENDENTE`) e, no tipo via chefe, também quando `DEVOLVIDA`. Vira `CANCELADA` com `metadados.canceladaPeloFuncionario`. Não cancela: depois que o chefe encaminha ou decide, pedidos abertos pelo RH em nome do funcionário e horas extras automáticas. Nada havia sido aplicado (os efeitos só ocorrem na aprovação do RH).

## Regras

- Arquivo: PDF, JPG, PNG ou WebP, até 10 MB, com conferência dos primeiros bytes (`utils/validar-documento-envio.ts`). O armazenamento é o mesmo dos demais anexos (`uploads/documentos/<funcionarioId>/`, URL assinada).
- `apenasInformativo = true`: não afeta folha nem ponto. Não entra no bloqueio de conflito de datas.
- O arquivo só é trocado pelo reenvio (a rota genérica `/documento` é recusada para este tipo).
- Chave de configuração: `ConfiguracaoSolicitacoes.tipoAtivoDocumentoViaChefe` (Configurações → Solicitações).
- Notificações: `SOLICITACAO_NOVA_GESTOR` (chefe), `SOLICITACAO_AGUARDANDO_RH` (RH), `SOLICITACAO_DEVOLVIDA` (funcionário).
- Banco: `StatusSolicitacao.DEVOLVIDA` e a coluna acima (aditivos, ver `prisma/migrations_manual/documento_via_chefe.sql`).
- LGPD: o chefe imediato passa a ver o documento do subordinado; o formulário avisa.

Teste: `packages/backend/scripts/teste-documento-via-chefe.ts`.
