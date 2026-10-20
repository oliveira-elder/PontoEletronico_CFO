## Fluxo

- O login é **delegado ao Keycloak** (OpenID Connect). O sistema **não armazena senhas**.
- O front obtém o token e o envia como `Authorization: Bearer`.
- A validação (`KeycloakJwtStrategy`):
  - assinatura **RS256** com chaves do **JWKS local** (arquivo montado somente leitura), com _fallback_ para o JWKS remoto (cache e limite de 5 consultas/min); `kid` desconhecido cai no remoto;
  - **validade** obrigatória (`ignoreExpiration: false`) com tolerância de relógio de 30 s;
  - **emissor** validado (`KEYCLOAK_VALIDATE_ISSUER`, ligado por padrão) e **audiência** opcional;
  - tokens **HS256** só com `ALLOW_DEV_TOKENS=true`, fora de produção e com `JWT_SECRET` próprio (uso de desenvolvimento);
- Em seguida o `AuthService` mapeia o token em contexto (usuário, e-mail, papéis, grupos, Super Admin) e `enrichRoles` acrescenta papéis derivados do cadastro local.

## Sessão

Sem sessão no servidor: o estado é o token. O front renova o token antes de expirar; falha de renovação leva ao login.

## Pontos de atenção

- Definir `JWT_SECRET` forte e exclusivo (o valor padrão de desenvolvimento é conhecido). O token na URL é aceito apenas em `/logs/stream` (SSE).
- `KEYCLOAK_JWKS_TLS_INSECURE` só deve existir em desenvolvimento.
- Bloqueios no login: conta desativada, cedida e sem matrícula.
