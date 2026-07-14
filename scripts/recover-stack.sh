#!/usr/bin/env bash
# Recupera o stack após up sem portas 80/443 (ou após troca Compose V1→V2).
# Uso (root): ./scripts/recover-stack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if docker compose version &>/dev/null; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi

echo "Recriando nginx com portas 80/443/12010..."
"${COMPOSE[@]}" -f docker-compose.yml up -d --force-recreate nginx web backend

echo
echo "Portas publicadas:"
ss -tln | grep -E ':443|:80|:12010' || true
echo
echo "Teste local: curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:12010/"
echo "Teste 443:   curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1/"
