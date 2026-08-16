#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d '=' -f2-)
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not found in .env" >&2
  exit 1
fi

export PATH="/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

BACKUP_DIR="/tmp/billflow-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
LAST_RUN_MARKER="$BACKUP_DIR/.last-run"
TODAY=$(date +%Y%m%d)

if [[ -f "$LAST_RUN_MARKER" && "$(cat "$LAST_RUN_MARKER")" == "$TODAY" ]]; then
  echo "backup already ran today ($TODAY), skipping"
  exit 0
fi

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="$BACKUP_DIR/billflow-$TIMESTAMP.sql.gz"
REMOTE="billflow-r2:billflow-backups"
RETENTION_DAYS=30

# Parse DATABASE_URL (postgresql://user:pass@host:port/db?params) into
# parts, so the password never appears as a process argument. Using a
# temporary PGPASSFILE instead of embedding it in argv or leaving it in a
# plain env var for the process's whole lifetime.
DB_USER=$(echo "$DATABASE_URL" | sed -E 's#^postgresql://([^:]+):.*#\1#')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's#^postgresql://[^@]+@([^:/]+).*#\1#')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's#.*@[^:/]+(:([0-9]+))?/.*#\2#')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
DB_PORT="${DB_PORT:-5432}"

PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:${DB_NAME}:${DB_USER}:${DB_PASS}" > "$PGPASS_FILE"
trap 'rm -f "$PGPASS_FILE"' EXIT

PGPASSFILE="$PGPASS_FILE" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$DUMP_FILE"

rclone copy "$DUMP_FILE" "$REMOTE/"

rm "$DUMP_FILE"

rclone delete "$REMOTE/" --min-age "${RETENTION_DAYS}d"

echo "$TODAY" > "$LAST_RUN_MARKER"

echo "backup complete: billflow-$TIMESTAMP.sql.gz"
