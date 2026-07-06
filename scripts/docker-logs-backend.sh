#!/usr/bin/env bash
# Logs e diagnóstico do container backend (NestJS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/docker-lib.sh
source "$ROOT/scripts/docker-lib.sh"

BACKEND="${BACKEND_CONTAINER:-$(docker_find_service_container backend)}"

echo "=== Containers do projeto ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
  | grep -E 'pontoeletronico|NAMES' || docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | head -10

if [ -z "$BACKEND" ]; then
  echo ""
  echo "ERRO: container backend NÃO EXISTE."
  echo "Suba com: ./scripts/docker-recreate.sh backend"
  echo "Ou stack completa: ./scripts/docker-up.sh"
  exit 1
fi

echo ""
echo "=== Container backend: $BACKEND ==="
docker ps -a --filter "name=${BACKEND}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo ""
echo "=== Últimas 80 linhas do log ==="
docker logs "$BACKEND" 2>&1 | tail -80
echo ""
echo "=== Teste HTTP interno ==="
docker exec "$BACKEND" node -e "
require('http').get('http://127.0.0.1:3000/api/auth/me', r => {
  console.log('HTTP', r.statusCode);
  process.exit(r.statusCode ? 0 : 1);
}).on('error', e => { console.error(e.message); process.exit(1); });
" 2>&1 || echo "API ainda não responde na 3000."
