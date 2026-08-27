# Plan 034: Fix dark-mode card/border contrast against page background

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 03e99d2..HEAD -- client/src/index.css client/src/components/stats-cards.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: MED (the `--card`/`--border` CSS variable change is global — it
  affects every card, dialog, input, and table border in dark mode, not
  just the two components named below; the fix is correct in principle but
  needs a visual once-over across pages, see Step 3)
- **Depends on**: none
- **Category**: bug (accessibility / visual design)
- **Planned at**: commit `03e99d2`, 2026-08-27

## Why this matters

In dark mode, cards barely separate visually from the page background, and
the hero "Total Monthly Budget" card — deliberately styled dark-and-bold to
stand out against a *light* page in light mode — loses that effect entirely
once the page itself is already dark. This was confirmed two ways:

1. **Visually**, via a live `pnpm dev` dark-mode screenshot: the
   "Remaining" stat card's border was barely perceptible against the page,
   and the hero budget card only remained distinguishable because of its
   `primary`-tinted gradient overlay, not its base color.
2. **Numerically**, computing WCAG relative-luminance contrast ratios
   (formula per [WCAG 2.x contrast algorithm](https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio))
   from this repo's own dark-mode HSL tokens in `client/src/index.css`:

   | Pair | Current ratio |
   |---|---|
   | page background (`--background`, `240 10% 4%`) vs card (`--card`, `240 10% 6%`) | **1.03:1** |
   | page background vs card border (`--border`, `240 3.7% 15.9%`) | **1.34:1** |
   | card vs card border | **1.30:1** |
   | page background vs hero card (`bg-slate-950`, ≈`229 84% 5%`) | **1.01:1** |

   WCAG 1.4.11 (Non-text Contrast) recommends **3:1** for the visual
   boundaries of UI components like cards. Every pair above is closer to
   1:1 (no perceptible difference) than to the 3:1 target — a low-vision
   user in dark mode currently can't reliably tell where one card ends and
   the page begins.

