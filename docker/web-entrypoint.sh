#!/bin/sh
set -e

MARKER="/app/node_modules/.docker-web-deps-ready"

if [ ! -f "$MARKER" ]; then
  echo "[web] Instalando dependências (primeira execução)..."
  npm install
  npm rebuild esbuild
  touch "$MARKER"
fi

echo "[web] Iniciando Vite na porta 12010..."
exec npm run dev -w @intranet/web -- --host 0.0.0.0 --port 12010
