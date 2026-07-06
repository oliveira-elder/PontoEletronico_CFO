#!/usr/bin/env bash
# Diagnóstico: login trava na tela do Keycloak (domínio ou IP).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE="${1:-${PONTO_BASE_URL:-https://ponto.cfo.org.br}}"
REALM="${VITE_KEYCLOAK_REALM:-cfo}"
CLIENT="${VITE_KEYCLOAK_CLIENT_ID:-pontoeletronico-dev}"
REDIRECT="${BASE%/}/ponto"
AUTH_URL="${BASE%/}/auth/realms/${REALM}/protocol/openid-connect/auth?client_id=${CLIENT}&redirect_uri=${REDIRECT}&response_type=code&scope=openid"

echo "=== Diagnóstico login SSO ==="
echo "Base:     $BASE"
echo "Redirect: $REDIRECT"
echo ""

SERVER_IP="${SERVER_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
DOMAIN_IP="$(getent hosts "$(echo "$BASE" | sed -E 's|https?://([^/:]+).*|\1|')" 2>/dev/null | awk '{print $1}' | head -1 || true)"
if [ -n "$DOMAIN_IP" ] && [ -n "$SERVER_IP" ] && [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
  echo "AVISO: DNS de $(echo "$BASE" | sed -E 's|https?://([^/:]+).*|\1|') → $DOMAIN_IP"
  echo "       IP deste servidor → $SERVER_IP"
  echo "       O domínio passa por proxy externo; teste também:"
  echo "       ./scripts/diagnose-login-stuck.sh https://${SERVER_IP}:12010"
  echo ""
fi

echo "1) OpenID (deve usar ${BASE}/auth, NÃO sso.cfo.org.br):"
OIDC=$(curl -sk --max-time 20 "${BASE%/}/auth/realms/${REALM}/.well-known/openid-configuration" 2>/dev/null || true)
if echo "$OIDC" | grep -q '"authorization_endpoint"'; then
  echo "$OIDC" | python3 -c "import sys,json; d=json.load(sys.stdin); print('   issuer:', d.get('issuer')); print('   auth:  ', d.get('authorization_endpoint'))"
  if echo "$OIDC" | grep -q 'sso.cfo.org.br'; then
    echo "   ERRO: ainda aponta para sso.cfo.org.br — reinicie nginx"
  fi
else
  echo "   ERRO: /auth inacessível ou sem JSON"
fi
echo ""

echo "2) Form action da página de login:"
HTML=$(curl -sk --max-time 20 "$AUTH_URL" 2>/dev/null || true)
ACTION=$(echo "$HTML" | grep -oE 'action="[^"]+"' | head -1 || true)
echo "   ${ACTION:-(não encontrado)}"
if echo "$ACTION" | grep -q 'sso.cfo.org.br'; then
  echo "   ERRO: form envia para sso.cfo.org.br (cookie não encontrado após Entrar)"
elif echo "$ACTION" | grep -q "${BASE#https://}"; then
  echo "   OK: form usa o mesmo host"
elif echo "$ACTION" | grep -q '/auth/'; then
  echo "   OK: form usa proxy /auth"
else
  echo "   AVISO: verifique se action usa host diferente do navegador"
fi
echo ""

echo "3) Cookies (Path deve ser /auth/realms/):"
curl -sk -D - -o /dev/null --max-time 20 "$AUTH_URL" 2>/dev/null \
  | grep -i set-cookie | head -3 | sed 's/^/   /' || echo "   (nenhum cookie)"
echo ""

echo "4) Redirect URI no Keycloak deve incluir:"
echo "   ${REDIRECT}"
echo "   ${REDIRECT}/*  (ou ${BASE}/*)"
echo ""

echo "5) Usuário AD: confira ortografia (ex.: elder.oliveira, não eider.oliveira)"
echo ""
echo "Após Entrar, abra F12 → Rede → POST .../login-actions/authenticate"
echo "  • 302 para ${REDIRECT}?code= → login OK, problema no app"
echo "  • 200 na mesma página → senha/usuário ou cookie"
echo "  • Mensagem 'Cookie não encontrado' → proxy /auth sem cookies Path=/auth/"
