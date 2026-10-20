O sistema distingue **categorias funcionais** (`Concursado`, `Assessor` — comissionado —, `Estagiário`, `Jovem aprendiz`) e características combináveis (**chefe** e **fiscal**). A categoria muda no tempo; o histórico (`FuncionarioCategoriaHistorico`) é usado para saber, **dia a dia**, se havia obrigação de ponto.

| Tema                                | Concursado | Assessor/Chefe/Fiscal                       | Estagiário / Jovem aprendiz                 |
| ----------------------------------- | ---------- | ------------------------------------------- | ------------------------------------------- |
| Registra ponto                      | Sim        | Conforme obrigação vigente (override do RH) | Sim                                         |
| Intervalo de almoço                 | Sim        | —                                           | **Não** (carga corrida; usa pausa/retomada) |
| Hora extra                          | Sim        | —                                           | **Não** (excedente só informativo)          |
| Banco de horas visível              | Sim        | —                                           | **Não**                                     |
| Tolerância individual de fechamento | Sim        | Assessor: só a geral                        | Só a geral                                  |
| Dependentes e capacitação           | Sim        | Sim                                         | —                                           |

## Contratos de estagiário e jovem aprendiz

- O supervisor de estágio recebe o papel de gestor.
- `contratoAvisoAntecedenciaDias` (padrão 90) define a antecedência do alerta de fim de contrato.
- Mudança de situação (ex.: concursado → comissionado) fecha o banco com o saldo do dia (`FechamentoSituacao`) e gera o aviso `FECHAMENTO_BANCO_MUDANCA_SITUACAO`; no retorno a uma categoria com ponto, a obrigação começa no **dia seguinte**.

## Isenção de ponto

Chefes e fiscais deixaram de ser categorias próprias: a isenção depende da combinação categoria × chefe × fiscal × override manual do RH (`registroPontoObrigatorio`) × data de início (`pontoObrigatorioDesde`). Dias isentos aparecem como "Isento" no Espelho e não geram falta.
