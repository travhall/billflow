# Plan 029: Fix `ZodError.errors` → `.issues` rename breaking every validation error response

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/routes.ts`
> If this file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `787434b`, 2026-08-15 (discovered during execution of plan 002, not part of the original audit — `zod` was on the dependency list but this specific runtime break wasn't caught until `pnpm check` was run against the merged baseline)

## Why this matters

`zod` v4 renamed `ZodError.errors` to `.issues` (`errors` was kept as a
deprecated alias in some v4 minor versions but is fully removed in the
version installed here — confirmed by `pnpm check` reporting `error
TS2339: Property 'errors' does not exist on type 'ZodError<unknown>'` at
every one of the 9 call sites below). Every mutating API endpoint in this
app — create/update bills, create/update payments, create budgets —
catches `ZodError` and reads `err.errors[0]` to build the 400 response.
Since `.errors` no longer exists on the type, and JavaScript doesn't
error at the type level at runtime, `err.errors` evaluates to `undefined`
at runtime, and `err.errors[0]` throws `TypeError: Cannot read properties
of undefined (reading '0')`. That secondary error is *not* a `ZodError`,
so it falls through the `if (err instanceof z.ZodError)` check's sibling
handling and becomes an unhandled 500 (or whatever the top-level error
middleware does with it) instead of the clean 400 the client expects.
**Every invalid request to this app's write endpoints currently crashes
instead of returning a validation error.** This is a live, user-facing
bug, not a typings-only issue — it was flagged during plan 002's
execution when `pnpm check` was run against the merged baseline and is
being fixed as its own focused plan rather than folded into an unrelated
one.

## Current state

`server/routes.ts` — the same catch-block pattern repeated at 5 endpoints,
9 total `err.errors` references:

```ts
// server/routes.ts:38-49 (POST /api/bills, representative of the pattern)
app.post(api.bills.create.path, async (req, res) => {
  try {
    const input = api.bills.create.input.parse(req.body);
    const bill = await storage.createBill(input);
    res.status(201).json(bill);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    throw err;
  }
});
```

The identical 2-line pattern (`err.errors[0].message`, `err.errors[0].path.join('.')`)
also appears at:
- `server/routes.ts:46-47` — `POST /api/bills` (shown above)
- `server/routes.ts:62-63` — `PUT /api/bills/:id`
- `server/routes.ts:89-90` — `POST /api/payments`
- `server/routes.ts:105-106` — `PUT /api/payments/:id`

A shorter single-line variant appears at the budgets endpoint:
```ts
// server/routes.ts:148-154
const budget = await storage.upsertBudget(category, monthlyLimit);
res.status(201).json(budget);
} catch (err) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: err.errors[0].message });
  }
  throw err;
```
- `server/routes.ts:152` — `POST /api/budgets`

`zod`'s v4 `ZodError` type exposes the same information under `.issues`
instead of `.errors` — each issue has the same `.message` and `.path`
shape, so this is a pure rename with no shape change.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0 for these 9 lines specifically — see Done criteria; the repo has other unrelated pre-existing errors, don't expect global exit 0 |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

## Scope

**In scope**:
- `server/routes.ts` — the 9 `err.errors` references only.

**Out of scope**:
- Any other pre-existing `pnpm check` error (~32 more, unrelated: library-version typings in the UI components, a couple of real bugs in `dashboard.tsx`/`upcoming.tsx`, a missing `@types/pg`) — not this plan's job, do not touch them.
- Any change to the error response shape/contract — `.message` and `.path` exist identically on `.issues[0]`, so client-facing behavior is unchanged, this is purely fixing the server-side property name.

## Git workflow

- Branch: `advisor/029-fix-zod-error-property-rename`
- Commit; message style matches repo history. Suggested message:
  `Fix ZodError.errors to .issues after zod v4 rename`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace all 9 occurrences

In `server/routes.ts`, replace every `err.errors` with `err.issues` at the
9 line numbers listed in "Current state" (lines 46, 47, 62, 63, 89, 90,
105, 106, 152). This is a mechanical find-and-replace of `err.errors` →
`err.issues` — confirm with a search-and-replace tool or manual edit that
exactly 9 occurrences are changed, no more, no fewer, and no other
`.errors` reference elsewhere in the file (e.g. on a different object) is
accidentally touched.

**Verify**: `grep -c "err\.errors" server/routes.ts` returns `0`.
`grep -c "err\.issues" server/routes.ts` returns `9`.

### Step 2: Confirm these specific errors are gone from typecheck

```bash
pnpm check 2>&1 | grep "server/routes.ts"
```

**Verify**: no output — all 9 `TS2339: Property 'errors' does not exist`
errors for `server/routes.ts` are gone. (The command's overall exit code
may still be non-zero due to the ~32 unrelated pre-existing errors in
other files — that's expected and not this plan's concern; only the
absence of `server/routes.ts` lines in this grep matters.)

### Step 3: Manually verify a validation error returns 400, not a crash

With `pnpm dev` running:
```bash
curl -i -X POST http://localhost:5000/api/bills \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**Verify**: response is `HTTP/1.1 400` with a JSON body containing a real
`message` (e.g. something like `"Required"` or a field-specific message,
not empty/undefined) — not a `500` or a hung/crashed connection. Repeat
for at least one more endpoint (e.g. `POST /api/payments` with an empty
body) to confirm the fix applies consistently across the pattern, not
just the first occurrence.

## Test plan

- No automated test framework exists in this repo. Verification is Step 2
  (typecheck) plus Step 3's manual `curl` checks confirming a real 400
  response instead of a crash.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "err\.errors" server/routes.ts` returns `0`
- [ ] `grep -c "err\.issues" server/routes.ts` returns `9`
- [ ] `pnpm check 2>&1 | grep "server/routes.ts"` returns no output
- [ ] Manual Step 3 confirms `POST /api/bills` with an empty body returns `400` with a real error message, not a crash
- [ ] Manual Step 3 confirms the same for at least one other endpoint (e.g. `POST /api/payments`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (add plan 029 as a new row if it isn't already present)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find (line numbers
  shifted, or a different property name than `.errors`/`.issues` is
  involved) — re-check the installed `zod` version's actual `ZodError`
  shape rather than assuming this plan's diagnosis still applies exactly.
- Any endpoint's manual test in Step 3 still returns a 500 or crashes
  after the fix — this would mean either a 10th occurrence this plan
  missed, or a different root cause; report the actual error rather than
  guessing at a second fix.

## Maintenance notes

- If this repo ever adds a `shared/routes.ts` contract entry for the
  budgets/reset/revert endpoints (see `plans/014-unify-api-contract.md`),
  make sure any new Zod-catch blocks added there use `.issues`, not
  `.errors`, matching this fix.
- This was found by running `pnpm check` against the *merged* baseline
  during plan 002's execution — a reminder that `pnpm check`'s pre-existing
  error count (documented across several other plans in this batch) is
  worth periodically re-running in full, since it can surface real runtime
  bugs like this one, not just typings noise.
