#!/usr/bin/env bash
# Opcional: /etc/hosts apenas NESTE servidor (não substitui DNS do AD nos clientes).
# Clientes na rede acessam via registro A no Active Directory — sem ajuste manual.
set -euo pipefail

HOSTNAME="ponto.cfo.local"

detect_server_ip() {
  local detected
  detected="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [ -n "${SERVER_IP:-}" ] && [ -n "$detected" ] && [ "$SERVER_IP" != "$detected" ]; then
    echo "AVISO: SERVER_IP no .env ($SERVER_IP) difere do IP desta máquina ($detected)." >&2
    echo "       Usando $detected para o DNS local (/etc/hosts)." >&2
  fi
  if [ -n "$detected" ]; then
    echo "$detected"
    return
  fi
  echo "${SERVER_IP:-}"
}

IP="$(detect_server_ip)"
if [ -z "$IP" ]; then
  echo "Defina SERVER_IP no .env ou verifique hostname -I." >&2
  exit 1
fi

LINE="$IP $HOSTNAME"
CURRENT="$(grep -E "[[:space:]]$HOSTNAME([[:space:]]|$)" /etc/hosts 2>/dev/null | head -1 || true)"

if [ "$CURRENT" = "$LINE" ]; then
  echo "OK: /etc/hosts já aponta $HOSTNAME → $IP"
  exit 0
fi

if [ -n "$CURRENT" ]; then
  echo "Atualizando entrada antiga:"
  echo "  - $CURRENT"
  echo "  + $LINE"
else
  echo "Adicionando: $LINE"
fi

TMP="$(mktemp)"
grep -vE "[[:space:]]${HOSTNAME}([[:space:]]|$)" /etc/hosts > "$TMP" 2>/dev/null || true
printf '%s\n' "$LINE" >> "$TMP"

if [ "$(id -u)" -eq 0 ]; then
  cp "$TMP" /etc/hosts
else
  sudo cp "$TMP" /etc/hosts
fi
rm -f "$TMP"

echo "OK. Resolução atual:"
getent hosts "$HOSTNAME" || true
echo "Teste: curl -kI --connect-timeout 3 https://$HOSTNAME/"
