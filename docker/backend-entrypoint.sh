#!/bin/sh
set -e

LOCK_HASH_FILE="/app/node_modules/.lock-hash"
CURRENT_HASH=$(md5sum /app/package-lock.json 2>/dev/null | awk '{print $1}' || echo "none")
STORED_HASH=$(cat "$LOCK_HASH_FILE" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo "[backend] Dependências desatualizadas — instalando..."
  npm install
  echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
  echo "[backend] Instalação concluída."
else
  echo "[backend] Dependências já atualizadas (hash ok)."
fi

echo "[backend] Prisma generate..."
npx prisma generate --schema=packages/backend/prisma/schema.prisma

if [ "${DOCKER_SKIP_DB_PUSH:-false}" != "true" ]; then
  echo "[backend] Prisma db push..."
  npx prisma db push --schema=packages/backend/prisma/schema.prisma --accept-data-loss
fi

if [ ! -f /app/.docker-seed-done ]; then
  echo "[backend] Seed inicial..."
  if (cd packages/backend && npx ts-node --project tsconfig.seed.json prisma/seed.ts); then
    touch /app/.docker-seed-done
  else
    echo "[backend] Seed ignorado."
  fi
fi

echo "[backend] Atualizando cache JWKS do Keycloak..."
mkdir -p /app/deploy/keycloak
JWKS_URI="${KEYCLOAK_JWKS_URI:-http://192.168.100.112:8080/realms/cfo/protocol/openid-connect/certs}"
if curl -fsSL --max-time 25 -k "$JWKS_URI" -o /app/deploy/keycloak/jwks.json.tmp 2>/dev/null; then
  mv /app/deploy/keycloak/jwks.json.tmp /app/deploy/keycloak/jwks.json
  echo "[backend] JWKS atualizado."
elif [ -f /app/deploy/keycloak/jwks.json ]; then
  echo "[backend] JWKS remoto indisponível — usando cache local."
else
  echo "[backend] AVISO: sem JWKS remoto nem cache local. Rode: ./scripts/fetch-keycloak-jwks.sh"
fi

echo "[backend] Compilando API..."
# dist fica em volume Docker (backend_dist) — evita conflito com dist root no host
rm -rf /app/packages/backend/dist/* 2>/dev/null || true
mkdir -p /app/packages/backend/dist

if ! npm run build -w @intranet/backend; then
  echo "[backend] AVISO: build falhou — tentando nest start --watch..."
  exec npm run dev -w @intranet/backend
fi

echo "[backend] Iniciando API na porta ${PORT:-3000}..."
exec npm run start -w @intranet/backend
