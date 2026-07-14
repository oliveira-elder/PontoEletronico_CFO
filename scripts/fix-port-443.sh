#!/usr/bin/env bash
# Libera a porta 443 (e sobe o nginx do Ponto).
# Uso: sudo ./scripts/fix-port-443.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root: sudo $0" >&2
  exit 1
fi

if docker compose version &>/dev/null; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi

echo "==> Quem está usando 443/80?"
ss -tlnp | grep -E ':443|:80\s' || echo "(ss sem match)"
echo

echo "==> Containers nginx/ponto (todos, inclusive parados):"
docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -iE 'nginx|ponto|NAMES' || true
echo

# Remove containers antigos do mesmo projeto (V1 underscore vs V2 hyphen)
echo "==> Removendo containers nginx órfãos / antigos do projeto..."
docker ps -aq --filter "name=pontoeletronico_cfo" --filter "name=pontoeletronico-cfo" | while read -r id; do
  name=$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null || true)
  if echo "$name" | grep -qi nginx; then
    echo "  removendo $name ($id)"
    docker rm -f "$id" 2>/dev/null || true
  fi
done

# docker-proxy órfão às vezes segura a porta sem container vivo
if ss -tln | grep -qE '(:|\.)443\s'; then
  echo "==> Ainda há bind em 443 — listando PIDs:"
  # shellcheck disable=SC2009
  ps aux | grep -E 'docker-proxy|nginx' | grep -v grep || true
  for pid in $(lsof -t -iTCP:443 -sTCP:LISTEN 2>/dev/null || true); do
    echo "  matando PID $pid ($(ps -p "$pid" -o comm= 2>/dev/null || unknown))"
    kill -9 "$pid" 2>/dev/null || true
  done
  # fallback: fuser
  if command -v fuser >/dev/null 2>&1; then
    fuser -k 443/tcp 2>/dev/null || true
  fi
fi

sleep 1
echo "==> Estado das portas após limpeza:"
ss -tln | grep -E ':443|:80\s|:12010' || echo "(livres / só 12010)"
echo

echo "==> Subindo nginx (+ dependências)..."
"${COMPOSE[@]}" -f docker-compose.yml up -d nginx

echo
echo "==> Status:"
"${COMPOSE[@]}" -f docker-compose.yml ps
echo
ss -tln | grep -E ':443|:80\s|:12010' || true
echo
echo "Teste: curl -sk -o /dev/null -w '%{http_code}\\n' https://127.0.0.1/"
curl -sk -o /dev/null -w "https://127.0.0.1/ → %{http_code}\n" https://127.0.0.1/ || true
curl -sk -o /dev/null -w "https://127.0.0.1:12010/ → %{http_code}\n" https://127.0.0.1:12010/ || true
