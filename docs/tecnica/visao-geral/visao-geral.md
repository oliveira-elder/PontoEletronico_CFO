O **Sistema de Ponto Eletrônico do CFO** digitaliza o registro de ponto e todo o fluxo operacional do Departamento de RH do Conselho Federal de Odontologia: marcação de jornada, correções, abonos, atestados, licenças, férias, banco de horas, assinatura do Espelho de Ponto, fechamento mensal, arquivos fiscais (AFD/AEJ) e a conformidade com a **Portaria MTP nº 671/2021** na modalidade **REP-P** (registrador eletrônico de ponto por programa).

## Objetivos

- Registrar a jornada de cada servidor com **hora do servidor** (nunca a do dispositivo), NSR sequencial sem lacunas e comprovante assinado.
- Levar o trabalho do RH — solicitações, aprovações, requisições, saúde ocupacional, férias — para dentro do sistema, com rastreabilidade de quem fez o quê.
- Entregar documentos com **valor de prova**: Espelho de Ponto assinado pelo funcionário e pelo chefe, selado com certificado ICP-Brasil e verificável publicamente.
- Atender a fiscalização: AFD, AEJ, Atestado Técnico e Termo de Responsabilidade, registro do programa no INPI.

## Escopo funcional (resumo)

| Área              | O que o sistema faz                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro de ponto | Entrada, intervalo, saída, pausa e retomada; presencial, mobile, híbrido, home office e viagem, com geolocalização, foto e rede reconhecida. |
| Solicitações      | Correção de ponto, abono, atestado, licença, férias, hora extra, day off e envio de documentos ao RH, com fluxo de aprovação (chefe → RH).   |
| Banco de horas    | Saldo por ciclo, marcos de fechamento, liberação de tempo pelo RH para abono, relatório do ciclo assinado.                                   |
| Espelho de Ponto  | Folha mensal gerada pelo sistema, assinada pelo funcionário e pelo chefe, selada em PDF imutável.                                            |
| REP-P / fiscal    | Livro de marcações imutável (hash encadeado), AFD, AEJ, Atestado Técnico, registro no INPI, monitor de relógio (NTP).                        |
| Gestão            | Cadastro de funcionários, gerências, lotações, jornadas, categorias, perfis do RH, Super Admin.                                              |
| Governança        | Termos de Uso, trilha de auditoria, notificações, backup e esta documentação técnica.                                                        |

## Fora do escopo

Folha de pagamento, controle de acesso físico (catraca) e videoconferência (há estrutura preparada, mas não habilitada).

## Como ler esta documentação

As seções **escritas** descrevem arquitetura, fluxos, regras e segurança. As seções **geradas** (stack, banco de dados, catálogo de endpoints, rotinas agendadas e variáveis de ambiente) são produzidas a partir do próprio código a cada acesso — por isso nunca ficam desatualizadas. Toda mudança nas partes geradas ou nos textos produz uma **revisão automática** na tabela de revisões do topo da página.
