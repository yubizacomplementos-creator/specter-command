#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/specter-command}"
if [ -f "${APP_DIR}/.env.production" ]; then
  set -a
  . "${APP_DIR}/.env.production"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-/tmp/specter-command-backups}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL requerido}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PG_DUMP_URL="$(printf '%s' "${DATABASE_URL}" | sed -E 's/[?&]schema=[^&]*//; s/[?&]$//')"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/specter-command-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"
cleanup() {
  rm -f "${FILE}" "${FILE}.sha256"
}
trap cleanup EXIT

pg_dump "${PG_DUMP_URL}" --format=custom --file="${FILE}"
sha256sum "${FILE}" > "${FILE}.sha256"

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone no esta instalado; no se puede subir el backup a R2." >&2
  exit 1
fi

if ! rclone listremotes | grep -q '^specter-r2:'; then
  echo "R2 no esta configurado como remoto specter-r2; no se conserva backup local." >&2
  exit 1
fi

rclone copy "${FILE}" "specter-r2:${R2_BUCKET:-specter-command}/postgres/"
rclone copy "${FILE}.sha256" "specter-r2:${R2_BUCKET:-specter-command}/postgres/"

echo "Backup subido a R2: ${R2_BUCKET:-specter-command}/postgres/$(basename "${FILE}")"
