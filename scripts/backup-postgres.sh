#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/specter-command}"
if [ -f "${APP_DIR}/.env.production" ]; then
  set -a
  . "${APP_DIR}/.env.production"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/specter-command}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL requerido}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PG_DUMP_URL="$(printf '%s' "${DATABASE_URL}" | sed -E 's/[?&]schema=[^&]*//; s/[?&]$//')"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/specter-command-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"
pg_dump "${PG_DUMP_URL}" --format=custom --file="${FILE}"
sha256sum "${FILE}" > "${FILE}.sha256"

find "${BACKUP_DIR}" -type f -name "specter-command-*.dump" -mtime +"${BACKUP_RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -type f -name "specter-command-*.dump.sha256" -mtime +"${BACKUP_RETENTION_DAYS}" -delete

if command -v rclone >/dev/null 2>&1 && rclone listremotes | grep -q '^specter-r2:'; then
  if rclone copy "${FILE}" "specter-r2:${R2_BUCKET:-specter-command}/postgres/" &&
    rclone copy "${FILE}.sha256" "specter-r2:${R2_BUCKET:-specter-command}/postgres/"; then
    echo "Backup subido a R2: ${R2_BUCKET:-specter-command}/postgres/$(basename "${FILE}")"
  else
    echo "R2 no disponible; backup conservado localmente."
  fi
else
  echo "R2 no configurado; backup conservado localmente."
fi

echo "Backup creado: ${FILE}"
