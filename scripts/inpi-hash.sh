#!/usr/bin/env bash
# Gera o pacote e o resumo hash (SHA-256) do código-fonte a registrar no INPI (e-Software):
# SOMENTE o núcleo de registro de ponto do REP-P (lista em packages/backend/rep-escopo.json).
#
# Uso:  scripts/inpi-hash.sh            (também: npm run rep:hash)
# Saída: pasta ./inpi-registro/ com o pacote .tar.gz, a lista de arquivos e o hash.
#
# O hash é determinístico: não depende de git, de commit, de datas nem do fim de linha (CRLF/LF).
# O hash a registrar é o "Hash do escopo" abaixo (mesmo valor mostrado em Sistema → Integridade do código).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

VERSAO="$(node -p "require('./packages/backend/package.json').version" 2>/dev/null || echo "desconhecida")"
SAIDA="inpi-registro"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Confere o lacre antes de gerar (avisa, mas não impede o registro de um escopo ainda não selado).
if ! npm run -s rep:verificar >/dev/null 2>&1; then
  echo "AVISO: o escopo difere do lacre (rep-escopo.lock.json). Rode npm run rep:verificar para ver os arquivos." >&2
fi

RESUMO="$(node node_modules/ts-node/dist/bin.js -P packages/backend/tsconfig.json --transpile-only \
  packages/backend/scripts/rep-escopo.ts pacote "$TMP/pacote")"
HASH="$(node -p "JSON.parse(process.argv[1]).hash" "$RESUMO")"
NOME="codigo-fonte-registro-v${VERSAO}-${HASH:0:10}"
mkdir -p "$SAIDA"

node -p "JSON.parse(process.argv[1]).itens.map(i => i.id + '  ' + i.sha256).join('\n')" "$RESUMO" \
  > "${SAIDA}/${NOME}.arquivos.txt"

# Pacote reprodutível (ordem fixa, sem datas nem donos).
tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
  -C "$TMP/pacote" -cf - . | gzip -n > "${SAIDA}/${NOME}.tar.gz"
PACOTE_HASH="$(sha256sum "${SAIDA}/${NOME}.tar.gz" | cut -d' ' -f1)"

{
  echo "Resumo hash do código-fonte — registro de programa de computador (INPI)"
  echo "Escopo             : núcleo de registro de ponto do REP-P (packages/backend/rep-escopo.json)"
  echo "Versão do programa : ${VERSAO}"
  echo "Algoritmo          : SHA-256"
  echo "Hash do escopo     : ${HASH}"
  echo "Como é calculado   : SHA-256 da lista ordenada 'arquivo<NUL>bytes<NUL>sha256-do-arquivo<LF>' (texto UTF-8, LF, sem BOM)"
  echo "Pacote (conferência): ${SAIDA}/${NOME}.tar.gz  (SHA-256 ${PACOTE_HASH})"
  echo "Arquivos listados  : $(wc -l < "${SAIDA}/${NOME}.arquivos.txt")  →  ${SAIDA}/${NOME}.arquivos.txt"
} | tee "${SAIDA}/${NOME}.hash.txt"

echo
echo "Informe o 'Hash do escopo' no e-Software (INPI) e na etapa 4 do checklist em Configurações > Institucional > REP-P."
