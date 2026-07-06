#!/usr/bin/env bash
# Atualiza cache local das chaves públicas do Keycloak (JWKS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/keycloak/jwks.json"
URI="${KEYCLOAK_JWKS_URI:-http://192.168.100.112:8080/realms/cfo/protocol/openid-connect/certs}"

mkdir -p "$(dirname "$OUT")"
echo "Baixando JWKS de $URI ..."
if curl -fsSL --max-time 30 -k "$URI" -o "$OUT.tmp"; then
  mv "$OUT.tmp" "$OUT"
  echo "OK: $OUT"
else
  rm -f "$OUT.tmp"
  if [ -f "$OUT" ]; then
    echo "AVISO: download falhou — mantendo cache existente em $OUT"
    exit 0
  fi
  echo "ERRO: não foi possível baixar JWKS e não há cache local."
  exit 1
fi
