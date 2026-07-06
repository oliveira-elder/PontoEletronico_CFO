#!/usr/bin/env bash
# Utilitários Git compartilhados (branch main, HTTPS + token).
set -euo pipefail

GIT_LIB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GIT_REPO="oliveira-elder/PontoEletronico_CFO"
GIT_HTTPS_URL="https://github.com/${GIT_REPO}.git"
GIT_BRANCH="main"

git_project() {
  git -c "safe.directory=${GIT_LIB_ROOT}" -C "$GIT_LIB_ROOT" "$@"
}

load_github_token() {
  if [ -n "${GITHUB_TOKEN:-}" ] || [ -n "${GH_TOKEN:-}" ]; then
    return 0
  fi
  if [ -f "${GIT_LIB_ROOT}/.env" ]; then
    local line
    line="$(grep -E '^[[:space:]]*GITHUB_TOKEN=' "${GIT_LIB_ROOT}/.env" | tail -1 || true)"
    if [ -n "$line" ]; then
      GITHUB_TOKEN="${line#*=}"
      GITHUB_TOKEN="${GITHUB_TOKEN#\"}"
      GITHUB_TOKEN="${GITHUB_TOKEN%\"}"
      GITHUB_TOKEN="${GITHUB_TOKEN#\'}"
      GITHUB_TOKEN="${GITHUB_TOKEN%\'}"
      export GITHUB_TOKEN
    fi
  fi
}

require_github_token() {
  load_github_token
  TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [ -z "$TOKEN" ]; then
    echo "Defina GITHUB_TOKEN (Personal Access Token com escopo repo)."
    echo "  export GITHUB_TOKEN=ghp_..."
    echo "  ou adicione GITHUB_TOKEN=... em .env (não versionado)"
    echo ""
    echo "Crie em: https://github.com/settings/tokens"
    exit 1
  fi
}

auth_remote_url() {
  echo "https://x-access-token:${TOKEN}@github.com/${GIT_REPO}.git"
}
