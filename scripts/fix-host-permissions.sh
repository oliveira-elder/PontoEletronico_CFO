#!/usr/bin/env bash
# Corrige permissões no host (dist/node_modules criados como root dentro do Docker).
# Execute como root no servidor: sudo ./scripts/fix-host-permissions.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OWNER="${SUDO_USER:-${USER:-root}}"
if [ "$OWNER" = "root" ] && [ -d /home/gerti ]; then
  OWNER="gerti"
fi

echo "Corrigindo permissões em $ROOT (owner: $OWNER)..."
rm -rf packages/backend/dist 2>/dev/null || true
chown -R "$OWNER:$OWNER" packages/backend packages/web node_modules .git 2>/dev/null || true
chmod -R u+rwX packages/backend packages/web 2>/dev/null || true
echo "OK. Agora rode: ./scripts/docker-recreate.sh backend"
