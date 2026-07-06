#!/usr/bin/env bash
# Atualiza a branch main a partir de origin (HTTPS + token).
set -euo pipefail

# shellcheck source=git-lib.sh
source "$(cd "$(dirname "$0")" && pwd)/git-lib.sh"

require_github_token

echo "Atualizando ${GIT_BRANCH} a partir de origin..."
git_project fetch "$(auth_remote_url)" "${GIT_BRANCH}"
git_project merge --ff-only "FETCH_HEAD"
echo "Pull concluído."
