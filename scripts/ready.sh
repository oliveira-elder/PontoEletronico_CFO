#!/usr/bin/env bash
# Sobe o stack e valida acesso (execute após git pull ou alterações locais).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Setup Ponto Eletrônico ==="

if [ ! -f deploy/nginx/certs/ponto.crt ]; then
  echo "Gerando certificados..."
  ./scripts/setup-ponto-access.sh
fi

if [ -x ./scripts/cleanup.sh ]; then
  ./scripts/cleanup.sh 2>/dev/null || sudo ./scripts/cleanup.sh 2>/dev/null || true
fi

./scripts/docker-up.sh --build

echo ""
./scripts/verify-ponto-access.sh || true

echo ""
echo "Pronto. Acesse: https://ponto.cfo.local:12010/ (ou IP do servidor na porta 12010)"
