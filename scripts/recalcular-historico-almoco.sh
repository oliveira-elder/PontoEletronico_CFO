#!/usr/bin/env bash
# Dispara o recálculo do histórico (almoço mínimo) para todos os funcionários.
# Uso:
#   TOKEN='eyJ...' ./scripts/recalcular-historico-almoco.sh
#   # ou, dentro do host com API local:
#   API_BASE=http://127.0.0.1:12003/api TOKEN='...' ./scripts/recalcular-historico-almoco.sh
set -euo pipefail

API_BASE="${API_BASE:-https://127.0.0.1:12010/api}"
if [ -z "${TOKEN:-}" ]; then
  echo "Defina TOKEN= (JWT de usuário RH_AUDITORIA ou ponto-admin)." >&2
  exit 1
fi

echo "POST $API_BASE/auditoria/recalcular-historico-almoco"
curl -sk -X POST "$API_BASE/auditoria/recalcular-historico-almoco" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -w "\nHTTP %{http_code}\n"
