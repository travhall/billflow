# Plan 012: Stop passing the database connection string as a `pg_dump` command-line argument

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
>
> **Note**: this plan and `plans/010-harden-backup-file-permissions.md`
> both edit `script/backup-db.sh` in different, non-overlapping sections.
> Either order is fine; if both are applied, do a final read-through of
> the combined script to confirm both changes coexist cleanly.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`script/backup-db.sh` invokes `pg_dump "$DATABASE_URL"`, passing the full
Neon Postgres connection string — including the embedded username and
password — as a literal command-line argument. On macOS (and Linux),
process arguments are visible to any other local account via `ps` (e.g.
`ps auxww | grep pg_dump`) or Activity Monitor for as long as the process
is running. On a single-user laptop this is a narrow exposure window (only
for the few seconds `pg_dump` runs, only to other local accounts on the
same machine), but it's a broader exposure than necessary — Postgres
client tools have a standard mechanism (`PGPASSFILE` / a `.pgpass` file)
specifically for supplying credentials without putting them on the command
line. This plan switches to that mechanism.

## Current state

`script/backup-db.sh:6,29` — the relevant lines:
```bash
DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d '=' -f2-)
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not found in .env" >&2
  exit 1
fi
# ...
pg_dump "$DATABASE_URL" | gzip > "$DUMP_FILE"
```

The `DATABASE_URL` is a standard Postgres connection URI:
`postgresql://<user>:<password>@<host>/<database>?sslmode=require&channel_binding=require`
(format only — this plan must never read or reproduce the actual value
from `.env`, which is git-ignored and out of scope to inspect beyond
confirming the variable exists).

`libpq` (which `pg_dump` uses) accepts connection parameters in multiple
equivalent forms: as a URI (current approach, argv-visible), as individual
`PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` environment variables (not
argv-visible, but environment variables of a running process are also
inspectable by other local users via `/proc` on Linux or `ps eww`/similar
on macOS with sufficient privileges — narrower exposure than argv, but
not zero), or via a `~/.pgpass` file (`hostname:port:database:username:password`
format, mode `0600`) referenced implicitly with no credential on the
command line or in the environment at all. This plan uses the `.pgpass`
approach since it's the standard, most-locked-down mechanism `pg_dump`
itself documents for exactly this use case, and it keeps the script
itself free of any credential material beyond what it already reads from
`.env`.

## Commands you will need

| Purpose        | Command                        | Expected on success |
|----------------|---------------------------------|----------------------|
| Syntax check   | `bash -n script/backup-db.sh`  | exit 0, no output    |
| Manual dry run | `bash script/backup-db.sh`     | "backup complete: ..." printed, exit 0 |

No automated test exists for this script. Verification is running it
manually and confirming `pg_dump`'s argv no longer contains the DSN.

## Scope

**In scope**:
- `script/backup-db.sh` — the `pg_dump` invocation and the connection-info
  handling immediately around it.

**Out of scope**:
- The `.env` file itself — not modified; `DATABASE_URL` continues to be
  read from `.env` exactly as today, this plan only changes how it's
  *passed to `pg_dump`*, not how it's stored.
- File-permission hardening on the backup directory — covered separately
  by `plans/010-harden-backup-file-permissions.md`.
- `rclone`'s own credential handling — per the audit, `rclone` already
  reads its R2 credentials from `~/.config/rclone/rclone.conf` (mode 600,
  not committed), which is already the secure pattern this plan applies to
  `pg_dump`; no change needed there.

## Git workflow

- Branch: `advisor/012-avoid-dsn-in-process-args`
- Commit; message style matches repo history. Suggested message:
  `Avoid passing DB connection string as a pg_dump command-line argument`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Parse the connection URI into a temporary `.pgpass`-format line

Postgres connection URIs have the shape
`postgresql://user:password@host:port/database?params`. `pg_dump` can
accept individual connection parameters (`-h`, `-U`, `-d`) plus a
`PGPASSFILE` pointing at a `.pgpass`-format file for the password, instead
of one URI argument. Add URI-parsing and a temporary, restrictively-
permissioned pgpass file right before the `pg_dump` call in
`script/backup-db.sh`:

```bash
# Parse DATABASE_URL (postgresql://user:pass@host:port/db?params) into
# parts, so the password never appears as a process argument. Using a
# temporary PGPASSFILE instead of embedding it in argv or leaving it in a
# plain env var for the process's whole lifetime.
DB_USER=$(echo "$DATABASE_URL" | sed -E 's#^postgresql://([^:]+):.*#\1#')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's#^postgresql://[^@]+@([^:/]+).*#\1#')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's#.*@[^:/]+:([0-9]+)/.*#\1#')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
DB_PORT="${DB_PORT:-5432}"

PGPASS_FILE=$(mktemp)
chmod 600 "$PGPASS_FILE"
echo "${DB_HOST}:${DB_PORT}:${DB_NAME}:${DB_USER}:${DB_PASS}" > "$PGPASS_FILE"
trap 'rm -f "$PGPASS_FILE"' EXIT
```

