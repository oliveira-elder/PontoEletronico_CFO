| Decisão                                                      | Motivo                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Monorepo com npm workspaces** (`backend`, `web`, `shared`) | Um único repositório e `package-lock.json`; versões consistentes.                                  |
| **NestJS modular**                                           | Separação por domínio, injeção de dependências e guardas declarativas.                             |
| **Prisma**                                                   | Esquema tipado, `db push` simples na subida, DMMF usado também por esta documentação.              |
| **Hora sempre do servidor**                                  | Exigência de confiabilidade (Anexo IX, itens 2 e 8.2); o relógio do dispositivo é ignorado.        |
| **Livro do REP em tabela própria com gatilhos**              | Imutabilidade garantida no banco, não só na aplicação.                                             |
| **Hash SHA-256 encadeado**                                   | Detecta qualquer alteração do histórico; verificado na subida e diariamente.                       |
| **PDFs gerados e congelados no servidor**                    | O documento assinado é um arquivo único e imutável; o histórico guarda só o hash dos substituídos. |
| **Verificação pública sem dados pessoais**                   | LGPD: mostra apenas o mínimo (nome mascarado, hash, datas).                                        |
| **Banco único em uma VM**                                    | Simplicidade; alta disponibilidade é item de infraestrutura pendente (ver Anexo IX).               |
| **Mermaid e Markdown auto-hospedados**                       | Documentação sem dependência de CDN.                                                               |
