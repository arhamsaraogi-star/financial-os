import type { Account, FinancialState } from '@/lib/types'
import { ISODate, addDays, daysBetween, today } from '@/lib/dates'
import { LedgerEvent, generateScheduledEvents } from './events'

export interface DayPoint {
  date: ISODate
  /** Closing balance per account id. */
  byAccount: Record<string, number>
  /** Closing liquid cash across every non-credit account. */
  total: number
  inflow: number
  outflow: number
  events: LedgerEvent[]
  /** True if any account closed below its own hard floor. */
  breach: boolean
  /** True if any account closed negative. */
  overdraft: boolean
}

export type RiskLevel = 'secure' | 'watch' | 'strained' | 'critical'

export interface RiskFlag {
  date: ISODate
  accountId: string
  accountName: string
  severity: 'overdraft' | 'below_buffer'
  balance: number
  shortfall: number
  /** The obligation that tipped it over, when one can be identified. */
  cause?: string
}

export interface Forecast {
  from: ISODate
  to: ISODate
  days: DayPoint[]
  events: LedgerEvent[]
  flags: RiskFlag[]
  /** Lowest total liquidity reached, and when. */
  trough: { date: ISODate; total: number }
  totalInflow: number
  totalOutflow: number
  netFlow: number
  closingTotal: number
  openingTotal: number
  /** 0–100. 100 = every obligation covered with buffer intact throughout. */
  riskScore: number
  riskLevel: RiskLevel
  /** Days of runway at the current burn rate if every inflow stopped today. */
  runwayDays: number
  /** Automated moves the rule engine performed inside the projection. */
  automatedMoves: LedgerEvent[]
}

export interface SimulateOptions {
  horizonDays?: number
  from?: ISODate
  /** Shift a specific income source by N days — powers "what if salary is late". */
  delayIncome?: { incomeId: string; days: number }
  /** A one-off purchase to test against the projection. */
  extraSpend?: { date: ISODate; amount: number; accountId: string; label: string }
  /** Skip rule automation to see the raw, unmanaged picture. */
  applyRules?: boolean
}

function liquidAccounts(state: FinancialState): Account[] {
  return state.accounts.filter((a) => a.role !== 'credit')
}

/**
 * Walk the horizon day by day, applying scheduled events and then the rule
 * engine, tracking every account independently. Per-account tracking is the
 * point: an aggregate balance can look healthy while the bills account is dry.
 */
