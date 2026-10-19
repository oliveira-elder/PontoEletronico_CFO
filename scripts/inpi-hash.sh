#!/usr/bin/env bash
# Gera o resumo hash (SHA-256) do código-fonte da versão a registrar no INPI (e-Software).
#
# Uso:  scripts/inpi-hash.sh [referência-git]     (padrão: HEAD)
# Saída: pasta ./inpi-registro/ com o arquivo .tar.gz do código-fonte, a lista de arquivos e o SHA-256.
#
# Só entram arquivos versionados no git (sem node_modules, builds, .env ou uploads).
set -euo pipefail

REF="${1:-HEAD}"
# Raiz do projeto a partir do local do script (não depende do git).
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

# Quando quem executa não é o dono da pasta (ex.: root), o git recusa o repositório
# ("dubious ownership"). Libera só para esta execução, sem alterar configuração global.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0="$RAIZ"

if ! git rev-parse --verify "$REF" >/dev/null 2>&1; then
  echo "Referência git inválida: $REF" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "AVISO: há alterações não commitadas. O hash cobre somente o que está em ${REF}; faça o commit antes de registrar." >&2
fi

VERSAO="$(node -p "require('./packages/backend/package.json').version" 2>/dev/null || echo "desconhecida")"
COMMIT="$(git rev-parse "$REF")"
DATA="$(date +%Y%m%d-%H%M%S)"
SAIDA="inpi-registro"
NOME="codigo-fonte-v${VERSAO}-${COMMIT:0:10}"
mkdir -p "$SAIDA"

git archive --format=tar --prefix="${NOME}/" "$REF" | gzip -n > "${SAIDA}/${NOME}.tar.gz"
git ls-tree -r --name-only "$REF" | sort > "${SAIDA}/${NOME}.arquivos.txt"
HASH="$(sha256sum "${SAIDA}/${NOME}.tar.gz" | cut -d' ' -f1)"

{
  echo "Resumo hash do código-fonte — registro de programa de computador (INPI)"
  echo "Versão do programa : ${VERSAO}"
  echo "Referência git     : ${REF} (${COMMIT})"
  echo "Gerado em          : ${DATA}"
  echo "Arquivo            : ${SAIDA}/${NOME}.tar.gz"
  echo "Algoritmo          : SHA-256"
  echo "Hash               : ${HASH}"
  echo "Arquivos listados  : $(wc -l < "${SAIDA}/${NOME}.arquivos.txt")"
} | tee "${SAIDA}/${NOME}.hash.txt"

echo
echo "Informe o hash acima no e-Software (INPI) e na etapa 4 do checklist em Configurações > Institucional > REP-P."
