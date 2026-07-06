#!/usr/bin/env bash
# Publica commits em origin/main via HTTPS + Personal Access Token.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="oliveira-elder/PontoEletronico_CFO"
HTTPS_URL="https://github.com/${REPO}.git"

cd "$ROOT"

GIT_SAFE=(git -c safe.directory="$ROOT")
"${GIT_SAFE[@]}" remote set-url origin "$HTTPS_URL"

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "Defina GITHUB_TOKEN (Personal Access Token com escopo repo)."
  echo "  export GITHUB_TOKEN=ghp_..."
  echo "  ./scripts/git-push.sh"
  echo ""
  echo "Crie em: https://github.com/settings/tokens"
  exit 1
fi

echo "Enviando commits para origin/main (HTTPS + token)..."
"${GIT_SAFE[@]}" push "https://x-access-token:${TOKEN}@github.com/${REPO}.git" HEAD:main
echo "Push concluído."
