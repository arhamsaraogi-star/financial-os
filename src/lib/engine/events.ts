import type { FinancialState, Priority } from '@/lib/types'
import {
  ISODate,
  addDays,
  fromISO,
  monthlyOccurrences,
  nextDayOfMonth,
  today,
  yearlyOccurrences,
} from '@/lib/dates'

export type EventKind =
  | 'income'
  | 'bill'
  | 'subscription'
  | 'sip'
  | 'card_payment'
  | 'discretionary'
  | 'transfer'

/**
 * One dated money movement in the projection. `amount` is always positive;
 * direction is carried by `kind` + the account fields, so a transfer can debit
 * one account and credit another without becoming two half-truths.
 */
export interface LedgerEvent {
  id: string
  date: ISODate
  label: string
  kind: EventKind
  amount: number
  /** Credited account (destination for transfers, `null` for pure outflows). */
  toAccountId: string | null
  /** Debited account (`null` for pure inflows). */
  fromAccountId: string | null
  /** 0–1. Income confidence, or 1 for contractual obligations. */
  confidence: number
  priority?: Priority
  sourceId: string
  /** True when the rule engine created this movement rather than a schedule. */
  automated?: boolean
  rationale?: string
}

/** Pessimism knob: 0 uses the expected value, 1 uses the worst end of the range. */
function skew(expected: number, min: number, max: number, conservatism: number, worstIsLow: boolean) {
  const worst = worstIsLow ? Math.min(min, expected) : Math.max(max, expected)
  return expected + (worst - expected) * conservatism
}

/** Midpoint of an arrival window, clamped into the month. Salary 28–31 → 29th. */
function windowMidDay(start: number, end: number): number {
  if (end >= start) return Math.round((start + end) / 2)
  return start // window wraps a month boundary; anchor at the opening day
}

/**
 * Expand every recurring schedule in the state into concrete dated events
 * across `[from, to]`. Pure — the rule engine layers its transfers on top.
 */
export function generateScheduledEvents(
  state: FinancialState,
  from: ISODate,
  to: ISODate,
): LedgerEvent[] {
  const events: LedgerEvent[] = []
  const c = state.settings.forecastConservatism

  // --- Income -------------------------------------------------------------
  for (const src of state.income) {
    if (!src.active) continue
    const day = windowMidDay(src.windowStart, src.windowEnd)
    const amount = skew(src.expectedAmount, src.minAmount, src.maxAmount, c, true)
    for (const date of monthlyOccurrences(day, from, to)) {
      events.push({
        id: `inc:${src.id}:${date}`,
        date,
        label: src.name,
        kind: 'income',
        amount,
        toAccountId: src.accountId,
        fromAccountId: null,
        confidence: src.confidence,
        sourceId: src.id,
      })
    }
  }

  // --- Bills --------------------------------------------------------------
  for (const b of state.bills) {
    if (!b.active) continue
    const amount = skew(b.expectedAmount, b.minAmount, b.maxAmount, c, false)
    for (const date of monthlyOccurrences(b.dueDay, from, to)) {
      events.push({
        id: `bill:${b.id}:${date}`,
        date,
        label: b.name,
        kind: 'bill',
        amount,
        toAccountId: null,
        fromAccountId: b.fundingAccountId,
        confidence: 1,
        priority: b.priority,
        sourceId: b.id,
      })
    }
  }

  // --- Subscriptions ------------------------------------------------------
  for (const s of state.subscriptions) {
    if (!s.active) continue
    let dates: ISODate[] = []
    if (s.cycle === 'monthly') {
      dates = monthlyOccurrences(s.renewalDay, from, to)
    } else if (s.cycle === 'annual') {
      dates = yearlyOccurrences(s.renewalMonth ?? fromISO(s.startedOn).getMonth() + 1, s.renewalDay, from, to)
    } else {
      // Quarterly: anchored to the start month so the cadence stays true.
      const anchor = fromISO(s.startedOn).getMonth() + 1
      dates = monthlyOccurrences(s.renewalDay, from, to).filter((d) => {
        const m = Number(d.slice(5, 7))
        return (m - anchor + 12) % 3 === 0
      })
    }
    for (const date of dates) {
      events.push({
        id: `sub:${s.id}:${date}`,
        date,
        label: s.name,
        kind: 'subscription',
        amount: s.amount,
        toAccountId: null,
        fromAccountId: s.accountId,
        confidence: 1,
        priority: 'low',
        sourceId: s.id,
      })
    }
  }

  // --- SIPs — treated exactly like rent, per the operating philosophy ------
  for (const s of state.sips) {
    if (!s.active) continue
    for (const date of monthlyOccurrences(s.day, from, to)) {
      events.push({
        id: `sip:${s.id}:${date}`,
        date,
        label: s.name,
        kind: 'sip',
        amount: s.amount,
        toAccountId: null,
        fromAccountId: s.accountId,
        confidence: 1,
        priority: 'high',
        sourceId: s.id,
      })
    }
  }

  // --- Credit cards -------------------------------------------------------
  // Only the *current* outstanding balance is scheduled, on the next due date.
  // Ongoing card spend is already represented by the discretionary run-rate,
  // so projecting a full balance every month would double-count it.
  for (const card of state.cards) {
    if (!card.active || card.currentBalance <= 0) continue
    const due = nextDayOfMonth(card.dueDay, from)
    if (due <= to) {
      events.push({
        id: `card:${card.id}:${due}`,
        date: due,
        label: `${card.name} statement`,
        kind: 'card_payment',
        amount: card.currentBalance,
        toAccountId: null,
        fromAccountId: card.paymentAccountId,
        confidence: 1,
        priority: 'critical',
        sourceId: card.id,
      })
    }
  }

  // --- Discretionary run-rate --------------------------------------------
  // Everyday spend is not a bill; it is a daily drip out of the operating
  // account. Modelling it weekly keeps the chart readable without lying about
  // the total.
  const operating =
    state.accounts.find((a) => a.role === 'income_hub') ?? state.accounts[0]
  if (operating && state.settings.discretionaryMonthly > 0) {
    const weekly = (state.settings.discretionaryMonthly * 12) / 52
    let cursor = from
    while (cursor <= to) {
      events.push({
        id: `disc:${cursor}`,
        date: cursor,
        label: 'Everyday spend',
        kind: 'discretionary',
        amount: weekly,
        toAccountId: null,
        fromAccountId: operating.id,
        confidence: 0.8,
        priority: 'low',
        sourceId: 'discretionary',
      })
      cursor = addDays(cursor, 7)
    }
  }

  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Obligations landing in the next `days`, soonest first. */
export function upcomingObligations(state: FinancialState, days = 30): LedgerEvent[] {
  const from = today()
  const to = addDays(from, days)
  return generateScheduledEvents(state, from, to).filter(
    (e) => e.kind !== 'income' && e.kind !== 'discretionary',
  )
}

/** Expected receipts in the next `days`, soonest first. */
export function upcomingIncome(state: FinancialState, days = 30): LedgerEvent[] {
  const from = today()
  const to = addDays(from, days)
  return generateScheduledEvents(state, from, to).filter((e) => e.kind === 'income')
}
