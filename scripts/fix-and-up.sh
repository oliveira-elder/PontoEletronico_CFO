#!/usr/bin/env bash
# Corrige permissões + sobe stack completa. Execute como root no servidor:
#   cd /home/gerti/PontoEletronico_CFO && sudo ./scripts/fix-and-up.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root: sudo $0"
  exit 1
fi

echo "=== 1/6 Corrigindo keycloak-admin (sem undici) ==="
./scripts/fix-keycloak-admin-undici.sh

echo "=== 2/6 Patches auth JWT (backend + frontend) ==="
./scripts/apply-backend-auth-patches.sh
./scripts/apply-frontend-patches.sh

echo "=== 3/6 Permissões no host ==="
rm -rf packages/backend/dist 2>/dev/null || true
OWNER="gerti"
[ -d "/home/gerti" ] || OWNER="${SUDO_USER:-root}"
chown -R "$OWNER:$OWNER" packages/backend packages/web .git 2>/dev/null || true
chmod -R u+rwX packages/backend packages/web 2>/dev/null || true

echo "=== 4/6 Parando stack antiga ==="
docker ps -aq --filter "name=pontoeletronico_cfo" | xargs -r docker rm -f

echo "=== 5/6 Subindo postgres → backend → web → nginx ==="
export PONTO_PUBLISH_HTTPS_PORTS="${PONTO_PUBLISH_HTTPS_PORTS:-false}"
./scripts/docker-up.sh

echo "=== 6/6 Aguardando backend (até 3 min) ==="
./scripts/wait-backend.sh || {
  ./scripts/docker-logs-backend.sh || true
  exit 1
}

echo ""
echo "=== Testes ==="
curl -s -o /dev/null -w "backend :12003 → %{http_code}\n" http://127.0.0.1:12003/api/auth/me || true
curl -sk -o /dev/null -w "nginx  :12010 → %{http_code}\n" https://127.0.0.1:12010/api/auth/me || true
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'pontoeletronico|NAMES' || docker ps
echo ""
echo "Pronto. Acesse https://192.168.161.50:12010 e faça login."
