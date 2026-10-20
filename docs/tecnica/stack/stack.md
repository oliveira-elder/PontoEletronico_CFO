As tabelas abaixo são **geradas do código**: pacotes, versões instaladas e serviços do Docker Compose (sem expor variáveis de ambiente).

| Camada       | Tecnologia                                                                   | Uso                                                          |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Linguagem    | TypeScript                                                                   | Backend, front-end e pacote compartilhado.                   |
| Runtime      | Node.js                                                                      | API e ferramentas.                                           |
| Backend      | NestJS 11, Passport (JWT), `@nestjs/schedule`                                | API, autenticação e rotinas agendadas.                       |
| Banco        | PostgreSQL + Prisma 5                                                        | Persistência e migrações por `db push`.                      |
| Front-end    | React 18, Vite 6, React Router 6, TanStack Query, Zustand, Recharts, Leaflet | SPA, estado de servidor/cliente, gráficos e mapas.           |
| Autenticação | Keycloak (OIDC)                                                              | SSO.                                                         |
| PDFs         | pdfmake, pdf-lib, pdfjs-dist                                                 | Espelho, comprovantes, relatórios, leitura de PDFs enviados. |
| Assinatura   | node-forge, `@signpdf/*`                                                     | Selo PAdES/CAdES com A1.                                     |
| OCR          | tesseract.js                                                                 | Conferência de fotos de documentos na verificação pública.   |
| Arquivos     | jszip                                                                        | ZIP de comprovantes e exportações.                           |
| Infra        | Docker Compose, nginx, CoreDNS                                               | Execução, proxy e DNS.                                       |
| Qualidade    | ESLint 8, Prettier 3, Husky, lint-staged                                     | Padrões de código.                                           |
