# Plan 008: Clean up the `appinstalled` event listener on unmount

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- client/src/components/install-prompt.tsx`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`InstallPrompt`'s effect registers a `beforeinstallprompt` listener with a
named handler that its cleanup function correctly removes, but the
`appinstalled` listener right next to it is registered as an inline
anonymous arrow function — there is no reference to pass to
`removeEventListener`, so it can never be removed. In practice
`InstallPrompt` is mounted once for the app's lifetime (it's rendered
unconditionally in the app shell), so this listener leak has no visible
user impact today. It's included here because it's a genuine, textbook
missing-cleanup bug that would silently misbehave (calling `setState` on
an unmounted component, which React warns about) the moment this
component's mount lifecycle changes — e.g. if it were ever moved behind a
route or a conditional render.

## Current state

`client/src/components/install-prompt.tsx:18-36`:
```ts
useEffect(() => {
  // Already running as installed PWA
  if (window.matchMedia("(display-mode: standalone)").matches) {
    setInstalled(true);
    return;
  }

  const handler = (e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e as BeforeInstallPromptEvent);
  };

  window.addEventListener("beforeinstallprompt", handler);
  window.addEventListener("appinstalled", () => setInstalled(true));

  return () => {
    window.removeEventListener("beforeinstallprompt", handler);
  };
}, []);
```

Note the `beforeinstallprompt` listener (`handler`) is correctly cleaned
up; only the `appinstalled` listener is missing a named reference and a
matching `removeEventListener` call.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

No automated test runner exists. Verification is a manual browser check
(PWA install events cannot be triggered from a script — this is a real
limitation, see Test plan below).

## Scope

**In scope**:
- `client/src/components/install-prompt.tsx` — the `useEffect` block only (lines 18-36).

**Out of scope**:
- Any other part of this component (the render/JSX, `handleInstall`,
  `handleDismiss`) — unrelated to this bug.

## Git workflow

- Branch: `advisor/008-install-prompt-listener-cleanup`
- Commit; message style matches repo history. Suggested message:
  `Fix appinstalled listener leak in InstallPrompt`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Name the handler and remove it in cleanup

Replace `client/src/components/install-prompt.tsx:18-36`:

```ts
useEffect(() => {
  // Already running as installed PWA
  if (window.matchMedia("(display-mode: standalone)").matches) {
    setInstalled(true);
    return;
  }

  const handler = (e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e as BeforeInstallPromptEvent);
  };

  const onInstalled = () => setInstalled(true);

  window.addEventListener("beforeinstallprompt", handler);
  window.addEventListener("appinstalled", onInstalled);

  return () => {
    window.removeEventListener("beforeinstallprompt", handler);
    window.removeEventListener("appinstalled", onInstalled);
  };
}, []);
```

**Verify**: `pnpm check` → exit 0.

## Test plan

- No automated test framework exists, and browser PWA install events
  (`beforeinstallprompt`, `appinstalled`) cannot be reliably triggered
  from a script in most browsers — this is a genuine testing limitation
  of the platform, not a gap in this plan's verification approach.
  Verification is therefore limited to:
  1. `pnpm check` passing (confirms the code is well-typed and the
     listener/cleanup pair is symmetric).
  2. A manual code review check: confirm both `addEventListener` calls in
     the effect have a matching `removeEventListener` call in the cleanup
     function referencing the exact same function identity (not a new
     inline arrow function that would silently fail to match).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "onInstalled" client/src/components/install-prompt.tsx` shows both the `addEventListener` and `removeEventListener` call using the same `onInstalled` identifier
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.

## Maintenance notes

- Low-priority, cosmetic-correctness fix — included in this audit round
  for completeness since it was a confirmed finding, not because it's
  currently causing any observed problem.
