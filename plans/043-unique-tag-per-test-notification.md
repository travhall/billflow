# Plan 043: Give each test notification a unique tag

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 51d990b..HEAD -- client/src/lib/notifications.ts`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (notifications)
- **Planned at**: commit `51d990b`, 2026-09-03

## Why this matters

While investigating why the owner's browser notifications appeared to do
nothing when clicking "Send Test Notification" in the dev-only Feature
Demo panel, the real, most likely cause turned out to be an OS/browser
notification-delivery setting outside this app's control (macOS System
Settings → Notifications, or the browser's own master notifications
toggle) — `Notification.permission === "granted"` at the site level
doesn't guarantee the OS actually displays a notification, and the
Notification API gives web pages no signal when that happens.

Separately, though, a real small bug surfaced along the way:
`sendTestNotification()` (`client/src/lib/notifications.ts:48-62`) always
constructs its test notification with the same literal `tag:
"billflow-test"`. Per the Notification API spec, creating a new
`Notification` with a `tag` that matches an still-showing one *replaces*
it silently rather than showing a second alert. So clicking "Send Test
Notification" twice in a row — exactly what someone debugging "did that
work?" is likely to do — can make the second click look like it did
nothing, even when notifications are working correctly. This plan makes
each test notification's tag unique so every click reliably produces a
fresh, visible notification, removing one confusing variable from future
debugging of the OS-level issue.

## Current state

Relevant file: `client/src/lib/notifications.ts` — only this file is
touched.

`client/src/lib/notifications.ts:48-62` (today):

```ts
export function sendTestNotification() {
  if (!("Notification" in window)) {
    alert("This browser does not support notifications.");
    return;
  }
  if (Notification.permission !== "granted") {
    alert("Notifications are not enabled. Open any bill's edit menu and click Enable under Payment Reminder first.");
    return;
  }
  new Notification("🔔 BillFlow Test", {
    body: "Notifications are working! You'll be reminded before bills are due.",
    tag: "billflow-test",
    icon: "/favicon.ico",
  });
}
```

For contrast, the real (non-test) reminder/overdue/budget notifications
in this same file deliberately reuse a stable, meaningful `tag` per
bill/category (`overdue-${bill.id}`, `reminder-${bill.id}`,
`budget-${budget.category}`, all passed through the shared `sendNotification`
helper at lines 19-27) — that reuse is intentional there, so a bill's
notification updates in place instead of stacking duplicates across
multiple app visits in one day. This plan does **not** touch that
behavior; it only changes the one-off manual test notification, where
stacking duplicates on repeated clicks is exactly what's wanted (each
click is a deliberate, individual test), not something to guard against.

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope**:
- `client/src/lib/notifications.ts`

**Out of scope** (do NOT touch, even though related):
- `sendNotification` (lines 19-27) and its 3 real callers
  (`checkAndSendReminders`, `checkBudgetOverages`) — their stable,
  per-bill/per-category tags are intentional and must not change; see
  "Current state" above.
- Any OS-level or browser-level notification permission/delivery
  behavior — not something this codebase can fix or detect; out of scope
  by nature, not by choice.
- The Feature Demo panel's dev-only gating
  (`import.meta.env.DEV`, `client/src/pages/dashboard.tsx:652`) — already
  correct, unrelated to this bug.

## Git workflow

- Branch: `advisor/043-unique-tag-per-test-notification`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the test notification's tag unique per call

Change `client/src/lib/notifications.ts:57-61` from:

```ts
  new Notification("🔔 BillFlow Test", {
    body: "Notifications are working! You'll be reminded before bills are due.",
    tag: "billflow-test",
    icon: "/favicon.ico",
  });
```

to:

```ts
  new Notification("🔔 BillFlow Test", {
    body: "Notifications are working! You'll be reminded before bills are due.",
    tag: `billflow-test-${Date.now()}`,
    icon: "/favicon.ico",
  });
```

`Date.now()` is sufficient here — this is a manual, human-clicked test
action, not a high-frequency automated path, so millisecond-resolution
uniqueness is more than enough to guarantee two clicks never collide.

**Verify**: `pnpm check` → exits 0. `grep -n 'tag: "billflow-test"' client/src/lib/notifications.ts` → no matches (confirms the old literal tag is gone, not just shadowed). `grep -n "billflow-test-" client/src/lib/notifications.ts` → 1 match.

## Test plan

No new automated tests — this repo's Vitest harness has no browser/DOM
Notification API mocking set up, and adding one for a single-line,
visually-verified change is out of scope. Verify manually against a live
`pnpm dev`, in a browser where notification permission is already
`"granted"` for `localhost` (skip this plan's manual verification
entirely if you only have a `"denied"`/blocked browser available — note
that in your report rather than guessing at the outcome):

1. Open the Feature Demo panel (the flask icon, bottom-right, dev mode
   only), click "Send Test Notification" once. Confirm a notification
   appears.
2. Click "Send Test Notification" again immediately, without dismissing
   the first one. Confirm a **second, separate** notification now
   appears (this is the actual regression check — before this plan, the
   second click would have silently replaced the first with no new
   visible alert).
3. Confirm the real (non-test) notification paths are unaffected: this
   plan doesn't touch `sendNotification`, `checkAndSendReminders`, or
   `checkBudgetOverages` — no live verification of those is needed beyond
   confirming `git diff` shows only the one line changed in Step 1.

**Verify**: both observations above hold as described (or are explicitly
noted as skipped, with the reason, if no granted-permission browser was
available).

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count — this plan adds no test files)
- [ ] `grep -n 'tag: "billflow-test"' client/src/lib/notifications.ts` → no matches
- [ ] `grep -n "billflow-test-" client/src/lib/notifications.ts` → 1 match
- [ ] `git diff` shows exactly one line changed in `client/src/lib/notifications.ts`, nothing else
- [ ] No files outside `client/src/lib/notifications.ts` modified (`git status`)
- [ ] Manual observations from Test Plan confirmed live, or explicitly noted as skipped with reason
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt above doesn't match the live code (drift
  since this plan was written).
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- You find `sendTestNotification`'s tag being read/matched anywhere else
  in the codebase (e.g. a test asserting the literal string
  `"billflow-test"`) — this plan assumes it's only ever used at this one
  call site; `grep -rn "billflow-test" client/src/` before editing to
  confirm.

## Maintenance notes

- This does not fix or diagnose the owner's original OS-level
  notification-delivery issue — that requires checking macOS System
  Settings → Notifications for their browser, and/or the browser's own
  master notifications toggle, neither of which this codebase can detect
  or control. This plan only removes one confusing variable (silent
  same-tag replacement) from future debugging of that separate issue.
