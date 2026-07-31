import type { Account, FinancialState, Transaction } from '@/lib/types'

/** What travels to Drive: the state plus enough metadata to resolve a conflict. */
export interface SyncEnvelope {
  version: 1
  updatedAt: string
  device: string
  state: FinancialState
}

export interface MergeSummary {
  /** Which side supplied settings, accounts and everything non-transactional. */
  base: 'local' | 'remote'
  added: number
  removed: number
  balanceAdjusted: boolean
}

/** Move an account balance by a transaction, in either direction. */
function applyDelta(accounts: Account[], tx: Transaction, direction: 1 | -1): Account[] {
  const delta = tx.amount * direction
  return accounts.map((a) => {
    if (a.id === tx.accountId) return { ...a, balance: a.balance + delta }
    if (tx.transfer && tx.transferAccountId && a.id === tx.transferAccountId) {
      return { ...a, balance: a.balance - delta }
    }
    return a
  })
}

/**
 * Merge two copies of the state.
 *
 * Rules, chosen for one person with two devices rather than a shared ledger:
 *
 * - Whichever side was saved most recently wins for everything configured:
 *   settings, account details, categories, recurring items, goals and rules.
 *   Blending two edits of the same rent amount has no correct answer.
 * - Transactions are unioned by id, so a spend logged on either device
 *   survives. This is the case that actually matters day to day.
 * - Deletions are honoured through tombstones, so removing a mistyped entry on
 *   your phone does not bring it back from your laptop.
 * - Account balances are *stored*, not derived, so folding in the other side's
 *   transactions means folding in their effect on balances too. Skipping this
 *   is the subtle way a merge silently corrupts every balance.
 */
export function mergeStates(
  local: FinancialState,
  localUpdatedAt: string,
  remote: FinancialState,
  remoteUpdatedAt: string,
): { merged: FinancialState; summary: MergeSummary } {
  const remoteIsNewer = remoteUpdatedAt > localUpdatedAt
  const base = remoteIsNewer ? remote : local
  const other = remoteIsNewer ? local : remote

  const tombstones = new Set([
    ...(local.deletedTransactionIds ?? []),
    ...(remote.deletedTransactionIds ?? []),
  ])

  const byId = new Map(base.transactions.map((t) => [t.id, t]))
  let accounts = base.accounts
  let added = 0
  let removed = 0

  // Bring across anything the base has never seen and nobody deleted.
  for (const tx of other.transactions) {
    if (byId.has(tx.id) || tombstones.has(tx.id)) continue
    byId.set(tx.id, tx)
    accounts = applyDelta(accounts, tx, 1)
    added++
  }

  // Honour deletions the other side made that the base still holds. The base's
  // balance includes these, so reverse them as they go.
  for (const id of tombstones) {
    const tx = byId.get(id)
    if (!tx) continue
    byId.delete(id)
    accounts = applyDelta(accounts, tx, -1)
    removed++
  }

  const transactions = [...byId.values()].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )

  return {
    merged: {
      ...base,
      accounts,
      transactions,
      // Keep the union so a third device, or a later sync, still sees them.
      deletedTransactionIds: [...tombstones].slice(-500),
    },
    summary: {
      base: remoteIsNewer ? 'remote' : 'local',
      added,
      removed,
      balanceAdjusted: added > 0 || removed > 0,
    },
  }
}

/** A stable, non-identifying name for this browser, used only in conflict messages. */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'device'
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android phone'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'device'
}
