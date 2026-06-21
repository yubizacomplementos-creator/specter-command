#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/specter-command"
DB_NAME="specter_command"
DB_USER="specter"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este script como root en el VPS."
  exit 1
fi

apt-get update
apt-get install -y curl git postgresql postgresql-contrib nginx ufw

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2

mkdir -p "${APP_DIR}" /var/backups/specter-command
chown -R "$SUDO_USER":"$SUDO_USER" "${APP_DIR}" /var/backups/specter-command 2>/dev/null || true

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD 'CAMBIAR_ESTE_PASSWORD';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "VPS base listo. Sube el codigo a ${APP_DIR}, crea .env.production y ejecuta scripts/deploy-vps.sh."
