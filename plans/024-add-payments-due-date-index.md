# Plan 024: Add an index on `payments.dueDate`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- shared/schema.ts`
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

`payments.dueDate` is the sort/filter key on every payments list query
(`server/storage.ts`'s `getPayments()` orders by it; the auto-pay sweep
compares against it). No index exists on this column today. At this
app's current scale (one user's bills — tens to low hundreds of rows)
this has no observable performance impact — Postgres seq-scans and sorts
that trivially. This is flagged as a cheap, preventative fix worth having
in place before the dataset grows, not because it's an active bottleneck.

## Current state

`shared/schema.ts:30-38` — the `payments` table, no indexes defined
anywhere in the file:
```ts
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull(),
  amount: numeric("amount").notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidDate: timestamp("paid_date"),
  status: text("status", { enum: ["paid", "pending", "overdue"] }).default("pending").notNull(),
  notes: text("notes"),
});
```

This repo has no versioned migrations — schema changes are applied via
`pnpm db:push` (`drizzle-kit push`), which diffs the schema file against
the live database directly.

## Commands you will need

| Purpose   | Command       | Expected on success |
|-----------|---------------|----------------------|
| Typecheck | `pnpm check`  | exit 0               |
| Push      | `pnpm db:push`| exit 0, prompts/applies the new index |

## Scope

**In scope**:
- `shared/schema.ts` — add one index definition to the `payments` table.

**Out of scope**:
- Any index on `billId` — the audit found `getPaymentsByBill` (the only
  query that would use it) isn't currently called from any route or
  client hook (the client fetches all payments and filters in memory
  instead), so an index there wouldn't currently serve any live query
  path; not added speculatively.
- Any other schema change.

## Git workflow

- Branch: `advisor/024-add-payments-due-date-index`
- Commit; message style matches repo history. Suggested message:
  `Add index on payments.dueDate`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the index

In `shared/schema.ts`, update the import line and add an index to the
`payments` table definition:

```ts
import { pgTable, text, serial, integer, boolean, timestamp, numeric, index } from "drizzle-orm/pg-core";
// ...
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull(),
  amount: numeric("amount").notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidDate: timestamp("paid_date"),
  status: text("status", { enum: ["paid", "pending", "overdue"] }).default("pending").notNull(),
  notes: text("notes"),
}, (table) => ({
  dueDateIdx: index("payments_due_date_idx").on(table.dueDate),
}));
```

**Verify**: `pnpm check` → exit 0.

### Step 2: Push the schema change

```bash
pnpm db:push
```

This requires a reachable `DATABASE_URL` (this repo's existing dev setup).
`drizzle-kit push` will show a diff/prompt describing the new index before
applying it — confirm the prompt only shows the expected `CREATE INDEX`
for `payments_due_date_idx`, nothing else, before accepting.

**Verify**: exit 0, and the prompt/output confirms only the one new index
was created — no unrelated schema changes were included.

### Step 3: Confirm the index exists

```bash
psql "$DATABASE_URL" -c "\d payments" 2>/dev/null || echo "psql not available locally — confirm via Neon's dashboard/SQL editor instead"
```

**Verify**: the output lists `payments_due_date_idx` among the table's
indexes (or, if `psql` isn't available in your environment, confirm via
whatever SQL access method is available, e.g. Neon's web SQL editor —
don't skip this check silently).

## Test plan

- No automated test framework covers schema/index verification directly.
  Verification is Step 3's direct inspection that the index was created.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "payments_due_date_idx" shared/schema.ts` shows the index definition
- [ ] `pnpm db:push` exits 0
- [ ] Step 3 confirms the index exists in the live database
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- No reachable `DATABASE_URL` is available to run `pnpm db:push` against
  — report this rather than treating the schema-file change alone as
  "done," since the index doesn't exist until it's actually applied to
  the database.
- `pnpm db:push`'s prompt shows any unexpected diff beyond the new index
  (e.g. if the schema and live database have drifted for unrelated
  reasons) — STOP and report the full diff rather than accepting it
  blindly, since `db:push` applies whatever diff it detects.

## Maintenance notes

- This repo has no versioned migrations (`pnpm db:push` only) — this is a
  known, previously-audited tradeoff (not something to "fix" as part of
  this plan). If migrations are ever adopted, this index should be
  captured as part of the first baseline migration.
