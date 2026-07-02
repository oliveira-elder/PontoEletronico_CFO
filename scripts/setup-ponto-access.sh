#!/usr/bin/env bash
# Certificados TLS + validação. DNS: registro A no AD (ponto.cfo.local) — já configurado pela TI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DETECTED_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
export SERVER_IP="${DETECTED_IP:-${SERVER_IP:-}}"

chmod +x scripts/generate-ponto-certs.sh scripts/verify-ponto-access.sh
./scripts/generate-ponto-certs.sh

# Opcional: entrada em /etc/hosts só neste servidor (não afeta PCs clientes).
if [ "${SETUP_SERVER_HOSTS:-0}" = "1" ] && [ -x scripts/setup-local-dns.sh ]; then
  ./scripts/setup-local-dns.sh || echo "AVISO: /etc/hosts do servidor não atualizado."
fi

echo ""
echo "DNS: clientes usam o registro A do Active Directory (ponto.cfo.local)."
echo "     Confirme na TI que o IP do registro é: ${SERVER_IP:-<IP deste servidor>}"
echo ""
echo "Suba o stack: docker compose up -d"
echo "Valide:       ./scripts/verify-ponto-access.sh"
echo ""
echo "Acesso: https://ponto.cfo.local/"
echo "Keycloak Redirect URIs: https://ponto.cfo.local/*"
