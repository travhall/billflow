# Plan 007: Remove the dead post-response `throw` in the error-handling middleware

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
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`server/index.ts`'s final error-handling middleware sends the JSON error
response and then unconditionally re-throws the same error. This was
initially flagged during audit as a potential "crashes the whole server on
any request error" bug — that hypothesis was tested directly against this
repo's installed Express 5.2.1 and disproven: Express's internal
`Layer.handleRequest` catches the re-thrown error and forwards it to
`finalhandler`, which sees `headersSent === true` and just logs to
stderr — the process keeps running and keeps accepting new requests. So
this is **not** an active crash bug. It is still worth fixing because: (a)
it's dead/misleading code that reads as an intentional "crash and let a
process manager restart" pattern when it isn't one, (b) it causes the
error to be logged twice (once by whatever ultimately logs it, once via
`finalhandler`'s stderr dump including a full stack trace), and (c) it's
fragile — a different Express version, a different call path, or moving
this logic into a context Express doesn't auto-catch could turn it into a
real unhandled-exception crash later. This plan removes the throw and adds
an explicit, intentional safety net instead.

## Current state

`server/index.ts:65-71`:
```ts
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({ message });
  throw err;
});
```

This is the last `app.use()` call before the dev/prod branch
(`server/index.ts:73-81`) that sets up Vite or static serving, and before
`httpServer.listen(...)` (`server/index.ts:87-97`).

There is currently no `process.on("uncaughtException", ...)` or
`process.on("unhandledRejection", ...)` handler anywhere in `server/`
(confirmed via repo-wide grep during the audit) — this plan adds one as
the safety net that a future genuinely-unhandled error should hit, instead
of relying on this middleware's now-removed throw.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

No automated test runner exists. Verification uses `curl` against a route
that deliberately errors, plus reading server logs.

## Scope

**In scope**:
- `server/index.ts` — the error-handling middleware (lines 65-71) and
  adding process-level `uncaughtException`/`unhandledRejection` logging
  near the top of the file (before `app.use(express.json(...))`).

**Out of scope**:
- Any change to how individual route handlers construct or throw errors
  (`server/routes.ts`) — out of scope for this plan; see
  `plans/003-404-on-missing-update.md` for the one place this repo already
  needed a routes.ts error-handling change.
- Adding a structured logging library — plain `console.error` matches this
  file's existing logging style (see the `log()` helper at
  `server/index.ts:24-32`, which also just wraps `console.log`).

## Git workflow

- Branch: `advisor/007-error-middleware-cleanup`
- Commit per step; message style matches repo history. Suggested message:
  `Remove dead post-response throw in error middleware, add process-level error logging`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the re-throw, log instead

Replace `server/index.ts:65-71`:

```ts
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error(err);
  res.status(status).json({ message });
});
```

**Verify**: `pnpm check` → exit 0.

### Step 2: Add process-level safety net handlers

Near the top of `server/index.ts`, after the existing imports (before
`const app = express();`), add:

```ts
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
```

This is a logging-only safety net (matches this repo's existing
"single-process, restart manually if needed" operational model — there's
no process manager like PM2 configured per `package.json`'s scripts) — it
does not call `process.exit()`, so it won't change existing behavior for
errors that are already being handled correctly elsewhere; it only ensures
that if something genuinely uncaught happens in the future, it's visible
in the logs instead of silently swallowed.

**Verify**: `pnpm check` → exit 0.

### Step 3: Manually verify error responses still work and the process survives

With `pnpm dev` running, trigger a route error (e.g. `curl -X PUT
http://localhost:5000/api/bills/not-a-number -d '{}' -H 'Content-Type:
application/json'` — a non-numeric id will cause `Number(req.params.id)`
to produce `NaN`, which Drizzle's `eq()` will likely reject downstream,
producing a 500). Confirm:

1. The client still receives a proper JSON error response (not a hung
   connection or empty body).
2. The server process is still running afterward — issue a second,
   unrelated request (e.g. `GET /api/bills`) and confirm it succeeds.
3. The error appears exactly once in the server's stdout/stderr (not
   duplicated by both the middleware and a stray `finalhandler` dump).

**Verify**: all 3 checks pass.

## Test plan

- No automated test framework exists. Verification is the manual sequence
  in Step 3.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "throw err" server/index.ts` returns no matches (the dead re-throw is gone)
- [ ] `grep -n "uncaughtException\|unhandledRejection" server/index.ts` shows both new handlers present
- [ ] Manual Step 3 confirms: error response still returned, server survives, error logged exactly once
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- The manual test in Step 3 shows the server actually does stop responding
  after the triggered error — this would mean the audit's live
  reproduction (Express 5.2.1 swallows the post-response throw) doesn't
  hold in this environment for some reason, and the fix needs
  reconsideration rather than blind application.

## Maintenance notes

- The `uncaughtException`/`unhandledRejection` handlers added here are
  intentionally logging-only. If this app is ever deployed under a process
  manager (PM2, systemd with restart-on-failure, etc.), revisit whether
  `process.exit(1)` should follow the log line so the manager can restart
  a genuinely corrupted process — not done here since no such manager is
  currently configured for this solo-dev, locally-run app.
