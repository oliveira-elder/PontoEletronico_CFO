#!/usr/bin/env bash
# Aguarda o backend Nest responder (401/403/200 = API no ar).
set -euo pipefail

PORT="${PONTO_BACKEND_PORT:-12003}"
MAX_ATTEMPTS="${PONTO_BACKEND_WAIT_ATTEMPTS:-36}"
SLEEP_SEC="${PONTO_BACKEND_WAIT_SLEEP:-5}"

echo "Aguardando backend em :${PORT} (até $((MAX_ATTEMPTS * SLEEP_SEC))s)..."
for i in $(seq 1 "$MAX_ATTEMPTS"); do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/auth/me" 2>/dev/null || echo "000")
  if echo "$CODE" | grep -qE '^(401|403|200)$'; then
    echo "Backend OK (HTTP ${CODE})."
    exit 0
  fi
  if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
    echo "AVISO: backend ainda não responde (último código: ${CODE})."
    exit 1
  fi
  sleep "$SLEEP_SEC"
done
