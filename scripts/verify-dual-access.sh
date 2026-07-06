#!/usr/bin/env bash
# Valida SSO via proxy /auth para IP e domínio público.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SERVER_IP="${SERVER_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
DOMAIN="${PONTO_PUBLIC_DOMAIN:-ponto.cfo.org.br}"

URLS=(
  "https://${SERVER_IP}:12010"
  "https://${DOMAIN}"
  "https://${DOMAIN}:12010"
)

FAILED=0
for BASE in "${URLS[@]}"; do
  echo ">>> $BASE"
  if PONTO_BASE_URL="$BASE" "$ROOT/scripts/verify-sso-proxy.sh"; then
    echo ""
  else
    FAILED=1
    echo "FALHOU: $BASE"
    echo ""
  fi
done

if [ "$FAILED" -eq 0 ]; then
  echo "=== Acesso IP e domínio OK ==="
else
  exit 1
fi
