# Plan 031: Make bill-table column sort headers keyboard-accessible

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

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (accessibility)
- **Planned at**: commit `03e99d2`, 2026-08-27

## Why this matters

The bill table's 5 sortable columns (Bill Name, Category, Due Date, Amount,
Status) are sorted by clicking a `<th>` that has an `onClick` handler and
nothing else — no `tabIndex`, no keyboard handler, no `role`, no
`aria-sort`. A keyboard-only or screen-reader user cannot Tab to these
headers at all, so sorting — a core feature of the app's two main tables —
is entirely unavailable to them (WCAG 2.1.1 Keyboard, 4.1.2 Name/Role/Value).
Mouse/touch users are unaffected today; this plan doesn't change their
experience, it adds the missing keyboard path and screen-reader semantics.

## Current state

- `client/src/pages/dashboard.tsx` — defines `BillTable`, the shared table
  component used for both "Upcoming Monthly Bills" and "Annual Bills
  Overview" (rendered twice, [dashboard.tsx:613](client/src/pages/dashboard.tsx:613) and
  [dashboard.tsx:626](client/src/pages/dashboard.tsx:626)).

Exact current code, [dashboard.tsx:95-124](client/src/pages/dashboard.tsx:95):

```tsx
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6 cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => onSort('name')}>
              <div className="flex items-center">
                Bill Name <SortIcon column="name" sortConfig={sortConfig} />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => onSort('category')}>
              <div className="flex items-center">
                Category <SortIcon column="category" sortConfig={sortConfig} />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => onSort('date')}>
              <div className="flex items-center">
                Due Date <SortIcon column="date" sortConfig={sortConfig} />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => onSort('amount')}>
              <div className="flex items-center">
                Amount <SortIcon column="amount" sortConfig={sortConfig} />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group" onClick={() => onSort('status')}>
              <div className="flex items-center">
                Status <SortIcon column="status" sortConfig={sortConfig} />
              </div>
            </TableHead>
            <TableHead className="text-right pr-6 min-w-[140px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
```

`SortIcon` (purely presentational, unchanged by this plan), [dashboard.tsx:53-56](client/src/pages/dashboard.tsx:53):

```tsx
function SortIcon({ column, sortConfig }: { column: string; sortConfig: SortConfig }) {
  if (sortConfig?.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
  return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
}
```

`SortConfig` type, [dashboard.tsx:40-43](client/src/pages/dashboard.tsx:40):

```tsx
type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
} | null;
```

`TableHead` is a plain forwarded `<th>` with no built-in interactivity —
[client/src/components/ui/table.tsx:69-82](client/src/components/ui/table.tsx:69):

```tsx
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
```

