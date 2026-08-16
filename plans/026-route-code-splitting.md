# Plan 026: Add route-level code splitting

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- client/src/App.tsx`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`App.tsx` statically imports all 4 route pages (`Dashboard`, `History`,
`Upcoming`, `Analytics`) at the top of the file, so every route's code —
including Analytics' `recharts` charting dependency, not needed by the
other 3 routes — ships in the initial JS bundle regardless of which page
is visited first. For a 4-route personal app this is a modest win, but
it's a standard, low-risk, well-supported Vite/React pattern
(`React.lazy` + `Suspense`) that Vite/Rollup code-splits automatically
once given a dynamic import — free to add.

## Current state

`client/src/App.tsx` (full file):
```tsx
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Dashboard from "@/pages/dashboard";
import History from "@/pages/history";
import Upcoming from "@/pages/upcoming";
import Analytics from "@/pages/analytics";
import NotFound from "@/pages/not-found";
import { InstallPrompt } from "@/components/install-prompt";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import { checkAndSendReminders } from "@/lib/notifications";
import type { Bill, Payment } from "@shared/schema";

function NotificationRunner() { /* ... */ }

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/history" component={History} />
      <Route path="/upcoming" component={Upcoming} />
      <Route path="/analytics" component={Analytics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() { /* ... */ }

export default App;
```
No `React.lazy`/`Suspense` anywhere in this file or elsewhere in
`client/src` (confirmed via grep during the audit).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |
| Build     | `pnpm build` | exit 0, `dist/public/assets/` shows multiple chunk files |

## Scope

**In scope**:
- `client/src/App.tsx` — the 4 page imports and the `Router` function only.

**Out of scope**:
- `NotFound` — trivial, not worth lazy-loading (it's the fallback route,
  always needed).
- Any other component.

## Git workflow

- Branch: `advisor/026-route-code-splitting`
- Commit; message style matches repo history. Suggested message:
  `Add route-level code splitting with React.lazy`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Convert the 4 page imports to `React.lazy`

In `client/src/App.tsx`, replace:
```tsx
import Dashboard from "@/pages/dashboard";
import History from "@/pages/history";
import Upcoming from "@/pages/upcoming";
import Analytics from "@/pages/analytics";
```
with:
```tsx
import { lazy, Suspense } from "react";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const History = lazy(() => import("@/pages/history"));
const Upcoming = lazy(() => import("@/pages/upcoming"));
const Analytics = lazy(() => import("@/pages/analytics"));
```
Keep the existing `import { useEffect } from "react";` line separate, or
merge it into the new `import { lazy, Suspense, useEffect } from "react";`
line — either is fine, just don't end up with two separate `from "react"`
import statements.

**Verify**: `pnpm check` → exit 0. Each page component's default export
must be a valid React component for `lazy()` to work — confirm
`client/src/pages/dashboard.tsx` (and the other 3) use `export default
function ...` or equivalent (all 4 already do, per the audit's file
listing).

### Step 2: Wrap the router in `Suspense`

In `Router()`, wrap the `<Switch>` in a `<Suspense>` with a minimal
fallback:
```tsx
function Router() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading…</div>}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/history" component={History} />
        <Route path="/upcoming" component={Upcoming} />
        <Route path="/analytics" component={Analytics} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
```

**Verify**: `pnpm check` → exit 0.

### Step 3: Manually verify navigation and confirm chunk splitting

With `pnpm dev` running, navigate to each of the 4 routes and confirm each
loads correctly (a brief "Loading…" flash is expected on first visit to
each route, then normal rendering).

Then run a production build:
```bash
pnpm build
ls dist/public/assets/
```

**Verify**: `dist/public/assets/` contains multiple separate `.js` chunk
files (not just one large bundle) — confirming Vite/Rollup actually
split the routes into separate chunks. Navigate the built app (`pnpm
start`, or inspect via the dev server) to confirm no runtime errors.

## Test plan

- No automated test framework exists. Verification is the manual
  navigation check plus the build-output chunk inspection in Step 3.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "lazy(" client/src/App.tsx` shows all 4 page imports converted
- [ ] `grep -n "Suspense" client/src/App.tsx` shows the router wrapped
- [ ] `pnpm build` exits 0 and `dist/public/assets/` contains multiple JS chunks (not a single bundle)
- [ ] Manual navigation to all 4 routes works with no console errors
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- Any page fails to load after conversion (a blank screen or console
  error on navigation) — this would indicate the page's default export
  isn't compatible with `React.lazy`; report the actual error rather than
  reverting silently.

## Maintenance notes

- Any new route page added in the future should follow this same
  `lazy(() => import(...))` pattern rather than a static import, to keep
  the initial bundle lean as the app grows.
