#!/usr/bin/env bash
# Logs e diagnóstico do container web (Vite).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/docker-lib.sh
source "$ROOT/scripts/docker-lib.sh"

WEB="${WEB_CONTAINER:-$(docker_find_service_container web)}"

echo "=== Container web: ${WEB:-NÃO ENCONTRADO} ==="
if [ -z "$WEB" ]; then
  echo "Suba com: ./scripts/docker-recreate.sh web"
  exit 1
fi
docker ps -a --filter "name=${WEB}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo ""
echo "=== Últimas 80 linhas do log ==="
docker logs "$WEB" 2>&1 | tail -80
echo ""
echo "=== Teste HTTP interno (se rodando) ==="
docker exec "$WEB" node -e "
require('http').get('http://127.0.0.1:12010/', r => {
  console.log('HTTP', r.statusCode);
  process.exit(r.statusCode && r.statusCode < 500 ? 0 : 1);
}).on('error', e => { console.error(e.message); process.exit(1); });
" 2>&1 || echo "Vite ainda não responde na 12010 — aguarde npm install ou veja erros acima."
