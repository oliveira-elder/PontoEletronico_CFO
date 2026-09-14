#!/usr/bin/env bash
# Limpa lixo do Docker sem afetar sistemas em execução.
#
# Faz:
#   - remove containers parados
#   - remove redes não usadas
#   - remove imagens não referenciadas por nenhum container
#   - remove cache de build com mais de 48 h
#
# Não faz:
#   - parar ou remover containers em execução
#   - docker compose down / restart
#   - apagar volumes (postgres e dados de qualquer stack)
set -euo pipefail

log() {
  echo "[$(date -Iseconds)] $*"
}

resolve_docker() {
  if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
  elif sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    log "ERRO: sem acesso ao Docker. Rode como root ou coloque o usuário no grupo docker."
    exit 1
  fi
}

running_ids() {
  "${DOCKER[@]}" ps -q | sort | tr -d ' '
}

resolve_docker

if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  log "ERRO: daemon Docker indisponível."
  exit 1
fi

ids_before="$(running_ids)"
n_before="$(printf '%s\n' "$ids_before" | grep -c '[0-9a-f]' || true)"

log "Início da limpeza. Containers em execução: ${n_before}"
"${DOCKER[@]}" system df || true

log "Removendo containers parados..."
"${DOCKER[@]}" container prune -f

log "Removendo redes não usadas..."
"${DOCKER[@]}" network prune -f

log "Removendo imagens dangling..."
"${DOCKER[@]}" image prune -f

log "Removendo imagens não usadas por nenhum container..."
"${DOCKER[@]}" image prune -af

log "Removendo cache de build com mais de 48h..."
"${DOCKER[@]}" builder prune -af --filter 'until=48h'

ids_after="$(running_ids)"
n_after="$(printf '%s\n' "$ids_after" | grep -c '[0-9a-f]' || true)"

if [ "$ids_before" != "$ids_after" ]; then
  log "ALERTA: a lista de containers em execução mudou durante a limpeza."
  log "Antes: ${n_before}  Depois: ${n_after}"
  log "Isso não deveria ocorrer. Verifique: docker ps -a"
  exit 2
fi

log "Limpeza concluída. Containers em execução intactos: ${n_after}"
"${DOCKER[@]}" system df || true
log "Fim."
