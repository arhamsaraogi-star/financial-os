import type { Account, FinancialState } from '@/lib/types'
import { ISODate, addDays, today } from '@/lib/dates'
import { LedgerEvent, generateScheduledEvents } from './events'
import { cashAccounts, creditAccounts } from './derived'

export { cashAccounts, creditAccounts }

export interface DayPoint {
  date: ISODate
  /** Closing balance per account id, cards included (negative = owed). */
  byAccount: Record<string, number>
  /** Closing cash across every non-credit account. */
  total: number
  inflow: number
  outflow: number
  events: LedgerEvent[]
  breach: boolean
  overdraft: boolean
}

export type RiskLevel = 'good' | 'watch' | 'tight' | 'trouble'

export interface RiskFlag {
  date: ISODate
  accountId: string
  accountName: string
  severity: 'overdraft' | 'below_buffer'
  balance: number
  shortfall: number
  cause?: string
}

export interface Forecast {
  from: ISODate
  to: ISODate
  days: DayPoint[]
  events: LedgerEvent[]
  flags: RiskFlag[]
  /** Lowest total cash reached, and when. */
  trough: { date: ISODate; total: number }
  totalInflow: number
  totalOutflow: number
  netFlow: number
  closingTotal: number
  openingTotal: number
  riskScore: number
  riskLevel: RiskLevel
  /** Days of cover at the current burn rate if every inflow stopped. */
  runwayDays: number
  automatedMoves: LedgerEvent[]
}

export interface SimulateOptions {
  horizonDays?: number
  from?: ISODate
  /** Shift an income source — powers "what if I'm paid late". */
  delayIncome?: { recurringId: string; days: number }
  /** A one-off purchase to test against the projection. */
  extraSpend?: { date: ISODate; amount: number; accountId: string; label: string }
  applyRules?: boolean
}

/**
 * How large a shortfall must be before a top-up rule fires: a tenth of the
 * account's target, floored at ₹2,000. Without a threshold this triggers the
 * day after every debit and savings ends up wiring ₹749 to cover a small
 * subscription.
 */
export function topUpThreshold(account: Account): number {
  return Math.max(2_000, account.targetBalance * 0.1)
}

/**
 * Walk the horizon day by day, applying scheduled events and then the rule
 * engine, tracking every account independently. Per-account tracking is the
 * point: a healthy total can hide a bills account that is about to run dry.
 */
