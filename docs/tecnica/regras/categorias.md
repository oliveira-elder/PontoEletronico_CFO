| Regra                                                                                            | Origem no código                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Estagiário e jovem aprendiz: carga corrida, sem almoço, sem hora extra, sem banco                | `utils/categoria-jornada`                        |
| Assessor (comissionado), chefe e fiscal: isenção de ponto por regra combinada com override do RH | `utils/categoria-jornada`, `categoria-historico` |
| Obrigação de ponto **por dia**, usando o histórico de categoria                                  | `diaSemObrigacaoPonto`                           |
| Tolerância individual de fechamento: não vale para estagiário, jovem aprendiz e assessor         | `utils/tolerancia-fechamento`                    |
| Cedido a outro órgão: sem login, sem ponto, dias neutros                                         | `utils/cessao-historico`                         |
| Dependentes e capacitação: efetivos e comissionados                                              | `utils/cadastro-listas`                          |
| Aviso de fim de contrato (estagiário/jovem aprendiz): 90 dias                                    | `contratoAvisoAntecedenciaDias`                  |

As mesmas funções alimentam o registro de ponto, o banco de horas, a elegibilidade do Espelho e o AEJ — por isso uma mudança de categoria afeta todos coerentemente.