export function simulate(state: FinancialState, opts: SimulateOptions = {}): Forecast {
  const horizon = opts.horizonDays ?? 90
  const from = opts.from ?? today()
  const to = addDays(from, horizon)
  const applyRules = opts.applyRules ?? true

  let events = generateScheduledEvents(state, from, to)

  if (opts.delayIncome) {
    const { incomeId, days } = opts.delayIncome
    events = events.map((e) =>
      e.kind === 'income' && e.sourceId === incomeId ? { ...e, date: addDays(e.date, days) } : e,
    )
  }

  if (opts.extraSpend) {
    const { date, amount, accountId, label } = opts.extraSpend
    events.push({
      id: `what-if:${date}`,
      date,
      label,
      kind: 'discretionary',
      amount,
      toAccountId: null,
      fromAccountId: accountId,
      confidence: 1,
      sourceId: 'what-if',
    })
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const balances: Record<string, number> = {}
  for (const a of state.accounts) balances[a.id] = a.balance

  const byDate = new Map<ISODate, LedgerEvent[]>()
  for (const e of events) {
    const list = byDate.get(e.date)
    if (list) list.push(e)
    else byDate.set(e.date, [e])
  }

  const accountById = new Map(state.accounts.map((a) => [a.id, a]))
  const liquid = liquidAccounts(state)
  const openingTotal = liquid.reduce((s, a) => s + a.balance, 0)

  const days: DayPoint[] = []
  const flags: RiskFlag[] = []
  const automatedMoves: LedgerEvent[] = []
  const allEvents: LedgerEvent[] = []
  let totalInflow = 0
  let totalOutflow = 0

  const enabledRules = state.rules
    .filter((r) => r.enabled)
    .slice()
    .sort((a, b) => a.order - b.order)

  for (let i = 0; i <= horizon; i++) {
    const date = addDays(from, i)
    const dayEvents = (byDate.get(date) ?? []).slice()
    let inflow = 0
    let outflow = 0

    const apply = (e: LedgerEvent) => {
      if (e.toAccountId != null) balances[e.toAccountId] = (balances[e.toAccountId] ?? 0) + e.amount
      if (e.fromAccountId != null)
        balances[e.fromAccountId] = (balances[e.fromAccountId] ?? 0) - e.amount
      // A transfer touches both sides, so it is neither inflow nor outflow.
      if (e.toAccountId != null && e.fromAccountId == null) inflow += e.amount
      if (e.fromAccountId != null && e.toAccountId == null) outflow += e.amount
    }

    for (const e of dayEvents) apply(e)

    if (applyRules) {
      // runRules applies its own transfers to `balances` as it goes, so that a
      // later rule sees the balance a earlier one left behind. They must not be
      // put through apply() a second time here.
      const generated = runRules(state, enabledRules, balances, dayEvents, date, accountById)
      for (const e of generated) {
        dayEvents.push(e)
        automatedMoves.push(e)
      }
    }

    totalInflow += inflow
    totalOutflow += outflow

    const snapshot: Record<string, number> = {}
    let breach = false
    let overdraft = false

    for (const a of liquid) {
      const bal = balances[a.id] ?? 0
      snapshot[a.id] = bal
      if (bal < 0) {
        overdraft = true
        flags.push({
          date,
          accountId: a.id,
          accountName: a.name,
          severity: 'overdraft',
          balance: bal,
          shortfall: -bal,
          cause: dominantCause(dayEvents, a.id),
        })
      } else if (a.minBuffer > 0 && bal < a.minBuffer) {
        breach = true
        flags.push({
          date,
          accountId: a.id,
          accountName: a.name,
          severity: 'below_buffer',
          balance: bal,
          shortfall: a.minBuffer - bal,
          cause: dominantCause(dayEvents, a.id),
        })
      }
    }

    const total = liquid.reduce((s, a) => s + (balances[a.id] ?? 0), 0)
    days.push({ date, byAccount: snapshot, total, inflow, outflow, events: dayEvents, breach, overdraft })
    allEvents.push(...dayEvents)
  }

  const trough = days.reduce(
    (min, d) => (d.total < min.total ? { date: d.date, total: d.total } : min),
    { date: days[0]?.date ?? from, total: days[0]?.total ?? openingTotal },
  )

  const closingTotal = days[days.length - 1]?.total ?? openingTotal
  const netFlow = totalInflow - totalOutflow

  const monthlyBurn = (totalOutflow / Math.max(1, horizon)) * 30
  const runwayDays = monthlyBurn > 0 ? Math.round((openingTotal / monthlyBurn) * 30) : Infinity

  const riskScore = scoreRisk({ days, flags, trough, netFlow, openingTotal, horizon })
  const riskLevel: RiskLevel =
    riskScore >= 82 ? 'secure' : riskScore >= 62 ? 'watch' : riskScore >= 38 ? 'strained' : 'critical'

  return {
    from,
    to,
    days,
    events: allEvents,
    flags,
    trough,
    totalInflow,
    totalOutflow,
    netFlow,
    closingTotal,
    openingTotal,
    riskScore,
    riskLevel,
    runwayDays,
    automatedMoves,
  }
}

/** The largest outflow hitting this account today — the plain-English culprit. */
function dominantCause(dayEvents: LedgerEvent[], accountId: string): string | undefined {
  const hits = dayEvents.filter((e) => e.fromAccountId === accountId)
  if (!hits.length) return undefined
  return hits.reduce((a, b) => (b.amount > a.amount ? b : a)).label
}

/* ------------------------------------------------------------------ *
 * Rule engine
 * ------------------------------------------------------------------ */

/**
 * How large a shortfall has to be before a top-up rule is worth firing:
 * a tenth of the account's target, floored at ₹2,000 so small accounts still
 * get topped up and large ones are not micro-managed.
 */
export function topUpThreshold(account: Account): number {
  return Math.max(2_000, account.targetBalance * 0.1)
}

/**
 * Evaluate every enabled rule against today's state. Rules only ever move money
 * that exists — a transfer is capped at the source account's spare balance
 * above its own floor, so automation can never create an overdraft.
 */
function runRules(
  state: FinancialState,
  rules: FinancialState['rules'],
  balances: Record<string, number>,
  dayEvents: LedgerEvent[],
  date: ISODate,
  accountById: Map<string, Account>,
): LedgerEvent[] {
  const generated: LedgerEvent[] = []
  const day = Number(date.slice(8, 10))

  const spare = (accountId: string) => {
    const acct = accountById.get(accountId)
    const floor = acct?.minBuffer ?? 0
    return Math.max(0, (balances[accountId] ?? 0) - floor)
  }

  const move = (
    fromId: string,
    toId: string,
    requested: number,
    label: string,
    rationale: string,
  ) => {
    if (fromId === toId) return
    const amount = Math.min(requested, spare(fromId))
    if (amount <= 0.5) return
    const e: LedgerEvent = {
      id: `rule:${label}:${date}:${toId}`,
      date,
      label,
      kind: 'transfer',
      amount,
      toAccountId: toId,
      fromAccountId: fromId,
      confidence: 1,
      sourceId: 'rule',
      automated: true,
      rationale,
    }
    balances[fromId] = (balances[fromId] ?? 0) - amount
    balances[toId] = (balances[toId] ?? 0) + amount
    generated.push(e)
  }

  for (const rule of rules) {
    let fires = false
    const t = rule.trigger

    if (t.type === 'income_received') {
      fires = dayEvents.some(
        (e) => e.kind === 'income' && (!t.incomeId || e.sourceId === t.incomeId),
      )
    } else if (t.type === 'day_of_month') {
      fires = day === t.day
    } else if (t.type === 'account_below_target') {
      const acct = accountById.get(t.accountId)
      // Materiality. Without a threshold this fires the day after every debit
      // and the reserve ends up wiring ₹749 to cover an iCloud charge. Real
      // treasury tops up when the gap is worth a transfer, not continuously.
      const shortfall = acct ? acct.targetBalance - (balances[t.accountId] ?? 0) : 0
      fires = !!acct && shortfall > topUpThreshold(acct)
    } else if (t.type === 'account_above') {
      fires = (balances[t.accountId] ?? 0) > t.amount
    } else if (t.type === 'goal_complete') {
      const g = state.goals.find((x) => x.id === t.goalId)
      fires = !!g && g.current >= g.target
    }

    if (!fires) continue

    for (const action of rule.actions) {
      if (action.type === 'top_up_to_target') {
        const target = accountById.get(action.toAccountId)
        if (!target) continue
        const need = target.targetBalance - (balances[action.toAccountId] ?? 0)
        if (need > 0) {
          move(action.fromAccountId, action.toAccountId, need, `Top up ${target.name}`, rule.rationale)
        }
      } else if (action.type === 'transfer_fixed') {
        const target = accountById.get(action.toAccountId)
        move(
          action.fromAccountId,
          action.toAccountId,
          action.amount,
          `Transfer to ${target?.name ?? 'account'}`,
          rule.rationale,
        )
      } else if (action.type === 'sweep_excess') {
        const available = (balances[action.fromAccountId] ?? 0) - action.keep
        const target = accountById.get(action.toAccountId)
        if (available > 0) {
          move(
            action.fromAccountId,
            action.toAccountId,
            available,
            `Sweep to ${target?.name ?? 'reserve'}`,
            rule.rationale,
          )
        }
      } else if (action.type === 'fund_sips') {
        const totalSip = state.sips.filter((s) => s.active).reduce((s, x) => s + x.amount, 0)
        const sipAccounts = new Set(state.sips.filter((s) => s.active).map((s) => s.accountId))
        for (const acctId of sipAccounts) {
          if (acctId === action.fromAccountId) continue
          const share = state.sips
            .filter((s) => s.active && s.accountId === acctId)
            .reduce((s, x) => s + x.amount, 0)
          move(action.fromAccountId, acctId, share, 'Fund SIP', rule.rationale)
        }
        if (sipAccounts.size === 0 && totalSip > 0) continue
      }
      // 'recommend' produces advice, not movement — surfaced by the advisor.
    }
  }

  return generated
}

/* ------------------------------------------------------------------ *
 * Risk scoring
 * ------------------------------------------------------------------ */

function scoreRisk(input: {
  days: DayPoint[]
  flags: RiskFlag[]
  trough: { date: ISODate; total: number }
  netFlow: number
  openingTotal: number
  horizon: number
}): number {
  const { days, flags, trough, netFlow, openingTotal } = input
  let score = 100

  const overdraftDays = new Set(
    flags.filter((f) => f.severity === 'overdraft').map((f) => f.date),
  ).size
  const bufferDays = new Set(
    flags.filter((f) => f.severity === 'below_buffer').map((f) => f.date),
  ).size

  // An account going negative is a hard failure, not a soft warning.
  score -= Math.min(50, overdraftDays * 12)
  score -= Math.min(22, bufferDays * 2.5)

  // How close the trough came to zero, relative to where we started.
  if (openingTotal > 0) {
    const troughRatio = trough.total / openingTotal
    if (troughRatio < 0) score -= 20
    else if (troughRatio < 0.15) score -= 14
    else if (troughRatio < 0.3) score -= 8
    else if (troughRatio < 0.5) score -= 3
  }

  // Direction of travel over the horizon.
  if (netFlow < 0) {
    const drainRatio = Math.abs(netFlow) / Math.max(1, openingTotal)
    score -= Math.min(18, drainRatio * 30)
  } else {
    score += 3
  }

  // Sustained pressure reads worse than a single bad day.
  const strainedDays = days.filter((d) => d.breach || d.overdraft).length
  score -= Math.min(10, (strainedDays / Math.max(1, days.length)) * 30)

  return Math.max(0, Math.min(100, Math.round(score)))
}

/* ------------------------------------------------------------------ *
 * Derived helpers used across the dashboards
 * ------------------------------------------------------------------ */

/** Net worth = liquid cash + investments at market − credit outstanding. */
export function netWorth(state: FinancialState) {
  const cash = state.accounts
    .filter((a) => a.role !== 'credit')
    .reduce((s, a) => s + a.balance, 0)
  const investments = state.holdings.reduce((s, h) => s + h.units * h.currentPrice, 0)
  const credit = state.cards.reduce((s, c) => s + c.currentBalance, 0)
  return { cash, investments, credit, total: cash + investments - credit }
}

/** Committed monthly outflow: bills + subscriptions (normalised) + SIPs. */
export function monthlyCommitments(state: FinancialState) {
  const bills = state.bills.filter((b) => b.active).reduce((s, b) => s + b.expectedAmount, 0)
  const subs = state.subscriptions
    .filter((s) => s.active)
    .reduce((s, x) => s + normaliseMonthly(x.amount, x.cycle), 0)
  const sips = state.sips.filter((s) => s.active).reduce((s, x) => s + x.amount, 0)
  return { bills, subs, sips, total: bills + subs + sips }
}

export function normaliseMonthly(amount: number, cycle: 'monthly' | 'quarterly' | 'annual') {
  if (cycle === 'monthly') return amount
  if (cycle === 'quarterly') return amount / 3
  return amount / 12
}

export function expectedMonthlyIncome(state: FinancialState) {
  return state.income
    .filter((i) => i.active)
    .reduce((s, i) => s + i.expectedAmount * i.confidence, 0)
}

/** Whole-rupee days until an account is projected to fall below its floor. */
export function daysUntilFirstBreach(forecast: Forecast): number | null {
  const first = forecast.flags[0]
  return first ? daysBetween(forecast.from, first.date) : null
}
