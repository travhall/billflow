# Plan 028 (direction spike): CSV import for bills

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/routes.ts server/storage.ts client/src/pages/history.tsx`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters (direction rationale)

`history.tsx` already implements CSV **export** for payment history
(`exportToCSV`, `client/src/pages/history.tsx:22-51`). There is no
corresponding **import** path anywhere — bill creation only goes through
`create-bill-dialog.tsx`'s one-record-at-a-time form. This is a real,
grounded surface asymmetry: export-without-import. The highest-value
moment for this feature is the one-time setup cost of entering a full
household's recurring bills (e.g. migrating from a spreadsheet) — after
that, ongoing value is lower since new bills are added infrequently.
Grounding: MEDIUM confidence — the asymmetry is solid evidence, but actual
value depends on how often the owner adds new bills going forward, which
this plan can't verify from the repo alone. This is scoped as a design +
build spike: a working create-only import (no bulk-update/merge logic),
matching the effort/risk tradeoff the original audit estimated.

## Current state

`client/src/pages/history.tsx:22-54` — the existing export function, the
column shape this import should mirror for round-trip compatibility:
```ts
function exportToCSV(payments: Payment[], billMap: Map<number, Bill>) {
  const header = ["Bill Name", "Category", "Due Date", "Paid Date", "Amount", "Status"];
  // ...
}
```
Note this exports **payment** history, not bill definitions — there is no
existing "export bills" function to mirror column-for-column. This plan's
import format is therefore a new, purpose-built CSV shape for bill
*definitions* (name, category, amount, frequency, due day/month, auto-pay),
not a mirror of the payment-history export.

`shared/schema.ts:16-28` — the `bills` table shape the import must
populate:
```ts
export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  defaultAmount: numeric("default_amount").notNull(),
  isVariable: boolean("is_variable").default(false).notNull(),
  frequency: text("frequency", { enum: ["monthly", "yearly"] }).notNull(),
  dueDay: integer("due_day").notNull(),
  dueMonth: integer("due_month"),
  isAutoPay: boolean("is_auto_pay").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  reminderDays: integer("reminder_days"),
});
```

`server/routes.ts` — the existing single-bill create endpoint this plan's
import reuses per-row, not a new bulk-insert code path:
```ts
app.post(api.bills.create.path, async (req, res) => {
  try {
    const input = api.bills.create.input.parse(req.body);
    const bill = await storage.createBill(input);
    res.status(201).json(bill);
  } catch (err) { /* ... */ }
});
```

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

## Scope

**In scope**:
- `client/src/components/import-bills-dialog.tsx` (create) — CSV file
  picker, client-side parse + per-row validation preview, submits valid
  rows one at a time to the existing `POST /api/bills` endpoint (via
  `useCreateBill()`).
- `client/src/pages/history.tsx` or a new location for the trigger button
  — wherever fits best next to the existing "+ Add Bill" button (check
  `client/src/components/app-sidebar.tsx` or `layout.tsx` for where that
  lives currently before deciding placement).

**Out of scope**:
- Any new server endpoint — this plan deliberately reuses the existing
  single-bill `POST /api/bills` per row rather than adding a bulk-import
  endpoint, to avoid new server-side validation/transaction logic in a
  first version. If row-count performance ever becomes a real problem
  (unlikely for a personal bill list), a bulk endpoint is a natural
  follow-up.
- Duplicate detection/merge logic — if a CSV row's bill name matches an
  existing bill, this version creates a second bill rather than
  attempting to merge or update. Document this limitation clearly in the
  UI (Step 3) rather than silently guessing at merge semantics.
- Importing payment history — only bill *definitions* are imported, not
  historical payment records.

## Git workflow

- Branch: `advisor/028-csv-bill-import`
- Commit per step; message style matches repo history. Suggested message:
  `Add CSV import for bills`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the CSV format and write a parser

Column format (header row required): `Name,Category,Amount,Frequency,DueDay,DueMonth,AutoPay`
- `Frequency`: `monthly` or `yearly` (case-insensitive, normalize to lowercase).
- `DueMonth`: required only when `Frequency` is `yearly`, otherwise ignored/blank.
- `AutoPay`: `true`/`false`/`yes`/`no`/blank (blank = false).

Create `client/src/lib/csv-import.ts`:
```ts
export interface ParsedBillRow {
  name: string;
  category: string;
  defaultAmount: string;
  frequency: "monthly" | "yearly";
  dueDay: number;
  dueMonth?: number;
  isAutoPay: boolean;
}

export interface ParseResult {
  valid: ParsedBillRow[];
  errors: { row: number; message: string }[];
}

