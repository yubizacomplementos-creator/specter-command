#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/specter-command}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL requerido}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/specter-command-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"
pg_dump "${DATABASE_URL}" --format=custom --file="${FILE}"
sha256sum "${FILE}" > "${FILE}.sha256"

echo "Backup creado: ${FILE}"
