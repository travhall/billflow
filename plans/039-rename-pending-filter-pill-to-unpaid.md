# Plan 039: Rename the "Pending" status filter pill to "Unpaid"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat c324014..HEAD -- client/src/pages/dashboard.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (follows plans 037/038, both merged to `main`)
- **Category**: bug (UX / vocabulary consistency)
- **Planned at**: commit `c324014`, 2026-09-02

## Why this matters

Plan 038 replaced the flat "Pending" status badge with cycle-aware labels
— unpaid-and-due-this-cycle now shows "Due", unpaid-and-due-a-future-cycle
now shows "Next Cycle" (`client/src/pages/dashboard.tsx`'s
`getUrgencyDisplay`). The word "Pending" no longer appears on any bill-row
badge anywhere in the app. But the status filter pill row above the bill
tables still has a button labeled "Pending" — its text is generated
directly from the underlying filter *value* (`s.charAt(0).toUpperCase() +
s.slice(1)`), which was never updated when the badge vocabulary changed.
The owner flagged this directly, screenshot attached: clicking "Pending"
now filters to a set of rows that visually read "Due" or "Next Cycle" —
neither of which is the word on the button that produced them. This is a
straightforward vocabulary-drift bug, not a design decision — fix the
label text only.

## Current state

Relevant file: `client/src/pages/dashboard.tsx` — same file plans 037 and
038 touched. This plan changes only the pill's *display text* for one
value; the underlying `statusFilter` state, its type, and the filtering
logic that reads it are untouched (same boundary both prior plans held).

`client/src/pages/dashboard.tsx:304` (the filter state — unchanged by this
plan, still a 3-value-plus-"all" type matching `item.status` exactly):

```ts
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "overdue">("all");
```

`client/src/pages/dashboard.tsx:482` (the filter logic — unchanged by this
plan, still reads the raw `status` value, not any display label):

```ts
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
```

`client/src/pages/dashboard.tsx:591-606` (today — the filter pill row;
this plan changes only line 603's label text for the `"pending"` case):

```tsx
          <div className="flex gap-2 flex-wrap">
            {(["all", "pending", "paid", "overdue"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                data-testid={`filter-status-${s}`}
                className={`px-3 h-10 rounded-xl text-sm font-medium border transition-all capitalize ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
```

Current badge vocabulary for reference (from plan 038, already live —
confirms "Pending" genuinely appears nowhere else a user would see it as a
bill status):

- `client/src/pages/dashboard.tsx`'s `getUrgencyDisplay` returns "Paid",
  "Overdue", "Due", or "Next Cycle" — never "Pending".

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exits 0 |
| Tests     | `pnpm test`   | all pass (this plan adds no test files) |
| Dev server | `pnpm dev`   | boots without error; used for manual verification |

## Scope

**In scope** (the only file you should modify):
- `client/src/pages/dashboard.tsx`

**Out of scope** (do NOT touch, even though related):
- `statusFilter`'s type, `setStatusFilter`, and `matchesStatus` (line 482)
  — the underlying filter value stays `"pending"`, only its rendered label
  changes. Do not rename the state value itself or add a new filter value.
- `data-testid={`filter-status-${s}`}` (line 596) — stays keyed off the raw
  `"pending"` value, not the new label text. Leave it exactly as-is.
- `title="Revert to Pending"` (line 253, on the "revert a paid payment"
  button) — this describes what the action literally does to the
  payment's `status` field in the database (sets it back to `"pending"`),
  not a bill-status badge competing with "Due"/"Next Cycle" vocabulary.
  Different context, do not touch it as part of this plan.
- `getUrgencyDisplay` and the badge render site — both already correct
  from plan 038, nothing to change there.
- `client/src/pages/upcoming.tsx` — has its own separate status model, out
  of scope, same as it was for plans 037/038.

## Git workflow

- Branch: `advisor/039-rename-pending-filter-pill-to-unpaid`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rename the "pending" pill's label text to "Unpaid"

Change `client/src/pages/dashboard.tsx:603` from:

```tsx
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
```

to:

```tsx
                {s === "all" ? "All" : s === "pending" ? "Unpaid" : s.charAt(0).toUpperCase() + s.slice(1)}
```

This only changes what renders for `s === "pending"`. `"paid"` and
`"overdue"` continue to fall through to the existing
`charAt(0).toUpperCase() + slice(1)` capitalization, rendering "Paid" and
"Overdue" exactly as before — both of those words are still accurate
(they match the badge vocabulary from plan 038 unchanged).

**Verify**: `pnpm check` → exits 0. `grep -n '"Unpaid"' client/src/pages/dashboard.tsx` → 1 match.

## Test plan

No new automated tests — same rationale as plans 037/038: no React
rendering test setup in this repo. Verify manually against a live
`pnpm dev`:

1. Confirm the filter pill row shows "All", "Unpaid", "Paid", "Overdue" —
   in that order, matching the existing `["all", "pending", "paid",
   "overdue"]` array order.
2. Click "Unpaid" — confirm it still filters to exactly the same set of
   rows as the old "Pending" pill did (every bill whose `status` is
   `"pending"`), regardless of whether each row's badge shows "Due" or
   "Next Cycle".
3. Click "Paid" and "Overdue" — confirm both labels and filtering behavior
   are unchanged from before this plan.
4. Confirm `hasActiveFilters` behavior (the "clear filters" X button,
   `dashboard.tsx:489`) is unaffected — selecting "Unpaid" still counts as
   an active filter the same way "Pending" did, since the underlying value
   is unchanged.

**Verify**: all 4 observations above hold as described.

## Done criteria

Machine-checkable, plus the manual checks above:

- [ ] `pnpm check` exits 0
- [ ] `pnpm test` exits 0 (unchanged pass count)
- [ ] `grep -n '"Unpaid"' client/src/pages/dashboard.tsx` → 1 match
- [ ] `grep -n '"pending" | "paid" | "overdue"' client/src/pages/dashboard.tsx` → 1 match (confirms `statusFilter`'s type is untouched)
- [ ] `grep -n 'data-testid={\`filter-status-\${s}\`}' client/src/pages/dashboard.tsx` → 1 match (confirms untouched)
- [ ] No files outside `client/src/pages/dashboard.tsx` modified (`git status`)
- [ ] All 4 manual observations confirmed live
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt above (lines 591-606) doesn't match the live
  code (drift since this plan was written).
- `pnpm check` reports new errors you can't resolve in one reasonable fix
  attempt.
- You find another user-facing surface where the word "Pending" is used as
  a bill-status label (distinct from the "Revert to Pending" tooltip named
  out-of-scope above, which is intentionally excluded) — report it rather
  than silently expanding this plan's scope to fix it.

## Maintenance notes

- If a future plan changes `getUrgencyDisplay`'s label wording again
  (e.g. "Due" becomes something else), this pill's `"Unpaid"` label stays
  correct regardless — it deliberately describes the *filter's* meaning
  (not-yet-paid), not either specific badge word, precisely so it doesn't
  need to be kept in lockstep with future badge-wording changes.
