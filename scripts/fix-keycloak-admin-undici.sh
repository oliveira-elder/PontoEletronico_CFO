#!/usr/bin/env bash
# Substitui import de undici por axios+https (já dependência do backend).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/packages/backend/src/modules/admin/keycloak-admin.service.ts"
PATCH="$ROOT/scripts/patches/keycloak-admin.service.ts"

if [ ! -f "$PATCH" ]; then
  echo "Patch não encontrado: $PATCH"
  exit 1
fi

cp "$PATCH" "$SRC"
echo "OK: $SRC (Keycloak Admin API + timeout 15s)"
