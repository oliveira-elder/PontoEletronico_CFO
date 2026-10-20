## Repositório

```
packages/backend   API NestJS + Prisma
packages/web       SPA React/Vite
packages/shared    tipos e funções comuns
packages/desktop   cliente desktop (experimental)
docs/              documentação (docs/tecnica = esta documentação)
deploy/            nginx, DNS, ICP, Keycloak (arquivos de ambiente, sem segredos)
scripts/           operação (subir, diagnosticar, DNS, JWKS, hash do INPI)
```

## Padrões

- **TypeScript estrito**, ESLint 8 e Prettier 3 (aplicados por Husky + lint-staged a cada commit).
- Comentários explicam o **porquê** (norma, decisão), não o óbvio.
- Mensagens ao usuário em **português**, claras e acionáveis.
- Regras de cálculo ficam em `utils/` e têm espelho no front quando houver prévia (arquivo com a nota "manter iguais").

## Como adicionar...

| Tarefa                   | Passos                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Endpoint**             | Método no controlador com guardas (`@UseGuards`, `@Roles`, `@RecursoRh`); lógica no serviço; entrada em `logs/endpoint-catalog.ts` (título e descrição). Ele aparece sozinho em _Catálogo de endpoints_ com acesso, tabelas e consultas. |
| **Tabela/campo**         | Alterar `schema.prisma`; incluir o modelo em `docs/tecnica/banco-dominios.json` e uma descrição em `banco-descricoes.json`; rótulos de relação em `banco-rotulos.json` se quiser. O DER e o dicionário se atualizam sozinhos.            |
| **Variável de ambiente** | Documentar a função em `docs/tecnica/ambiente.json` (nunca o valor).                                                                                                                                                                     |
| **Fluxo/regra**          | Editar o Markdown em `docs/tecnica/**` e, se for nova seção, declarar no `docs/tecnica/indice.json`.                                                                                                                                     |
| **Rotina agendada**      | `@Cron` no serviço; ela aparece sozinha em _Rotinas agendadas_.                                                                                                                                                                          |

Cada mudança nas partes geradas ou nos textos cria uma **revisão automática** (versão de correção). Mudanças relevantes devem receber também uma **revisão manual** com comentário na tabela do topo.

## Testes

- Regras puras: testes unitários (`npm test -w @intranet/backend`).
- Qualquer teste que toque o banco usa **transação com desfazer** (`throw new Error("ROLLBACK")` no final) para não deixar dados.
- Antes de entregar: `tsc --noEmit`, `eslint`, `prettier --check` e `vite build` no web.

## Segurança no desenvolvimento

Nunca colocar segredo em código, log, resposta ou documentação; não versionar `.env`, certificados ou chaves; revisar `git diff` antes de publicar.
