#!/bin/sh
set -e

# Usa hash do package-lock.json para detectar mudanças de deps e reinstalar só quando necessário
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

echo "[backend] Iniciando API na porta ${PORT:-3000}..."
npm run build -w @intranet/backend
exec npm run start -w @intranet/backend
