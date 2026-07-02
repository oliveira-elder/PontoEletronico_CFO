#!/usr/bin/env bash
# Configura SSH para git push e publica commits em origin/main.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${GITHUB_SSH_KEY:-$HOME/.ssh/id_ed25519_github}"
PUB="${KEY}.pub"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ ! -f "$KEY" ]; then
  echo "Gerando chave SSH em $KEY ..."
  ssh-keygen -t ed25519 -C "elder.oliveira@cfo.org.br" -f "$KEY" -N ""
fi

chmod 600 "$KEY"
chmod 644 "$PUB"

cat >"$HOME/.ssh/config" <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
chmod 600 "$HOME/.ssh/config"

cd "$ROOT"
git remote set-url origin git@github.com:oliveira-elder/PontoEletronico_CFO.git

echo ""
echo "=== Chave pública (adicione em https://github.com/settings/keys) ==="
cat "$PUB"
echo "====================================================================="
echo ""

if ssh -o BatchMode=yes -T git@github.com 2>&1 | grep -qi 'successfully authenticated'; then
  echo "SSH OK — enviando commits..."
  git push -u origin main
  echo "Push concluído."
else
  echo "SSH ainda não autorizado no GitHub."
  echo "1. Copie a chave acima"
  echo "2. GitHub → Settings → SSH and GPG keys → New SSH key"
  echo "3. Execute novamente: ./scripts/git-push.sh"
  exit 1
fi
