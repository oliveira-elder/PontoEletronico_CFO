#!/usr/bin/env bash
# Sobe o stack Docker. Corrige incompatibilidade docker-compose 1.29 + Docker Engine 29
# (KeyError: ContainerConfig) removendo containers antigos antes do recreate.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_CMD=()
if docker compose version &>/dev/null; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Erro: instale Docker Compose (plugin v2 ou docker-compose)." >&2
  exit 1
fi

COMPOSE_FILES=(-f docker-compose.yml)
# 80/443 já estão em docker-compose.yml (nginx). O overlay https-ports
# só se usa se algum ambiente antigo remover essas portas do arquivo base.
if [ "${PONTO_USE_HTTPS_OVERLAY:-false}" = "true" ]; then
  COMPOSE_FILES+=(-f docker/compose.https-ports.yml)
  echo "Overlay HTTPS explícito: docker/compose.https-ports.yml"
fi

# Aviso se 443 já estiver ocupada no host (outro processo)
if ss -tln 2>/dev/null | grep -qE '(:|\.)443\s'; then
  echo "AVISO: porta 443 já em uso neste servidor — o bind do nginx pode falhar."
  echo "  Verifique: ss -tlnp | grep ':443'"
fi
PROJECT_PREFIX="pontoeletronico_cfo"

# Remove lixo acumulado (backups npm, caches) antes de subir
if [ -x "$ROOT/scripts/cleanup.sh" ]; then
  "$ROOT/scripts/cleanup.sh" 2>/dev/null || true
fi

echo "Parando stack (se existir)..."
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" down --remove-orphans 2>/dev/null || true

# docker-compose 1.29 falha ao recriar containers com metadados antigos no Docker 29+
if [ "${COMPOSE_CMD[0]}" = "docker-compose" ]; then
  echo "Removendo containers residuais do projeto (workaround ContainerConfig)..."
  docker ps -aq --filter "name=${PROJECT_PREFIX}" | xargs -r docker rm -f
fi

EXTRA=()
if [ "${1:-}" = "--build" ] || [ "${1:-}" = "-b" ]; then
  EXTRA=(--build)
fi

echo "Subindo serviços (postgres → backend → web → nginx)..."
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" up "${EXTRA[@]}" -d postgres
sleep 5
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" up "${EXTRA[@]}" -d backend
"$ROOT/scripts/wait-backend.sh" || {
  echo "AVISO: backend lento — verifique: ./scripts/docker-logs-backend.sh"
}
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" up "${EXTRA[@]}" -d web nginx

echo ""
echo "Aguardando Vite (web) — primeira subida pode levar alguns minutos..."
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:12010/" 2>/dev/null \
    || curl -kfsS -o /dev/null "https://127.0.0.1:12010/" 2>/dev/null; then
    echo "Frontend respondendo na porta 12010."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "AVISO: frontend ainda não responde. Logs: docker ps -a --filter name=web --filter name=pontoeletronico"
  fi
  sleep 5
done

echo ""
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" ps
