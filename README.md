# Financial Operating System

A personal CFO for one household. Not a budgeting app and not an expense tracker — the point is not to record what happened, it is to know what happens next.

The system simulates cash flow day by day across every account, runs treasury rules inside that simulation, scores the risk, and explains every recommendation in the numbers it used to reach it.

---

## What it does

**Cash-flow engine.** Expands every income source, bill, subscription, SIP and card statement into dated events across a 30/60/90/365-day horizon, then walks the horizon one day at a time tracking each account independently. Aggregate balances lie — they can look healthy while the account that pays rent is empty.

**Rule engine.** IF/THEN automation that runs *inside* the projection, so the forecast already reflects the transfers you would have made. Transfers are capped at the source account's balance above its own floor, so automation can never manufacture an overdraft. Every rule carries a written rationale that appears verbatim in the ledger next to the money it moved.

**The CFO.** Ask "can I afford a laptop for 90k" or "what if my salary is four days late" and the question is routed to the engine that can answer it. Each answer re-runs the simulation under the new assumption and reports the trough, the risk delta and the reasoning. It is deterministic — no model, no API, no guessing.

**Everything else.** Income ranges with confidence weighting and historical variance, obligations with priority tiers and funding accounts, subscriptions scored by cost against usage, portfolio with XIRR and corpus projection, credit utilisation with score-factor guidance, emergency fund measured in months of cover, and monthly reports generated from the ledger.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

To produce the static site:

```bash
npm run build
```

The output lands in `out/`.

---

## Deploying to GitHub Pages

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the static export and publishes it.

One setting is required first: **Settings → Pages → Build and deployment → Source → GitHub Actions**.

The workflow derives the base path from the repository name automatically — a project site at `<user>.github.io/<repo>` gets the `/<repo>` prefix it needs, and a user site at `<user>.github.io` gets none.

---

## Where your data lives

In your browser's local storage, on your machine, and nowhere else. There is no account, no server and no third party holding your balances.

The consequence is that clearing site data erases it. **Settings → Export backup** writes a JSON file that restores into any browser running this application.

---

## Architecture

```
src/
  lib/
    types.ts            Zod schemas — the single source of truth for shape
    dates.ts            Local-time date maths (UTC would shift every event by a day)
    format.ts           Indian-numbering currency
    seed.ts             The starting profile
    storage.ts          The one seam between app and persistence
    store.tsx           React context, derived views memoised
    engine/
      events.ts         Schedule expansion
      forecast.ts       Day-by-day simulation, rule engine, risk scoring
      analytics.ts      XIRR, ratios, rollups, subscription intelligence
      advisor.ts        Proactive advisories and the conversational CFO
      sankey.ts         Monthly flow model
  components/           Shell, design primitives, charts
  app/                  One route per dashboard
```

Everything above `storage.ts` is storage-agnostic: the engines take a `FinancialState` and return numbers. Moving to Supabase and Clerk means writing one more object satisfying the `StateStore` interface — no engine or page changes.

### A note on the stack

The brief specified Supabase, Prisma, PostgreSQL and Clerk. GitHub Pages serves static files only, so none of those can execute there. The application is built as a statically-exported Next.js app with the persistence layer isolated behind a single interface, which keeps the GitHub Pages deployment target and leaves the server-backed path open.

---

## How the projection works

1. **Expand.** Recurring schedules become dated events. Days-of-month clamp to the end of short months, so a bill due on the 31st lands on the 28th in February rather than rolling into March.
2. **Skew.** Each amount is pulled toward the pessimistic end of its range by the conservatism setting — receipts toward their floor, obligations toward their ceiling. Default is 35%.
3. **Walk.** One day at a time, applying events to individual account balances.
4. **Automate.** After each day's events, enabled rules run in order. Top-ups carry a materiality threshold so the reserve is not wired a few hundred rupees every time a small subscription clears.
5. **Score.** Risk is penalised for overdrafts first, floor breaches second, how close the trough came to zero third, and the direction of net flow last. Sustained pressure scores worse than a single bad day.

---

## Keyboard

| Keys | |
|---|---|
| `⌘K` / `Ctrl K` | Command palette |
| `g` then `o` `f` `a` `i` `b` `s` `v` `c` `r` `p` `k` `u` | Jump to a section |
| `/` | Focus the CFO question box |
| `Esc` | Close any overlay |

---

## Stack

Next.js 15 (App Router, static export) · React 19 · TypeScript · Tailwind v4 · Framer Motion · Recharts · Zod
