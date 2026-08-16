# Plan 030: Deploy BillFlow to Render with HTTP Basic Auth

> **Executor instructions**: This plan has two parts with different
> executors. Part A (Steps 1-4) is ordinary code work — an agent session
> can do it exactly like any other plan in this repo: follow each step,
> run every Verify command, stop and report on any STOP condition, update
> `plans/README.md` when done. Part B (Steps 5-7) requires the repo
> operator directly — creating a Render account, connecting GitHub, and
> deploying is not something a coding agent can do (no browser/OAuth
> access to Render's dashboard). **Do not attempt Part B — stop after
> Step 4 and report that Part B needs the operator.**
>
> **Drift check (run first)**: `git diff --stat 11c92f7..HEAD -- server/index.ts package.json vite.config.ts`
> If any of these files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (blocks the remote-access goal, but not a bug/regression)
- **Effort**: M
- **Risk**: MED (adds a new production-facing auth control — must not ship half-done)
- **Depends on**: none (all prerequisite work — plan 011's opt-in `HOST`
  binding, plan 022's `.env.example` — already landed on `main`)
- **Category**: infra/direction
- **Planned at**: commit `11c92f7`, 2026-08-16

## Why this matters

BillFlow was built with **no authentication by design** (per `CLAUDE.md`:
"Solo-developer, single-user, no authentication by design — runs locally
on the owner's machine"). The owner wants to reach it from their phone
without keeping their laptop awake (it runs local dev servers + Claude
and gets warm; the laptop sleeps overnight). After comparing Tailscale,
Cloudflare Tunnel, and hosted platforms in conversation, **Render** was
chosen: its free tier runs the existing Express server as-is (no
serverless rewrite, unlike Vercel/Netlify), deploys straight from GitHub,
needs no domain purchase, and decouples the app from the owner's machine
entirely. The tradeoff, accepted deliberately: free-tier services sleep
after 15 minutes idle and take 30-60s to wake on the next request — fine
for a bill tracker checked occasionally, not a defect.

**This is the one place in the whole plan queue where skipping a step is
not an option.** Every other plan in this repo could land independently.
This one can't: the moment the app has a public `onrender.com` URL, it is
reachable by anyone on the internet who finds or guesses it — real
financial data (bill amounts, categories, payment history) with zero
protection. Basic Auth must ship in the *same* deploy as the public URL,
not as a follow-up.

## Current state

`server/index.ts:91-105` — the listen call this plan builds on. Plan 011
already made `HOST` opt-in via env var, which is exactly what Render
needs (a container's whole point is being reached externally, so it must
bind `0.0.0.0` — no code change required, just an env var Render sets):
```ts
// Binds to loopback only by default so the app isn't reachable from other
// devices on the network. Set HOST=0.0.0.0 in .env to opt into listening
// on all interfaces (e.g. to reach the app from another device on your
// LAN) — do this deliberately, since this app has no authentication.
const port = parseInt(process.env.PORT || "5000", 10);
const host = process.env.HOST || "127.0.0.1";
httpServer.listen({ port, host }, () => {
  log(`serving on port ${port}, bound to ${host}`);
});
```

`server/vite.ts:15` — plan 009's `allowedHosts` restriction
(`["localhost", "127.0.0.1"]`) only affects the **development** Vite
middleware branch. It does not apply to Render at all: Render runs
`NODE_ENV=production`, which takes the `serveStatic(app)` branch in
`server/index.ts:84-89`, never touching `server/vite.ts`. No conflict,
no change needed here — noted so this isn't mistaken for a blocker.

`server/static.ts` (full file) — confirms production mode is a plain,
portable Express static-file server with SPA fallback, nothing tying it
to any particular host or the local machine:
```ts
export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }
  app.use(express.static(distPath));
  app.use("*splat", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
```

`package.json:6-11` — the existing scripts this plan reuses verbatim,
already exactly what Render needs (build command / start command):
```json
"build": "tsx script/build.ts",
"start": "NODE_ENV=production node dist/index.cjs",
```

`server/db.ts:11` — `new Pool({ connectionString: process.env.DATABASE_URL })`.
Neon's connection string already carries `?sslmode=require` (see
`.env.example`), so the same `DATABASE_URL` used locally works unchanged
from Render — Neon doesn't require IP allow-listing for its pooled
endpoint. No database-side change needed.

`vite.config.ts` — the PWA manifest (`scope: "/"`, `start_url: "/"`) and
Workbox runtime caching are all origin-relative; nothing here assumes
`localhost` or any specific domain. No change needed for the build to
work on a new origin.

`.env.example` (full file, from plan 022) — the template this plan
extends with two new variables:
```
DATABASE_URL=
PORT=5000
HOST=127.0.0.1
NODE_ENV=development
```

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0 (repo baseline is clean as of commit `11c92f7`) |
| Dev run   | `pnpm dev`   | server logs "serving on port 5000, bound to 127.0.0.1" |
| Build     | `pnpm build` | exit 0, produces `dist/index.cjs` + `dist/public/` |
| Prod run  | `pnpm start` | server logs "serving on port 5000, bound to 127.0.0.1" (or whatever `HOST`/`PORT` are set to) |

## Scope

**In scope (Part A — code, chip-executable)**:
- `server/index.ts` — add HTTP Basic Auth middleware, opt-in via env vars.
- `.env.example` — document the two new env vars.
- `render.yaml` (create, repo root) — Render Blueprint config.
- `CLAUDE.md` — add a "Deployment" section.

**Out of scope**:
- Any change to `server/vite.ts`'s `allowedHosts` — confirmed above it
  doesn't apply to production, don't touch it.
- Removing or changing the default loopback `HOST` binding from plan 011
  — local `pnpm dev` must keep defaulting to `127.0.0.1`. Render sets its
  own `HOST=0.0.0.0` via its dashboard env vars, not by changing the
  code's default.
- A custom domain — out of scope for this pass; Render's free
  `*.onrender.com` subdomain is the target. Attaching a custom domain
  later is free on Render and doesn't require this plan to change.
- Session-based login, OAuth, or any auth beyond Basic Auth — deliberately
  minimal, matching the "solo user, zero recurring cost" constraint
  discussed; Basic Auth over HTTPS (Render provides free automatic TLS)
  is sufficient for this threat model, not a compromise.
- Rate-limiting or lockout on failed Basic Auth attempts — a reasonable
  future hardening step, not required to close this plan; Basic Auth's
  own credential space (a real password) plus HTTPS is the baseline this
  plan targets, not brute-force resistance.

## Git workflow

- Branch: `advisor/030-render-deployment-with-basic-auth`
- Commit per step; message style matches repo history. Suggested message:
  `Add Basic Auth and Render deployment config`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add opt-in HTTP Basic Auth middleware

In `server/index.ts`, add the middleware **before** `registerRoutes` is
called, so it gates every route including the static SPA shell — for a
financial app, don't leave the HTML/JS bundle world-readable even if API
calls are separately protected. Gate it on env vars being *set*, not on
`NODE_ENV`, so `pnpm start` run locally without the vars stays
password-free (matches plan 011's opt-in pattern — the code doesn't
assume where it's running, the environment decides):

```ts
import { timingSafeEqual } from "crypto";

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function basicAuth(req: Request, res: Response, next: NextFunction) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return next(); // not configured — auth disabled (local dev default)

  const header = req.headers.authorization;
  if (header?.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const reqUser = decoded.slice(0, separatorIndex);
    const reqPass = decoded.slice(separatorIndex + 1);
    if (
      separatorIndex !== -1 &&
      timingSafeStringEqual(reqUser, user) &&
      timingSafeStringEqual(reqPass, pass)
    ) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="BillFlow"');
  res.status(401).send("Authentication required");
}

app.use(basicAuth);
```

Place `app.use(basicAuth)` right after the `express.json`/`express.urlencoded`
setup (`server/index.ts:23-31`) and before the request-logging middleware
(`server/index.ts:44`), so unauthenticated requests don't get logged as
if they succeeded and don't reach any route logic at all.

Note `timingSafeEqual` throws if the two buffers have different lengths
— `timingSafeStringEqual` checks length first and returns `false` instead
of letting it throw, so a wrong-length guess doesn't crash the request or
leak length information through an error vs. no-error timing difference.

**Verify**: `pnpm check` → exit 0. Then manually, with `pnpm dev` running
and `BASIC_AUTH_USER=test BASIC_AUTH_PASS=test123` set in the shell
before starting it:
1. `curl -i http://localhost:5000/` with no credentials → `401` with a
   `WWW-Authenticate: Basic realm="BillFlow"` header.
2. `curl -i -u test:test123 http://localhost:5000/` → `200`.
3. `curl -i -u test:wrongpass http://localhost:5000/` → `401`.
4. Restart `pnpm dev` with `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` unset →
   `curl -i http://localhost:5000/` → `200` with no auth required
   (confirms local dev stays frictionless by default).

### Step 2: Document the new env vars in `.env.example`

Add to `.env.example`:
```
# HTTP Basic Auth — leave both unset to disable (default, used for local
# dev). Set both to require a username/password on every request, e.g.
# when deployed somewhere reachable from the public internet.
BASIC_AUTH_USER=
BASIC_AUTH_PASS=
```

**Verify**: `grep -c "BASIC_AUTH_USER\|BASIC_AUTH_PASS" .env.example`
returns `2`.

### Step 3: Add a Render Blueprint config

Create `render.yaml` at the repo root (Render's Blueprint format — lets
the operator deploy via "New Blueprint" pointed at this repo instead of
manually clicking through every field in Render's dashboard, and keeps
the deploy config version-controlled and reviewable like everything
else in this repo):

```yaml
services:
  - type: web
    name: billflow
    runtime: node
    plan: free
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: HOST
        value: 0.0.0.0
      - key: DATABASE_URL
        sync: false
      - key: BASIC_AUTH_USER
        sync: false
      - key: BASIC_AUTH_PASS
        sync: false
```

`sync: false` means Render will prompt the operator to fill these in
through the dashboard at deploy time rather than storing secrets in this
committed file — `DATABASE_URL` and the Basic Auth credentials must
never be committed to the repo. `PORT` is deliberately not listed: Render
injects its own `PORT` value automatically, and `server/index.ts:95`
already reads `process.env.PORT`, so no explicit config is needed there.

**Verify**: `test -f render.yaml` succeeds. `grep -c "sync: false" render.yaml`
returns `3` (confirms `DATABASE_URL`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`
are all secrets, not committed values).

### Step 4: Document deployment in `CLAUDE.md`

Add a new `## Deployment` section to `CLAUDE.md` (after the existing
`## Backups` section), documenting what Part B (below) sets up, so a
future session — human or agent — understands the app has two run modes
without needing to rediscover it:

```markdown
## Deployment

Optionally deployed to [Render](https://render.com) (`render.yaml` at
repo root, free tier) for access away from the local machine. Render
runs the same `pnpm build`/`pnpm start` as local production mode — no
code differences between local and deployed. Protected by HTTP Basic
Auth (`BASIC_AUTH_USER`/`BASIC_AUTH_PASS` env vars, unset locally by
default) since the deployed instance has a public URL and this app has
no other authentication. Free-tier services sleep after 15 minutes idle;
the first request after a sleep period takes 30-60s to wake — expected
behavior, not a bug.
```

**Verify**: `grep -n "## Deployment" CLAUDE.md` shows the new section.

---

## Part B: Deploy (operator only — do not attempt as a chip)

These steps require Render's web dashboard (GitHub OAuth connection,
clicking through the Blueprint deploy flow) — no coding-agent session has
browser access to do this. Once Part A is merged to `main`:

### Step 5: Create a Render account and connect GitHub

At [render.com](https://render.com), sign up (free, no credit card
required for the free tier) and connect the GitHub account that owns
this repo.

### Step 6: Deploy via Blueprint

In Render's dashboard: New → Blueprint → select this repo → Render reads
`render.yaml` and shows the `billflow` web service with 3 prompted
secrets. Fill in:
- `DATABASE_URL`: the same Neon connection string from the local `.env`.
- `BASIC_AUTH_USER` / `BASIC_AUTH_PASS`: a new username/password chosen
  for this deployment — **not** reused from anywhere else, this is the
  only thing standing between the internet and real financial data.

Click Deploy. First deploy takes a few minutes (installs deps, builds
client + server). Render assigns a `https://billflow-XXXX.onrender.com`
URL (or similar) automatically, with free TLS already active.

### Step 7: Verify the live deployment

1. Visit the Render URL — confirm a browser Basic Auth prompt appears
   before any BillFlow content loads.
2. Enter the wrong password — confirm it's rejected.
3. Enter the correct credentials — confirm the Dashboard loads with real
   bill data (same Neon database as local).
4. Confirm a full round trip works: mark a bill paid, confirm it persists
   on reload.
5. Let the service sit idle 15+ minutes, then load the URL again —
   confirm it works after the expected 30-60s cold-start delay (this is
   normal, not a failure).
6. From a phone (off the home network, e.g. cellular data) confirm the
   same URL + Basic Auth prompt + login flow works.

## Test plan

- No automated test framework covers auth middleware or deployment
  config directly. Step 1's `curl` checks (401 unauthenticated, 200 with
  correct credentials, 401 with wrong credentials, 200 when unset)
  are the closest thing to a test suite this plan has, and are mandatory,
  not optional — this is the security-critical step.
- Part B's Step 7 is the real end-to-end verification; it can only be
  done by the operator against the actual live deployment.

## Done criteria

Machine-checkable (Part A). ALL must hold:

- [ ] `pnpm check` exits 0
- [ ] `curl -i http://localhost:5000/` with `BASIC_AUTH_USER`/`BASIC_AUTH_PASS`
      set returns `401` with no credentials, `200` with correct
      credentials, `401` with wrong credentials
- [ ] `curl -i http://localhost:5000/` with neither var set returns `200`
      (local dev unaffected by default)
- [ ] `grep -c "BASIC_AUTH_USER\|BASIC_AUTH_PASS" .env.example` returns `2`
- [ ] `test -f render.yaml` succeeds, `grep -c "sync: false" render.yaml` returns `3`
- [ ] `grep -n "## Deployment" CLAUDE.md` shows the new section
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated — mark Part A DONE and Part B
      as requiring the operator, do not mark the whole plan DONE unless
      Part B has actually been completed by the operator

Operator-only (Part B), tracked separately in the same README row once done:

- [ ] Render account created, GitHub connected, Blueprint deployed
- [ ] Live URL loads behind a working Basic Auth prompt
- [ ] Full mark-paid round trip verified against the live deployment
- [ ] Cold-start-after-idle behavior confirmed as expected, not broken
- [ ] Verified reachable from a phone off the home network

## STOP conditions

Stop and report back (do not improvise) if:

- The code at "Current state" doesn't match what you find.
- Any of Step 1's 4 `curl` checks behaves differently than specified —
  this is the one place in this whole plan queue where "close enough" is
  not acceptable; a Basic Auth bypass or lockout bug must be reported and
  fixed correctly, not shipped as a known issue.
- You find yourself about to attempt Part B (creating a Render account,
  connecting GitHub, clicking Deploy) — stop immediately, that's the
  operator's step, not yours.

## Maintenance notes

- If the owner ever wants to share BillFlow with another person (e.g. a
  spouse), Basic Auth's single shared username/password is the wrong
  primitive — that's the point where real per-user auth (the
  `passport`/`express-session` stack plan 013 removed as unused) would
  become worth reintroducing, not before.
- Basic Auth prompts render slightly differently across mobile browsers
  and can be a little clunky on a PWA's first launch — a known,
  acceptable tradeoff for a personal app, not something to "fix" by
  adding a custom login page unless it becomes a real annoyance in
  practice.
- Render's free tier is genuinely free indefinitely (unlike Railway/Fly.io,
  which dropped their free tiers in 2024 — verified via web search during
  planning, 2026-08-16) but pricing/free-tier terms can change; if Render
  ever changes free-tier terms, re-evaluate against Fly.io/Railway's
  then-current pricing rather than assuming this plan's cost comparison
  still holds.
