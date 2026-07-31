import type { Category, FinancialState, Transaction } from '@/lib/types'
import { ISODate, addDays, daysInMonth, monthKey, today } from '@/lib/dates'
import {
  cashAccounts,
  creditAccounts,
  everydayBurnMonthly,
  expectedMonthlyIncome,
  monthlyCommitments,
  netWorth,
} from './derived'

export { netWorth, monthlyCommitments, expectedMonthlyIncome, cashAccounts, creditAccounts }

/* ------------------------------------------------------------------ *
 * Transaction slicing
 * ------------------------------------------------------------------ */

/** Real spending: excludes transfers between your own accounts. */
export function isSpend(t: Transaction) {
  return !t.transfer && t.amount < 0
}

export function isIncome(t: Transaction) {
  return !t.transfer && t.amount > 0
}

export function inMonth(t: Transaction, month: string) {
  return monthKey(t.date) === month
}

export function currentMonth(): string {
  return today().slice(0, 7)
}

export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ *
 * Category spending + budgets
 * ------------------------------------------------------------------ */

export interface CategorySpend {
  category: Category
  spent: number
  budget: number
  /** 0–1+, uncapped so overspend is visible. */
  ratio: number
  share: number
  count: number
  /** Same category, previous month. */
  prior: number
  change: number
}

export function spendByCategory(state: FinancialState, month = currentMonth()): CategorySpend[] {
  const prev = previousMonth(month)
  const now = new Map<string, { total: number; count: number }>()
  const before = new Map<string, number>()

  for (const t of state.transactions) {
    if (!isSpend(t)) continue
    const k = monthKey(t.date)
    if (k === month) {
      const cur = now.get(t.categoryId) ?? { total: 0, count: 0 }
      now.set(t.categoryId, { total: cur.total + Math.abs(t.amount), count: cur.count + 1 })
    } else if (k === prev) {
      before.set(t.categoryId, (before.get(t.categoryId) ?? 0) + Math.abs(t.amount))
    }
  }

  const grand = [...now.values()].reduce((s, v) => s + v.total, 0)

  return state.categories
    .filter((c) => c.kind === 'expense')
    .map((category) => {
      const hit = now.get(category.id) ?? { total: 0, count: 0 }
      const prior = before.get(category.id) ?? 0
      return {
        category,
        spent: hit.total,
        count: hit.count,
        budget: category.budget,
        ratio: category.budget > 0 ? hit.total / category.budget : 0,
        share: grand > 0 ? (hit.total / grand) * 100 : 0,
        prior,
        change: prior > 0 ? ((hit.total - prior) / prior) * 100 : 0,
      }
    })
    .filter((r) => r.spent > 0 || r.budget > 0)
    .sort((a, b) => b.spent - a.spent)
}

export interface BudgetSummary {
  budgeted: number
  /** Spend inside budgeted categories only — the like-for-like budget figure. */
  spent: number
  remaining: number
  /** Every category, budgeted or not. What the user thinks of as "spent". */
  totalSpent: number
  /** Categories with a budget that are already over it. */
  over: CategorySpend[]
  /** Spending pace against how much of the month has elapsed. */
  paceRatio: number
  /** Month-end projection for budgeted categories. */
  projectedSpend: number
  /** Month-end projection across everything. */
  projectedTotal: number
  daysLeft: number
}

/**
 * Budget health for a month. The useful signal is not "have you overspent" but
 * "are you on track to" — so this projects the month-end total from the pace so
 * far and compares it to the budget.
 */
export function budgetSummary(state: FinancialState, month = currentMonth()): BudgetSummary {
  const rows = spendByCategory(state, month)
  const budgeted = rows.reduce((s, r) => s + r.budget, 0)
  const spent = rows.filter((r) => r.budget > 0).reduce((s, r) => s + r.spent, 0)
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0)

  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const total = daysInMonth(y, m)
  const isCurrent = month === currentMonth()
  const elapsed = isCurrent ? Number(today().slice(8, 10)) : total
  const daysLeft = Math.max(0, total - elapsed)

  const projectedSpend = elapsed > 0 ? (spent / elapsed) * total : 0
  const projectedTotal = elapsed > 0 ? (totalSpent / elapsed) * total : 0

  return {
    budgeted,
    spent,
    remaining: budgeted - spent,
    totalSpent,
    over: rows.filter((r) => r.budget > 0 && r.spent > r.budget),
    paceRatio: budgeted > 0 ? projectedSpend / budgeted : 0,
    projectedSpend,
    projectedTotal,
    daysLeft,
  }
}

