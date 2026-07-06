#!/usr/bin/env bash
# Valida proxy SSO /auth → Keycloak interno.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE="${PONTO_BASE_URL:-${VITE_APP_BASE_URL:-https://127.0.0.1:12010}}"
PROXY="${BASE%/}/auth"
REALM="${VITE_KEYCLOAK_REALM:-cfo}"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_JSON="$TMP_DIR/kc-openid.json"
TMP_CODE="$TMP_DIR/kc-openid-code.txt"

echo "=== Proxy SSO (/auth) ==="
echo "Ponto:  $BASE"
echo "Proxy:  $PROXY"
echo ""

echo "1) OpenID via proxy:"
curl -sk -o "$TMP_JSON" -w "%{http_code}" --max-time 15 \
  "${PROXY}/realms/${REALM}/.well-known/openid-configuration" > "$TMP_CODE" 2>/dev/null \
  || true
CODE=$(tr -d '\n' < "$TMP_CODE")
[ -n "$CODE" ] || CODE="000"
echo "   HTTP $CODE"
if [ "$CODE" = "200" ]; then
  if head -1 "$TMP_JSON" | grep -qi '<!doctype html'; then
    echo "   ERRO: resposta é HTML do Vite — proxy /auth NÃO está ativo"
    echo "   Rode como root: ./scripts/fix-sso-login.sh"
    exit 1
  fi
  ISSUER=$(grep -o '"issuer":"[^"]*"' "$TMP_JSON" | head -1 || true)
  AUTH=$(grep -o '"authorization_endpoint":"[^"]*"' "$TMP_JSON" | head -1 || true)
  echo "   $ISSUER"
  echo "   $AUTH"
  if echo "$AUTH" | grep -q 'sso.cfo.org.br'; then
    echo "   ERRO: endpoints ainda apontam para sso.cfo.org.br (use proxy /auth no nginx)"
    exit 1
  fi
  if echo "$BASE" | grep -q ':12010' && echo "$AUTH" | grep -qE 'https://[0-9.]+/auth/' && ! echo "$AUTH" | grep -q ':12010'; then
    echo "   ERRO: URL sem porta :12010"
    exit 1
  fi
  if echo "$AUTH" | grep -q '/auth/'; then
    echo "   OK: endpoints usam proxy /auth"
  else
    echo "   ERRO: authorization_endpoint sem /auth/"
    exit 1
  fi
else
  echo "   ERRO: proxy /auth inacessível (HTTP $CODE)"
  exit 1
fi
echo ""

echo "2) Página de login (form action):"
HTML=$(curl -sk --max-time 15 \
  "${PROXY}/realms/${REALM}/protocol/openid-connect/auth?client_id=${VITE_KEYCLOAK_CLIENT_ID:-pontoeletronico-dev}&redirect_uri=${BASE}/ponto&response_type=code&scope=openid" \
  2>/dev/null || true)
ACTION=$(echo "$HTML" | grep -oE 'action="[^"]+"' | head -1 || true)
echo "   ${ACTION:-(form não encontrado)}"
if echo "$ACTION" | grep -q 'sso.cfo.org.br'; then
  echo "   ERRO: form ainda usa sso.cfo.org.br"
  exit 1
fi
if echo "$ACTION" | grep -q '/auth/'; then
  echo "   OK: form usa proxy /auth"
else
  echo "   ERRO: form action sem /auth/"
  exit 1
fi

echo ""
echo "3) Cookies e recursos estáticos:"
HDRS=$(curl -sk -D - -o /dev/null --max-time 15 \
  "${PROXY}/realms/${REALM}/protocol/openid-connect/auth?client_id=${VITE_KEYCLOAK_CLIENT_ID:-pontoeletronico-dev}&redirect_uri=${BASE}/ponto&response_type=code&scope=openid" \
  2>/dev/null || true)
if echo "$HDRS" | grep -i 'set-cookie' | grep -q 'Path=/auth/'; then
  echo "   OK: cookies com Path=/auth/"
else
  echo "   ERRO: cookies sem Path=/auth/ (causa 'Cookie não encontrado')"
  echo "$HDRS" | grep -i 'set-cookie' | head -2 | sed 's/^/   /'
  exit 1
fi
RES_PATH=$(echo "$HTML" | grep -oE 'src="/resources/[^"]+\.js"' | head -1 | sed 's/src="//;s/"$//' || true)
if [ -z "$RES_PATH" ]; then
  RES_PATH="/resources/vc6c9/login/cfo/js/authChecker.js"
fi
RES_CODE=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 \
  "${BASE%/}${RES_PATH}" 2>/dev/null || echo "000")
if [ "$RES_CODE" = "200" ]; then
  echo "   OK: /resources/... acessível (HTTP $RES_CODE)"
else
  echo "   ERRO: /resources/... retornou HTTP $RES_CODE"
  exit 1
fi

echo ""
echo "=== SSO proxy OK ==="