This is a vendored shadcn/ui primitive (per `CLAUDE.md`: "`components/ui/`
is vendored shadcn/ui, not hand-maintained") — do not modify it. Fix this in
`dashboard.tsx` by changing what's rendered *inside* each sortable
`TableHead`, plus adding `aria-sort` to the `<TableHead>` itself (it accepts
arbitrary `th` props via `{...props}`, so `aria-sort` passes through fine).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0, no output (current baseline is clean — zero pre-existing errors) |
| Dev server | `pnpm dev` | starts on port 5000 (or `$PORT`) with no console errors |

## Scope

**In scope** (the only file you should modify):
- `client/src/pages/dashboard.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `client/src/components/ui/table.tsx` — vendored shadcn primitive, don't
  hand-edit it for this fix; everything needed can be done from the call
  site.
- The `Actions` column header (`dashboard.tsx:123`) — it isn't sortable,
  leave it as plain text.
- `handleSort` / `onSort` logic itself ([dashboard.tsx:271-279](client/src/pages/dashboard.tsx:271)) — the
  sort *behavior* is correct and untouched; this plan only adds the missing
  input method and ARIA semantics on top of it.

## Git workflow

- Branch: `advisor/031-keyboard-accessible-sort-headers`
- Commit per logical step; message style: imperative, capitalized sentence
  (e.g. "Make bill-table sort headers keyboard-accessible"), no
  conventional-commit prefix — matches this repo's existing log (see
  `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Wrap each sortable header's content in a real `<button>`

For each of the 5 sortable `TableHead` elements, move the `onClick` off the
`TableHead` and onto a `<button type="button">` that wraps the existing
`<div className="flex items-center">...</div>` content. A native `<button>`
is focusable and fires `onClick` on both mouse click and Enter/Space by
default — no manual `onKeyDown` needed.

Target shape for the "Bill Name" header (repeat the same pattern for
`category`/`date`/`amount`/`status`, changing only the sort key, label text,
and `aria-sort` value):

```tsx
            <TableHead
              className="pl-6"
              aria-sort={sortConfig?.key === 'name' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button
                type="button"
                onClick={() => onSort('name')}
                className="flex items-center hover:text-foreground transition-colors group w-full"
              >
                Bill Name <SortIcon column="name" sortConfig={sortConfig} />
              </button>
            </TableHead>
```

Notes:
- The old `cursor-pointer hover:bg-muted/50 transition-colors group` classes
  lived on the `TableHead` to signal "this is clickable"; move the
  hover/interactivity styling onto the new `<button>` instead (as shown
  above — `hover:text-foreground transition-colors group`). Keep the
  `pl-6`/`pr-6` padding utilities that exist on the first/last `TableHead`
  (`pl-6` on Bill Name) on the `TableHead`, not the button, so cell spacing
  is unchanged.
- Give the button `w-full` and keep the inner `flex items-center` div (or
  fold its classes onto the button directly) so the whole header cell
  remains clickable, matching today's behavior where clicking anywhere in
  the `<th>` triggers a sort.
- `aria-sort` goes on the `<th>` (i.e. `TableHead`), per the
  [WAI-ARIA sortable-table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/) —
  not on the button. Non-sortable headers (`Actions`) get no `aria-sort`
  attribute at all (its absence is equivalent to `"none"`).

**Verify**: `pnpm check` → exit 0, no new errors.

### Step 2: Manual keyboard test against the live dev server

1. Run `pnpm dev`.
2. Open the dashboard in a browser, Tab from the "Search bills…" input
   toward the table (or click into the page and press Tab repeatedly) until
   focus reaches "Bill Name" in the table header — confirm a visible focus
   ring appears on the button (shadcn's default button/focus-visible
   styling should apply automatically since it's a real `<button>`; if no
   focus ring is visible, that's a STOP condition, see below).
3. Press Enter (or Space) — confirm the table re-sorts by name ascending,
   the sort icon changes to the ascending arrow, and clicking/pressing
   again toggles to descending then back to unsorted, matching the existing
   mouse-click behavior exactly.
4. Confirm mouse click still works unchanged on all 5 sortable headers.
5. With browser devtools open, inspect one sorted `<th>` and confirm
   `aria-sort="ascending"` (or `"descending"`) is present when that column
   is the active sort, and absent/`"none"` on the other headers.

**Verify**: all 5 sub-checks above pass. No automated test exists for this
interaction (see Test plan below for what to add).

## Test plan

This repo has a Vitest harness (`pnpm test`, see
`shared/date-utils.test.ts` for the existing pattern) but no component/DOM
test setup (no `@testing-library/react`, no jsdom config in
`vitest.config.ts`) — adding one is out of scope for this plan. Verification
is manual (Step 2 above), consistent with how most of this repo's prior
UI-behavior plans were verified (see `plans/README.md` plans 014, 015, 025,
026, 027, 028 — all manually verified against a live `pnpm dev`, no
component tests added).

## Done criteria

Machine-checkable where possible; manual steps called out:

- [ ] `pnpm check` exits 0, no new errors
- [ ] All 5 sortable `TableHead` elements contain a `<button type="button">` wrapping their label + `SortIcon` (`grep -c '<button' client/src/pages/dashboard.tsx` includes 5 more than before this change, plus the pre-existing buttons in the file)
- [ ] Each sortable `TableHead` has an `aria-sort` attribute (`grep -c 'aria-sort=' client/src/pages/dashboard.tsx` → 5)
- [ ] Manual Step 2 (keyboard sort, focus ring, mouse-click parity, `aria-sort` toggling) passes in a live `pnpm dev` session
- [ ] No files outside `client/src/pages/dashboard.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row for 031 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at [dashboard.tsx:95-124](client/src/pages/dashboard.tsx:95) doesn't match the "Current state"
  excerpt above (the file has drifted since this plan was written).
- No visible focus ring appears on the new `<button>` elements when
  Tab-focused — this means the app's global CSS or the shadcn `Button`
  focus-visible styles aren't applying to a plain `<button>`; investigate
  `client/src/index.css` and `client/src/components/ui/button.tsx` for a
  `:focus-visible` rule to match, rather than inventing a new one.
- Wrapping the header content in a `<button>` visibly breaks the header row
  layout (e.g. icon wraps to a new line, column width shifts) in a way
  simple class tweaks (from Step 1's notes) don't fix.

## Maintenance notes

- If a 6th sortable column is ever added, follow the same pattern: `<th>`
  gets `aria-sort`, the label + `SortIcon` go inside a `<button
  type="button" onClick={...}>`.
- A reviewer should scrutinize that hover/focus styling still visually
  matches the old `cursor-pointer hover:bg-muted/50` treatment closely
  enough that sighted mouse users don't perceive a regression — the classes
  moved from the `<th>` to the `<button>`, but the visual affordance should
  look the same.
- Adding `@testing-library/react` + jsdom to actually unit-test this
  interaction (keyboard Enter triggers `onSort`) was considered but is a
  bigger, separate investment (new dev dependency, `vitest.config.ts`
  changes) — worth a future plan if the app's test coverage strategy
  expands beyond the current `shared/` unit tests.
