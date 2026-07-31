import type { Account, FinancialState } from '@/lib/types'
import { everydayDailyBurn } from './events'

/**
 * Small derivations shared by the forecast, the analytics and the advisor.
 * They live here rather than in any one engine so none of them has to import
 * another just to add up account balances.
 */

export function cashAccounts(state: FinancialState): Account[] {
  return state.accounts.filter((a) => a.kind !== 'credit' && !a.archived)
}

export function creditAccounts(state: FinancialState): Account[] {
  return state.accounts.filter((a) => a.kind === 'credit' && !a.archived)
}

/** Money owed on a card, as a positive number. Card balances are ≤ 0. */
export function owedOn(account: Account): number {
  return Math.abs(Math.min(0, account.balance))
}

/** Net worth = cash − what you owe on cards. */
export function netWorth(state: FinancialState) {
  const cash = cashAccounts(state).reduce((s, a) => s + a.balance, 0)
  const owed = creditAccounts(state).reduce((s, a) => s + owedOn(a), 0)
  return { cash, owed, total: cash - owed }
}

export function normaliseMonthly(amount: number, cadence: 'monthly' | 'quarterly' | 'annual') {
  if (cadence === 'monthly') return amount
  if (cadence === 'quarterly') return amount / 3
  return amount / 12
}

export function monthlyCommitments(state: FinancialState) {
  const active = state.recurring.filter((r) => r.active)
  const bills = active
    .filter((r) => r.kind === 'bill')
    .reduce((s, r) => s + normaliseMonthly(r.amount, r.cadence), 0)
  const subs = active
    .filter((r) => r.kind === 'subscription')
    .reduce((s, r) => s + normaliseMonthly(r.amount, r.cadence), 0)
  return { bills, subs, total: bills + subs }
}

export function expectedMonthlyIncome(state: FinancialState) {
  return state.recurring
    .filter((r) => r.active && r.kind === 'income')
    .reduce((s, r) => s + normaliseMonthly(r.amount, r.cadence) * r.confidence, 0)
}

/** Everyday spending per month, measured from the ledger rather than guessed. */
export function everydayBurnMonthly(state: FinancialState): number {
  return everydayDailyBurn(state) * 30.44
}
