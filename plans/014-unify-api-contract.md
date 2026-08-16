# Plan 014: Extend the shared API contract to cover budgets, and migrate the two hand-rolled fetch call sites onto it

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- shared/routes.ts client/src/hooks/use-budgets.ts client/src/components/edit-bill-dialog.tsx server/routes.ts`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`shared/routes.ts` defines a typed, Zod-validated contract (`api.bills.*`,
`api.payments.*`) that `client/src/hooks/use-bills.ts` and
`use-payments.ts` both build their fetch calls from — request/response
shapes are checked against the schema at both ends. But the contract only
covers bills and payments CRUD. Budgets (`GET/POST /api/budgets`,
`DELETE /api/budgets/:id`, defined server-side in `server/routes.ts:136-161`)
were added later and never added to the contract — `use-budgets.ts`
instead calls `apiRequest("POST", "/api/budgets", ...)` with hand-typed
inline objects and no response validation. Separately,
`edit-bill-dialog.tsx` also bypasses the *existing* bills contract
entirely: instead of using the already-available `useUpdateBill()` hook
from `use-bills.ts`, it calls `apiRequest("PUT", ...)` directly. This
means a change to the budgets or bill-update response shape has no
compile-time or runtime check on the client side for these two call
sites — exactly the kind of drift that turns into a silent runtime bug.
This plan closes both gaps: extends the contract to cover budgets, and
migrates both bypassing call sites onto the typed pattern.

## Current state

`shared/routes.ts` (full file) — the existing contract, covering only
`bills` and `payments`:
```ts
import { z } from 'zod';
import { insertBillSchema, insertPaymentSchema, bills, payments } from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  bills: { /* list, create, update, delete — see file for full shape */ },
  payments: { /* list, create, update, delete */ },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  // ...
}
```
Note `errorSchemas` is defined and referenced in the `responses` maps
(e.g. `404: errorSchemas.notFound`) but no client call site actually
`.parse()`s an error response against it — it's currently dead weight
beyond documenting the intended shape. This plan wires it into actual use
for the new budgets contract (see Step 2) rather than leaving it purely
decorative.

`server/routes.ts:136-161` — the real budgets endpoints this plan's new
contract entries must match:
```ts
app.get("/api/budgets", async (_req, res) => {
  const budgets = await storage.getBudgets();
  res.json(budgets);
});

app.post("/api/budgets", async (req, res) => {
  try {
    const { category, monthlyLimit } = z.object({
      category: z.string().min(1),
      monthlyLimit: z.string().min(1),
    }).parse(req.body);
    const budget = await storage.upsertBudget(category, monthlyLimit);
    res.status(201).json(budget);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    throw err;
  }
});

app.delete("/api/budgets/:id", async (req, res) => {
  await storage.deleteBudget(Number(req.params.id));
  res.status(204).send();
});
```

`shared/schema.ts:6-14` — the `categoryBudgets` table this contract wraps:
```ts
export const categoryBudgets = pgTable("category_budgets", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(),
  monthlyLimit: numeric("monthly_limit").notNull(),
});

export const insertCategoryBudgetSchema = createInsertSchema(categoryBudgets).omit({ id: true });
export type CategoryBudget = typeof categoryBudgets.$inferSelect;
export type InsertCategoryBudget = z.infer<typeof insertCategoryBudgetSchema>;
```

`client/src/hooks/use-budgets.ts` (full file) — the bypassing hooks:
```ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CategoryBudget } from "@shared/schema";

export function useBudgets() {
  return useQuery<CategoryBudget[]>({ queryKey: ["/api/budgets"] });
}

