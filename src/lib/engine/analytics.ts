import type { FinancialState, Holding } from '@/lib/types'
import { ISODate, daysBetween, monthKey, today } from '@/lib/dates'
import {
  expectedMonthlyIncome,
  monthlyCommitments,
  netWorth,
  normaliseMonthly,
} from './forecast'

/* ------------------------------------------------------------------ *
 * Portfolio
 * ------------------------------------------------------------------ */

export function holdingValue(h: Holding) {
  return h.units * h.currentPrice
}

export function holdingCost(h: Holding) {
  return h.units * h.avgCost
}

/**
 * Money-weighted return. Newton–Raphson on the NPV curve, bisection fallback
 * when the derivative is flat — a portfolio with irregular SIP dates is exactly
 * the case where a naive implementation diverges.
 */
export function xirr(flows: { date: ISODate; amount: number }[]): number | null {
  if (flows.length < 2) return null
  const base = flows[0].date
  const points = flows.map((f) => ({ t: daysBetween(base, f.date) / 365, a: f.amount }))
  // A rate only exists if money went both directions. The caller supplies
  // today's market value as the closing inflow.
  if (points.every((p) => p.a >= 0) || points.every((p) => p.a <= 0)) return null

  const npv = (r: number) => points.reduce((s, p) => s + p.a / Math.pow(1 + r, p.t), 0)

  let rate = 0.1
  for (let i = 0; i < 60; i++) {
    const f = npv(rate)
    const step = 1e-5
    const d = (npv(rate + step) - f) / step
    if (!Number.isFinite(d) || Math.abs(d) < 1e-9) break
    const next = rate - f / d
    if (!Number.isFinite(next)) break
    if (Math.abs(next - rate) < 1e-7) return clampRate(next)
    rate = Math.max(-0.95, Math.min(10, next))
  }

  // Bisection fallback across a wide, well-behaved bracket.
  let lo = -0.9
  let hi = 5
  if (npv(lo) * npv(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return clampRate((lo + hi) / 2)
}

function clampRate(r: number): number | null {
  if (!Number.isFinite(r) || r <= -0.999 || r > 10) return null
  return r
}

export interface PortfolioSummary {
  invested: number
  current: number
  absoluteGain: number
  absoluteReturnPct: number
  xirrPct: number | null
  dividends: number
  byAssetClass: { name: string; value: number; pct: number }[]
  bySector: { name: string; value: number; pct: number }[]
  byKind: { name: string; value: number; pct: number }[]
}

const KIND_LABEL: Record<Holding['kind'], string> = {
  mutual_fund: 'Mutual Funds',
  stock: 'Stocks',
  etf: 'ETFs',
  bond: 'Bonds',
  gold: 'Gold',
  cash: 'Cash',
}

export function portfolioSummary(state: FinancialState): PortfolioSummary {
  const invested = state.holdings.reduce((s, h) => s + holdingCost(h), 0)
  const current = state.holdings.reduce((s, h) => s + holdingValue(h), 0)
  const absoluteGain = current - invested
  const absoluteReturnPct = invested > 0 ? (absoluteGain / invested) * 100 : 0

  // Every holding's flows, plus today's market value as the terminal inflow.
  const flows = state.holdings.flatMap((h) => h.flows)
  const allFlows = [...flows].sort((a, b) => (a.date < b.date ? -1 : 1))
  if (current > 0) allFlows.push({ date: today(), amount: current })
  const r = xirr(allFlows)

  const group = (key: (h: Holding) => string) => {
    const map = new Map<string, number>()
    for (const h of state.holdings) {
      const v = holdingValue(h)
      map.set(key(h), (map.get(key(h)) ?? 0) + v)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value, pct: current > 0 ? (value / current) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }

  return {
    invested,
    current,
    absoluteGain,
    absoluteReturnPct,
    xirrPct: r == null ? null : r * 100,
    dividends: state.holdings.reduce((s, h) => s + (h.dividendsYtd ?? 0), 0),
    byAssetClass: group((h) => h.assetClass[0].toUpperCase() + h.assetClass.slice(1)),
    bySector: group((h) => h.sector),
    byKind: group((h) => KIND_LABEL[h.kind]),
  }
}

/** Compound a monthly contribution + lump sum forward at a nominal annual rate. */
export function projectCorpus(
  current: number,
  monthly: number,
  annualRatePct: number,
  years: number,
): { year: number; value: number; contributed: number }[] {
  const r = annualRatePct / 100 / 12
  const out: { year: number; value: number; contributed: number }[] = []
  let value = current
  let contributed = current
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      value = value * (1 + r) + monthly
      contributed += monthly
    }
    out.push({ year: y, value: Math.round(value), contributed: Math.round(contributed) })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Credit
 * ------------------------------------------------------------------ */

export function creditSummary(state: FinancialState) {
  const active = state.cards.filter((c) => c.active)
  const limit = active.reduce((s, c) => s + c.limit, 0)
  const balance = active.reduce((s, c) => s + c.currentBalance, 0)
  const utilisation = limit > 0 ? (balance / limit) * 100 : 0

  // Utilisation is the single largest controllable score input; the bands below
  // mirror how bureaus actually treat it.
  const band =
    utilisation <= 10
      ? { label: 'Excellent', tone: 'good' as const }
      : utilisation <= 30
        ? { label: 'Healthy', tone: 'good' as const }
        : utilisation <= 50
          ? { label: 'Elevated', tone: 'warn' as const }
          : { label: 'Damaging', tone: 'bad' as const }

  const perCard = active.map((c) => ({
    ...c,
    utilisation: c.limit > 0 ? (c.currentBalance / c.limit) * 100 : 0,
    available: c.limit - c.currentBalance,
  }))

  return { limit, balance, utilisation, band, perCard, available: limit - balance }
}

/* ------------------------------------------------------------------ *
 * Headline ratios
 * ------------------------------------------------------------------ */

export interface Analytics {
  income: number
  commitments: ReturnType<typeof monthlyCommitments>
  discretionary: number
  savingsRate: number
  fixedExpenseRatio: number
  investmentRate: number
  burnRate: number
  liquidityRatio: number
  cashRunwayMonths: number
  emergencyMonthsCovered: number
  netWorth: ReturnType<typeof netWorth>
  surplus: number
}

export function analytics(state: FinancialState): Analytics {
  const income = expectedMonthlyIncome(state)
  const commitments = monthlyCommitments(state)
  const discretionary = state.settings.discretionaryMonthly
  const burnRate = commitments.bills + commitments.subs + discretionary
  const surplus = income - burnRate - commitments.sips

  const nw = netWorth(state)
  const liquidCash = nw.cash

  // Savings rate counts money that *stays yours* — investments included.
  const saved = income - burnRate
  const savingsRate = income > 0 ? (saved / income) * 100 : 0
  const fixedExpenseRatio = income > 0 ? (commitments.bills / income) * 100 : 0
  const investmentRate = income > 0 ? (commitments.sips / income) * 100 : 0

  const monthlyObligations = burnRate || 1
  const cashRunwayMonths = liquidCash / monthlyObligations

  const ef = state.goals.find((g) => g.kind === 'emergency_fund')
  const emergencyMonthsCovered = ef ? ef.current / monthlyObligations : 0

  const shortTermLiabilities = state.cards.reduce((s, c) => s + c.currentBalance, 0) + commitments.bills
  const liquidityRatio = shortTermLiabilities > 0 ? liquidCash / shortTermLiabilities : Infinity

  return {
    income,
    commitments,
    discretionary,
    savingsRate,
    fixedExpenseRatio,
    investmentRate,
    burnRate,
    liquidityRatio,
    cashRunwayMonths,
    emergencyMonthsCovered,
    netWorth: nw,
    surplus,
  }
}

/**
 * A single 0–100 read on financial health. Weighted toward the things that
 * actually break a month: liquidity and buffer discipline, not vanity returns.
 */
export function healthScore(state: FinancialState, riskScore: number) {
  const a = analytics(state)
  const credit = creditSummary(state)

  const parts = [
    { key: 'Cash flow safety', weight: 0.3, value: riskScore },
    { key: 'Savings rate', weight: 0.2, value: clamp((a.savingsRate / 35) * 100) },
    {
      key: 'Emergency cover',
      weight: 0.2,
      value: clamp((a.emergencyMonthsCovered / state.settings.emergencyFundMonths) * 100),
    },
    { key: 'Credit health', weight: 0.15, value: clamp(100 - credit.utilisation * 2) },
    { key: 'Investment rate', weight: 0.15, value: clamp((a.investmentRate / 20) * 100) },
  ]

  const total = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0))
  return { total, parts }
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
}

/* ------------------------------------------------------------------ *
 * History from the transaction ledger
 * ------------------------------------------------------------------ */

export interface MonthRollup {
  month: string
  label: string
  income: number
  expense: number
  invested: number
  net: number
  savingsRate: number
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthlyRollups(state: FinancialState): MonthRollup[] {
  const map = new Map<string, MonthRollup>()

  for (const t of state.transactions) {
    const k = monthKey(t.date)
    if (!map.has(k)) {
      const m = Number(k.slice(5, 7))
      map.set(k, {
        month: k,
        label: `${MONTH_ABBR[m - 1]} ${k.slice(2, 4)}`,
        income: 0,
        expense: 0,
        invested: 0,
        net: 0,
        savingsRate: 0,
      })
    }
    const row = map.get(k)!
    if (t.kind === 'income') row.income += Math.abs(t.amount)
    else if (t.kind === 'investment') row.invested += Math.abs(t.amount)
    else if (t.kind !== 'transfer') row.expense += Math.abs(t.amount)
  }

  return [...map.values()]
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((r) => ({
      ...r,
      net: r.income - r.expense - r.invested,
      savingsRate: r.income > 0 ? ((r.income - r.expense) / r.income) * 100 : 0,
    }))
}

/** Trailing-12 average of a rollup field, ignoring months with no income. */
export function rolling12(rows: MonthRollup[], field: 'income' | 'expense' | 'invested'): number {
  const last = rows.slice(-12).filter((r) => r.income > 0)
  if (!last.length) return 0
  return last.reduce((s, r) => s + r[field], 0) / last.length
}

export function growthRate(rows: MonthRollup[], field: 'income' | 'expense'): number {
  if (rows.length < 4) return 0
  const recent = rows.slice(-3).reduce((s, r) => s + r[field], 0) / 3
  const prior = rows.slice(-6, -3).reduce((s, r) => s + r[field], 0) / 3
  if (prior <= 0) return 0
  return ((recent - prior) / prior) * 100
}

/* ------------------------------------------------------------------ *
 * Subscription intelligence
 * ------------------------------------------------------------------ */

export function subscriptionInsights(state: FinancialState) {
  const active = state.subscriptions.filter((s) => s.active)
  const monthly = active.reduce((s, x) => s + normaliseMonthly(x.amount, x.cycle), 0)
  const annual = monthly * 12

  const rows = active.map((s) => {
    const monthlyCost = normaliseMonthly(s.amount, s.cycle)
    const monthsHeld = Math.max(1, Math.round(daysBetween(s.startedOn, today()) / 30))
    const lifetime = monthlyCost * monthsHeld
    // Cost per unit of value: high spend + low usage is what we want to surface.
    const valueIndex = s.usageScore > 0 ? monthlyCost / s.usageScore : monthlyCost * 2
    return { ...s, monthlyCost, lifetime, monthsHeld, valueIndex }
  })

  const cancelCandidates = rows
    .filter((r) => r.usageScore < 4 && r.monthlyCost > 100)
    .sort((a, b) => b.valueIndex - a.valueIndex)

  const potentialSaving = cancelCandidates.reduce((s, r) => s + r.monthlyCost, 0)

  return {
    rows: rows.sort((a, b) => b.monthlyCost - a.monthlyCost),
    monthly,
    annual,
    lifetime: rows.reduce((s, r) => s + r.lifetime, 0),
    cancelCandidates,
    potentialSaving,
  }
}