/* ------------------------------------------------------------------ *
 * Month rollups
 * ------------------------------------------------------------------ */

export interface MonthRollup {
  month: string
  label: string
  income: number
  spend: number
  net: number
  savingsRate: number
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthLabel(month: string, withYear = false): string {
  const m = Number(month.slice(5, 7))
  return withYear ? `${MONTH_ABBR[m - 1]} ${month.slice(0, 4)}` : MONTH_ABBR[m - 1]
}

/**
 * Month-by-month totals from the ledger, with recurring bills folded in.
 *
 * Bills are not written into the ledger — they live as schedules — so a rollup
 * built purely from transactions would under-report spending badly. Committed
 * amounts are added for every complete month.
 */
export function monthlyRollups(state: FinancialState, months = 6): MonthRollup[] {
  const commitments = monthlyCommitments(state).total
  const income = expectedMonthlyIncome(state)
  const out: MonthRollup[] = []
  const base = new Date()

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    let ledgerSpend = 0
    let ledgerIncome = 0
    for (const t of state.transactions) {
      if (monthKey(t.date) !== key) continue
      if (isSpend(t)) ledgerSpend += Math.abs(t.amount)
      else if (isIncome(t)) ledgerIncome += t.amount
    }

    const monthIncome = ledgerIncome > 0 ? ledgerIncome : income
    const monthSpend = ledgerSpend + commitments

    out.push({
      month: key,
      label: monthLabel(key),
      income: Math.round(monthIncome),
      spend: Math.round(monthSpend),
      net: Math.round(monthIncome - monthSpend),
      savingsRate: monthIncome > 0 ? ((monthIncome - monthSpend) / monthIncome) * 100 : 0,
    })
  }

  return out
}

