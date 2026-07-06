#!/usr/bin/env bash
# Correção rápida do 502 na Gestão de Usuários (sem derrubar postgres).
# Execute como root: sudo ./scripts/quick-fix-502.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root: sudo $0"
  exit 1
fi

echo "=== 1/4 Patches (auth JWT + frontend) ==="
./scripts/fix-keycloak-admin-undici.sh
./scripts/apply-backend-auth-patches.sh
./scripts/apply-frontend-patches.sh

echo "=== 2/4 Recriando backend e web ==="
./scripts/docker-recreate.sh backend
./scripts/wait-backend.sh
./scripts/docker-recreate.sh web

echo "=== 3/4 Testes ==="
curl -s -o /dev/null -w "backend :12003 → %{http_code}\n" http://127.0.0.1:12003/api/auth/me || true
curl -sk -o /dev/null -w "nginx  :12010 → %{http_code}\n" https://127.0.0.1:12010/api/auth/me || true
curl -sk -o /dev/null -w "grupos :12010 → %{http_code}\n" https://127.0.0.1:12010/api/admin/keycloak/grupos || true

echo ""
echo "=== 4/4 Pronto ==="
echo "Recarregue a página (Ctrl+F5): https://192.168.161.50:12010/ponto/usuarios"
echo "Se ainda falhar, no Console do navegador após login:"
echo "  fetch('/api/auth/me',{headers:{Authorization:'Bearer '+keycloak.token}}).then(r=>r.status)"
echo "Deve retornar 200."
