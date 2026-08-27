# Plan 032: Gate the "Feature Demo" panel behind dev-only build

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 03e99d2..HEAD -- client/src/pages/dashboard.tsx`
> If that file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (prod hygiene)
- **Planned at**: commit `03e99d2`, 2026-08-27

## Why this matters

The Dashboard renders a floating "Feature Demo" panel (a flask-icon button,
bottom-right, that opens a small dev-testing panel) unconditionally — in
both `pnpm dev` and the production build served by `pnpm start` / deployed
on Render. It lets whoever's looking at the page fake an overdue-bill
banner and fire a test browser notification. That's a genuinely useful dev
tool (confirmed with the app's owner), but it has no reason to exist in the
production build the owner actually uses day-to-day — it's visual clutter
and a stray affordance a real user shouldn't see. Vite's `import.meta.env.DEV`
is a compile-time constant (`false` in a production build), so gating the
panel on it doesn't just hide the UI — Vite's dead-code elimination strips
the whole branch (and its now-unreachable JSX) out of the production bundle
entirely, satisfying both "suppress in prod" and "don't bloat the prod
bundle" with one change. No existing code in this repo uses
`import.meta.env.DEV` yet — this plan introduces the pattern for the first
time; it's a standard, zero-config Vite built-in, nothing to install.

## Current state

- `client/src/pages/dashboard.tsx` — the entire floating panel is one
  `<div>` block near the end of the `Dashboard` component's JSX.

State declarations that back the panel, [dashboard.tsx:256-259](client/src/pages/dashboard.tsx:256):

```tsx
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [demoOverdue, setDemoOverdue] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
```

`demoOverdue` and `bannerDismissed` are also read elsewhere, to control the
*real* overdue banner (not just the demo panel) — [dashboard.tsx:467](client/src/pages/dashboard.tsx:467),
[:476](client/src/pages/dashboard.tsx:476), [:495](client/src/pages/dashboard.tsx:495):

```tsx
        {(processedData.overdueCount > 0 || demoOverdue) && !bannerDismissed && (
```

**Do not touch these state declarations or the banner-condition lines above
— they're shared with real (non-demo) behavior and must keep working
identically in both dev and prod** (in prod, `demoOverdue` will simply
never be set to `true` by anything, since nothing renders the button that
sets it — the banner condition still correctly falls back to
`processedData.overdueCount > 0`).

The panel block itself to gate, exact current code,
[dashboard.tsx:642-714](client/src/pages/dashboard.tsx:642):

```tsx
      {/* Floating test panel */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {demoOpen && (
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 w-72 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5" /> Feature Demo
            </p>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">Overdue Banner</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs border-rose-300 text-rose-600 hover:bg-rose-50"
                  onClick={() => { setDemoOverdue(true); setBannerDismissed(false); }}
                >
                  Show Banner
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                  onClick={() => { setDemoOverdue(false); setBannerDismissed(false); }}
                >
                  Hide
                </Button>
              </div>
            </div>

            <div className="border-t border-border pt-3 space-y-1.5">
              <p className="text-xs font-medium text-foreground">Browser Notifications</p>
              {notifPermission !== "granted" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={async () => {
                    const r = await requestNotificationPermission();
                    setNotifPermission(r);
                  }}
                >
                  <Bell className="w-3 h-3" /> Enable Notifications
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/5"
                  onClick={() => sendTestNotification()}
                >
                  <Bell className="w-3 h-3" /> Send Test Notification
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground">
                {notifPermission === "granted"
                  ? "Notifications enabled. Click above to fire a test."
                  : notifPermission === "denied"
                  ? "Blocked in browser settings — allow and reload."
                  : "Permission not yet requested."}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={() => setDemoOpen((o) => !o)}
          className="w-12 h-12 rounded-2xl bg-foreground text-background shadow-xl flex items-center justify-center hover:opacity-80 transition-all hover:scale-105 active:scale-95"
          title="Test Features"
          data-testid="button-demo-toggle"
        >
          <FlaskConical className="w-5 h-5" />
        </button>
      </div>
```

## Commands you will need

| Purpose         | Command       | Expected on success |
|------------------|---------------|----------------------|
| Typecheck        | `pnpm check`  | exit 0, no output |
| Dev server       | `pnpm dev`    | starts, panel visible (dev = `import.meta.env.DEV === true`) |
| Production build | `pnpm build`  | exit 0, produces `dist/` |
| Production run   | `pnpm start`  | starts; panel must NOT appear |

`pnpm build` writes to `dist/` — this repo's own build output directory
(already git-ignored), not a mutation of tracked source; running it as a
verification step is fine.

## Scope

**In scope** (the only file you should modify):
- `client/src/pages/dashboard.tsx`

**Out of scope** (do NOT touch, even though they look related):
- The state declarations at `dashboard.tsx:256-259` and the banner-display
  logic at `dashboard.tsx:467-495` — see "Current state" above, these are
  shared with real (non-demo) behavior.
- `client/src/lib/notifications.ts` (`sendTestNotification`,
  `getNotificationPermission`, `requestNotificationPermission`) — these
  functions are also used by the real notification pipeline
  (`checkBudgetOverages` / `checkAndSendReminders` per `plans/027`); don't
  touch them, only stop rendering the button that manually calls
  `sendTestNotification()`.
- Deleting the panel's code outright — the operator wants it kept for dev
  use, not removed (confirmed). Gate it, don't delete it.

## Git workflow

- Branch: `advisor/032-gate-feature-demo-panel-dev-only`
- Commit message style: imperative, capitalized sentence (e.g. "Gate
  Feature Demo panel behind dev-only build"), no conventional-commit
  prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Wrap the floating panel in an `import.meta.env.DEV` check

Change the outer `<div>` at [dashboard.tsx:642-714](client/src/pages/dashboard.tsx:642) from being always
rendered to only rendering when `import.meta.env.DEV` is true. Keep every
line inside the `<div>...</div>` exactly as-is; only add the conditional
wrapper:

```tsx
      {/* Floating test panel — dev only, stripped from production builds by Vite's import.meta.env.DEV dead-code elimination */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {demoOpen && (
            <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 w-72 space-y-3">
              {/* ...unchanged contents... */}
            </div>
          )}
          <button
            onClick={() => setDemoOpen((o) => !o)}
            className="w-12 h-12 rounded-2xl bg-foreground text-background shadow-xl flex items-center justify-center hover:opacity-80 transition-all hover:scale-105 active:scale-95"
            title="Test Features"
            data-testid="button-demo-toggle"
          >
            <FlaskConical className="w-5 h-5" />
          </button>
        </div>
      )}
```

Update the leading comment as shown (`{/* Floating test panel — dev only, ... */}`)
so a future reader immediately understands why the block is conditional.
Every line of JSX between the outer `<div>`'s open and close tags stays
byte-for-byte identical — only the wrapping condition changes.

**Verify**: `pnpm check` → exit 0, no new errors.

### Step 2: Confirm the panel still renders in dev

1. Run `pnpm dev`.
2. Load the dashboard in a browser — confirm the flask button (bottom-right,
   `title="Test Features"`) is visible and clicking it still opens the
   panel with working "Show Banner" / "Hide" / notification buttons,
   identical to before this change.

**Verify**: panel visible and functional in `pnpm dev`.

### Step 3: Confirm the panel is absent from a production build

1. Run `pnpm build` — confirm exit 0.
2. Run `pnpm start` (this runs the production build; if `DATABASE_URL`
   isn't set in your environment, the server itself may fail to start —
   in that case, confirm this step by inspecting `dist/public/assets/*.js`
   instead: `grep -c "Feature Demo" dist/public/assets/*.js` should return
   `0` for every file, since the string only appears inside the now
   dead-code-eliminated JSX).
3. If the server does start, load it in a browser and confirm the flask
   button/panel does NOT appear anywhere on the dashboard.

**Verify**: either the running production build shows no flask button, or
(fallback) `grep -rc "Feature Demo" dist/public/assets/*.js` returns `0`
for all matched files.

## Test plan

No automated test exists for this (no component-test setup in this repo,
see `plans/031`'s Test plan for the same note). Verification is the manual
dev/prod comparison in Steps 2-3 above, plus the build-output grep as a
machine-checkable proxy for "not shipped to prod."

## Done criteria

- [ ] `pnpm check` exits 0, no new errors
- [ ] `grep -n "import.meta.env.DEV" client/src/pages/dashboard.tsx` finds the new conditional wrapping the floating panel
- [ ] Manual Step 2 confirms the panel still works in `pnpm dev`
- [ ] `pnpm build` exits 0, and `grep -rc "Feature Demo" dist/public/assets/*.js` returns `0` for every matched file (or the live `pnpm start` visual check in Step 3 confirms the panel's absence)
- [ ] No files outside `client/src/pages/dashboard.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row for 032 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at [dashboard.tsx:642-714](client/src/pages/dashboard.tsx:642) doesn't match the "Current state"
  excerpt above.
- `pnpm build` fails for a reason unrelated to this change (investigate
  whether it's pre-existing by checking it fails identically on `main`
  before your change — if so, it's out of scope, note it and continue with
  the `grep` fallback verification instead of blocking on a working
  `pnpm start`).
- You find any other code path (besides the button at `dashboard.tsx:706-713`)
  that sets `demoOpen`, `demoOverdue`, or opens the panel — that would mean
  the panel is reachable some other way this plan didn't account for;
  report it rather than gating only the one path.

## Maintenance notes

- If more dev-only tooling is added later, follow the same
  `import.meta.env.DEV &&` pattern rather than introducing a second
  mechanism (env var, build flag, etc.) — Vite's built-in is free and
  requires no configuration.
- A reviewer should confirm the diff touches *only* the wrapping condition
  and the one comment line — no reformatting or logic changes inside the
  panel's existing JSX.
