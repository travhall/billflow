#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d '=' -f2-)
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not found in .env" >&2
  exit 1
fi

export PATH="/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

BACKUP_DIR="/tmp/billflow-backups"
mkdir -p "$BACKUP_DIR"
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

pg_dump "$DATABASE_URL" | gzip > "$DUMP_FILE"

rclone copy "$DUMP_FILE" "$REMOTE/"

rm "$DUMP_FILE"

rclone delete "$REMOTE/" --min-age "${RETENTION_DAYS}d"

echo "$TODAY" > "$LAST_RUN_MARKER"

echo "backup complete: billflow-$TIMESTAMP.sql.gz"