export function useUpsertBudget() {
  return useMutation({
    mutationFn: ({ category, monthlyLimit }: { category: string; monthlyLimit: string }) =>
      apiRequest("POST", "/api/budgets", { category, monthlyLimit }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/budgets"] }),
  });
}

export function useDeleteBudget() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/budgets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/budgets"] }),
  });
}
```

`client/src/hooks/use-bills.ts:1-15` — the existing contract-driven
pattern to replicate (note the `.parse()` against the contract's declared
response schema):
```ts
import { api, buildUrl } from "@shared/routes";
// ...
export function useBills() {
  return useQuery({
    queryKey: [api.bills.list.path],
    queryFn: async () => {
      const res = await fetch(api.bills.list.path);
      if (!res.ok) throw new Error("Failed to fetch bills");
      return api.bills.list.responses[200].parse(await res.json());
    },
  });
}
```

`client/src/components/edit-bill-dialog.tsx:72-88` — the bypassing bill
update call:
```ts
const onSubmit = async (data: any) => {
  try {
    await apiRequest("PUT", `/api/bills/${bill.id}`, data);
    queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
    toast({ title: "Success", description: "Bill updated successfully" });
    setOpen(false);
  } catch (error) {
    toast({ title: "Error", description: "Failed to update bill", variant: "destructive" });
  }
};
```
The already-existing, unused-here alternative is `useUpdateBill()` from
`client/src/hooks/use-bills.ts:53-74`.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

## Scope

**In scope**:
- `shared/routes.ts` — add a `budgets` entry to the `api` object.
- `client/src/hooks/use-budgets.ts` — migrate all 3 hooks to the contract-driven pattern.
- `client/src/components/edit-bill-dialog.tsx` — `onSubmit` only, switch to `useUpdateBill()`.

**Out of scope**:
- `/api/payments/:id/reset`, `/api/payments/:id/revert`, and (if
  `plans/005-atomic-mark-paid-endpoint.md` was applied)
  `/api/payments/:id/mark-paid-and-reset` — these are also uncontracted
  endpoints, but adding them requires more contract-shape design (they
  return composite objects, not a single entity) than this plan's budgets
  addition; left as a natural follow-up, not silently expanded into here.
- Any change to `server/routes.ts`'s actual budget endpoint behavior —
  this plan only adds a client-side contract that matches what already
  exists server-side, it doesn't change server behavior.

## Git workflow

- Branch: `advisor/014-unify-api-contract`
- Commit per step; message style matches repo history. Suggested message:
  `Add budgets to the shared API contract, migrate bypassing fetch call sites`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `budgets` entry to the shared contract

In `shared/routes.ts`, update the import line and add a new top-level key
to the `api` object (after the closing `},` of `payments`):

```ts
import { insertBillSchema, insertPaymentSchema, insertCategoryBudgetSchema, bills, payments, categoryBudgets } from './schema';
// ...
export const api = {
  bills: { /* unchanged */ },
  payments: { /* unchanged */ },
  budgets: {
    list: {
      method: 'GET' as const,
      path: '/api/budgets',
      responses: {
        200: z.array(z.custom<typeof categoryBudgets.$inferSelect>()),
      },
    },
    upsert: {
      method: 'POST' as const,
      path: '/api/budgets',
      input: insertCategoryBudgetSchema,
      responses: {
        201: z.custom<typeof categoryBudgets.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/budgets/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};
```

Note the server's actual `POST /api/budgets` handler (`server/routes.ts:142-147`)
validates against an inline `z.object({ category: z.string().min(1),
monthlyLimit: z.string().min(1) })`, not `insertCategoryBudgetSchema`
directly — check these two schemas describe the same shape (both should:
`category: string`, `monthlyLimit: string`) before using
`insertCategoryBudgetSchema` as the contract's `input`; if they diverge in
any field, use the server's actual inline schema shape as the source of
truth for the contract instead, since the contract must describe reality.

**Verify**: `pnpm check` → exit 0.

### Step 2: Migrate `use-budgets.ts` to the contract-driven pattern

Replace `client/src/hooks/use-budgets.ts` in full:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useBudgets() {
  return useQuery({
    queryKey: [api.budgets.list.path],
    queryFn: async () => {
      const res = await fetch(api.budgets.list.path);
      if (!res.ok) throw new Error("Failed to fetch budgets");
      return api.budgets.list.responses[200].parse(await res.json());
    },
  });
}

export function useUpsertBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { category: string; monthlyLimit: string }) => {
      const res = await fetch(api.budgets.upsert.path, {
        method: api.budgets.upsert.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save budget");
      }
      return api.budgets.upsert.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.budgets.list.path] }),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.budgets.delete.path, { id });
      const res = await fetch(url, { method: api.budgets.delete.method });
      if (!res.ok) throw new Error("Failed to delete budget");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.budgets.list.path] }),
  });
}
```

Note the query key changes from the string literal `"/api/budgets"` to
`api.budgets.list.path` — these evaluate to the same string
(`"/api/budgets"`) so this is not a behavior change, just deriving the key
from the contract instead of duplicating the literal.

**Verify**: `pnpm check` → exit 0. Then manually confirm in
`client/src/pages/analytics.tsx` (the only consumer of these hooks, per
`grep -rn "useBudgets\|useUpsertBudget\|useDeleteBudget" client/src/`)
that nothing else needs to change — it only calls the hooks, not their
internals.

### Step 3: Migrate `edit-bill-dialog.tsx` to `useUpdateBill()`

In `client/src/components/edit-bill-dialog.tsx`, replace the `onSubmit`
function (lines 72-88) and remove the now-unused `apiRequest`/`queryClient`
import if nothing else in the file uses them (check with
`grep -n "apiRequest\|queryClient" client/src/components/edit-bill-dialog.tsx`
after this change):

```ts
import { useUpdateBill } from "@/hooks/use-bills";
// ... inside the component:
const updateBill = useUpdateBill();

const onSubmit = (data: any) => {
  updateBill.mutate(
    { id: bill.id, data },
    { onSuccess: () => setOpen(false) }
  );
};
```

`useUpdateBill()` (`client/src/hooks/use-bills.ts:53-74`) already shows
its own success/error toasts ("Bill Updated" / thrown error), so the
dialog's separate manual toast calls in the old `onSubmit` are redundant
and are dropped here — confirm no duplicate toast appears after this
change (Step 4).

**Verify**: `pnpm check` → exit 0.

### Step 4: Manually verify both migrated flows

With `pnpm dev` running:
1. On the Analytics page, set a category budget limit, confirm it saves
   and appears (exercises `useUpsertBudget`); delete it (exercises
   `useDeleteBudget`); reload the page and confirm the list loads
   (exercises `useBudgets`).
2. Edit an existing bill via its pencil icon, change a field, save.
   Confirm exactly one "Bill Updated" toast appears (not zero, not two)
   and the dashboard reflects the change.

**Verify**: both flows work with no console errors and no duplicate/missing toasts.

## Test plan

- No automated test framework exists. Verification is the manual flows in
  Step 4, which exercise every migrated hook and call site.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "api.budgets" shared/routes.ts client/src/hooks/use-budgets.ts` shows both files reference the new contract entry
- [ ] `grep -n "useUpdateBill" client/src/components/edit-bill-dialog.tsx` shows the migrated call
- [ ] `grep -n "apiRequest" client/src/hooks/use-budgets.ts` returns no matches (fully migrated off the untyped helper)
- [ ] Manual Step 4 confirms both flows work with no duplicate/missing toasts
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- The server's inline budget-creation Zod schema
  (`server/routes.ts:144-147`) and `insertCategoryBudgetSchema` describe
  meaningfully different shapes — use the server's actual validated shape
  as the source of truth and report the discrepancy rather than picking
  one arbitrarily.
- `edit-bill-dialog.tsx` turns out to have other logic in `onSubmit`
  beyond what's shown in "Current state" (e.g. if another plan already
  modified this file) — re-read the live file and adapt rather than
  blindly pasting the replacement shown here.

## Maintenance notes

- `/api/payments/:id/reset`, `/api/payments/:id/revert`, and (if applied)
  `/api/payments/:id/mark-paid-and-reset` remain outside the shared
  contract after this plan — a natural next step once this pattern is
  proven out, but deliberately not expanded into this plan's scope.
- Any new client code that calls a server endpoint should default to the
  `api`/`buildUrl`/`.parse()` pattern established in `use-bills.ts` and now
  also `use-budgets.ts`, rather than reaching for `apiRequest` directly.