Place this block right before the existing `pg_dump` line, after
`DATABASE_URL` is confirmed non-empty. The `trap ... EXIT` ensures the
temporary pgpass file is removed even if the script fails partway through
— confirm this doesn't conflict with any existing `trap` in the script
(there is none currently, per the full-file excerpt in
`plans/010-harden-backup-file-permissions.md`'s "Current state" section —
if `plans/010` has already been applied and altered this file, re-check
for an existing `trap` before adding a second one; if one exists, combine
the cleanup logic into a single trap rather than overwriting it).

**Verify**: `bash -n script/backup-db.sh` → exit 0.

### Step 2: Replace the `pg_dump` call to use the parsed parameters

Replace:
```bash
pg_dump "$DATABASE_URL" | gzip > "$DUMP_FILE"
```
with:
```bash
PGPASSFILE="$PGPASS_FILE" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$DUMP_FILE"
```

If the original `DATABASE_URL` includes `sslmode=require` (confirmed
present in this repo's actual Neon connection string per prior session
context, though this plan must not read or reproduce the value itself),
confirm SSL is still negotiated by default — Neon requires SSL and
`libpq` defaults to `sslmode=prefer`, which should still succeed against a
server that requires SSL. If the dry run in Step 3 fails with an
SSL-related connection error, add `PGSSLMODE=require` to the environment
of the `pg_dump` call:
```bash
PGPASSFILE="$PGPASS_FILE" PGSSLMODE=require pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$DUMP_FILE"
```

**Verify**: `bash -n script/backup-db.sh` → exit 0.

### Step 3: Manually verify the backup still works and the DSN isn't in argv

Run `bash script/backup-db.sh` with a reachable `DATABASE_URL` in `.env`.
While it's running, in a separate terminal:

```bash
ps auxww | grep pg_dump
```

**Verify**:
1. The script completes successfully — "backup complete: ..." is printed,
   exit code 0, and the dump uploads to R2 as before (confirm via
   `rclone ls billflow-r2:billflow-backups` showing a new file, or just
   trust the script's own success output if `rclone` isn't independently
   inspectable in your environment).
2. The `ps` output during the run shows `pg_dump -h ... -p ... -U ... -d ...`
   — **no password or full connection string** anywhere in the command
   line.
3. The temporary pgpass file no longer exists after the script finishes
   (`ls "$PGPASS_FILE"` — capture the path before the script deletes it,
   or just confirm no stray files matching `/tmp/tmp.*` from `mktemp`
   linger after a run).

## Test plan

- No automated test framework exists for this script. Verification is the
  manual run + `ps` inspection in Step 3.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bash -n script/backup-db.sh` exits 0
- [ ] `grep -n 'pg_dump "\$DATABASE_URL"' script/backup-db.sh` returns no matches (the old argv-based call is gone)
- [ ] `grep -n "PGPASSFILE" script/backup-db.sh` shows the new pgpass-based invocation
- [ ] Manual Step 3 confirms the script still completes successfully end-to-end
- [ ] Manual Step 3's `ps auxww | grep pg_dump` shows no password/connection-string material in the command line
- [ ] The temporary pgpass file is cleaned up after the script exits (success or failure)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- The `sed`-based URI parsing in Step 1 doesn't correctly extract the
  host/port/user/password/database from this repo's actual `DATABASE_URL`
  format (Neon connection strings sometimes include additional query
  parameters like `channel_binding=require` after `sslmode=require` —
  confirm the `DB_NAME` extraction correctly strips everything after `?`,
  and if the URI shape doesn't match what the `sed` patterns expect, fix
  the regex rather than hardcoding a workaround for one specific string).
- `pg_dump` fails to connect with the new parameter-based invocation after
  trying the `PGSSLMODE=require` fallback in Step 2 — report the actual
  connection error rather than reverting to the argv-based DSN as a
  workaround, since that would silently undo this plan's fix.
- No reachable `DATABASE_URL` is available to run Step 3 against — report
  this rather than skipping verification.

## Maintenance notes

- If `DATABASE_URL`'s format ever changes (e.g. a different cloud Postgres
  provider with a different URI shape), the `sed`-based parsing in Step 1
  should be re-verified — it was written and tested against this repo's
  current Neon connection string shape only.
- This plan is paired with `plans/010-harden-backup-file-permissions.md`,
  which hardens file permissions on the same script's backup artifacts.
  Both are independent, narrow changes to `script/backup-db.sh`.
