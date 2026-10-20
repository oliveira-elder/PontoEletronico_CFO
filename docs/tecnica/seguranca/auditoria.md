## Trilha de auditoria de requisições

Um interceptor global (`AuditLogInterceptor`) grava **uma linha por requisição** em `AuditLog` — inclusive as que falham:

| Campo                                                  | Conteúdo                                                  |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `tracker`                                              | UUID da requisição, devolvido ao cliente em `X-Trace-Id`. |
| `category`                                             | `SUCCESS`, `FAILURE` (4xx) ou `ERROR` (5xx).              |
| `actorUserId`, `username`                              | Quem fez (do token).                                      |
| `method`, `path`, `action`, `statusCode`, `durationMs` | O quê e quanto demorou.                                   |
| `ipAddress`, `userAgent`                               | De onde (primeiro IP da cadeia de proxy).                 |
| `payload`                                              | Corpo e consulta **saneados**.                            |

- **Saneamento**: chaves `password`, `senha`, `token`, `secret`, `authorization`, `refreshToken` e `fotoBase64` viram `[REDACTED]`; textos longos são truncados em 400 caracteres.
- **Falhas de autenticação/autorização barradas por guarda** também são registradas (`AuthFailureLogFilter`).
- **Ignorados de propósito**: telas de alta frequência (status do ponto, configuração/branding, métricas e o próprio fluxo de Logs) para não poluir nem gerar laço de eventos.
- A tela **Logs** (Super Admin) oferece dashboard, busca textual e por assunto (usando o catálogo de endpoints), desempenho e atualização ao vivo (SSE). Índices trigram aceleram a busca por substring.

## Trilhas específicas de negócio

| Trilha               | Onde                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| Livro do REP         | `MarcacaoRep`, `EventoRep` (imutáveis) e `ExtracaoArquivoFiscal` (cada AFD/AEJ gerado). |
| Aceite de termos     | `AceiteTermoUso` (somente inclusão).                                                    |
| Super Admin          | `SuperAdminConcessao` (concedido por, revogado por, datas).                             |
| Documentação técnica | `DocumentacaoRevisao` — **nunca excluída, só anulada com motivo**.                      |
| Liberações de banco  | `BancoHorasLiberacao` com quem liberou/revogou.                                         |
| Assinaturas          | IP real, gateway, _user agent_ e usuário em `AssinaturaQuadro`.                         |
| Solicitações         | Quem aprovou em cada etapa, observação e horário.                                       |
| Observações de ponto | Ajustes automáticos e correções ficam anotados no próprio registro.                     |

## Envio ao monitor

Se `MONITOR_AUDIT_INGEST_ENABLED` estiver ligado, a auditoria pode ser enviada ao MonitorSistema.

## Retenção

Não há expurgo automático do `AuditLog`; o volume cresce com o uso e deve ser acompanhado (ver _Runbook_).
