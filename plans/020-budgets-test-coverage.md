# Plan 020: Add a Budgets & Analytics section to the manual test plan

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- TEST_PLAN.md`
> If this file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`TEST_PLAN.md` is this repo's manual QA checklist, covering 8 feature
areas: dashboard overdue banner, browser notifications, bill history,
mark-paid/cycle-reset, add/edit bill, upcoming bills, sorting/filtering,
and delete. It never mentions "budget" or "analytics" anywhere. The
budgets/analytics feature is real and shipped (`client/src/pages/analytics.tsx`,
`client/src/hooks/use-budgets.ts`, `server/routes.ts:136-161`'s
`/api/budgets` endpoints, `server/storage.ts`'s `upsertBudget`/
`deleteBudget`) — it's the one feature nobody, human or automated, is
currently verifying at all. `deleteBudget` is also a hard delete (unlike
`deleteBill`, which soft-archives), making it a second money-adjacent
mutation path worth explicit QA coverage.

## Current state

`TEST_PLAN.md` (relevant excerpt — the file's existing structure, section
8 is the last one):
```
## 8. Delete Bill

| Step | Action | Expected result |
|------|--------|-----------------|
| 8a | Click the trash icon on a bill | Confirmation dialog appears |
| 8b | Cancel | Bill remains |
| 8c | Confirm delete | Bill disappears from the list (archived) |
```
No section covers Budgets or Analytics anywhere in the file.

## Commands you will need

None — this is a documentation-only change to a markdown file.

## Scope

**In scope**:
- `TEST_PLAN.md` — add one new section.

**Out of scope**:
- Any automated test — that's `plans/019-add-test-harness-and-ci.md`'s
  domain (harness) and future follow-on work (actual coverage of
  `upsertBudget`/`deleteBudget`); this plan only adds the manual checklist
  entry, matching the file's existing style and scope.

## Git workflow

- Branch: `advisor/020-budgets-test-coverage`
- Commit; message style matches repo history. Suggested message:
  `Add Budgets & Analytics section to TEST_PLAN.md`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the new section

Append to `TEST_PLAN.md`, after the existing "## 8. Delete Bill" section,
matching its exact table format:

```markdown

---

## 9. Budgets & Analytics

| Step | Action | Expected result |
|------|--------|-----------------|
| 9a | Go to the Analytics page | Summary cards, monthly chart, category donut, and budget limits section all load |
| 9b | Click the **+** next to a category with no limit set | Inline input appears |
| 9c | Enter an amount and submit | Limit saves; progress bar appears showing this month's spend vs. the limit |
| 9d | Spend past the limit for that category (mark a bill in that category paid) | Progress bar turns red; "Over by $X this month" text appears |
| 9e | Click the pencil icon on an existing limit | Inline input appears pre-filled with the current limit |
| 9f | Change the amount and save | Limit updates; progress bar recalculates |
| 9g | Click the trash icon while editing a limit | Confirmation not required — limit is removed immediately (hard delete, not archived) |
| 9h | Reload the page after removing a limit | Category shows "No limit set — click + to add one" again |
```

**Verify**: the file renders as valid markdown (visually inspect, or run
any markdown linter already in your environment if one's available — not
required, this repo has none configured).

## Test plan

- This plan's own "test" is the manual walkthrough it adds — no further
  verification beyond confirming the section was added correctly and
  matches the existing file's table format.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "## 9. Budgets" TEST_PLAN.md` shows the new section present
- [ ] `grep -c "^|" TEST_PLAN.md` increased by 9 (the header row + 8 new step rows — count before/after)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find (e.g. if the
  file's section numbering or table format has changed).

## Maintenance notes

- If `plans/019-add-test-harness-and-ci.md` and further follow-on
  automated coverage for `server/storage.ts`'s `upsertBudget`/
  `deleteBudget` are added later, this manual checklist entry stays useful
  as a UI-level smoke test even after automated coverage exists — the two
  aren't redundant (one verifies the storage layer, the other verifies the
  full UI flow).