export function simulate(state: FinancialState, opts: SimulateOptions = {}): Forecast {
  const horizon = opts.horizonDays ?? 90
  const from = opts.from ?? today()
  const to = addDays(from, horizon)
  const applyRules = opts.applyRules ?? true

  let events = generateScheduledEvents(state, from, to)

  if (opts.delayIncome) {
    const { recurringId, days } = opts.delayIncome
    events = events.map((e) =>
      e.kind === 'income' && e.sourceId === recurringId ? { ...e, date: addDays(e.date, days) } : e,
    )
  }

  if (opts.extraSpend) {
    const { date, amount, accountId, label } = opts.extraSpend
    events.push({
      id: `what-if:${date}`,
      date,
      label,
      kind: 'everyday',
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
  const cash = cashAccounts(state)
  const openingTotal = cash.reduce((s, a) => s + a.balance, 0)

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
      if (e.fromAccountId != null) balances[e.fromAccountId] = (balances[e.fromAccountId] ?? 0) - e.amount
      // A movement with both sides set is internal — neither in nor out.
      if (e.toAccountId != null && e.fromAccountId == null) inflow += e.amount
      if (e.fromAccountId != null && e.toAccountId == null) outflow += e.amount
      // Clearing a card leaves cash even though it credits the card account.
      if (e.kind === 'card_payment') outflow += e.amount
    }

    for (const e of dayEvents) apply(e)

    if (applyRules) {
      // runRules applies its own transfers to `balances` as it goes, so a later
      // rule sees what an earlier one left behind. They must NOT be put through
      // apply() again here — that would double-count every transfer.
      const generated = runRules(enabledRules, balances, dayEvents, date, accountById)
      for (const e of generated) {
        dayEvents.push(e)
        automatedMoves.push(e)
      }
    }

    totalInflow += inflow
    totalOutflow += outflow

    const snapshot: Record<string, number> = {}
    for (const a of state.accounts) snapshot[a.id] = balances[a.id] ?? 0

    let breach = false
    let overdraft = false

    for (const a of cash) {
      const bal = balances[a.id] ?? 0
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

    const total = cash.reduce((s, a) => s + (balances[a.id] ?? 0), 0)
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

  const riskScore = scoreRisk({ days, flags, trough, netFlow, openingTotal })
  const riskLevel: RiskLevel =
    riskScore >= 82 ? 'good' : riskScore >= 62 ? 'watch' : riskScore >= 38 ? 'tight' : 'trouble'

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
 * Evaluate every enabled rule against today's state. Rules only move money
 * that exists — a transfer is capped at the source account's balance above its
 * own floor, so automation can never create an overdraft.
 */
function runRules(
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
    return Math.max(0, (balances[accountId] ?? 0) - (acct?.minBuffer ?? 0))
  }

  const move = (fromId: string, toId: string, requested: number, label: string, rationale: string) => {
    if (fromId === toId) return
    const amount = Math.min(requested, spare(fromId))
    if (amount <= 0.5) return
    balances[fromId] = (balances[fromId] ?? 0) - amount
    balances[toId] = (balances[toId] ?? 0) + amount
    generated.push({
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
    })
  }

  for (const rule of rules) {
    const t = rule.trigger
    let fires = false

    if (t.type === 'income_received') {
      fires = dayEvents.some((e) => e.kind === 'income' && (!t.recurringId || e.sourceId === t.recurringId))
    } else if (t.type === 'day_of_month') {
      fires = day === t.day
    } else if (t.type === 'account_below_target') {
      const acct = accountById.get(t.accountId)
      const shortfall = acct ? acct.targetBalance - (balances[t.accountId] ?? 0) : 0
      fires = !!acct && shortfall > topUpThreshold(acct)
    }

    if (!fires) continue

    for (const action of rule.actions) {
      if (action.type === 'top_up_to_target') {
        const target = accountById.get(action.toAccountId)
        if (!target) continue
        const need = target.targetBalance - (balances[action.toAccountId] ?? 0)
        if (need > 0) move(action.fromAccountId, action.toAccountId, need, `Top up ${target.name}`, rule.rationale)
      } else if (action.type === 'transfer_fixed') {
        const target = accountById.get(action.toAccountId)
        move(
          action.fromAccountId,
          action.toAccountId,
          action.amount,
          `Move to ${target?.name ?? 'account'}`,
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
            `Move to ${target?.name ?? 'savings'}`,
            rule.rationale,
          )
        }
      }
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
}): number {
  const { days, flags, trough, netFlow, openingTotal } = input
  let score = 100

  const overdraftDays = new Set(flags.filter((f) => f.severity === 'overdraft').map((f) => f.date)).size
  const bufferDays = new Set(flags.filter((f) => f.severity === 'below_buffer').map((f) => f.date)).size

  // An account going negative is a hard failure, not a soft warning.
  score -= Math.min(50, overdraftDays * 12)
  score -= Math.min(22, bufferDays * 2.5)

  if (openingTotal > 0) {
    const ratio = trough.total / openingTotal
    if (ratio < 0) score -= 20
    else if (ratio < 0.15) score -= 14
    else if (ratio < 0.3) score -= 8
    else if (ratio < 0.5) score -= 3
  }

  if (netFlow < 0) score -= Math.min(18, (Math.abs(netFlow) / Math.max(1, openingTotal)) * 30)
  else score += 3

  const strained = days.filter((d) => d.breach || d.overdraft).length
  score -= Math.min(10, (strained / Math.max(1, days.length)) * 30)

  return Math.max(0, Math.min(100, Math.round(score)))
}

