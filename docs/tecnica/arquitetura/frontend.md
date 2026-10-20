SPA em **React 18** com **Vite**, roteamento por `react-router` e autenticação por `keycloak-js`.

```mermaid
flowchart TB
  KC[keycloak-js<br/>login SSO e renovação] --> AC[AuthContext]
  AC --> RT[Router<br/>app/router.tsx]
  RT --> LY[Layout<br/>menu, topo, rodapé]
  LY --> PG[Páginas /ponto/*]
  PG --> HK[hooks<br/>useApi, useComprovantes ...]
  HK --> API[(API /api)]
  PG --> CP[components/*<br/>modais, tabelas, assinatura ...]
  PG --> UT[utils/<br/>cálculo e regras espelhadas]
```

- **Páginas** ficam em `pages/ponto/*` e são carregadas sob demanda (`lazy`).
- **`useApi`** anexa o token (`Authorization: Bearer`) e trata 401/403/428.
- **Regras espelhadas** (`utils/`): partes do cálculo existem também no front para exibir prévias; o **backend é a autoridade**.
- **Acessibilidade**: menu de acessibilidade, orientação travada em telas pequenas, componentes com foco visível.
- **Terminais móveis**: GPS e câmera pelo navegador, com guias de permissão (Android/iOS).
