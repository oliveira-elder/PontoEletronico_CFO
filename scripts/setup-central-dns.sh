#!/usr/bin/env bash
# Gera configuração do CoreDNS (ponto.cfo.local → IP do servidor).
# Clientes resolvem o nome SEM /etc/hosts se a TI configurar:
#   (A) registro A no DNS do Active Directory (cfo.local), ou
#   (B) DHCP apontando o DNS para o IP deste servidor.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

HOSTNAME="ponto.cfo.local"
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
SERVER_IP="${SERVER_IP:-${SERVER_IP_ENV:-}}"

if [ -z "$SERVER_IP" ]; then
  echo "Não foi possível detectar o IP do servidor (hostname -I)." >&2
  exit 1
fi

UPSTREAM="${CORP_DNS_SERVERS:-8.8.8.8}"
OUT_DIR="$ROOT/deploy/dns/generated"
mkdir -p "$OUT_DIR"

sed "s/__SERVER_IP__/$SERVER_IP/g" "$ROOT/deploy/dns/hosts.template" > "$OUT_DIR/hosts"
sed "s|__UPSTREAM_DNS__|$UPSTREAM|g" "$ROOT/deploy/dns/Corefile.template" > "$OUT_DIR/Corefile"

echo "DNS interno gerado:"
echo "  $HOSTNAME → $SERVER_IP"
echo "  Encaminhamento (demais nomes): $UPSTREAM"
echo "  Arquivos: $OUT_DIR/"
echo ""
echo "══════════════════════════════════════════════════════════════"
echo " PARA CLIENTES ACESSAREM https://ponto.cfo.local/ SEM AJUSTE"
echo " EM CADA PC, A TI DO CFO DEVE FAZER UMA OPÇÃO (uma vez só):"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "OPÇÃO A — Active Directory (recomendado se PCs estão no domínio):"
echo "  Registro A: ponto.cfo.local → $SERVER_IP"
echo "  No controlador de domínio (PowerShell como Admin):"
echo "    .\\scripts\\registrar-dns-ad.ps1 -IPv4Address $SERVER_IP"
echo ""
echo "OPÇÃO B — DHCP da rede:"
echo "  Definir servidor DNS primário = $SERVER_IP"
echo "  (este host com 'docker compose up -d' sobe o serviço dns na porta 53)"
echo ""
echo "Depois: docker compose up -d dns nginx web backend"
echo "Teste na rede: nslookup $HOSTNAME $SERVER_IP"
