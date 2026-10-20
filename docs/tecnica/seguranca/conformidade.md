## Normas

| Norma                                   | Relação com o sistema                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Portaria MTP nº 671/2021**            | Disciplina o REP-P (arts. 74–91): livro imutável, NSR, comprovante, AFD, AEJ, atestado técnico, registro no INPI. Matriz item a item em _Anexo IX_. |
| **CLT (arts. 58, 59, 62, 66, 71, 473)** | Jornada, banco de horas, interjornada de 11 h, intervalos, licenças.                                                                                |
| **MP 2.200-2/2001 e Lei 14.063/2020**   | Validade das assinaturas eletrônicas e do selo ICP-Brasil.                                                                                          |
| **LGPD (Lei 13.709/2018)**              | Proteção de dados pessoais e sensíveis (saúde).                                                                                                     |
| **ACT 2026-2028**                       | Jornada reduzida e regras de abono da categoria.                                                                                                    |

## Mapa de artigos principais

| Artigo         | Requisito                                    | Onde atende                               |
| -------------- | -------------------------------------------- | ----------------------------------------- |
| 74, IV         | Registro não pode ser alterado nem apagado   | Gatilhos + hash encadeado                 |
| 74 (restrição) | A marcação não pode ser restringida          | Ponto isento do bloqueio por termos (428) |
| 78–79          | REP-P e comprovante                          | Módulos `rep`, `comprovante`              |
| 80, II–III     | Comprovante imediato; últimas 48 h           | PDF A6 e ZIP de 48 h                      |
| 81–88          | AFD/AEJ e assinatura                         | `arquivos-fiscais`, CAdES                 |
| 89             | Atestado técnico e termo de responsabilidade | Modelo preenchido para e-CPF              |
| 91             | Registro do programa no INPI                 | `RegistroProgramaInpi`, hash do código    |

## Pendências conhecidas

Alta disponibilidade (Anexo IX, itens 6, 8.1 e 13), obtenção do certificado de registro do INPI e do e-CNPJ A1 em produção, e parecer jurídico/DPO sobre a base legal da LGPD. O estado atualizado está no _Anexo IX_.
