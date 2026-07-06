#!/usr/bin/env bash
# Publica commits da branch main em origin (HTTPS + Personal Access Token).
set -euo pipefail

# shellcheck source=git-lib.sh
source "$(cd "$(dirname "$0")" && pwd)/git-lib.sh"

require_github_token

git_project remote set-url origin "$GIT_HTTPS_URL"

CURRENT="$(git_project rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT" != "$GIT_BRANCH" ]; then
  echo "Erro: checkout em '${CURRENT}'. Use a branch ${GIT_BRANCH}."
  exit 1
fi

echo "Enviando commits para origin/${GIT_BRANCH} (HTTPS + token)..."
git_project push "$(auth_remote_url)" "HEAD:${GIT_BRANCH}"
git_project fetch "$(auth_remote_url)" "+${GIT_BRANCH}:refs/remotes/origin/${GIT_BRANCH}"
echo "Push concluído."
