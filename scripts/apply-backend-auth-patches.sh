#!/usr/bin/env bash
# Aplica patches de autenticação JWT no backend.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH="$ROOT/scripts/patches"
DEST="$ROOT/packages/backend/src/modules/auth"

cp "$PATCH/keycloak-jwks.loader.ts" "$DEST/keycloak-jwks.loader.ts"
cp "$PATCH/keycloak-jwt.strategy.ts" "$DEST/keycloak-jwt.strategy.ts"
echo "OK: patches de auth JWT aplicados em $DEST"
