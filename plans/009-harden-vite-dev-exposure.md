# Plan 009: Restrict Vite dev server's `allowedHosts` instead of disabling Host-header protection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/vite.ts`
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

Vite's dev middleware ships a `allowedHosts` allow-list specifically to
prevent DNS-rebinding attacks: a malicious webpage a developer has open in
another tab could otherwise make the browser send requests that appear
(from the dev server's perspective) to originate from `localhost`, letting
an attacker's page read/write through the dev server. This repo sets
`allowedHosts: true`, which **disables that protection entirely**, and
does so while `server/index.ts` binds the whole app (including the Vite
middleware) to `0.0.0.0` — meaning any device on the same network can also
reach it directly. For a personal finance app run during active
development on a laptop that may be on shared Wi-Fi, this is a real,
inexpensive-to-close exposure window. This plan replaces `true` with an
explicit host allow-list.

## Current state

`server/vite.ts:11-16`:
```ts
export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };
```

This `setupVite` function is only called from `server/index.ts:76-81`,
gated on `NODE_ENV !== "production"` — so this only affects `pnpm dev`,
never `pnpm start` (production, which uses `serveStatic` instead, see
`server/static.ts`).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000"; app loads at `http://localhost:5000` |

No automated test runner exists. Verification is manual — confirm the app
still loads normally in dev after the change.

## Scope

**In scope**:
- `server/vite.ts` — the `allowedHosts` value only.

**Out of scope**:
- `server/index.ts`'s `host: "0.0.0.0"` bind — covered separately by
  `plans/011-default-loopback-bind.md`.
- Any production-path change (`server/static.ts`) — this file is dev-only.

## Git workflow

- Branch: `advisor/009-harden-vite-dev-exposure`
- Commit; message style matches repo history. Suggested message:
  `Restrict Vite dev server allowedHosts instead of disabling Host-header protection`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace `allowedHosts: true` with an explicit list

In `server/vite.ts`, replace line 15:

```ts
const serverOptions = {
  middlewareMode: true,
  hmr: { server, path: "/vite-hmr" },
  allowedHosts: ["localhost", "127.0.0.1"] as const,
};
```

If, after this change, the owner reports they specifically rely on
reaching the dev server from a second device on their LAN (e.g. testing on
a phone during development), that hostname/IP should be added explicitly
to this array rather than reverting to `true` — but do not add anything
speculative; only what's confirmed needed.

**Verify**: `pnpm check` → exit 0.

### Step 2: Confirm the dev server still works normally

Run `pnpm dev`, open `http://localhost:5000` in a browser, and confirm:
1. The app loads normally (no Vite "Blocked request" error page).
2. Hot Module Reload still works — edit any client file (e.g. add a
   comment to `client/src/pages/dashboard.tsx`) and confirm the browser
   updates without a full reload.

**Verify**: both checks pass.

## Test plan

- No automated test framework exists. Verification is the manual dev-server
  smoke test in Step 2.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "allowedHosts" server/vite.ts` shows an explicit array, not `true`
- [ ] Manual Step 2 confirms the app loads and HMR still works at `localhost:5000`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- After the change, the dev server rejects requests to `localhost` itself
  (this would indicate Vite's host-matching needs a different value format
  than a plain hostname — check the installed Vite version's docs for the
  `server.allowedHosts` option shape before guessing).

## Maintenance notes

- If the owner later needs to reach the dev server from another device
  (phone, tablet) on their LAN, add that device's specific hostname to the
  `allowedHosts` array — do not revert to `true`, which reopens this
  finding.
- This finding is paired with `plans/011-default-loopback-bind.md`, which
  addresses the same underlying "reachable from the whole LAN" exposure at
  the socket-bind level rather than the Vite-middleware level. Both are
  independent, low-risk fixes and can be applied in either order.
