O sistema distingue **categorias funcionais** (`Concursado`, `Assessor` — comissionado —, `Estagiário`, `Jovem aprendiz`) e características combináveis (**chefe** e **assessor**). A categoria muda no tempo; o histórico (`FuncionarioCategoriaHistorico`) é usado para saber, **dia a dia**, se havia obrigação de ponto.

| Tema                                | Concursado | Comissionado/Assessor/Chefe                 | Estagiário / Jovem aprendiz                 |
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

Chefes e assessores deixaram de ser categorias próprias: a isenção depende da combinação categoria × chefe × assessor × override manual do RH (`registroPontoObrigatorio`) × data de início (`pontoObrigatorioDesde`). Dias isentos aparecem como "Isento" no Espelho e não geram falta.

## Alta Administração (sem matrícula)

Categoria `ALTA_ADMINISTRACAO` (subcategoria: Presidente, Vice-Presidente, Secretário-Geral, Tesoureiro, Superintendente, Outros) para quem está na API de ramais **sem matrícula**. **Não registra ponto** (nem o override do RH vale), **não entra no REP-P** (sem evento tipo 5 no livro, fora do AFD/AEJ) e mantém os demais recursos (solicitações, requisições, saúde ocupacional, dependentes e capacitação).

- **Só nasce pelo fluxo da aba Sistema → Alta Administração (Super Admin).** Não se cria pelo "Novo funcionário", não se migra para ela quem tem matrícula e quem entrou sem matrícula não muda de categoria.
- **Fluxo com negação possível** (`EntradaSemMatricula`): (1) o Super Admin registra a requisição do RH com **usuário do SSO, subcategoria, nº do chamado e anexo obrigatório (CPF opcional)** (PDF/JPG/PNG, até 8 MB, conferido pelos bytes, guardado em diretório privado com SHA-256) → fica `PENDENTE`, sem acesso; (2) **outro** Super Admin **autoriza expressamente** ou **nega** (fraude suspeita, erro de cadastro, divergência, outro). Pode ser revogada a qualquer tempo com novo chamado. Nada é apagado.
- **Verificações automáticas** (SSO via API Admin do Keycloak; o AD via federação do SSO): conta existe, **habilitada**, com nome e sobrenome, **federada ao AD**; usuário `nome.sobrenome`; e-mail do SSO e da API **pessoais** (e-mail geral/compartilhado não ativa); usuário/e-mail livres; CPF **opcional** (se informado, válido e único). Sem a API Admin do SSO, **nada é autorizado**.
- **Acesso preso ao SSO/AD:** o login só vale com a entrada `AUTORIZADA` e o mesmo usuário do SSO. De hora em hora, conta **desabilitada ou removida** no SSO/AD inativa o funcionário e revoga a entrada (automático); **não reativa sozinho**. A revogação vale logo (o token em uso é barrado em até 30 s).
- **Riscos aceitos:** identificação mais frágil (sem matrícula), anexo falsificável (guardamos hash, autor, data e IP, mas não provamos autenticidade), sem trilha de jornada no REP e relatórios que usam matrícula mostram "—". O aviso integral aparece na tela de edição da pessoa.

**Fora de toda estatística.** A Alta Administração não entra em dashboards, totais, rankings nem gráficos: dashboard consolidado (totais, categorias, lotação, cargos, diversidade, vale-transporte, dependentes, contratos), dashboard de auditoria (totais de funcionários, solicitações, afastamentos, atestados, férias, assinaturas, rankings), banco de horas geral, contagem por gerência, cartões da Gestão e cartões do resumo de saúde ocupacional. Fica **dentro** das listas e **filas de trabalho** do RH (cadastro, aprovações pendentes, exames a conferir, requisições, painel de demandas), para que as pendências possam ser tratadas. O filtro único é `SEM_ALTA_ADMINISTRACAO` (`utils/categoria-jornada`); teste: `scripts/teste-estatisticas-alta-adm.ts`.
