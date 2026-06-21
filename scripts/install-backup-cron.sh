#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/specter-command}"
CRON_FILE="/etc/cron.d/specter-command-backups"

cat > "${CRON_FILE}" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

0 3 * * * root cd ${APP_DIR} && APP_DIR=${APP_DIR} bash scripts/backup-postgres.sh >> /var/log/specter-command-backup.log 2>&1
EOF

chmod 644 "${CRON_FILE}"
echo "Cron instalado en ${CRON_FILE}"
