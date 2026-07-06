#!/usr/bin/env bash
# Gera certificado autoassinado para ponto.cfo.local, ponto.cfo.org.br e IP do servidor.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/deploy/nginx/certs"
mkdir -p "$CERT_DIR"

IP="${SERVER_IP:-}"
if [ -z "$IP" ]; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
IP="${IP:-127.0.0.1}"

SAN="DNS:ponto.cfo.local,DNS:ponto.cfo.org.br,DNS:localhost,DNS:*.cfo.local,IP:127.0.0.1"
if [ "$IP" != "127.0.0.1" ]; then
  SAN="$SAN,IP:$IP"
fi

echo "Gerando certificado em $CERT_DIR (SAN: $SAN)"
openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout "$CERT_DIR/ponto.key" \
  -out "$CERT_DIR/ponto.crt" \
  -subj "/CN=ponto.cfo.local/O=Conselho Federal de Odontologia/C=BR" \
  -addext "subjectAltName=$SAN"

chmod 600 "$CERT_DIR/ponto.key"
echo "OK: $CERT_DIR/ponto.crt"
