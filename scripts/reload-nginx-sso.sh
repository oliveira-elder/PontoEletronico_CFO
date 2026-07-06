#!/usr/bin/env bash
# Recarrega nginx após alterações em deploy/nginx/ (cookies /resources do SSO).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ "$(id -u)" -eq 0 ] || { echo "Execute como root"; exit 1; }
# shellcheck source=scripts/docker-lib.sh
source "$ROOT/scripts/docker-lib.sh"
"$ROOT/scripts/docker-recreate.sh" nginx
sleep 2
"$ROOT/scripts/verify-sso-proxy.sh"
