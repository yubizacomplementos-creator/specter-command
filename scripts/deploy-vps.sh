#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/specter-command}"

cd "${APP_DIR}"

npm ci
npm run prisma:deploy
npm run build
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "Specter Command desplegado en ${APP_DIR}."
