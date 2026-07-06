#!/usr/bin/env bash
# Configura Git local deste projeto: branch main, origin HTTPS, safe.directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${ROOT}/.git/config"
REPO="oliveira-elder/PontoEletronico_CFO"
HTTPS_URL="https://github.com/${REPO}.git"
GIT_BRANCH="main"

if [ ! -d "${ROOT}/.git" ]; then
  echo "Erro: ${ROOT} não é um repositório Git."
  exit 1
fi

# safe.directory — necessário quando o dono do diretório difere do usuário atual
if ! grep -qF "directory = ${ROOT}" "$CONFIG" 2>/dev/null; then
  if grep -q '^\[safe\]' "$CONFIG" 2>/dev/null; then
    if ! grep -qF "${ROOT}" "$CONFIG"; then
      sed -i "/^\[safe\]/a\\\tdirectory = ${ROOT}" "$CONFIG"
    fi
  else
    printf '\n[safe]\n\tdirectory = %s\n' "$ROOT" >>"$CONFIG"
  fi
  echo "OK: safe.directory → ${ROOT}"
fi

git_project() {
  git -c "safe.directory=${ROOT}" -C "$ROOT" "$@"
}

git_project remote set-url origin "$HTTPS_URL"
echo "OK: origin → ${HTTPS_URL}"

git_project checkout "$GIT_BRANCH" 2>/dev/null || git_project checkout -b main
git_project branch --set-upstream-to="origin/${GIT_BRANCH}" "$GIT_BRANCH" 2>/dev/null || true
echo "OK: branch ${GIT_BRANCH} rastreia origin/${GIT_BRANCH}"

echo ""
echo "Git configurado. Comandos Git neste projeto:"
echo "  ./scripts/git.sh status"
echo "  ./scripts/git-pull.sh"
echo "  ./scripts/git-push.sh"
echo ""
echo "Token: adicione GITHUB_TOKEN em .env (veja .env.example)"
