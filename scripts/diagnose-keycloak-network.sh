#!/usr/bin/env bash
# Diagnóstico de rede: servidor → Keycloak SSO.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE="${KEYCLOAK_URL:-${VITE_KEYCLOAK_URL:-http://192.168.100.112:8080}}"
REALM="${VITE_KEYCLOAK_REALM:-cfo}"
CLIENT_ID="${KEYCLOAK_SERVICE_CLIENT_ID:-pontoeletronico-service}"
CLIENT_SECRET="${KEYCLOAK_SERVICE_CLIENT_SECRET:-}"

echo "=== Diagnóstico rede Keycloak ==="
echo "URL:    $BASE"
echo "Realm:  $REALM"
echo "Client: $CLIENT_ID"
echo ""

echo "1) DNS:"
getent hosts "$(echo "$BASE" | sed -E 's#^https?://([^/:]+).*#\1#')" 2>/dev/null || echo "   (getent falhou)"
echo ""

echo "2) HTTPS (10s timeout):"
CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}/realms/${REALM}/.well-known/openid-configuration" 2>/dev/null || echo "000")
echo "   GET /.well-known/openid-configuration → HTTP ${CODE}"
if [ "$CODE" = "000" ]; then
  echo "   ERRO: servidor NÃO alcança o SSO (timeout/rede/firewall)."
  echo "   Peça à TI a URL INTERNA do Keycloak (ex.: https://192.168.x.x) e configure:"
  echo "     VITE_KEYCLOAK_URL=https://<ip-interno>"
  echo "     KEYCLOAK_ISSUER=https://<ip-interno>/realms/cfo"
  echo "     KEYCLOAK_JWKS_URI=https://<ip-interno>/realms/cfo/protocol/openid-connect/certs"
  exit 1
fi
echo ""

if [ -z "$CLIENT_SECRET" ]; then
  echo "3) Secret ausente no .env (KEYCLOAK_SERVICE_CLIENT_SECRET)"
  exit 1
fi

echo "3) Token client_credentials:"
RESP=$(curl -sk --max-time 15 -X POST "${BASE}/realms/${REALM}/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" 2>&1) || true

if echo "$RESP" | grep -q access_token; then
  echo "   OK: access_token obtido"
  TOKEN=$(echo "$RESP" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 15 \
    -H "Authorization: Bearer ${TOKEN}" \
    "${BASE}/admin/realms/${REALM}/users?max=3")
  echo "   GET /admin/.../users → HTTP ${CODE}"
else
  echo "   FALHA:"
  echo "$RESP" | head -5
  echo ""
  echo "   Se HTTP 401: secret errado ou client sem Client Credentials habilitado."
  exit 1
fi

echo ""
echo "4) Dentro do container backend (se existir):"
BACKEND=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'backend' | head -1 || true)
if [ -n "$BACKEND" ]; then
  docker exec "$BACKEND" node -e "
const https=require('https');
const u=new URL('${BASE}/realms/${REALM}/.well-known/openid-configuration');
const req=https.get(u,{rejectUnauthorized:false,timeout:10000},r=>{
  console.log('   container → HTTP',r.statusCode);
  process.exit(r.statusCode?0:1);
});
req.on('error',e=>{console.log('   container ERRO:',e.message);process.exit(1);});
req.on('timeout',()=>{req.destroy();console.log('   container timeout');process.exit(1);});
" 2>/dev/null || echo "   container não alcança SSO"
else
  echo "   (container backend não encontrado)"
fi
