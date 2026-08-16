# Plan 010: Restrict file permissions on the nightly database backup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- script/backup-db.sh`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

The nightly backup script writes a full `pg_dump` of the entire database —
every bill and payment record, the app's complete financial data — to
`/tmp/billflow-backups`, a directory shared by every local account on the
machine. Because the script sets no `umask` and does no explicit
`chmod`, the directory and dump file inherit the shell's default
permissions (`umask 022` → `drwxr-xr-x` directory, `-rw-r--r--` file —
confirmed by inspecting the actual backup artifact on disk during the
audit). Any other local macOS account on this machine can read the full
financial dump during the window between when the backup script creates
it and when it deletes it after upload. This plan tightens permissions so
the dump is only readable by the account that created it, for the entire
time it exists on disk.

## Current state

`script/backup-db.sh` (full file):
```bash
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
```

Confirmed on disk: `BACKUP_DIR` (`drwxr-xr-x`) and the `.sql.gz` dump file
(`-rw-r--r--`) — both world-readable, consistent with the shell's default
`umask 022`.

This script is invoked nightly by a macOS LaunchAgent (per prior session
context: `~/Library/LaunchAgents/com.billflow.dbbackup.plist`, not part of
this repo) — this plan only touches the script itself, not the LaunchAgent
configuration.

## Commands you will need

| Purpose        | Command                        | Expected on success |
|----------------|---------------------------------|----------------------|
| Syntax check   | `bash -n script/backup-db.sh`  | exit 0, no output    |
| Manual dry run | `bash script/backup-db.sh`     | "backup complete: ..." printed, exit 0 |

This script has no automated test. Verification is running it manually
and inspecting file permissions with `ls -l` / `stat`.

## Scope

**In scope**:
- `script/backup-db.sh` — permission-hardening lines only.

**Out of scope**:
- The DSN-as-argv exposure in the same script's `pg_dump "$DATABASE_URL"`
  call — covered separately by `plans/012-avoid-dsn-in-process-args.md`.
- The LaunchAgent plist — not part of this repo, out of scope.
- Moving `BACKUP_DIR` out of `/tmp` entirely (e.g. to `~/`) — considered
  but not done here to keep this plan's change minimal; see Maintenance
  notes for why `umask`/`chmod` alone is judged sufficient.

## Git workflow

- Branch: `advisor/010-harden-backup-file-permissions`
- Commit; message style matches repo history. Suggested message:
  `Restrict backup dump file permissions to owner-only`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Set a restrictive umask at the top of the script

Add a `umask 077` line right after the `set -euo pipefail` line (before
any file/directory is created):

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
```

`umask 077` means every file and directory this script creates from this
point on is owner-read/write-only (`-rw-------` for files, `drwx------`
for directories) unless explicitly overridden.

**Verify**: `bash -n script/backup-db.sh` → exit 0 (syntax check only,
confirms the added line doesn't break the script).

### Step 2: Explicitly re-tighten permissions on the existing backup directory

Since `BACKUP_DIR` may already exist from previous runs with the old,
looser permissions (a fresh `umask` only affects *newly created* files, not
ones that already exist), add an explicit `chmod` right after the
`mkdir -p` line:

```bash
BACKUP_DIR="/tmp/billflow-backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
```

**Verify**: `bash -n script/backup-db.sh` → exit 0.

### Step 3: Manually run the script and confirm permissions

Run `bash script/backup-db.sh` (requires a reachable `DATABASE_URL` in
`.env` and `pg_dump`/`rclone` installed, matching this repo's existing
setup). While it's running (or immediately before the `rm "$DUMP_FILE"`
line executes), check:

```bash
ls -ld /tmp/billflow-backups
ls -l /tmp/billflow-backups/*.sql.gz 2>/dev/null || echo "(file already cleaned up — check again mid-run if needed)"
```

**Verify**: the directory shows `drwx------` and, if caught before
cleanup, the dump file shows `-rw-------` — not the previous
`drwxr-xr-x`/`-rw-r--r--`. If the file is already deleted by the time you
check (the script deletes it right after upload), re-run and check faster,
or temporarily comment out the `rm "$DUMP_FILE"` line for this one
verification run only (restore it afterward — do not leave it removed,
since not cleaning up local dumps was never the intent).

## Test plan

- No automated test framework exists for this script. Verification is the
  manual run + `ls -l`/`ls -ld` permission check in Step 3.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bash -n script/backup-db.sh` exits 0
- [ ] `grep -n "umask 077" script/backup-db.sh` shows the line present near the top
- [ ] `grep -n "chmod 700" script/backup-db.sh` shows the directory-hardening line present
- [ ] Manual Step 3 confirms `drwx------` on the backup directory (and `-rw-------` on the dump file if caught before cleanup)
- [ ] The script still completes successfully end-to-end (backup uploads to R2, retention cleanup runs, "backup complete" is printed)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- No reachable `DATABASE_URL`/Postgres tools are available to run Step 3 —
  report this rather than skipping verification; the syntax check alone
  (Step 1/2) is not sufficient to confirm the permission fix actually
  works.
- The script fails after these changes for a reason unrelated to
  permissions (e.g. `rclone`/`pg_dump` not found) — that's a pre-existing
  environment issue, not something this plan should attempt to fix; report
  it.

## Maintenance notes

- `BACKUP_DIR` stays under `/tmp` rather than moving to a
  user-home-directory path — `umask 077` + `chmod 700` closes the
  world-readable gap without needing to touch the LaunchAgent
  configuration (which references this path and lives outside this repo).
  If the owner wants defense-in-depth beyond permissions (e.g. in case
  `/tmp` itself is ever mounted with unusual options), moving the backup
  location to `~/.billflow-backups` or similar would be a reasonable
  follow-up, but is a bigger change (touches the LaunchAgent plist too)
  than this plan's scope.
- This plan is paired with `plans/012-avoid-dsn-in-process-args.md`, which
  hardens the same script's `pg_dump "$DATABASE_URL"` call against a
  different exposure (connection string visible via `ps`). Independent
  changes, either order is fine.
