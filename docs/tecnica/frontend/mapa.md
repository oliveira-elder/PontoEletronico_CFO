Rotas da SPA (`app/router.tsx`). Todas sob `/ponto` exigem login; a visibilidade de menus segue papéis e perfis do RH, mas **a decisão final é do backend**.

| Rota                                                  | Tela                                                                | Quem usa                    |
| ----------------------------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| `/login`                                              | Entrada SSO                                                         | Todos                       |
| `/verificar/:codigo?`                                 | Verificação pública de documentos                                   | Qualquer pessoa             |
| `/ponto/registrar`                                    | Registro de ponto                                                   | Funcionário                 |
| `/ponto/historico`                                    | Histórico e espelho do funcionário                                  | Funcionário                 |
| `/ponto/comprovantes`                                 | Meus comprovantes                                                   | Funcionário                 |
| `/ponto/banco-horas`                                  | Banco de horas e ciclos                                             | Funcionário                 |
| `/ponto/folhas-assinadas`                             | Folhas assinadas                                                    | Funcionário                 |
| `/ponto/solicitacoes`                                 | Solicitações (correção, abono, atestado, licença, férias…)          | Funcionário                 |
| `/ponto/documentos-rh`, `/minhas-requisicoes`         | Documentos e requisições do RH                                      | Funcionário                 |
| `/ponto/relatorios`                                   | Relatórios                                                          | Funcionário/gestor          |
| `/ponto/termos-uso`                                   | Termos de Uso                                                       | Todos (gestão: Super Admin) |
| `/ponto/notificacoes`                                 | Notificações                                                        | Todos                       |
| `/ponto/aprovacoes`                                   | Aprovações da equipe                                                | Gestor                      |
| `/ponto/dashboard`                                    | Painel consolidado                                                  | Gestor/RH                   |
| `/ponto/gestao`, `/gestao/novo`, `/gestao/:id/editar` | Cadastro de funcionários                                            | RH                          |
| `/ponto/gerencias`                                    | Gerências                                                           | RH                          |
| `/ponto/perfis-rh`                                    | Perfis e permissões do RH                                           | RH/Super Admin              |
| `/ponto/auditoria`                                    | Auditoria, saúde ocupacional, banco de horas do RH                  | RH                          |
| `/ponto/requisicoes-rh`                               | Requisições do RH                                                   | RH                          |
| `/ponto/configuracoes`                                | Configurações do sistema, REP-P, termos                             | RH/Super Admin              |
| `/ponto/sistema`                                      | Usuários, grupos, Start e Super Admin                               | Super Admin                 |
| `/ponto/logs`                                         | Logs, desempenho, ingestão, backup, API servidora, **Documentação** | Super Admin                 |

Atalhos legados (`/usuarios`, `/saude-ocupacional`) redirecionam para as telas atuais.
