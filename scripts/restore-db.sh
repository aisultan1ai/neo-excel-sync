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

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "Использование: bash scripts/restore-db.sh backups/neo_db_YYYY-MM-DD_HH-MM-SS.sql.gz"
  echo ""
  echo "Доступные бэкапы:"
  ls -1 "$ROOT_DIR/backups/"*.sql.gz 2>/dev/null || echo "  (нет бэкапов)"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Файл не найден: $FILE"
  exit 1
fi

echo "⚠  Это ЗАМЕНИТ все данные в базе '${POSTGRES_DB}'!"
read -r -p "Введите 'yes' для подтверждения: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Отменено."
  exit 0
fi

echo "→ Восстановление из: $FILE"
gunzip -c "$FILE" | docker exec -i neo_db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
echo "✓ База данных восстановлена."
