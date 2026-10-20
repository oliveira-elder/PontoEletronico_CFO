O banco é **PostgreSQL**, modelado com **Prisma** (`packages/backend/prisma/schema.prisma`). Esta seção explica as convenções; os **diagramas (DER)** e o **dicionário de dados** completos são gerados do esquema real nas duas seções seguintes.

## Convenções

| Tema                   | Convenção                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identificadores        | `String` com `cuid()` (exceto tabelas de linha única e o NSR).                                                                 |
| Linha única            | `ConfiguracaoSistema`, `DocumentacaoAutoria`, `ContadorNsr` usam `id = "singleton"`.                                           |
| Datas                  | `DateTime` em UTC; dias civis (feriado, vigência) são tratados como datas de Brasília nos utilitários.                         |
| Tipos fechados         | Enums do PostgreSQL (tipo de ponto, status de assinatura, categoria funcional etc.).                                           |
| Dados flexíveis        | Colunas `Json` para observações, metadados de solicitações e dados de eventos do REP.                                          |
| Exclusão               | Histórico e trilhas **não são excluídos**: anulam-se (revisões da documentação, concessões de Super Admin, aceites de termos). |
| Atualização do esquema | `prisma db push --accept-data-loss` na subida do backend (mudanças aditivas são seguras; remoções exigem cuidado).             |

## Objetos especiais

- **Livro do REP somente inclusão** — `MarcacaoRep` e `EventoRep` têm gatilhos `BEFORE UPDATE OR DELETE` e `BEFORE TRUNCATE` que lançam erro (Portaria 671, art. 74, IV; Anexo IX, item 7).
- **Contador de NSR** — `ContadorNsr.ultimo` é incrementado por `UPDATE … RETURNING` dentro da transação da marcação: a linha fica travada até o fim da transação, o que garante NSR **sem lacunas e sem repetição**.
- **Hash encadeado** — cada marcação guarda `hash` e `hashAnterior` (SHA-256 sobre os campos do AFD tipo 7 + hash anterior).
- **Documentos emitidos** — `DocumentoEmitido` registra a impressão digital (SHA-256) de cada PDF assinado para permitir verificação por upload.
- **Retenção** — não há expurgo automático das tabelas de ponto; a guarda mínima de 5 anos depende do backup (ver _Backup_).

## Domínios

Os diagramas são organizados por domínio para ficarem legíveis: identidade; pessoas e organização; registro de ponto e REP-P; solicitações, afastamentos e saúde; banco de horas e assinaturas; documentos e termos; comunicação; configuração e integrações; auditoria e documentação. Cada tabela aparece em ao menos um domínio — a seção _Cobertura da documentação_ alerta se um modelo novo ficar sem domínio.
