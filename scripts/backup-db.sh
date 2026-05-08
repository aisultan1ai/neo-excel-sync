#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-aisadmin}"
POSTGRES_DB="${POSTGRES_DB:-neo_db}"

BACKUP_DIR="$ROOT_DIR/backups"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
FILENAME="neo_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "→ Создание бэкапа: $FILENAME"
docker exec neo_db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "✓ Готово: backups/${FILENAME}"
