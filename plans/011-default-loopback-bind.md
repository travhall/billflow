# Plan 011: Default the server to loopback-only, require an explicit opt-in for LAN exposure

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/index.ts`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (see Maintenance notes — changes default network reachability)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

BillFlow has no authentication, no rate limiting, and no per-request
authorization of any kind (by design — it's a personal, single-user tool).
The server currently binds to `host: "0.0.0.0"` unconditionally, meaning
it listens on **every** network interface, not just loopback. On a laptop
that's ever on a shared or untrusted Wi-Fi network, or if a tunnel/reverse
proxy is ever pointed at it, this means anyone who can route to the
machine's LAN IP and the configured port can read and modify every bill
and payment record with zero authentication. This plan makes the safer
choice (`127.0.0.1`, loopback-only) the **default**, and requires an
explicit environment variable to opt into the current LAN-wide behavior —
so a deliberate choice is required to expose the app beyond the local
machine, rather than that being silently true today.

## Current state

`server/index.ts:85-97`:
```ts
// ALWAYS serve the app on the port specified in the environment variable PORT
// Other ports are firewalled. Default to 5000 if not specified.
// this serves both the API and the client.
// It is the only port that is not firewalled.
const port = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
    ...(process.env.REPL_ID ? { reusePort: true } : {}),
  },
  () => {
    log(`serving on port ${port}`);
  },
);
```

Note the comment block above it ("ALWAYS serve...", "Other ports are
firewalled", "the only port that is not firewalled") is leftover Replit
platform-specific guidance from before this app moved to running locally
per recent git history (`3e56e49 Add nightly R2 backup script for Neon
database`, `16259a1 feat: update pnpm workspace and improve server
routing`) — it no longer accurately describes this app's actual local
deployment model and should be updated as part of this change.

`.env` (per this repo's `.gitignore:3`, not committed) currently defines
`DATABASE_URL`, `PORT`, `NODE_ENV` — this plan adds one more optional
variable, `HOST`.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

No automated test runner exists. Verification uses `lsof`/`nc` to confirm
which interfaces the server is actually listening on.

## Scope

**In scope**:
- `server/index.ts` — the `httpServer.listen(...)` call and its preceding comment block.

**Out of scope**:
- `server/vite.ts`'s `allowedHosts` setting — covered separately by
  `plans/009-harden-vite-dev-exposure.md`.
- Adding actual authentication — out of scope; this plan only changes the
  default network reachability, it does not add access control for
  whoever *can* reach the port.
- `.env` itself — this repo's real `.env` is git-ignored and not part of
  this plan's file changes; the executor should not need to read or write
  it to complete this plan (the new `HOST` variable is optional and
  defaults safely with no `.env` change required).

## Git workflow

- Branch: `advisor/011-default-loopback-bind`
- Commit; message style matches repo history. Suggested message:
  `Default server bind to loopback, require HOST=0.0.0.0 to opt into LAN exposure`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change the default bind host and update the stale comment

Replace `server/index.ts:85-97`:

```ts
// Binds to loopback only by default so the app isn't reachable from other
// devices on the network. Set HOST=0.0.0.0 in .env to opt into listening
// on all interfaces (e.g. to reach the app from another device on your
// LAN) — do this deliberately, since this app has no authentication.
const port = parseInt(process.env.PORT || "5000", 10);
const host = process.env.HOST || "127.0.0.1";
httpServer.listen(
  {
    port,
    host,
  },
  () => {
    log(`serving on port ${port}, bound to ${host}`);
  },
);
```

Note this also drops the `...(process.env.REPL_ID ? { reusePort: true } : {})`
spread — `REPL_ID` is a Replit-platform environment variable and this app
no longer runs on Replit per the project's migration history; if
`process.env.REPL_ID` is genuinely still relied upon in this environment
for some reason, STOP and report rather than removing it — but the audit
found no other reference to `REPL_ID` anywhere in the codebase, so this is
expected to be safe dead code cleanup, not a functional change.

**Verify**: `pnpm check` → exit 0.

### Step 2: Confirm the default binds to loopback only

Run `pnpm dev`, then in a separate terminal:

```bash
lsof -iTCP -sTCP:LISTEN -n -P | grep ":5000"
```

**Verify**: the output shows the listening address as `127.0.0.1:5000` (or
`localhost:5000`), not `*:5000` or `0.0.0.0:5000`. Also confirm the app
still loads normally at `http://localhost:5000` in a browser.

### Step 3: Confirm the opt-in still works

Stop the server, set `HOST=0.0.0.0` (either by adding it to `.env` for
this test, or `HOST=0.0.0.0 pnpm dev` inline), restart, and re-run the
`lsof` check from Step 2.

**Verify**: with `HOST=0.0.0.0` set, the listening address shows `*:5000`
(all interfaces) — confirming the opt-in path still works as before. If
you added `HOST=0.0.0.0` to `.env` only for this test, remove it
afterward so the repo's local `.env` is left in the safer default state.

## Test plan

- No automated test framework exists. Verification is the `lsof` checks in
  Steps 2 and 3, confirming both the new safe default and the opt-in path.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n 'host = process.env.HOST' server/index.ts` shows the new default-to-loopback logic
- [ ] `grep -n "REPL_ID" server/index.ts` returns no matches (dead Replit-specific code removed)
- [ ] Step 2's `lsof` check shows `127.0.0.1:5000` with no `HOST` env var set
- [ ] Step 3's `lsof` check shows `*:5000` with `HOST=0.0.0.0` set
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- `process.env.REPL_ID` turns out to be referenced elsewhere in a way the
  audit missed — re-check with `grep -rn "REPL_ID" --include="*.ts" .`
  before removing the `reusePort` conditional, and if found, keep it and
  report the discrepancy instead of silently dropping it.
- The owner (if reachable) has not confirmed whether they currently rely
  on LAN access to this app from another device — if so, this change would
  break that workflow until `HOST=0.0.0.0` is added to their `.env`. This
  is a **behavior change**, not a pure bug fix, so flag it clearly in your
  final report even if you proceed, so the operator knows to add `HOST=0.0.0.0`
  to their real `.env` if they need LAN access restored.

## Maintenance notes

- **This changes default behavior**, unlike most other plans in this
  batch. If the owner has been relying on reaching this app from a phone
  or another computer on their home network, that will stop working until
  they add `HOST=0.0.0.0` to their `.env`. This is flagged as MED risk in
  the Status block specifically for that reason — the code change itself
  is simple and low-risk, but its effect on the running app's reachability
  is a real behavior change the owner should be aware of.
- Paired with `plans/009-harden-vite-dev-exposure.md`, which closes a
  related but distinct exposure (Vite's dev-only Host-header check).
