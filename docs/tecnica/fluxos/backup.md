O backup é conduzido por um **agente externo** (MonitorSistema) que consulta a API; o sistema não executa `pg_dump` por conta própria.

```mermaid
sequenceDiagram
  autonumber
  participant M as Agente (MonitorSistema)
  participant A as API /backup-agent
  participant D as PostgreSQL
  M->>A: GET jobs/next (x-backup-agent-key)
  A->>D: pega job PENDING, marca RUNNING, gera runToken
  A-->>M: engine, modo, runToken
  loop durante a execução
    M->>A: POST runs/{id}/heartbeat (runToken)
  end
  alt sucesso
    M->>A: POST runs/{id}/artifact (caminho e tamanho)
    A->>D: SUCCESS, limpa o runToken
  else falha
    M->>A: POST runs/{id}/failure (mensagem)
    A->>D: FAILED
  end
```

- O Super Admin cria **jobs manuais** e vê o histórico (`BackupJob`, últimos 100).
- O `runToken` é aleatório (32 bytes) por execução e **zerado** ao concluir; sem ele o agente não consegue reportar.
- Todo dia à meia-noite, uma rotina limpa artefatos com **retenção expirada**.
- **Restauração**: feita fora do sistema. Depois de restaurar um backup antigo, o livro do REP pode ficar com NSR abaixo do exportado: nesse caso as marcações ficam bloqueadas até a TI conferir (ver _Runbook_).
- A guarda mínima de **5 anos** do livro do REP depende desses backups (item 7 do Anexo IX).
