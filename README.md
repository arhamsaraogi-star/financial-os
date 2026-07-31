# Financial OS

A personal money app for one person. Bank accounts, credit cards, daily spending, and a forecast that tells you what your balance will be — not just what it was.

**Live:** https://arhamsaraogi-star.github.io/financial-os/

---

## What it does

**Track daily spend.** The add button sits in the middle of the tab bar on every screen. Type an amount, tap a category, save — three taps. It remembers what you type, so "Blinkit" fills in its own category and account the second time.

**Budgets that warn you early.** Per-category monthly caps. The useful signal isn't "you've overspent" — it's "at this pace you will", so the app projects the month-end total from how fast you're going and tells you what you can spend per day to stay inside.

**Cards handled properly.** A credit card is just an account with a negative balance. Utilisation is tracked against the 30% threshold that actually affects your score, and the app is clear that what counts is the balance on the *statement* date, not the due date.

**Forecast.** Every bill, subscription and payday laid out day by day, with each account tracked separately — a healthy total can hide one account about to run dry. Drag a slider to see what happens if you're paid late.

**Automatic transfers.** IF/THEN rules that run *inside* the forecast, so the projection reflects the moves you'd actually make. They're capped at what the source account can spare, so a rule can never overdraw you.

**Ask it things.** "Can I afford a 90k laptop", "how much did I spend on groceries", "where can I save money". Answers are computed from your own numbers and show the figures behind them. Deterministic — no model, no API, nothing leaves your phone.

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

---

## Deploying

Push to `main`. The workflow builds and publishes automatically.

One setting is required once: **Settings → Pages → Build and deployment → Source → GitHub Actions**. If it's set to "Deploy from a branch", GitHub's Jekyll builder runs too and overwrites the site with a rendered README.

---

## Your data

In your browser, on your device, and nowhere else. No account, no server.

That means clearing browser data erases it, and your phone and laptop hold separate copies. **Settings → Save backup** writes a JSON file that restores anywhere; there's a CSV export for spreadsheets too.

---

## How the forecast works

1. **Lists what's scheduled** — bills, subscriptions and paydays across the period. A bill due on the 31st lands on the 28th in February rather than slipping into March.
2. **Leans pessimistic** — income nudged toward the low end of its range, bills toward the high end, by however cautious you set it.
3. **Walks day by day** — each account separately.
4. **Applies your rules** — capped so they can never overdraw the account they pull from.
5. **Scores it** — overdrafts hurt most, then cushion breaches, then how close the low point came to zero.

Everyday spending is measured from your last 90 days of transactions rather than typed in, so the forecast sharpens as you log.

---

## Architecture

```
src/
  lib/
    types.ts        Zod schemas — the source of truth
    dates.ts        Local-time date maths (UTC would shift every event a day)
    seed.ts         Sample profile + 3 months of history
    storage.ts      The one seam between app and persistence
    store.tsx       State, transaction CRUD, memoised derived views
    engine/
      events.ts     Turns schedules into dated events; measures everyday burn
      forecast.ts   Day-by-day simulation, rules, risk scoring
      analytics.ts  Categories, budgets, rollups, credit
      advisor.ts    Proactive advice and the question answering
      derived.ts    Shared helpers
  components/       Shell, sheet, design primitives, charts
  app/              One route per screen
```

Everything above `storage.ts` is storage-agnostic. Moving to a server means writing one object satisfying `StateStore` — no engine or screen changes.

**Two things worth knowing before changing code:**

- **Cards are accounts** with a balance ≤ 0. One sign convention everywhere. Don't add a parallel card model.
- **Sheets mount purely off state** and animate entry in CSS. They deliberately don't use exit animations — an animation library that delays unmount can leave an invisible full-screen overlay swallowing every tap, which happened and made the app feel broken.

---

## Stack

Next.js 15 (App Router, static export) · React 19 · TypeScript · Tailwind v4 · Framer Motion · Recharts · Zod
