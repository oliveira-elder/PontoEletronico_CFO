#!/usr/bin/env bash
# Testa token client_credentials do service account (sem usuário/senha admin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CLIENT_ID="${KEYCLOAK_SERVICE_CLIENT_ID:-}"
CLIENT_SECRET="${KEYCLOAK_SERVICE_CLIENT_SECRET:-}"
REALM="${VITE_KEYCLOAK_REALM:-cfo}"
BASE="${KEYCLOAK_URL:-${VITE_KEYCLOAK_URL:-http://192.168.100.112:8080}}"

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Configure no .env:"
  echo "  KEYCLOAK_SERVICE_CLIENT_ID=pontoeletronico-service"
  echo "  KEYCLOAK_SERVICE_CLIENT_SECRET=<secret do client>"
  exit 1
fi

echo "=== Token client_credentials ==="
echo "Client: $CLIENT_ID"
echo "Realm:  $REALM"
echo ""

RESP=$(curl -sk --max-time 20 -X POST "${BASE}/realms/${REALM}/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" 2>&1) || true

if echo "$RESP" | grep -q access_token; then
  echo "OK: access_token obtido"
  TOKEN=$(echo "$RESP" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  echo ""
  echo "=== Teste API Admin (usuários) ==="
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE}/admin/realms/${REALM}/users?max=5")
  echo "GET /admin/realms/${REALM}/users → HTTP ${CODE}"
  [ "$CODE" = "200" ] && echo "Pronto para listar usuários do AD." || echo "Faltam roles no service account (view-users, query-users)."
else
  echo "FALHA ao obter token:"
  if [ -z "$RESP" ]; then
    echo "  (sem resposta — timeout de rede para ${BASE})"
    echo "  Rode: ./scripts/diagnose-keycloak-network.sh"
  else
    echo "$RESP"
  fi
  exit 1
fi
