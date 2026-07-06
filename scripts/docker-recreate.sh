#!/usr/bin/env bash
# Recria um serviço sem o bug ContainerConfig (docker-compose 1.29 + Docker 29).
# Uso: ./scripts/docker-recreate.sh backend
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/docker-lib.sh
source "$ROOT/scripts/docker-lib.sh"

SERVICE="${1:?Informe o serviço (ex.: web, backend, nginx, postgres)}"
BUILD=0
[ "${2:-}" = "--build" ] && BUILD=1

read -r -a COMPOSE_CMD <<<"$(docker_compose_cmd)"
mapfile -t COMPOSE_FILES < <(docker_compose_files)

echo "Parando ${SERVICE}..."
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" stop "$SERVICE" 2>/dev/null || true

echo "Removendo containers antigos de ${SERVICE}..."
docker_rm_service_containers "$SERVICE"

EXTRA=()
[ "$BUILD" -eq 1 ] && EXTRA=(--build)

echo "Subindo ${SERVICE}..."
if [ "$SERVICE" = "backend" ]; then
  # Garante postgres antes do backend
  "${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" up -d postgres
  sleep 3
fi

"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" up -d "${EXTRA[@]}" "$SERVICE"

if [ "$SERVICE" = "backend" ]; then
  "$ROOT/scripts/wait-backend.sh" || true
  NGINX="$(docker_find_service_container nginx)"
  if [ -n "$NGINX" ]; then
    echo "Recarregando nginx (DNS do backend)..."
    docker exec "$NGINX" nginx -s reload 2>/dev/null || true
  fi
fi

echo ""
"${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" ps

FOUND="$(docker_find_service_container "$SERVICE")"
if [ -n "$FOUND" ]; then
  echo ""
  echo "Container: $FOUND"
else
  echo ""
  echo "AVISO: container de ${SERVICE} não encontrado após o up."
  echo "Se falhou com ContainerConfig, rode: ./scripts/docker-up.sh"
fi