/** Daily spend for a month, for the calendar and the sparkline. */
export function dailySpend(state: FinancialState, month = currentMonth()): { date: ISODate; amount: number }[] {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const total = daysInMonth(y, m)
  const map = new Map<string, number>()

  for (const t of state.transactions) {
    if (!isSpend(t) || monthKey(t.date) !== month) continue
    map.set(t.date, (map.get(t.date) ?? 0) + Math.abs(t.amount))
  }

  return Array.from({ length: total }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`
    return { date, amount: map.get(date) ?? 0 }
  })
}

/* ------------------------------------------------------------------ *
 * Credit
 * ------------------------------------------------------------------ */

export function creditSummary(state: FinancialState) {
  const cards = creditAccounts(state)
  const limit = cards.reduce((s, c) => s + (c.creditLimit ?? 0), 0)
  const owed = cards.reduce((s, c) => s + Math.abs(Math.min(0, c.balance)), 0)
  const utilisation = limit > 0 ? (owed / limit) * 100 : 0

  const band =
    utilisation <= 10
      ? { label: 'Excellent', tone: 'good' as const }
      : utilisation <= 30
        ? { label: 'Healthy', tone: 'good' as const }
        : utilisation <= 50
          ? { label: 'High', tone: 'warn' as const }
          : { label: 'Too high', tone: 'bad' as const }

  return {
    cards: cards.map((c) => ({
      account: c,
      owed: Math.abs(Math.min(0, c.balance)),
      limit: c.creditLimit ?? 0,
      utilisation: c.creditLimit ? (Math.abs(Math.min(0, c.balance)) / c.creditLimit) * 100 : 0,
      available: (c.creditLimit ?? 0) - Math.abs(Math.min(0, c.balance)),
    })),
    limit,
    owed,
    utilisation,
    band,
    available: limit - owed,
    monthlyInterestIfCarried: cards.reduce(
      (s, c) => s + (Math.abs(Math.min(0, c.balance)) * ((c.apr ?? 0) / 100)) / 12,
      0,
    ),
  }
}

/* ------------------------------------------------------------------ *
 * Headline numbers
 * ------------------------------------------------------------------ */

export interface Analytics {
  income: number
  commitments: ReturnType<typeof monthlyCommitments>
  everyday: number
  burnRate: number
  surplus: number
  savingsRate: number
  fixedExpenseRatio: number
  cashRunwayMonths: number
  emergencyMonthsCovered: number
  netWorth: ReturnType<typeof netWorth>
  monthSpend: number
  monthIncome: number
}

export function analytics(state: FinancialState): Analytics {
  const income = expectedMonthlyIncome(state)
  const commitments = monthlyCommitments(state)
  const everyday = everydayBurnMonthly(state)
  const burnRate = commitments.total + everyday
  const surplus = income - burnRate

  const nw = netWorth(state)
  const month = currentMonth()

  let monthSpend = 0
  let monthIncome = 0
  for (const t of state.transactions) {
    if (!inMonth(t, month)) continue
    if (isSpend(t)) monthSpend += Math.abs(t.amount)
    else if (isIncome(t)) monthIncome += t.amount
  }

  const ef = state.goals.find((g) => g.emergencyFund)

  return {
    income,
    commitments,
    everyday,
    burnRate,
    surplus,
    savingsRate: income > 0 ? (surplus / income) * 100 : 0,
    fixedExpenseRatio: income > 0 ? (commitments.total / income) * 100 : 0,
    cashRunwayMonths: burnRate > 0 ? nw.cash / burnRate : Infinity,
    emergencyMonthsCovered: ef && burnRate > 0 ? ef.saved / burnRate : 0,
    netWorth: nw,
    monthSpend,
    monthIncome,
  }
}

/** One 0–100 read on how things stand, weighted toward what breaks a month. */
export function healthScore(state: FinancialState, riskScore: number) {
  const a = analytics(state)
  const credit = creditSummary(state)
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))

  const parts = [
    { key: 'Cash flow', weight: 0.35, value: riskScore },
    { key: 'Saving', weight: 0.25, value: clamp((a.savingsRate / 30) * 100) },
    {
      key: 'Safety net',
      weight: 0.25,
      value: clamp((a.emergencyMonthsCovered / Math.max(1, state.settings.emergencyFundMonths)) * 100),
    },
    { key: 'Credit', weight: 0.15, value: clamp(100 - credit.utilisation * 2) },
  ]

  return { total: Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0)), parts }
}

/* ------------------------------------------------------------------ *
 * Subscriptions
 * ------------------------------------------------------------------ */

export function subscriptionInsights(state: FinancialState) {
  const subs = state.recurring.filter((r) => r.kind === 'subscription' && r.active)
  const rows = subs
    .map((s) => {
      const monthly =
        s.cadence === 'monthly' ? s.amount : s.cadence === 'quarterly' ? s.amount / 3 : s.amount / 12
      return { recurring: s, monthly, yearly: monthly * 12 }
    })
    .sort((a, b) => b.monthly - a.monthly)

  const lowValue = rows.filter((r) => r.recurring.usage < 4 && r.monthly > 100)

  return {
    rows,
    monthly: rows.reduce((s, r) => s + r.monthly, 0),
    yearly: rows.reduce((s, r) => s + r.yearly, 0),
    lowValue,
    recoverable: lowValue.reduce((s, r) => s + r.monthly, 0),
  }
}

/* ------------------------------------------------------------------ *
 * Descriptions the user types often — powers autocomplete
 * ------------------------------------------------------------------ */

export interface Suggestion {
  description: string
  categoryId: string
  accountId: string
  amount: number
  count: number
}

export function frequentDescriptions(state: FinancialState, limit = 8): Suggestion[] {
  const map = new Map<string, Suggestion>()

  for (const t of state.transactions) {
    if (t.transfer) continue
    const key = t.description.trim().toLowerCase()
    if (!key) continue
    const cur = map.get(key)
    if (cur) {
      cur.count += 1
      // Most recent wins for the prefilled values; transactions are newest-first.
      continue
    }
    map.set(key, {
      description: t.description.trim(),
      categoryId: t.categoryId,
      accountId: t.accountId,
      amount: Math.abs(t.amount),
      count: 1,
    })
  }

  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}

/** Look up the best category guess for a description the user is typing. */
export function guessCategory(state: FinancialState, description: string): string | null {
  const needle = description.trim().toLowerCase()
  if (needle.length < 2) return null
  const hit = state.transactions.find((t) => t.description.trim().toLowerCase() === needle)
  if (hit) return hit.categoryId
  const partial = state.transactions.find((t) => t.description.toLowerCase().includes(needle))
  return partial?.categoryId ?? null
}

/* ------------------------------------------------------------------ *
 * Anomalies worth surfacing
 * ------------------------------------------------------------------ */

export function unusualTransactions(state: FinancialState, days = 30) {
  const from = addDays(today(), -days)
  const recent = state.transactions.filter((t) => isSpend(t) && t.date >= from)
  if (recent.length < 8) return []

  const amounts = recent.map((t) => Math.abs(t.amount))
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length
  const sd = Math.sqrt(amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length)
  if (sd === 0) return []

  // Two standard deviations above the mean, which for spending data reliably
  // surfaces the handful of purchases worth a second look.
  return recent
    .filter((t) => Math.abs(t.amount) > mean + sd * 2)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 4)
}
