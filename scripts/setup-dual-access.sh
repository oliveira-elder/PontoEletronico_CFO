#!/usr/bin/env bash
# Configura acesso dual: IP do servidor + https://ponto.cfo.org.br
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

chmod +x scripts/apply-frontend-patches.sh \
  scripts/generate-ponto-certs.sh \
  scripts/sync-keycloak-redirect-uris.sh \
  scripts/verify-dual-access.sh \
  scripts/verify-sso-proxy.sh 2>/dev/null || true

echo "=== 1/5 Patches frontend (SSO dinâmico por host) ==="
"$ROOT/scripts/apply-frontend-patches.sh"

echo ""
echo "=== 2/5 Certificado TLS (IP + ponto.cfo.org.br) ==="
"$ROOT/scripts/generate-ponto-certs.sh"

echo ""
echo "=== 3/5 Keycloak Redirect URIs ==="
if ! "$ROOT/scripts/sync-keycloak-redirect-uris.sh"; then
  echo ""
  echo "AVISO: sincronização automática falhou."
  echo "Peça à TI para adicionar as URIs listadas acima no client pontoeletronico-dev,"
  echo "ou configure KEYCLOAK_ADMIN_USER/PASSWORD no .env e rode este script de novo."
fi

echo ""
echo "=== 4/5 Reiniciar containers ==="
if command -v docker >/dev/null 2>&1; then
  if docker compose ps >/dev/null 2>&1; then
    docker compose up -d --force-recreate web nginx
    if [ -f docker/compose.https-ports.yml ] && ss -tln 2>/dev/null | grep -q ':443 '; then
      docker compose -f docker-compose.yml -f docker/compose.https-ports.yml up -d nginx
    fi
  else
    echo "Sem permissão no Docker — rode como root ou no grupo docker:"
    echo "  sudo docker compose up -d --force-recreate web nginx"
  fi
else
  echo "Docker não encontrado."
fi

echo ""
echo "=== 5/5 Validação SSO ==="
sleep 3
if [ -x "$ROOT/scripts/verify-dual-access.sh" ]; then
  "$ROOT/scripts/verify-dual-access.sh" || true
fi

echo ""
echo "Pronto."
echo "  Domínio: https://ponto.cfo.org.br/login"
echo "  IP:      https://${SERVER_IP:-$(hostname -I | awk '{print $1}')}:12010/login"
