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
import type { FinancialState } from '@/lib/types'
import { seedState } from '@/lib/seed'
import { localStore } from '@/lib/storage'
import { simulate, type Forecast } from '@/lib/engine/forecast'
import { analytics, healthScore, type Analytics } from '@/lib/engine/analytics'
import { advisories, type Advisory } from '@/lib/engine/advisor'

interface StoreValue {
  state: FinancialState
  /** False until localStorage has been read — gates render to avoid mismatch. */
  ready: boolean
  horizon: number
  setHorizon: (days: number) => void
  update: (fn: (draft: FinancialState) => FinancialState) => void
  replace: (next: FinancialState) => void
  reset: () => void
  forecast: Forecast
  metrics: Analytics
  health: ReturnType<typeof healthScore>
  advice: Advisory[]
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  // Seeding lazily keeps the synthetic history stable for the session.
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

  // The three derived views every screen reads from. Recomputed only when the
  // underlying state or horizon actually changes — the 365-day simulation is
  // real work and should not run on every keystroke elsewhere in the tree.
  const forecast = useMemo(() => simulate(state, { horizonDays: horizon }), [state, horizon])
  const metrics = useMemo(() => analytics(state), [state])
  const health = useMemo(() => healthScore(state, forecast.riskScore), [state, forecast.riskScore])
  const advice = useMemo(() => advisories(state, forecast), [state, forecast])

  const value = useMemo<StoreValue>(
    () => ({ state, ready, horizon, setHorizon, update, replace, reset, forecast, metrics, health, advice }),
    [state, ready, horizon, update, replace, reset, forecast, metrics, health, advice],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/** Look up an account name without every component reaching into state. */
export function useAccountName() {
  const { state } = useStore()
  return useCallback(
    (id: string | null | undefined) =>
      state.accounts.find((a) => a.id === id)?.name ?? '—',
    [state.accounts],
  )
}
