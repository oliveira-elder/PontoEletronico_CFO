#!/usr/bin/env bash
# Funções compartilhadas pelos scripts Docker (compose v1/v2, nomes com - ou _).

docker_compose_cmd() {
  if docker compose version &>/dev/null; then
    echo "docker compose"
  elif command -v docker-compose &>/dev/null; then
    echo "docker-compose"
  else
    echo "Erro: Docker Compose não encontrado." >&2
    return 1
  fi
}

docker_compose_files() {
  local files=(-f docker-compose.yml)
  if [ "${PONTO_PUBLISH_HTTPS_PORTS:-auto}" != "false" ]; then
    if ! ss -tln 2>/dev/null | grep -qE '(:|\])443\s'; then
      files+=(-f docker/compose.https-ports.yml)
    fi
  fi
  printf '%s\n' "${files[@]}"
}

# Encontra container do serviço (ex.: backend → pontoeletronico_cfo-backend-1 ou _backend_1)
docker_find_service_container() {
  local service="$1"
  docker ps -a --format '{{.Names}}' \
    | grep -E "pontoeletronico_cfo[-_]${service}[-_]?[0-9]*$" \
    | head -1
}

docker_rm_service_containers() {
  local service="$1"
  docker ps -aq --filter "name=pontoeletronico_cfo-${service}" | xargs -r docker rm -f
  docker ps -aq --filter "name=pontoeletronico_cfo_${service}" | xargs -r docker rm -f
}
