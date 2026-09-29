# BillFlow

Personal bill/payment tracking app. Solo-developer, single-user, built to
run locally or on a small always-on deployment — no user accounts, no
multi-tenant auth.

## Features

- **Dashboard** — monthly budget summary, remaining-to-pay, and a
  filterable/sortable table of bills with quick actions (Mark Paid, Pay
  Ahead, Revert to Pending, Archive)
- **Bills** — monthly, yearly, and multi-year (every N years) frequencies;
  optional auto-pay, per-bill payment reminders, and variable amounts
- **Payments** — one row per billing cycle; marking a bill paid
  auto-queues its next cycle, with an optional confirmation number and
  amount/date override
- **Upcoming** — 6-month grid view of every bill's cycles
- **Calendar** — month view of due dates with a payday marker
- **History** — full payment log, sortable/filterable, CSV export
- **Analytics** — monthly spend by category, trends, and per-category
  budget limits with overage warnings
- **CSV import** — bulk-create bills from a CSV file
- **Browser notifications** — upcoming and overdue reminders, budget
  overage alerts (opt-in per bill)
- **Installable PWA** — add-to-home-screen on desktop and mobile
- Light/dark theme

## Stack

- Frontend: React 19 + Vite (`client/src/`)
- Backend: Express 5 (`server/`)
- Database: PostgreSQL (Neon, managed) via Drizzle ORM (`shared/schema.ts`)
- Package manager: pnpm

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in DATABASE_URL at minimum
pnpm db:push            # create/update tables in the database
pnpm dev                # http://localhost:5000 (or $PORT)
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start dev server (tsx + Vite HMR) |
| `pnpm check` | TypeScript typecheck |
| `pnpm build` | Production build to `dist/` |
| `pnpm start` | Run the production build |
| `pnpm db:push` | Push schema changes to the database |
| `pnpm test` | Run the test suite (Vitest) |

## Testing

`pnpm test` runs the Vitest suite (storage layer against a real
transient PGlite Postgres, plus shared date-utils logic). A manual
click-through checklist for the parts that aren't automated lives in
`TEST_PLAN.md`.

## Deployment

Deployed to [Render](https://render.com) (`render.yaml` at repo root,
free tier), protected by HTTP Basic Auth (`BASIC_AUTH_USER`/
`BASIC_AUTH_PASS` env vars — unset locally by default, required on the
deployed instance since it has a public URL and this app has no other
authentication). See `CLAUDE.md`'s Deployment section and
`plans/030-render-deployment-with-basic-auth.md` for how it's wired up.

## More

Full architecture notes, data model, conventions, and required env vars
live in `CLAUDE.md`. Completed and planned improvement work is tracked
in `plans/`.
