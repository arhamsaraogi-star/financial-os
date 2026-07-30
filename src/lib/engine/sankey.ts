import type { FinancialState } from '@/lib/types'
import type { SankeyLink, SankeyNode } from '@/components/charts'
import { normaliseMonthly } from './forecast'

const CATEGORY_COLOUR: Record<string, string> = {
  Housing: '#B8564C',
  Utilities: '#C28C3E',
  Debt: '#8F74A2',
  Subscriptions: '#7A9E9F',
  Investments: '#74A37F',
  'Everyday spend': '#9C988E',
  'Credit cards': '#B8564C',
  Retained: '#C9A227',
}

/**
 * Four-stage flow for a representative month:
 *
 *   income source → account that receives it → account that pays from it → what it buys
 *
 * The middle hop is the interesting one. Salary lands in the income hub but
 * rent is paid from the bills account, so the ribbon between them *is* the
 * treasury transfer the rule engine performs. A three-column Sankey would hide
 * exactly the movement this system exists to manage.
 */
export function buildSankey(state: FinancialState): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const accounts = state.accounts.filter((a) => a.role !== 'credit')
  const operating = accounts.find((a) => a.role === 'income_hub') ?? accounts[0]

  // --- What each account has to pay out in a month -------------------------
  const need = new Map<string, Map<string, number>>()
  const addNeed = (accountId: string, category: string, amount: number) => {
    if (amount <= 0) return
    if (!need.has(accountId)) need.set(accountId, new Map())
    const m = need.get(accountId)!
    m.set(category, (m.get(category) ?? 0) + amount)
  }

  for (const b of state.bills) {
    if (b.active) addNeed(b.fundingAccountId, b.category, b.expectedAmount)
  }
  for (const s of state.subscriptions) {
    if (s.active) addNeed(s.accountId, 'Subscriptions', normaliseMonthly(s.amount, s.cycle))
  }
  for (const s of state.sips) {
    if (s.active) addNeed(s.accountId, 'Investments', s.amount)
  }
  if (operating && state.settings.discretionaryMonthly > 0) {
    addNeed(operating.id, 'Everyday spend', state.settings.discretionaryMonthly)
  }
  // Card balances are paid down at roughly one statement per month.
  for (const c of state.cards) {
    if (c.active && c.currentBalance > 0) {
      addNeed(c.paymentAccountId, 'Credit cards', c.currentBalance)
    }
  }

  const totalNeed = new Map<string, number>()
  for (const [acc, cats] of need) {
    totalNeed.set(acc, [...cats.values()].reduce((s, v) => s + v, 0))
  }

  // --- What each account receives -----------------------------------------
  const receipts = new Map<string, number>()
  for (const i of state.income) {
    if (i.active) receipts.set(i.accountId, (receipts.get(i.accountId) ?? 0) + i.expectedAmount)
  }

  const nodes: SankeyNode[] = []
  const links: SankeyLink[] = []

  const incomeColours = ['#C9A227', '#7A9E9F', '#8F74A2', '#74A37F']
  state.income
    .filter((i) => i.active)
    .forEach((i, idx) => {
      nodes.push({
        id: `src:${i.id}`,
        label: i.name,
        value: i.expectedAmount,
        column: 0,
        colour: incomeColours[idx % incomeColours.length],
      })
      links.push({ from: `src:${i.id}`, to: `recv:${i.accountId}`, value: i.expectedAmount })
    })

  for (const a of accounts) {
    const r = receipts.get(a.id) ?? 0
    if (r > 0) nodes.push({ id: `recv:${a.id}`, label: a.name, value: r, column: 1, colour: a.accent })
  }

  // --- Allocate receipts to the accounts that actually spend ---------------
  // Each account funds its own obligations first; the shortfall is drawn from
  // whichever accounts still hold a surplus. That is the rule engine's logic,
  // expressed as a single month rather than a day-by-day walk.
  const surplus = new Map<string, number>()
  for (const a of accounts) surplus.set(a.id, receipts.get(a.id) ?? 0)

  const shortfall = new Map<string, number>()
  for (const a of accounts) {
    const n = totalNeed.get(a.id) ?? 0
    const own = Math.min(n, surplus.get(a.id) ?? 0)
    if (own > 0) {
      links.push({ from: `recv:${a.id}`, to: `pay:${a.id}`, value: own })
      surplus.set(a.id, (surplus.get(a.id) ?? 0) - own)
    }
    if (n - own > 0) shortfall.set(a.id, n - own)
  }

  for (const [needyId, amountNeeded] of shortfall) {
    let remaining = amountNeeded
    for (const donor of accounts) {
      if (remaining <= 0) break
      const spare = surplus.get(donor.id) ?? 0
      if (spare <= 0) continue
      const take = Math.min(spare, remaining)
      links.push({ from: `recv:${donor.id}`, to: `pay:${needyId}`, value: take })
      surplus.set(donor.id, spare - take)
      remaining -= take
    }
  }

  for (const a of accounts) {
    const n = totalNeed.get(a.id) ?? 0
    if (n > 0) nodes.push({ id: `pay:${a.id}`, label: a.name, value: n, column: 2, colour: a.accent })
  }

  // --- Destinations --------------------------------------------------------
  const catTotals = new Map<string, number>()
  for (const [accId, cats] of need) {
    for (const [cat, amount] of cats) {
      links.push({ from: `pay:${accId}`, to: `cat:${cat}`, value: amount })
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + amount)
    }
  }

  // Anything left after every obligation is money with no job yet.
  const retained = [...surplus.values()].reduce((s, v) => s + Math.max(0, v), 0)
  if (retained > 1) {
    for (const a of accounts) {
      const spare = surplus.get(a.id) ?? 0
      if (spare > 1) links.push({ from: `recv:${a.id}`, to: 'cat:Retained', value: spare })
    }
    catTotals.set('Retained', retained)
  }

  for (const [cat, value] of [...catTotals.entries()].sort((a, b) => b[1] - a[1])) {
    nodes.push({
      id: `cat:${cat}`,
      label: cat,
      value,
      column: 3,
      colour: CATEGORY_COLOUR[cat] ?? '#9C988E',
    })
  }

  return { nodes, links: links.filter((l) => l.value > 0.5) }
}
