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
  # Garante peer deps em volumes Docker antigos (recharts, mapas, etc.)
  NEED_INSTALL=0
  for pkg in react-is leaflet; do
    if [ ! -d "/app/node_modules/$pkg" ]; then
      echo "[web] Pacote $pkg ausente."
      NEED_INSTALL=1
    fi
  done
  if [ "$NEED_INSTALL" -eq 1 ]; then
    echo "[web] Reinstalando dependências..."
    npm install
    npm rebuild esbuild
  fi
fi

# Produção (padrão): build estático + `vite preview` — muito mais rápido que o servidor de
# desenvolvimento (sem transformar módulos a cada acesso, sem HMR e sem varredura de arquivos).
# Para desenvolver com recarga automática: WEB_MODE=dev.
if [ "${WEB_MODE:-prod}" = "dev" ]; then
  echo "[web] Modo desenvolvimento — Vite dev na porta 12010..."
  exec npm run dev -w @intranet/web -- --host 0.0.0.0 --port 12010
fi

echo "[web] Gerando build de produção..."
if npm run build -w @intranet/web; then
  echo "[web] Build OK — servindo build estático na porta 12010..."
  cd /app/packages/web && exec npx vite preview --host 0.0.0.0 --port 12010 --strictPort
fi

echo "[web] AVISO: build falhou — usando o servidor de desenvolvimento."
exec npm run dev -w @intranet/web -- --host 0.0.0.0 --port 12010
