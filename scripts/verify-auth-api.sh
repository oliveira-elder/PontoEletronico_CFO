#!/usr/bin/env bash
# Diagnóstico de autenticação API + JWKS do Keycloak no servidor.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKEND="${BACKEND_CONTAINER:-pontoeletronico_cfo_backend_1}"
NGINX="${NGINX_CONTAINER:-pontoeletronico_cfo_nginx_1}"
BASE_URL="${PONTO_BASE_URL:-https://127.0.0.1:12010}"

echo "=== Diagnóstico Auth API ==="
echo "Backend: $BACKEND"
echo "Base URL: $BASE_URL"
echo ""

fail() {
  echo "FALHA: $1"
  exit 1
}

docker ps --format '{{.Names}}' | grep -q "^${BACKEND}$" || fail "container backend não encontrado ($BACKEND)"

echo "1) Variáveis no backend:"
docker exec "$BACKEND" printenv KEYCLOAK_ISSUER KEYCLOAK_JWKS_URI KEYCLOAK_JWKS_TLS_INSECURE 2>/dev/null || true
echo ""

set -a
# shellcheck disable=SC1091
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a

JWKS_TEST_URI="${KEYCLOAK_JWKS_URI:-http://192.168.100.112:8080/realms/cfo/protocol/openid-connect/certs}"

echo "2) JWKS do Keycloak (dentro do backend):"
if docker exec "$BACKEND" curl -skI "$JWKS_TEST_URI" | head -1; then
  echo "   JWKS acessível"
else
  echo "   ERRO: backend não alcança o JWKS do SSO"
fi
echo ""

echo "3) /api/auth/me sem token (esperado 401):"
CODE=$(curl -kfsS -o /dev/null -w '%{http_code}' "${BASE_URL}/api/auth/me" 2>/dev/null || echo "000")
echo "   HTTP $CODE"
[ "$CODE" = "401" ] || echo "   AVISO: esperava 401 sem Bearer"
echo ""

echo "4) Proxy nginx → backend (/api):"
if docker ps --format '{{.Names}}' | grep -q nginx; then
  docker exec "$NGINX" wget -qO- http://backend:3000/api/auth/me 2>&1 | head -3 || true
else
  echo "   nginx não encontrado — testando via host"
  curl -kfsS "${BASE_URL}/api/auth/me" 2>&1 | head -3 || true
fi
echo ""

echo "5) Logs recentes do backend (erros JWT):"
docker logs "$BACKEND" 2>&1 | tail -20
echo ""
echo "=== Próximo passo no navegador ==="
echo "Após login, no Console:"
echo "  fetch('/api/auth/me',{headers:{Authorization:'Bearer '+keycloak.token}}).then(r=>r.status)"
echo "Deve retornar 200. Se 401, o JWT ainda não é aceito pelo backend."
