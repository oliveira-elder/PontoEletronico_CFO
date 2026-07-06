#!/usr/bin/env bash
# Wrapper Git do projeto (safe.directory + diretório raiz).
# Uso: ./scripts/git.sh status
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec git -c "safe.directory=${ROOT}" -C "${ROOT}" "$@"
