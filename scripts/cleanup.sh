#!/usr/bin/env bash
# Remove artefatos temporários do projeto (~2GB+ de backups npm, cache Docker, etc.).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
DOCKER_PRUNE=0
for arg in "$@"; do
  case "$arg" in
    -n | --dry-run) DRY_RUN=1 ;;
    --docker) DOCKER_PRUNE=1 ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

removed_bytes=0

remove_path() {
  local p="$1"
  if [ ! -e "$p" ]; then
    return 0
  fi
  local size
  size="$(du -sb "$p" 2>/dev/null | awk '{print $1}' || echo 0)"
  if [ "$DRY_RUN" -eq 1 ]; then
    du -sh "$p" 2>/dev/null || true
    echo "[dry-run] rm -rf $p"
  else
    if rm -rf "$p" 2>/dev/null; then
      removed_bytes=$((removed_bytes + size))
      echo "Removido: $p ($(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B"))"
    else
      echo "AVISO: sem permissão para remover $p (execute como root: sudo $0)" >&2
    fi
  fi
}

echo "=== Limpeza Ponto Eletrônico CFO ==="

# Backups deixados por scripts/deps-install.js (root no Docker)
while IFS= read -r -d '' dir; do
  remove_path "$dir"
done < <(find "$ROOT" -maxdepth 3 -type d \( \
  -name 'node_modules.bak.*' -o \
  -name 'node_modules.root.bak.*' \
  \) -print0 2>/dev/null)

# Instalações temporárias npm
while IFS= read -r -d '' dir; do
  remove_path "$dir"
done < <(find /tmp -maxdepth 1 -type d -name 'ponto-npm-*' -print0 2>/dev/null)

remove_path /tmp/ponto-new-objects
remove_path /tmp/ponto-git-objects

# Logs e caches locais
find "$ROOT" -type f \( -name '*.log' -o -name '.eslintcache' \) \
  -not -path '*/node_modules/*' \
  -not -path '*/node_modules.bak.*/*' \
  -not -path '*/node_modules.root.bak.*/*' \
  -print0 2>/dev/null \
  | while IFS= read -r -d '' f; do remove_path "$f"; done

# Git: stashes automáticos do lint-staged
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  stash_count="$(git stash list 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${stash_count:-0}" -gt 0 ]; then
    echo "Limpando $stash_count stash(es) git..."
    if [ "$DRY_RUN" -eq 0 ]; then
      git stash clear 2>/dev/null || true
    fi
  fi
  rm -f .git/gc.log 2>/dev/null || true
fi

# Docker (opcional)
if [ "$DOCKER_PRUNE" -eq 1 ] && command -v docker >/dev/null 2>&1; then
  echo "Prune Docker (imagens/containers não usados)..."
  if [ "$DRY_RUN" -eq 0 ]; then
    docker system prune -f 2>/dev/null || echo "AVISO: docker prune falhou (rodar como root?)" >&2
  else
    echo "[dry-run] docker system prune -f"
  fi
fi

echo ""
if [ "$DRY_RUN" -eq 0 ] && [ "$removed_bytes" -gt 0 ]; then
  echo "Total liberado: $(numfmt --to=iec "$removed_bytes" 2>/dev/null || echo "${removed_bytes} bytes")"
elif [ "$DRY_RUN" -eq 1 ]; then
  echo "Simulação concluída. Execute sem --dry-run para apagar."
else
  echo "Nada removido (ou faltou permissão — use: sudo ./scripts/cleanup.sh)"
fi