export function parseBillsCSV(csvText: string): ParseResult {
  const lines = csvText.trim().split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 2) return { valid: [], errors: [{ row: 0, message: "CSV must have a header row and at least one data row" }] };

  const header = lines[0].split(",").map(h => h.trim().toLowerCase());
  const requiredCols = ["name", "category", "amount", "frequency", "dueday"];
  const missing = requiredCols.filter(c => !header.includes(c));
  if (missing.length > 0) {
    return { valid: [], errors: [{ row: 0, message: `Missing required columns: ${missing.join(", ")}` }] };
  }

  const valid: ParsedBillRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map(c => c.trim());
    const get = (col: string) => cells[header.indexOf(col)] ?? "";

    const name = get("name");
    const category = get("category");
    const amount = get("amount");
    const frequency = get("frequency").toLowerCase();
    const dueDay = parseInt(get("dueday"), 10);
    const dueMonthRaw = get("duemonth");
    const autoPayRaw = get("autopay").toLowerCase();

    if (!name || !category || !amount || (frequency !== "monthly" && frequency !== "yearly") || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      errors.push({ row: i + 1, message: `Invalid or missing required field(s) in row: "${lines[i]}"` });
      continue;
    }
    if (frequency === "yearly" && (!dueMonthRaw || isNaN(parseInt(dueMonthRaw, 10)))) {
      errors.push({ row: i + 1, message: `Yearly bill "${name}" is missing a valid DueMonth` });
      continue;
    }

    valid.push({
      name,
      category,
      defaultAmount: amount,
      frequency: frequency as "monthly" | "yearly",
      dueDay,
      dueMonth: frequency === "yearly" ? parseInt(dueMonthRaw, 10) : undefined,
      isAutoPay: autoPayRaw === "true" || autoPayRaw === "yes",
    });
  }

  return { valid, errors };
}
```
This is a minimal CSV parser (naive comma-split, no quoted-field/embedded-
comma support) — sufficient for a simple bill-name/category CSV, but
document this limitation in the UI (Step 2) rather than silently
mishandling a bill name containing a comma.

**Verify**: `pnpm check` → exit 0.

### Step 2: Build the import dialog UI

Create `client/src/components/import-bills-dialog.tsx`: a dialog with a
file input (`<input type="file" accept=".csv">`), reads the file via
`FileReader`, calls `parseBillsCSV`, shows a preview table of valid rows
plus any errors, and a "Import N bills" button that calls
`useCreateBill().mutate()` once per valid row (sequentially or via
`Promise.all` — sequential is simpler and safer for showing per-row
progress/failure). Follow this repo's existing dialog conventions (see
`create-bill-dialog.tsx` for the `Dialog`/`DialogContent`/`DialogHeader`
structure to match). Include a visible note in the dialog: "Bills with
names matching existing bills will be created as duplicates — check your
list after importing" and "Simple CSV only — no support for names
containing commas."

**Verify**: `pnpm check` → exit 0.

### Step 3: Add a trigger button

Add an "Import CSV" button next to the existing "Add Bill" button
(locate its current placement — likely near `CreateBillDialog`'s usage in
`client/src/components/app-sidebar.tsx` or a page header; use
`grep -rn "CreateBillDialog" client/src/` to find the exact spot) that
opens the new `ImportBillsDialog`.

**Verify**: `pnpm check` → exit 0.

### Step 4: Manually verify the import flow

With `pnpm dev` running:
1. Create a test CSV file:
   ```
   Name,Category,Amount,Frequency,DueDay,DueMonth,AutoPay
   Netflix,Subscription,15.99,monthly,1,,false
   Car Insurance,Insurance,600.00,yearly,15,3,true
   ```
2. Open the import dialog, select the file, confirm the preview shows 2
   valid rows with no errors.
3. Click Import, confirm both bills appear on the dashboard with correct
   fields (check the yearly bill shows the right due month).
4. Try a CSV with one intentionally bad row (e.g. missing `DueDay`) mixed
   with one good row — confirm the preview correctly separates them and
   only the good row imports.

**Verify**: both scenarios behave as described — valid rows import
correctly, invalid rows are reported without blocking the valid ones.

## Test plan

- No automated test framework exists (though `parseBillsCSV` in
  `csv-import.ts` is a pure function and a good candidate for a Vitest
  test if `plans/019-add-test-harness-and-ci.md` has been applied —
  optional, not required for this plan's done criteria). Verification is
  the manual flow in Step 4.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `test -f client/src/lib/csv-import.ts` and `test -f client/src/components/import-bills-dialog.tsx` both succeed
- [ ] Manual Step 4 confirms both the happy path (2 valid rows import correctly) and the mixed-validity path (bad row reported, good row still imports)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- You find an existing "export bills" (not payment history) function
  somewhere the audit missed — if one exists, mirror its column format
  instead of inventing a new one, and report the discrepancy.

## Maintenance notes

- Duplicate detection is explicitly out of scope for this first version —
  if the owner reports it's a real pain point after using this feature,
  a follow-up could add a "skip if name already exists" checkbox.
- The CSV parser in `csv-import.ts` is naive (no quoted-field support) —
  if bill names with commas turn out to be needed, upgrade to a proper
  CSV parsing library (e.g. `papaparse`) rather than hand-rolling quote
  handling.
