# Plan 003: Return 404 (not 200 with empty body) when updating a nonexistent bill or payment

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3e56e49..HEAD -- server/storage.ts server/routes.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3e56e49`, 2026-08-15

## Why this matters

`updateBill()` and `updatePayment()` in `server/storage.ts` run a Drizzle
`UPDATE ... RETURNING` and destructure the first row without checking
whether any row was actually returned. When the target `id` doesn't exist
(e.g. a stale browser tab still showing a bill that was deleted in another
tab), `db.update(...).returning()` returns an empty array, the
destructured `[updated]` is `undefined`, and `res.json(undefined)` sends
an HTTP `200` with an **empty response body** — not the `404` that
`shared/routes.ts` already declares as the contract for these routes
(`api.bills.update.responses[404]`, `api.payments.update.responses[404]`).
On the client, `use-bills.ts`'s `useUpdateBill()` checks `res.ok` (`true`
for this empty 200) and then calls `api.bills.update.responses[200].parse(await res.json())`
— but `res.json()` on an empty body throws an unhandled `SyntaxError`
("Unexpected end of JSON input") instead of a clean, catchable "not found"
error the UI could show the user.

## Current state

`server/storage.ts:45-48` — `updateBill`:
```ts
async updateBill(id: number, updates: UpdateBillRequest): Promise<Bill> {
  const [updated] = await db.update(bills).set(updates).where(eq(bills.id, id)).returning();
  return updated;
}
```
Note the return type is declared `Promise<Bill>` but the actual runtime
value can be `undefined` — the type signature is already lying about this.

`server/storage.ts:85-88` — `updatePayment`, same shape:
```ts
async updatePayment(id: number, updates: UpdatePaymentRequest): Promise<Payment> {
  const [updated] = await db.update(payments).set(updates).where(eq(payments.id, id)).returning();
  return updated;
}
```

`server/routes.ts:54-68` — the bill PUT handler that calls it:
```ts
app.put(api.bills.update.path, async (req, res) => {
  try {
    const input = api.bills.update.input.parse(req.body);
    const bill = await storage.updateBill(Number(req.params.id), input);
    res.json(bill);
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

`server/routes.ts:97-111` — the payment PUT handler, same shape:
```ts
app.put(api.payments.update.path, async (req, res) => {
  try {
    const input = api.payments.update.input.parse(req.body);
    const payment = await storage.updatePayment(Number(req.params.id), input);
    res.json(payment);
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

`shared/routes.ts:35-43` — the contract these routes are supposed to satisfy:
```ts
update: {
  method: 'PUT' as const,
  path: '/api/bills/:id',
  input: insertBillSchema.partial(),
  responses: {
    200: z.custom<typeof bills.$inferSelect>(),
    404: errorSchemas.notFound,
  },
},
```
(payments' `update` contract at `shared/routes.ts:70-78` is identical in shape).

The existing 404 pattern already used elsewhere in this file, for
`resetPayment`/`revertPayment` (`server/routes.ts:118-134`):
```ts
app.post("/api/payments/:id/reset", async (req, res) => {
  try {
    const payment = await storage.resetPayment(Number(req.params.id));
    res.json(payment);
  } catch (err) {
    res.status(404).json({ message: err instanceof Error ? err.message : "Unknown error" });
  }
});
```
This plan follows that same "storage throws, route catches and returns
404" convention rather than inventing a new one.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0               |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000" |

No automated test runner exists in this repo. Verification uses `curl`
against the running dev server.

## Scope

**In scope**:
- `server/storage.ts` — `updateBill()`, `updatePayment()`
- `server/routes.ts` — the two `PUT` handlers at lines 54-68 and 97-111

**Out of scope**:
- `deleteBill`/`deletePayment` — these already silently no-op on a missing
  row (an `UPDATE`/`DELETE` on a nonexistent id matches zero rows, no
  error), which is idempotent and acceptable REST behavior for DELETE; not
  changing that.
- `createBill`/`createPayment` — not affected by this bug.
- Any client-side change — `use-bills.ts`/`use-payments.ts` already handle
  a non-`res.ok` response correctly (`throw new Error(...)`); once the
  server returns a real 404, the existing client error handling applies
  without modification.

## Git workflow

- Branch: `advisor/003-404-on-missing-update`
- Commit per step; message style matches repo history. Suggested message:
  `Return 404 instead of empty 200 when updating a nonexistent bill or payment`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `updateBill` throw when no row matches

In `server/storage.ts`, replace lines 45-48:

```ts
async updateBill(id: number, updates: UpdateBillRequest): Promise<Bill> {
  const [updated] = await db.update(bills).set(updates).where(eq(bills.id, id)).returning();
  if (!updated) throw new Error("Bill not found");
  return updated;
}
```

**Verify**: `pnpm check` → exit 0. The return type `Promise<Bill>` is now
actually honest (never returns `undefined`).

### Step 2: Make `updatePayment` throw the same way

In `server/storage.ts`, replace lines 85-88:

```ts
async updatePayment(id: number, updates: UpdatePaymentRequest): Promise<Payment> {
  const [updated] = await db.update(payments).set(updates).where(eq(payments.id, id)).returning();
  if (!updated) throw new Error("Payment not found");
  return updated;
}
```

**Verify**: `pnpm check` → exit 0.

### Step 3: Catch the "not found" error in both PUT route handlers

In `server/routes.ts`, update the bill PUT handler (lines 54-68) to catch
the not-found case ahead of the generic `throw err`:

```ts
app.put(api.bills.update.path, async (req, res) => {
  try {
    const input = api.bills.update.input.parse(req.body);
    const bill = await storage.updateBill(Number(req.params.id), input);
    res.json(bill);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    if (err instanceof Error && err.message === "Bill not found") {
      return res.status(404).json({ message: err.message });
    }
    throw err;
  }
});
```

Apply the equivalent change to the payment PUT handler (lines 97-111),
matching on `"Payment not found"`.

**Verify**: `pnpm check` → exit 0.

### Step 4: Manually verify both endpoints

With `pnpm dev` running:

```bash
curl -i -X PUT http://localhost:5000/api/bills/999999 \
  -H 'Content-Type: application/json' -d '{"name":"test"}'

curl -i -X PUT http://localhost:5000/api/payments/999999 \
  -H 'Content-Type: application/json' -d '{"status":"paid"}'
```

**Verify**: both responses show `HTTP/1.1 404` and a JSON body
`{"message":"Bill not found"}` / `{"message":"Payment not found"}` — not
`200` with an empty body. Also re-run a normal update against a real
existing bill/payment id to confirm the happy path is unaffected (should
still return `200` with the updated record).

## Test plan

- No automated test framework exists. Verification is the `curl` checks in
  Step 4, covering: (a) update-missing-bill → 404, (b) update-missing-payment
  → 404, (c) update-existing-bill → 200 with updated data (regression
  check on the happy path).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `grep -n "if (!updated) throw" server/storage.ts` shows both `updateBill` and `updatePayment` (2 matches)
- [ ] `grep -n "not found" server/routes.ts` shows both PUT handlers catching the not-found case (in addition to the existing 2 in the reset/revert handlers — 4 total)
- [ ] `curl -i -X PUT http://localhost:5000/api/bills/999999 -d '{}' -H 'Content-Type: application/json'` returns `404`
- [ ] `curl -i -X PUT http://localhost:5000/api/payments/999999 -d '{}' -H 'Content-Type: application/json'` returns `404`
- [ ] A PUT against a real existing bill id still returns `200` with the updated bill (happy path unaffected)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the "Current state" excerpts doesn't match what you find.
- `pnpm check` fails for a reason other than the changes described here.
- The happy-path regression check in Step 4 fails (an existing bill/payment
  update stops working) — this would indicate the `if (!updated) throw`
  guard is misfiring even when a row does exist.

## Maintenance notes

- This plan intentionally matches the existing string-message-based error
  convention already used by `resetPayment`/`revertPayment`'s route
  handlers (`server/routes.ts:118-134`) rather than introducing typed
  error classes — keeps the diff minimal and consistent with the rest of
  the file. If this repo ever adopts typed errors, all four "not found"
  call sites (reset, revert, update-bill, update-payment) should be
  migrated together.
- No further plan currently touches these two functions.
