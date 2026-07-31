import { financialState, type FinancialState } from '@/lib/types'

/**
 * The one seam between the app and where data lives.
 *
 * Everything above this file is storage-agnostic: the engines take a
 * `FinancialState` and return numbers. Today it is the browser, which keeps
 * financial data on the user's own machine and lets the whole app deploy as
 * static files. Moving to a server means writing one more object satisfying
 * this interface — no engine or page changes.
 */
export interface StateStore {
  load(): Promise<FinancialState | null>
  save(state: FinancialState): Promise<void>
  clear(): Promise<void>
}

const KEY = 'fos.state.v2'
/** Keys from earlier schema versions, cleaned up on first successful load. */
const LEGACY_KEYS = ['fos.state.v1']

export const localStore: StateStore = {
  async load() {
    if (typeof window === 'undefined') return null
    try {
      for (const old of LEGACY_KEYS) window.localStorage.removeItem(old)
      const raw = window.localStorage.getItem(KEY)
      if (!raw) return null
      const parsed = financialState.safeParse(JSON.parse(raw))
      // A schema change degrades to a fresh start, never to a broken app.
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
      // Quota or private-mode failure: the session works, it just won't persist.
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
    const issue = parsed.error.issues[0]
    throw new Error(`That file isn't a valid backup: ${issue?.path.join('.')} ${issue?.message ?? ''}`)
  }
  return parsed.data
}

/** Comma-separated export of the ledger, for spreadsheets. */
export function transactionsToCsv(state: FinancialState): string {
  const cat = new Map(state.categories.map((c) => [c.id, c.name]))
  const acc = new Map(state.accounts.map((a) => [a.id, a.name]))
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

  const rows = [
    ['Date', 'Description', 'Amount', 'Account', 'Category', 'Note'].join(','),
    ...state.transactions.map((t) =>
      [
        t.date,
        esc(t.description),
        String(t.amount),
        esc(acc.get(t.accountId) ?? ''),
        esc(t.transfer ? 'Transfer' : (cat.get(t.categoryId) ?? '')),
        esc(t.note ?? ''),
      ].join(','),
    ),
  ]
  return rows.join('\n')
}
