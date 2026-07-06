#!/usr/bin/env bash
# Sincroniza Redirect URIs / Web Origins do client SPA no Keycloak a partir de
# docker/ponto-web-config.json (acesso por IP, ponto.cfo.org.br e ponto.cfo.local).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CONFIG="$ROOT/docker/ponto-web-config.json"
REALM="${VITE_KEYCLOAK_REALM:-cfo}"
CLIENT_ID="${VITE_KEYCLOAK_CLIENT_ID:-pontoeletronico-dev}"
BASE="${KEYCLOAK_URL:-http://192.168.100.112:8080}"
BASE="${BASE%/}"

if [ ! -f "$CONFIG" ]; then
  echo "Arquivo ausente: $CONFIG"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 é necessário para ler $CONFIG"
  exit 1
fi

get_token() {
  if [ -n "${KEYCLOAK_ADMIN_USER:-}" ] && [ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
    curl -sk --max-time 20 -X POST "${BASE}/realms/master/protocol/openid-connect/token" \
      -d "grant_type=password" \
      -d "client_id=admin-cli" \
      -d "username=${KEYCLOAK_ADMIN_USER}" \
      -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
    return
  fi
  if [ -n "${KEYCLOAK_SERVICE_CLIENT_ID:-}" ] && [ -n "${KEYCLOAK_SERVICE_CLIENT_SECRET:-}" ]; then
    curl -sk --max-time 20 -X POST "${BASE}/realms/${REALM}/protocol/openid-connect/token" \
      -d "grant_type=client_credentials" \
      -d "client_id=${KEYCLOAK_SERVICE_CLIENT_ID}" \
      -d "client_secret=${KEYCLOAK_SERVICE_CLIENT_SECRET}" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
    return
  fi
  echo ""
}

print_manual() {
  echo ""
  echo "Adicione manualmente no Keycloak → Clients → $CLIENT_ID:"
  python3 -c "
import json
with open('$CONFIG') as f:
    d = json.load(f)
print('  Valid Redirect URIs:')
for u in d.get('redirectUris', []):
    print('   ', u)
print('  Web Origins:')
for u in d.get('webOrigins', []):
    print('   ', u)
"
}

echo "=== Sincronizar Keycloak: $CLIENT_ID ==="
echo "Realm: $REALM"
echo "Keycloak: $BASE"
echo ""

TOKEN="$(get_token)"
if [ -z "$TOKEN" ]; then
  echo "ERRO: não foi possível obter token admin."
  echo "Configure KEYCLOAK_ADMIN_USER/PASSWORD ou KEYCLOAK_SERVICE_CLIENT_* no .env"
  print_manual
  exit 1
fi

INTERNAL_ID=$(curl -sk --max-time 20 \
  -H "Authorization: Bearer $TOKEN" \
  "${BASE}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")

if [ -z "$INTERNAL_ID" ]; then
  echo "ERRO: client '$CLIENT_ID' não encontrado (ou sem permissão view-clients no service account)."
  print_manual
  exit 1
fi

TMP_CLIENT=$(mktemp)
TMP_RESULT=$(mktemp)
trap 'rm -f "$TMP_CLIENT" "$TMP_RESULT"' EXIT

curl -sk --max-time 20 \
  -H "Authorization: Bearer $TOKEN" \
  "${BASE}/admin/realms/${REALM}/clients/${INTERNAL_ID}" \
  -o "$TMP_CLIENT"

HTTP_CODE=$(python3 <<PY
import json, os, urllib.request, urllib.error

config_path = "$CONFIG"
client_path = "$TMP_CLIENT"
token = """$TOKEN"""
realm = "$REALM"
base = "$BASE"
internal_id = "$INTERNAL_ID"

with open(config_path) as f:
    cfg = json.load(f)
with open(client_path) as f:
    client = json.load(f)

client["redirectUris"] = sorted(set(cfg.get("redirectUris", [])))
client["webOrigins"] = sorted(set(cfg.get("webOrigins", []) + ["+"]))
client["attributes"] = client.get("attributes") or {}
client["attributes"]["post.logout.redirect.uris"] = " ".join(
    sorted(set(cfg.get("postLogoutRedirectUris", [])))
)

payload = json.dumps(client).encode()
req = urllib.request.Request(
    f"{base}/admin/realms/{realm}/clients/{internal_id}",
    data=payload,
    method="PUT",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    },
)
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        print(resp.status)
except urllib.error.HTTPError as e:
    print(e.code)
PY
)

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "OK: Redirect URIs e Web Origins atualizados no Keycloak."
  python3 -c "
import json
with open('$CONFIG') as f:
    d = json.load(f)
for u in d.get('redirectUris', []):
    print(' ', u)
"
else
  echo "ERRO: Keycloak retornou HTTP $HTTP_CODE"
  echo "O service account pode precisar da role realm-management:manage-clients."
  print_manual
  exit 1
fi
