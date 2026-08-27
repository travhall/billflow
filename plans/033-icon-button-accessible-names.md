# Plan 033: Add accessible names to icon-only buttons

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 03e99d2..HEAD -- client/src/pages/dashboard.tsx client/src/components/theme-toggle.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (accessibility)
- **Planned at**: commit `03e99d2`, 2026-08-27

## Why this matters

Two icon-only buttons in the UI render nothing but an SVG icon and have no
`aria-label`, `title`, or visually-hidden text — so a screen reader
announces them as a bare "button" with no indication of what they do
(WCAG 4.1.2 Name, Role, Value). This is inconsistent with sibling controls
in the same file that already do this correctly: the "Revert to Pending"
button right next to the broken one has `title="Revert to Pending"`
([dashboard.tsx:210](client/src/pages/dashboard.tsx:210)), and the "Dismiss" button on the overdue banner has
`aria-label="Dismiss"` ([dashboard.tsx:485](client/src/pages/dashboard.tsx:485)) — this plan brings the two
outliers in line with that existing, already-correct pattern.

## Current state

### 1. Delete-bill button — missing entirely

[dashboard.tsx:173-180](client/src/pages/dashboard.tsx:173), inside `BillTable`'s row actions (this block
renders once per bill row, in both the "Upcoming Monthly Bills" and "Annual
Bills Overview" tables):

```tsx
                <TableCell className="text-right pr-6">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive no-default-hover-elevate">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
```

Compare to the sibling "Revert to Pending" button a few lines later in the
same file, which already does this correctly, [dashboard.tsx:204-213](client/src/pages/dashboard.tsx:204):

```tsx
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRevertPayment(item.paymentId!)}
                          disabled={revertPending}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground no-default-hover-elevate"
                          title="Revert to Pending"
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
```

### 2. Theme toggle button — missing entirely

Full current file, `client/src/components/theme-toggle.tsx`:

```tsx
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-9 w-9 rounded-lg"
      data-testid="button-theme-toggle"
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-muted-foreground" />
      ) : (
        <Moon className="h-5 w-5 text-muted-foreground" />
      )}
    </Button>
  );
}
```

`Button` here is the shadcn/ui primitive at `client/src/components/ui/button.tsx`
(vendored, don't modify it — it already forwards arbitrary props including
`aria-label` to the underlying `<button>`, which is all this fix needs).

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0, no output |

## Scope

**In scope** (the only files you should modify):
- `client/src/pages/dashboard.tsx`
- `client/src/components/theme-toggle.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `client/src/components/ui/button.tsx` — vendored shadcn primitive, don't
  hand-edit it; it already supports `aria-label` via prop spreading.
- The "Revert to Pending" button (`dashboard.tsx:210`) and the "Dismiss"
  button (`dashboard.tsx:485`) — these are already correct, don't touch
  them (they're the reference pattern, cited above for comparison only).
- `EditBillDialog`'s trigger button (`dashboard.tsx:200`, rendered as
  `<EditBillDialog bill={item.bill} />`) — it's a separate component; if it
  turns out to have the same issue, note it in your final report but do
  not fix it here (out of this plan's scope — it wasn't part of the
  original audit and its trigger button implementation isn't shown above).

## Git workflow

- Branch: `advisor/033-icon-button-accessible-names`
- Commit message style: imperative, capitalized sentence (e.g. "Add
  accessible names to icon-only delete and theme-toggle buttons"), no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `aria-label` to the delete-bill button

In [dashboard.tsx:177](client/src/pages/dashboard.tsx:177), add `aria-label="Delete bill"` to the
`Button`. Since the button is generic across all bill rows (not
per-bill-name), a static label is sufficient and matches the existing
`title="Revert to Pending"` sibling's level of specificity (also static,
not per-row):

```tsx
                        <Button variant="ghost" size="icon" aria-label="Delete bill" className="h-8 w-8 text-muted-foreground hover:text-destructive no-default-hover-elevate">
                          <Trash2 className="h-4 w-4" />
                        </Button>
```

**Verify**: `pnpm check` → exit 0, no new errors.

### Step 2: Add `aria-label` to the theme-toggle button

In `client/src/components/theme-toggle.tsx`, add a dynamic `aria-label`
that names the action the click performs (matches the button's own dynamic
icon, which already swaps between Sun/Moon based on `isDark`):

```tsx
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-9 w-9 rounded-lg"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="button-theme-toggle"
    >
```

**Verify**: `pnpm check` → exit 0, no new errors.

### Step 3: Manual screen-reader / accessibility-tree check

1. Run `pnpm dev`, open the dashboard in a browser.
2. Open browser devtools' Accessibility panel (Chrome: DevTools →
   Elements → Accessibility pane; Firefox: DevTools → Accessibility) and
   inspect the delete (trash icon) button on any bill row — confirm the
   computed "Name" is now "Delete bill" (previously blank/empty).
3. Inspect the theme-toggle button in the top-right of the header — confirm
   the computed "Name" is "Switch to dark mode" (or "Switch to light mode"
   if already in dark mode) — previously blank/empty.
4. Click the theme toggle once and re-inspect — confirm the label flips to
   the opposite instruction (e.g. was "Switch to dark mode", now reads
   "Switch to light mode").

**Verify**: all 4 sub-checks pass.

## Test plan

No automated accessibility test exists in this repo (no
`jest-axe`/`vitest-axe` or similar installed) — adding one is out of scope
for this small, targeted fix. Verification is the manual accessibility-tree
inspection in Step 3, consistent with how this repo verifies other
UI-only changes (see `plans/031`'s Test plan note).

## Done criteria

- [ ] `pnpm check` exits 0, no new errors
- [ ] `grep -n 'aria-label="Delete bill"' client/src/pages/dashboard.tsx` finds exactly 1 match
- [ ] `grep -n 'aria-label={isDark' client/src/components/theme-toggle.tsx` finds exactly 1 match
- [ ] Manual Step 3 (accessibility-tree names, dynamic label flip) passes in a live `pnpm dev` session
- [ ] No files outside `client/src/pages/dashboard.tsx` and `client/src/components/theme-toggle.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row for 033 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at either "Current state" excerpt doesn't match what's actually
  in the file (drift since this plan was written).
- `Button` (the shadcn primitive) turns out not to forward `aria-label` to
  the underlying DOM element (verify by checking the rendered `<button>`'s
  attributes in devtools, not just by reading the component source) — if
  it's swallowed somewhere, report the exact mechanism rather than working
  around it with a wrapper element.

## Maintenance notes

- This plan fixes the two icon-only buttons confirmed during the audit. If
  a broader sweep is wanted later (e.g. every `variant="icon"`/`size="icon"`
  button in `client/src/components/`), that's a larger, separate effort —
  worth a dedicated future plan with its own full inventory, not bundled
  into this small fix.
- Any new icon-only button added to this codebase should follow the same
  pattern demonstrated by the existing "Revert to Pending" button
  (`title=`) or "Dismiss" button (`aria-label=`) — this plan's two fixes
  now make that the consistent convention across all 4 icon-only buttons
  audited in `dashboard.tsx` and `theme-toggle.tsx`.
