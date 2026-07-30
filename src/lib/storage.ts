import { financialState, type FinancialState } from '@/lib/types'

/**
 * The one seam between the app and where data lives.
 *
 * Everything above this file is storage-agnostic: the engines take a
 * `FinancialState` and return numbers. Today that state is held in the browser,
 * which keeps financial data on the user's own machine and lets the whole system
 * deploy as static files. Swapping in Supabase + Clerk later means writing one
 * more object that satisfies this interface — no page or engine changes.
 */
export interface StateStore {
  load(): Promise<FinancialState | null>
  save(state: FinancialState): Promise<void>
  clear(): Promise<void>
}

const KEY = 'fos.state.v1'

export const localStore: StateStore = {
  async load() {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(KEY)
      if (!raw) return null
      const parsed = financialState.safeParse(JSON.parse(raw))
      // A schema change should degrade to a fresh seed, never to a broken app.
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  },

  async save(state) {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // Quota or private-mode failure: the session still works, it just won't persist.
    }
  },

  async clear() {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(KEY)
  },
}

export function exportState(state: FinancialState): string {
  return JSON.stringify(state, null, 2)
}

export function importState(json: string): FinancialState {
  const parsed = financialState.safeParse(JSON.parse(json))
  if (!parsed.success) {
    throw new Error(
      `That file is not a valid backup: ${parsed.error.issues[0]?.path.join('.')} ${
        parsed.error.issues[0]?.message ?? ''
      }`,
    )
  }
  return parsed.data
}