This plan raises the dark-mode `--card`/`--popover` lightness slightly and
the `--border`/`--input` lightness enough to reach 3:1 against both the
page background and the card fill, then gives the hero budget card (which
uses a hardcoded `bg-slate-950` unrelated to the `--card` token, so it
doesn't benefit from that token change on its own) an explicit dark-mode
border reusing the now-fixed `--border` token. Light mode is untouched —
the existing screenshots show it already has strong card/page contrast.

## Current state

`client/src/index.css`, the `.dark` block, [index.css:54-90](client/src/index.css:54) (only the 4
lines this plan touches are shown with context; the rest of the block is
unrelated and must not change):

```css
.dark {
  --background: 240 10% 4%;
  --foreground: 0 0% 98%;
 
  --primary: 262 80% 60%;
  --primary-foreground: 210 40% 98%;
 
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
 
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
 
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
 
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
 
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 262 80% 60%;

  --card: 240 10% 6%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 6%;
  --popover-foreground: 0 0% 98%;

  --sidebar: 240 5.9% 10%;
  --sidebar-foreground: 240 4.8% 95.9%;
  --sidebar-primary: 262 80% 60%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 240 3.7% 15.9%;
  --sidebar-accent-foreground: 240 4.8% 95.9%;
  --sidebar-border: 240 3.7% 15.9%;
  --sidebar-ring: 262 80% 60%;
}
```

`client/src/components/stats-cards.tsx`, the hero card, [stats-cards.tsx:17](client/src/components/stats-cards.tsx:17):

```tsx
      <Card className="md:col-span-2 overflow-hidden bg-slate-950 text-white border-0 shadow-2xl relative group">
```

The second card in the same file, [stats-cards.tsx:47](client/src/components/stats-cards.tsx:47), already does the
right thing (theme-aware bg + explicit border) — this is the pattern to
match, don't change this line:

```tsx
      <Card className="overflow-hidden bg-white dark:bg-card border border-border shadow-sm group hover:shadow-xl transition-all duration-300">
```

`--border` and `--input` share the same value in both the `:root` (light,
`220 13% 91%` for both) and `.dark` blocks today — keep them in sync when
you change one, matching that existing convention.

## Commands you will need

| Purpose   | Command      | Expected on success |
|-----------|--------------|----------------------|
| Typecheck | `pnpm check` | exit 0, no output (this is a CSS/className-only change, typecheck should be unaffected) |
| Dev server | `pnpm dev`  | starts, used for the visual verification in Step 3 |

No Node/CSS test can compute contrast ratios inline in this repo (no such
tooling installed) — Step 1's verification uses a standalone one-off Node
script (Node ships with this repo's toolchain already; no new dependency).

## Scope

**In scope** (the only files you should modify):
- `client/src/index.css` — only the `--card`, `--popover`, `--border`,
  `--input` lines inside the `.dark { ... }` block.
- `client/src/components/stats-cards.tsx` — only the `className` on the
  hero `Card` at line 17.

**Out of scope** (do NOT touch, even though they look related):
- The `:root` (light mode) block in `index.css` — light mode's contrast is
  already good (per the original design critique's screenshots); this plan
  is dark-mode-only.
- `--sidebar-border` and other `--sidebar-*` tokens — a separate token
  namespace; leave them as-is unless Step 3's visual check turns up a
  specific problem with the sidebar (see STOP conditions).
- Any other `bg-slate-*` / hardcoded-color usage elsewhere in the codebase
  — this plan fixes the one hero card identified in the audit, not a
  general sweep (a `grep -rn "bg-slate-950\|bg-slate-900"` sweep, if it
  turns up more instances, is a separate future plan).

## Git workflow

- Branch: `advisor/034-dark-mode-card-border-contrast`
- Commit message style: imperative, capitalized sentence (e.g. "Fix
  dark-mode card and border contrast against page background"), no
  conventional-commit prefix.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Raise dark-mode `--card`/`--popover` and `--border`/`--input` lightness

In `client/src/index.css`'s `.dark` block, change:

```css
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
```
to
```css
  --border: 240 3.7% 40%;
  --input: 240 3.7% 40%;
```

and change:

```css
  --card: 240 10% 6%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 6%;
  --popover-foreground: 0 0% 98%;
```
to
```css
  --card: 240 10% 9%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 9%;
  --popover-foreground: 0 0% 98%;
```

(`--card-foreground`/`--popover-foreground` are unchanged — only the
background lightness moves.)

**Verify**: run this Node one-liner (WCAG relative-luminance contrast, same
formula the "Why this matters" numbers above were computed with) to confirm
the new values clear 3:1 both ways:

```bash
node -e '
function hslToRgb(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12;const a=s*Math.min(l,1-l);const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return [f(0)*255,f(8)*255,f(4)*255];}
function luminance([r,g,b]){const [rs,gs,bs]=[r,g,b].map(c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);});return 0.2126*rs+0.7152*gs+0.0722*bs;}
function contrast(a,b){const l1=luminance(hslToRgb(...a));const l2=luminance(hslToRgb(...b));const [hi,lo]=l1>l2?[l1,l2]:[l2,l1];return (hi+0.05)/(lo+0.05);}
const bg=[240,10,4], card=[240,10,9], border=[240,3.7,40];
console.log("bg vs card:", contrast(bg,card).toFixed(2));
console.log("bg vs border:", contrast(bg,border).toFixed(2));
console.log("card vs border:", contrast(card,border).toFixed(2));
'
```

Expected output (all ≥ 3.0, confirming WCAG 1.4.11 compliance):
```
bg vs card: 1.09
bg vs border: 3.30
card vs border: 3.03
```

Note `bg vs card` itself stays low (1.09) by design — the fill barely
changes on purpose, since a large lightness jump on the fill alone would
look wrong (a nearly-white "dark mode" card). The border is what actually
carries the 3:1 boundary signal here, which is the same approach most
dark-themed design systems use (subtle fill, a clearly lighter hairline
border) — this is a deliberate tradeoff, not a shortfall; see STOP
conditions if you believe a different tradeoff is warranted.

### Step 2: Give the hero budget card a dark-mode border

In `client/src/components/stats-cards.tsx:17`, add `dark:border
dark:border-border` to the existing className (keep `border-0` as-is for
light mode — Tailwind's `dark:` variant overrides it only when the `.dark`
class is active):

```tsx
      <Card className="md:col-span-2 overflow-hidden bg-slate-950 text-white border-0 dark:border dark:border-border shadow-2xl relative group">
```

This reuses the same `--border` token fixed in Step 1, so the hero card
gets the identical 3:1-against-background treatment as every other bordered
card, with zero new color values introduced.

**Verify**: `pnpm check` → exit 0, no new errors (className-only change,
should be unaffected either way).

### Step 3: Visual check across the app in dark mode

1. Run `pnpm dev`, open the app, switch to dark mode via the theme toggle
   (top-right of the header).
2. On the **Dashboard**, confirm: the hero "Total Monthly Budget" card now
   has a visible border/edge distinguishing it from the page, and the
   "Remaining" card's border is clearly visible (not just barely-there as
   before).
3. Visit **Upcoming**, **History**, and **Analytics** — confirm cards and
   panels on each page show a similarly improved, clearly-visible border in
   dark mode, with no layout shift or broken-looking double-borders.
4. Open one dialog (e.g. click "Add Bill") — confirm the dialog's edge
   against the page backdrop is clearly visible.
5. Confirm nothing looks *too* bright or out of place — the border should
   read as a normal, visible-but-subtle UI hairline, not a glowing outline.

**Verify**: all 5 sub-checks pass, by eye, across all 4 pages plus one
dialog.

## Test plan

No automated visual-regression tooling exists in this repo. Step 1's Node
one-liner is the machine-checkable contrast verification; Step 3 is a
manual cross-page visual check, consistent with how this repo verifies
other styling-only changes (see `plans/README.md` plan 015's manual
end-to-end UI verification for the same pattern).

## Done criteria

- [ ] `pnpm check` exits 0, no new errors
- [ ] Step 1's Node contrast script prints `bg vs border: 3.30` and `card vs border: 3.03` (or higher — confirms the token values landed correctly)
- [ ] `grep -n 'dark:border-border' client/src/components/stats-cards.tsx` finds 1 match on the hero card's `Card`
- [ ] Manual Step 3 (visual check across Dashboard, Upcoming, History, Analytics, and one dialog) passes with no regressions
- [ ] No files outside `client/src/index.css` and `client/src/components/stats-cards.tsx` are modified (`git status`)
- [ ] `plans/README.md` status row for 034 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at either "Current state" excerpt doesn't match what's actually
  in the file (drift since this plan was written).
- Step 3's visual check finds the new border reads as too bright/harsh on
  any specific page or component — don't tune the numbers yourself beyond
  what's specified here; report which page/component looked wrong and let
  the operator decide whether to soften it (e.g. a lower border lightness
  that trades some WCAG margin for a more subtle look is a legitimate
  design call, but it's the operator's call, not an executor improvisation).
- The `--border`/`--input` change visibly breaks a component that relies on
  a near-invisible border as an intentional design choice (scan for any
  component using `border-transparent` or similar overrides that might
  interact oddly) — if found, report it rather than special-casing it.

## Maintenance notes

- The dark-mode border is now brighter/more visible than before across the
  *entire* app (every `border-border` usage), not just the two components
  named in this plan — that's intentional (see "Why this matters"), but a
  reviewer should specifically look for any component that was relying on
  the old, nearly-invisible border as a deliberate "borderless" look.
- If a future design pass wants a different dark-mode palette entirely
  (not just this contrast fix), these are the exact token values and
  contrast-computation script to build from.
- The `grep -rn "bg-slate-950\|bg-slate-900"` sweep mentioned in "Out of
  scope" is worth running as a quick follow-up check — if other components
  hardcode similar non-token dark colors, they'll have the same dark-mode
  contrast problem this plan just fixed for the one hero card.
