# Intranet CFO

Monorepo modular para Intranet corporativa com:
- Backend NestJS + Prisma + PostgreSQL
- Web React + Vite
- Mobile Expo
- Desktop React + Tauri (estrutura inicial)
- SSO via Keycloak
- Integracao GLPI
- Atendimento via chat contextual (rule-based no MVP)

## Pacotes
- `packages/backend`
- `packages/web`
- `packages/mobile`
- `packages/desktop`
- `packages/shared`

## Executar localmente
1. `npm install`
2. `docker compose up -d postgres keycloak backend`
3. Backend: `http://localhost:11003`
4. Keycloak: `http://localhost:11002`
5. PostgreSQL exposto em `localhost:11001`
