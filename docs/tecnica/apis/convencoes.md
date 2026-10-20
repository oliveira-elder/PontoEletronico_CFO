## Base e formato

- **Prefixo:** todas as rotas ficam sob `/api` (ex.: `GET /api/ponto/status`).
- **Formato:** JSON (`application/json`); corpo de até **15 MB** (fotos e documentos em base64). Downloads devolvem PDF/ZIP/CSV/TXT.
- **Validação:** `ValidationPipe` global com `whitelist` (campos desconhecidos são descartados) e `transform`.
- **Datas:** ISO 8601; datas civis como `AAAA-MM-DD` (Brasília).
- **Eventos em tempo real:** `GET /api/logs/stream` (SSE, Super Admin) e `GET /api/realtime/capabilities`.

## Autenticação

`Authorization: Bearer <token>` com o token do Keycloak. O token na URL (`?access_token=`) só é aceito em `/logs/stream` (SSE). Rotas **sem login** (sem `AuthGuard`) são poucas e cada uma tem seu controle próprio:

| Grupo               | Rotas                                                       | Controle                                                                                                         |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Verificação pública | `/ponto/verificar/*`, `/ponto/verificar-marcacao/*`         | O código, o hash ou o arquivo funcionam como segredo; a resposta traz só o mínimo (nome mascarado, datas, hash). |
| API pública         | `/api-publica/v1/feriados`, `/api-publica/v1/configuracoes` | `ApiTokenGuard` (token de sistema).                                                                              |
| Agente de backup    | `/backup-agent/*`                                           | Cabeçalho `x-backup-agent-key` conferido no controlador, mais `runToken` por execução.                           |
| Ingestão            | `/ingest/push-http`                                         | Chave compartilhada conferida no controlador.                                                                    |
| Aparência           | `/ponto/config/branding`                                    | Dados de marca (nome/logo da instituição).                                                                       |
| Arquivos            | `/uploads/**` (fora do prefixo `/api`)                      | Link assinado e temporário (HMAC); sem assinatura, 403.                                                          |

## Códigos de resposta

| Código  | Quando                                                                | Observação                                                                                        |
| ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 200/201 | Sucesso                                                               |                                                                                                   |
| 400     | Regra de negócio ou validação                                         | `message` em português, pronto para exibir.                                                       |
| 401     | Token ausente, inválido ou expirado                                   | O front renova o token e repete.                                                                  |
| 403     | Sem permissão (papel, perfil do RH ou autoridade sobre o funcionário) |                                                                                                   |
| 404     | Recurso inexistente                                                   |                                                                                                   |
| **428** | **Termos de Uso pendentes** (`code: TERMOS_PENDENTES`)                | O front abre o aceite; o **registro de ponto nunca é bloqueado**.                                 |
| **503** | Registro de ponto temporariamente indisponível                        | Livro do REP com integridade quebrada, segunda instância ativa ou relógio fora do limite de 30 s. |
| 5xx     | Erro interno                                                          | Registrado na trilha de auditoria com `X-Trace-Id`.                                               |

## Rastreamento

Toda resposta recebe o cabeçalho **`X-Trace-Id`** (UUID). A mesma chave aparece na tela de Logs, o que permite correlacionar uma reclamação do usuário com a requisição.

## Acesso por rota

Cada rota do catálogo mostra: **Acesso** (público, autenticado ou papéis exigidos), **recursos do RH** (`@RecursoRh`, quando a rota depende de permissão de aba/função), as **tabelas lidas e gravadas** e as **consultas** identificadas por análise do código (marcadas como inferidas).

## Limites

O limite de taxa fica no nginx (429): 30 req/s por IP na API e 5 req/s na verificação pública. As rotas de verificação pública não exigem login; sua proteção é a entropia do código/hash e a resposta mínima. _(Ver ameaças residuais em Modelo de ameaças.)_
