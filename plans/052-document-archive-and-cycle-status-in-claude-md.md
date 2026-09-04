# Plan 052: Document the archive flag and cycle-status system in CLAUDE.md

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e4429a5..HEAD -- CLAUDE.md client/src/lib/bill-status.ts shared/schema.ts`
> If any of these changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `e4429a5`, 2026-09-04

## Why this matters

`CLAUDE.md` was written at the very first `/improve` pass (2026-08-15)
and hasn't been touched since (`plans/021-add-claude-md-fix-replit-md.md`
created it; nothing since has updated it). A large amount of this
session's own work landed after that — the `bills.archived` soft-delete
flag, the whole cycle-status derivation system
(`client/src/lib/bill-status.ts`'s `getBillCycleStatus`), and the
Due/Next Cycle/Unpaid badge vocabulary that's now central to how the
Dashboard represents a bill's state. None of it is mentioned in
`CLAUDE.md`'s "Data model" or "Architecture" sections. The next session
or agent that opens this file for orientation gets an incomplete picture
of how bill status actually works — exactly the kind of gap `CLAUDE.md`
exists to prevent.

## Current state

Relevant file: `CLAUDE.md` — only the "Data model" and "Architecture"
sections gain new lines; nothing else in the file changes.

`CLAUDE.md`'s current "Architecture" section (today, full section):

```markdown
## Architecture

- `server/routes.ts` — HTTP route handlers.
- `server/storage.ts` — data access layer (`DatabaseStorage` implementing `IStorage`).
- `server/db.ts` — Drizzle/pg connection setup.
- `shared/schema.ts` — Drizzle table definitions + Zod schemas (`bills`, `payments`, `categoryBudgets`).
- `shared/routes.ts` — typed API contract (`api.bills.*`, `api.payments.*`) consumed by `client/src/hooks/use-bills.ts`/`use-payments.ts`. Not all endpoints are covered by this contract yet (budgets, `/reset`, `/revert`) — see `plans/014-unify-api-contract.md`.
- `client/src/hooks/` — TanStack Query hooks, one per resource.
- `client/src/pages/` — route-level components (dashboard, history, upcoming, analytics).
- `client/src/components/` — shared UI; `components/ui/` is vendored shadcn/ui, not hand-maintained.
```

`CLAUDE.md`'s current "Data model" section (today, full section):

```markdown
## Data model

- `bills`: recurring payment definitions (name, category, amount, frequency, due day/month, auto-pay, reminder settings).
- `payments`: individual payment records per billing cycle, linked to a bill.
- `categoryBudgets`: optional monthly spending limit per category.
```

`shared/schema.ts:26` (today, the `archived` column — confirms it's a
real, existing field this plan is documenting, not proposing):

```ts
  archived: boolean("archived").default(false).notNull(),
```

`client/src/lib/bill-status.ts`'s exported type and function signature
(today, confirms the exact names/shape this plan's doc text should
reference precisely — see the plan-050 excerpt of this same file for the
full current implementation if more detail is needed; this plan only
needs the public shape, not the internals):

```ts
export type BillCycleStatus = {
  status: "paid" | "pending" | "overdue";
  dueDate: Date;
  amount: string;
  paymentId: number | undefined;
  nextCycle?: { dueDate: Date; amount: string };
};

export function getBillCycleStatus(bill: Bill, payments: Payment[], today: Date): BillCycleStatus
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|----------------------|
| n/a | — | This plan edits only a Markdown file — no build/test/typecheck command applies. Verification is `git diff` review and the `grep` checks in Done criteria. |

## Scope

**In scope**:
- `CLAUDE.md`

**Out of scope** (do NOT touch, even though related):
- `replit.md` — a separate, older doc file; plan 021 already reconciled
  it once and it's not part of this session's active documentation set.
  Don't touch it unless separately asked.
- Any code file — this is a docs-only plan; `bill-status.ts`,
  `dashboard.tsx`, `shared/schema.ts`, etc. are all read-only reference
  material here, not edit targets.
- `TEST_PLAN.md` — a different document (manual test checklist), out of
  scope for this plan's "how the codebase works" documentation update.

## Git workflow

- Branch: `advisor/052-document-archive-and-cycle-status`
- Commit message style: imperative, capitalized sentence, no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the cycle-status system to the Architecture section

Change `CLAUDE.md`'s "Architecture" section from:

```markdown
## Architecture

- `server/routes.ts` — HTTP route handlers.
- `server/storage.ts` — data access layer (`DatabaseStorage` implementing `IStorage`).
- `server/db.ts` — Drizzle/pg connection setup.
- `shared/schema.ts` — Drizzle table definitions + Zod schemas (`bills`, `payments`, `categoryBudgets`).
- `shared/routes.ts` — typed API contract (`api.bills.*`, `api.payments.*`) consumed by `client/src/hooks/use-bills.ts`/`use-payments.ts`. Not all endpoints are covered by this contract yet (budgets, `/reset`, `/revert`) — see `plans/014-unify-api-contract.md`.
- `client/src/hooks/` — TanStack Query hooks, one per resource.
- `client/src/pages/` — route-level components (dashboard, history, upcoming, analytics).
- `client/src/components/` — shared UI; `components/ui/` is vendored shadcn/ui, not hand-maintained.
```

