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
if [ "${PONTO_PUBLISH_HTTPS_PORTS:-auto}" != "false" ]; then
  PORT_443_FREE=1
  if ss -tln 2>/dev/null | grep -qE '(:|\])443\s'; then
    PORT_443_FREE=0
  fi
  if [ "$PORT_443_FREE" -eq 1 ] || [ "${PONTO_PUBLISH_HTTPS_PORTS:-}" = "true" ]; then
    COMPOSE_FILES+=(-f docker/compose.https-ports.yml)
    echo "Porta 443 livre: publicando 80/443 + 12010 (https://ponto.cfo.local/)"
  else
    echo "AVISO: porta 443 já em uso neste servidor."
    echo "  Subindo só na 12010 → https://ponto.cfo.local:12010/"
    echo "  Para ver o que usa 443: ss -tlnp | grep ':443'"
    echo "  Depois de liberar 443: PONTO_PUBLISH_HTTPS_PORTS=true ./scripts/docker-up.sh"
  fi
fi

PROJECT_PREFIX="pontoeletronico_cfo"

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

echo "Subindo serviços..."
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" up "${EXTRA[@]}" -d

echo ""
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" ps
