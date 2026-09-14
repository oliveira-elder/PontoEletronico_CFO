#!/usr/bin/env bash
# Instala o timer systemd da limpeza Docker e executa uma passagem agora.
# Requer root. Não para stacks em execução e não apaga volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_SRC="$ROOT/scripts/docker-prune-safe.sh"
UNIT_SRC="$ROOT/docker/systemd"
SCRIPT_DST="/usr/local/sbin/docker-prune-safe.sh"
SERVICE_DST="/etc/systemd/system/docker-prune-safe.service"
TIMER_DST="/etc/systemd/system/docker-prune-safe.timer"

if [ "$(id -u)" -ne 0 ]; then
  echo "Reexecutando com sudo..."
  exec sudo --preserve-env=PATH "$0" "$@"
fi

if [ ! -x "$SCRIPT_SRC" ] && [ ! -f "$SCRIPT_SRC" ]; then
  echo "Script não encontrado: $SCRIPT_SRC" >&2
  exit 1
fi

install -m 0755 "$SCRIPT_SRC" "$SCRIPT_DST"
install -m 0644 "$UNIT_SRC/docker-prune-safe.service" "$SERVICE_DST"
install -m 0644 "$UNIT_SRC/docker-prune-safe.timer" "$TIMER_DST"

systemctl daemon-reload
systemctl enable --now docker-prune-safe.timer

echo "Timer ativo:"
systemctl list-timers docker-prune-safe.timer --no-pager || true

echo ""
echo "Executando limpeza agora (containers em execução e volumes permanecem)..."
"$SCRIPT_DST"

echo ""
echo "Instalado. Próxima execução automática: 06:30 UTC (03:30 Brasília)."
echo "Logs: journalctl -u docker-prune-safe.service -n 50"
