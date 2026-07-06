#!/usr/bin/env bash
# Aplica patches do frontend (arquivos em scripts/patches/).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH_DIR="$ROOT/scripts/patches"

apply() {
  local name="$1"
  local dest="$2"
  local src="$PATCH_DIR/$name"
  if [ ! -f "$src" ]; then
    echo "Patch ausente: $src"
    return 1
  fi
  cp "$src" "$dest"
  echo "OK: $dest"
}

apply "useApi.ts" "$ROOT/packages/web/src/hooks/useApi.ts"
apply "AuthContext.tsx" "$ROOT/packages/web/src/auth/AuthContext.tsx"
apply "keycloak.ts" "$ROOT/packages/web/src/auth/keycloak.ts"
apply "vite.config.ts" "$ROOT/packages/web/vite.config.ts"
