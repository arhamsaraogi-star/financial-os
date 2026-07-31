'use client'

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { FinancialState, Transaction } from '@/lib/types'
import { seedState } from '@/lib/seed'
import { localStore } from '@/lib/storage'
import { simulate, type Forecast } from '@/lib/engine/forecast'
import { analytics, healthScore, type Analytics } from '@/lib/engine/analytics'
import { advisories, type Advisory } from '@/lib/engine/advisor'

export type NewTransaction = Omit<Transaction, 'id'>

interface StoreValue {
  state: FinancialState
  /** False until localStorage has been read — gates render to avoid mismatch. */
  ready: boolean
  horizon: number
  setHorizon: (days: number) => void
  update: (fn: (draft: FinancialState) => FinancialState) => void
  replace: (next: FinancialState) => void
  reset: () => void

  addTransaction: (tx: NewTransaction) => void
  editTransaction: (id: string, tx: Partial<Transaction>) => void
  removeTransaction: (id: string) => void

  forecast: Forecast
  metrics: Analytics
  health: ReturnType<typeof healthScore>
  advice: Advisory[]

  accountName: (id: string | null | undefined) => string
  categoryOf: (id: string) => FinancialState['categories'][number] | undefined
}

const StoreContext = createContext<StoreValue | null>(null)

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(performance.now() % 1000)}`
}

/**
 * Applying a transaction moves the account balance with it.
 *
 * Card accounts hold a negative balance, so a −₹500 purchase on a card takes it
 * from −4,000 to −4,500 by the same addition that takes a bank account down.
 * One sign convention everywhere is why cards are ordinary accounts here.
 */
function applyToBalances(state: FinancialState, tx: Transaction, direction: 1 | -1): FinancialState {
  const delta = tx.amount * direction
  return {
    ...state,
    accounts: state.accounts.map((a) => {
      if (a.id === tx.accountId) return { ...a, balance: a.balance + delta }
      // A transfer credits the other side by the same amount it debits here.
      if (tx.transfer && tx.transferAccountId && a.id === tx.transferAccountId) {
        return { ...a, balance: a.balance - delta }
      }
      return a
    }),
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FinancialState>(() => seedState())
  const [ready, setReady] = useState(false)
  const [horizon, setHorizon] = useState(90)

  useEffect(() => {
    let alive = true
    localStore.load().then((loaded) => {
      if (!alive) return
      if (loaded) setState(loaded)
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (ready) void localStore.save(state)
  }, [state, ready])

  const update = useCallback((fn: (draft: FinancialState) => FinancialState) => {
    setState((prev) => fn(prev))
  }, [])

  const replace = useCallback((next: FinancialState) => setState(next), [])

  const reset = useCallback(() => {
    void localStore.clear()
    setState(seedState())
  }, [])

  const addTransaction = useCallback((tx: NewTransaction) => {
    setState((prev) => {
      const full: Transaction = { ...tx, id: newId('tx') }
      const withBalance = applyToBalances(prev, full, 1)
      return {
        ...withBalance,
        transactions: [full, ...withBalance.transactions].sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
        ),
      }
    })
  }, [])

  const editTransaction = useCallback((id: string, patch: Partial<Transaction>) => {
    setState((prev) => {
      const existing = prev.transactions.find((t) => t.id === id)
      if (!existing) return prev
      const next: Transaction = { ...existing, ...patch }
      // Reverse the old effect before applying the new one, so edits to amount
      // or account can never leave a balance drifting.
      const reverted = applyToBalances(prev, existing, -1)
      const reapplied = applyToBalances(reverted, next, 1)
      return {
        ...reapplied,
        transactions: reapplied.transactions
          .map((t) => (t.id === id ? next : t))
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
      }
    })
  }, [])

  const removeTransaction = useCallback((id: string) => {
    setState((prev) => {
      const existing = prev.transactions.find((t) => t.id === id)
      if (!existing) return prev
      const reverted = applyToBalances(prev, existing, -1)
      return { ...reverted, transactions: reverted.transactions.filter((t) => t.id !== id) }
    })
  }, [])

  // The derived views every screen reads. Recomputed only when the underlying
  // state or horizon changes — the 365-day simulation is real work.
  const forecast = useMemo(() => simulate(state, { horizonDays: horizon }), [state, horizon])
  const metrics = useMemo(() => analytics(state), [state])
  const health = useMemo(() => healthScore(state, forecast.riskScore), [state, forecast.riskScore])
  const advice = useMemo(() => advisories(state, forecast), [state, forecast])

  const accountName = useCallback(
    (id: string | null | undefined) => state.accounts.find((a) => a.id === id)?.name ?? '—',
    [state.accounts],
  )

  const categoryOf = useCallback(
    (id: string) => state.categories.find((c) => c.id === id),
    [state.categories],
  )

  const value = useMemo<StoreValue>(
    () => ({
      state,
      ready,
      horizon,
      setHorizon,
      update,
      replace,
      reset,
      addTransaction,
      editTransaction,
      removeTransaction,
      forecast,
      metrics,
      health,
      advice,
      accountName,
      categoryOf,
    }),
    [
      state,
      ready,
      horizon,
      update,
      replace,
      reset,
      addTransaction,
      editTransaction,
      removeTransaction,
      forecast,
      metrics,
      health,
      advice,
      accountName,
      categoryOf,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
