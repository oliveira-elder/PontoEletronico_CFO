## Registro de ponto indisponível (503)

| Mensagem/sintoma                  | Causa                                 | Ação                                                                                                      |
| --------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "integridade do livro: NSR n — …" | Cadeia de hash quebrada               | **Não force.** Preservar o banco, acionar a TI/desenvolvimento; comparar com o backup. Ver _Integridade_. |
| "segunda instância ativa"         | Dois backends gravando no mesmo livro | Parar a instância extra.                                                                                  |
| "NSR abaixo do exportado"         | Restauração de backup antigo          | Conferir o último AFD gerado; alinhar o contador de NSR com a TI antes de liberar.                        |
| "relógio fora do limite"          | Servidor a mais de 30 s da Hora Legal | Corrigir NTP do servidor/VM; aguardar duas medições dentro do limite.                                     |

## Login

| Sintoma                                               | Verificação                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 401 em todas as chamadas                              | Chaves do Keycloak: `./scripts/fetch-keycloak-jwks.sh`; conferir relógio (tolerância 30 s) e emissor. |
| `CONTA_DESATIVADA` / `CONTA_CEDIDA` / `SEM_MATRICULA` | Cadastro do funcionário no RH.                                                                        |
| Loop de login                                         | `./scripts/diagnose-login-stuck.sh`, `verify-sso-proxy.sh`.                                           |

## Documentos

| Sintoma                       | Verificação                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| PDFs sem selo ICP             | Painel do selo: certificado ausente, vencido ou senha incorreta.     |
| Verificação "não reconhecido" | O arquivo foi alterado ou é de outra origem; conferir pelo conteúdo. |
| Espelho não pode ser assinado | Há dias inconsistentes ou solicitações pendentes (a mensagem lista). |

## Desempenho e disco

- Acompanhar o tamanho de `AuditLog` e do volume de uploads.
- Em lentidão, abrir **Logs → Desempenho** e filtrar por rota; usar o `X-Trace-Id` do usuário para achar a requisição.

## Incidente de segurança (suspeita de acesso indevido)

1. Preservar evidências: exportar os registros de **Logs** do período (usuário, IP, rotas).
2. Revogar acessos: desativar o usuário no Keycloak e no cadastro; revogar concessão de Super Admin.
3. Trocar segredos possivelmente expostos (`JWT_SECRET`, `DOC_SEAL_SECRET`, chaves de integração).
4. Avaliar dados pessoais envolvidos e acionar o encarregado (DPO) para comunicação à ANPD e aos titulares, se aplicável.
5. Registrar a ocorrência e uma **revisão** nesta documentação.

## Contatos

TI do CFO (sala 203) — equipe de Desenvolvimento de TI; gerente responsável conforme o quadro de autoria.
