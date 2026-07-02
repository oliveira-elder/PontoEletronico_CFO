#!/bin/sh
set -e

LOCK_HASH_FILE="/app/node_modules/.web-lock-hash"
CURRENT_HASH=$(
  { md5sum /app/package-lock.json /app/packages/web/package.json 2>/dev/null; } \
    | md5sum | awk '{print $1}'
)
STORED_HASH=$(cat "$LOCK_HASH_FILE" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo "[web] Dependências desatualizadas — instalando..."
  npm install
  npm rebuild esbuild
  echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
  echo "[web] Instalação concluída."
else
  echo "[web] Dependências já atualizadas (hash ok)."
  # Garante peer deps do recharts (ex.: react-is) em volumes Docker antigos
  if [ ! -d /app/node_modules/react-is ]; then
    echo "[web] Pacote react-is ausente — reinstalando..."
    npm install
    npm rebuild esbuild
  fi
fi

echo "[web] Iniciando Vite na porta 12010..."
exec npm run dev -w @intranet/web -- --host 0.0.0.0 --port 12010