to:

```markdown
## Architecture

- `server/routes.ts` — HTTP route handlers.
- `server/storage.ts` — data access layer (`DatabaseStorage` implementing `IStorage`).
- `server/db.ts` — Drizzle/pg connection setup.
- `shared/schema.ts` — Drizzle table definitions + Zod schemas (`bills`, `payments`, `categoryBudgets`).
- `shared/routes.ts` — typed API contract (`api.bills.*`, `api.payments.*`) consumed by `client/src/hooks/use-bills.ts`/`use-payments.ts`. Not all endpoints are covered by this contract yet (budgets, `/reset`, `/revert`) — see `plans/014-unify-api-contract.md`.
- `client/src/hooks/` — TanStack Query hooks, one per resource.
- `client/src/pages/` — route-level components (dashboard, history, upcoming, analytics).
- `client/src/components/` — shared UI; `components/ui/` is vendored shadcn/ui, not hand-maintained.
- `client/src/lib/bill-status.ts` — `getBillCycleStatus(bill, payments, today)` is the single source of truth for a bill's current-cycle status on the Dashboard: `"paid"` (a payment covers the current cycle), `"overdue"`/`"pending"` (the oldest unpaid payment, before/after its due date), plus an optional `nextCycle` preview (the already-created next payment) shown once a bill is paid. `client/src/pages/upcoming.tsx` has its own independent, simpler status logic for its month-grid view — the two are deliberately not unified (different granularity needs).
```

### Step 2: Add `bills.archived` to the Data model section

Change `CLAUDE.md`'s "Data model" section from:

```markdown
## Data model

- `bills`: recurring payment definitions (name, category, amount, frequency, due day/month, auto-pay, reminder settings).
- `payments`: individual payment records per billing cycle, linked to a bill.
- `categoryBudgets`: optional monthly spending limit per category.
```

to:

```markdown
## Data model

- `bills`: recurring payment definitions (name, category, amount, frequency, due day/month, auto-pay, reminder settings). `archived` (boolean) soft-deletes a bill — "Delete" in the UI archives rather than destroys, preserving its payment history for History/Analytics. Archiving also removes that bill's not-yet-paid payment, if any.
- `payments`: individual payment records per billing cycle, linked to a bill. When a payment is marked paid, the next cycle's payment is created automatically (`resetPayment` in `server/storage.ts`) — a bill's current-cycle paid record and its next unpaid one typically coexist.
- `categoryBudgets`: optional monthly spending limit per category.
- Reverting a paid payment back to pending (`revertPayment`) is blocked server-side for bills with Auto Pay on — Auto Pay would otherwise immediately re-claim it as overdue on the next request, silently undoing the revert. Turn off Auto Pay on the bill first.
```

**Verify**: `git diff CLAUDE.md` shows exactly these two section changes, nothing else in the file touched.

## Test plan

No automated tests apply to a documentation-only change. Verification is
a straightforward content review:

1. Read the full updated `CLAUDE.md` top to bottom — confirm it reads
   coherently, the new lines fit the existing terse, factual style of
   the rest of the file (no marketing language, no restating what the
   code already makes obvious), and nothing else in the file was
   accidentally altered.
2. Cross-check every claim in the new text against the "Current state"
   excerpts above (or the live code, if drift occurred) — every sentence
   added must be verifiably true of the code as it exists, not
   aspirational or approximate.

**Verify**: both checks above hold.

## Done criteria

Machine-checkable, plus the review above:

- [ ] `grep -n "archived" CLAUDE.md` → at least 2 matches (the existing
      "Data model" bullet's implicit context plus this plan's new
      explicit mention — confirm at least 1 new match beyond whatever
      existed before, per the drift check)
- [ ] `grep -n "getBillCycleStatus" CLAUDE.md` → 1 match
- [ ] `grep -n "bill-status.ts" CLAUDE.md` → 1 match
- [ ] `git diff --stat` shows only `CLAUDE.md` changed
- [ ] Full-file read-through confirms coherent, accurate, style-matched prose
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Either "Current state" excerpt above doesn't match the live file
  (drift since this plan was written) — re-derive the correct insertion
  point from the live file rather than guessing.
- `client/src/lib/bill-status.ts`'s exported `BillCycleStatus` type or
  `getBillCycleStatus` signature have changed since this plan was
  written in a way that makes the new doc text inaccurate — verify
  against the live file before writing, adjust the wording to match
  reality rather than copying this plan's text verbatim if it's drifted.

## Maintenance notes

- This plan documents the state of the archive/cycle-status system as of
  commit `e4429a5`. If a future plan changes `getBillCycleStatus`'s
  behavior (e.g. adds a new status value, changes what `nextCycle`
  means), update this same `CLAUDE.md` section in the same change — keep
  the doc and the code from drifting apart again.
