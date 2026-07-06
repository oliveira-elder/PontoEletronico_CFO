#!/usr/bin/env bash
# Corrige login SSO: patches frontend + proxy /auth (nginx) + reinício.
# Rode como root no servidor ponto-cfo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root: sudo $0"
  exit 1
fi

# shellcheck source=scripts/docker-lib.sh
source "$ROOT/scripts/docker-lib.sh"

cleanup_stale_nginx() {
  echo "Removendo containers nginx antigos (nomes com - ou _)..."
  docker ps -aq --filter "name=pontoeletronico" | grep -E 'nginx' | xargs -r docker rm -f 2>/dev/null || true
}

wait_openid_json() {
  local url="$1"
  local tries="${2:-45}"
  local i body
  for i in $(seq 1 "$tries"); do
    body=$(curl -sk --max-time 5 "$url" 2>/dev/null | head -c 30 || true)
    if echo "$body" | grep -q '{'; then
      echo "   OpenID JSON OK (tentativa $i)"
      return 0
    fi
    sleep 2
  done
  return 1
}

echo "=== 1/5 Limpar nginx duplicado ==="
cleanup_stale_nginx

echo ""
echo "=== 2/5 Patches frontend ==="
"$ROOT/scripts/apply-frontend-patches.sh"
if ! grep -q 'rewriteKeycloakProxyBody' "$ROOT/packages/web/vite.config.ts"; then
  echo "ERRO: vite.config.ts não foi atualizado"
  exit 1
fi
if ! grep -q 'resolveKeycloakUrl' "$ROOT/packages/web/src/auth/keycloak.ts"; then
  echo "ERRO: keycloak.ts não foi atualizado"
  exit 1
fi
chown gerti:gerti \
  "$ROOT/packages/web/vite.config.ts" \
  "$ROOT/packages/web/src/auth/keycloak.ts" \
  "$ROOT/packages/web/src/auth/AuthContext.tsx" \
  "$ROOT/packages/web/src/hooks/useApi.ts" 2>/dev/null || true
echo "Patches OK"

echo ""
echo "=== 3/5 Reiniciar web + nginx ==="
"$ROOT/scripts/apply-frontend-patches.sh"
"$ROOT/scripts/docker-recreate.sh" web
"$ROOT/scripts/docker-recreate.sh" nginx
cleanup_stale_nginx

NGINX="$(docker_find_service_container nginx)"
if [ -z "$NGINX" ]; then
  echo "ERRO: container nginx não encontrado"
  exit 1
fi
docker exec "$NGINX" nginx -t
echo "nginx: $NGINX"

echo ""
echo "=== 4/5 Aguardar SSO (/auth → JSON, até 90s) ==="
OPENID_URL="${VITE_APP_BASE_URL:-https://127.0.0.1:12010}/auth/realms/${VITE_KEYCLOAK_REALM:-cfo}/.well-known/openid-configuration"
if ! wait_openid_json "$OPENID_URL" 45; then
  echo "ERRO: /auth não retorna JSON do Keycloak"
  echo "Logs nginx:"
  docker logs "$NGINX" --tail 20 2>&1 || true
  exit 1
fi

echo ""
echo "=== 5/5 Verificar proxy SSO ==="
"$ROOT/scripts/verify-sso-proxy.sh"

echo ""
echo "Pronto. Login: aba anônima → https://192.168.161.50:12010/login"
