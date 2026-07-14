#!/bin/bash
# Força o backend a usar o dist do host (sem volume antigo) e limpa cache do Vite.
set -euo pipefail
cd /home/gerti/PontoEletronico_CFO

echo "==> Build backend no host"
npm run build -w @intranet/backend

echo "==> Recria backend/web sem o volume backend_dist antigo"
docker compose up -d --force-recreate backend web nginx

echo "==> Limpa cache Vite"
docker compose exec -T web sh -c 'rm -rf /app/node_modules/.vite /app/packages/web/node_modules/.vite 2>/dev/null || true'

echo "==> Reinicia web"
docker compose restart web

echo
echo "Pronto. No navegador: Ctrl+Shift+R em /ponto/historico e /ponto/auditoria"
echo "13/07 Elder deve mostrar: ~3h22 trabalhadas e saldo 0h00 (Atestado médico parcial)."
