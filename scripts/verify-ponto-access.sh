#!/usr/bin/env bash
# Valida acesso via DNS corporativo (AD) — clientes não precisam de /etc/hosts.
set -euo pipefail

HOSTNAME="ponto.cfo.local"
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
RESOLVED_IP="$(getent hosts "$HOSTNAME" 2>/dev/null | awk '{print $1}' | head -1 || true)"

# Resolução via DNS (ignora só o arquivo hosts, se possível)
DNS_IP=""
if command -v dig >/dev/null 2>&1; then
  NS="$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null || true)"
  if [ -n "$NS" ]; then
    DNS_IP="$(dig +short "$HOSTNAME" A @"$NS" 2>/dev/null | head -1 || true)"
  fi
  if [ -z "$DNS_IP" ]; then
    DNS_IP="$(dig +short "$HOSTNAME" A 2>/dev/null | head -1 || true)"
  fi
fi

HOSTS_OVERRIDE=""
if grep -qE "[[:space:]]${HOSTNAME}([[:space:]]|$)" /etc/hosts 2>/dev/null; then
  HOSTS_OVERRIDE="$(grep -E "[[:space:]]${HOSTNAME}([[:space:]]|$)" /etc/hosts | head -1)"
fi

echo "=== Diagnóstico $HOSTNAME (DNS corporativo) ==="
echo "IP desta máquina:     ${SERVER_IP:-?}"
echo "Resolução (nss):      ${RESOLVED_IP:-NÃO RESOLVE}"
echo "Resolução (DNS AD):   ${DNS_IP:-não verificado (instale dig)}"
if [ -n "$HOSTS_OVERRIDE" ]; then
  echo "/etc/hosts (servidor): $HOSTS_OVERRIDE"
  echo "  (no servidor só; clientes usam o DNS do AD)"
fi
echo ""

check_ip() {
  local label="$1"
  local ip="$2"
  if [ -z "$ip" ]; then
    echo "AVISO: $label sem IP"
    return 1
  fi
  if [ -n "$SERVER_IP" ] && [ "$ip" != "$SERVER_IP" ]; then
    echo "ERRO: $label aponta para $ip, mas este servidor é $SERVER_IP"
    echo "      Peça à TI para corrigir o registro A no AD: ponto.cfo.local → $SERVER_IP"
    return 1
  fi
  return 0
}

FAIL=0
check_ip "DNS AD" "$DNS_IP" || FAIL=1
if [ -z "$DNS_IP" ]; then
  check_ip "Resolução local" "$RESOLVED_IP" || FAIL=1
fi

for port in 443 12010; do
  if ss -tln 2>/dev/null | grep -qE "(:|\\])${port}[[:space:]]"; then
    echo "Porta $port: OK"
  else
    if [ "$port" = "443" ]; then
      echo "Porta 443: indisponível (outro serviço no host ou use :12010)"
    else
      echo "Porta $port: FALHA (nginx/stack parado?)"
      FAIL=1
    fi
  fi
done

echo "Teste HTTPS:"
HTTPS_OK=0
if curl -kfsS --connect-timeout 5 -o /dev/null -w "HTTP %{http_code}\n" "https://${HOSTNAME}/"; then
  echo "OK: https://${HOSTNAME}/"
  HTTPS_OK=1
elif curl -kfsS --connect-timeout 5 -o /dev/null -w "HTTP %{http_code}\n" "https://${HOSTNAME}:12010/"; then
  echo "OK: https://${HOSTNAME}:12010/ (porta 443 ocupada no host)"
  HTTPS_OK=1
else
  echo "FALHA: https://${HOSTNAME}/ e https://${HOSTNAME}:12010/"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then
  echo ""
  echo "Clientes na rede: basta abrir https://ponto.cfo.local/ (DNS do AD, sem /etc/hosts)."
  exit 0
fi
exit 1
