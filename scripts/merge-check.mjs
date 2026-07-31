/**
 * Checks the two-device merge against the cases that actually go wrong.
 *
 *   npm run check:merge
 *
 * Runs the real module — Node strips the types, and merge.ts imports types
 * only, so there is nothing to build and no test dependency to install.
 * Needs Node 22.6+ for `--experimental-strip-types`.
 */
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { mergeStates } = await import(
  pathToFileURL(join(here, '..', 'src', 'lib', 'sync', 'merge.ts')).href
)

const tx = (id, amount, accountId, extra = {}) => ({
  id,
  date: '2026-07-30',
  description: id,
  amount,
  accountId,
  categoryId: 'c1',
  note: '',
  transfer: false,
  ...extra,
})

const base = (accounts, transactions, deleted = []) => ({
  version: 2,
  settings: { ownerName: '', emergencyFundMonths: 6, forecastConservatism: 0.3, compact: false },
  accounts,
  categories: [],
  transactions,
  recurring: [],
  goals: [],
  rules: [],
  deletedTransactionIds: deleted,
})

const acc = (id, balance) => ({
  id,
  name: id,
  institution: '',
  kind: 'spending',
  balance,
  targetBalance: 0,
  minBuffer: 0,
  accent: '#fff',
  archived: false,
  notes: '',
})

let pass = 0
let fail = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        got ${JSON.stringify(actual)}  want ${JSON.stringify(expected)}`)
  ok ? pass++ : fail++
}

const bal = (s, id) => s.accounts.find((a) => a.id === id).balance

/* 1. Both devices logged a different spend from a shared starting point of 1000. */
{
  const phone = base([acc('a', 1000 - 100)], [tx('t1', -100, 'a')])
  const laptop = base([acc('a', 1000 - 250)], [tx('t2', -250, 'a')])
  const { merged } = mergeStates(phone, '2026-07-30T10:00:00Z', laptop, '2026-07-30T11:00:00Z')
  check('both spends kept', merged.transactions.length, 2)
  check('balance reflects both', bal(merged, 'a'), 650)
}

/* 2. Deleting on one device must not be undone by the other still holding it. */
{
  const phone = base([acc('a', 1000)], [], ['t1'])
  const laptop = base([acc('a', 900)], [tx('t1', -100, 'a')])
  const { merged } = mergeStates(phone, '2026-07-30T12:00:00Z', laptop, '2026-07-30T09:00:00Z')
  check('deleted stays deleted', merged.transactions.length, 0)
  check('balance restored on delete', bal(merged, 'a'), 1000)
}

/* 3. A deletion recorded on the newer side, where the older side already dropped it. */
{
  const phone = base([acc('a', 1000)], [], ['t1'])
  const laptop = base([acc('a', 1000)], [], [])
  const { merged } = mergeStates(phone, '2026-07-30T12:00:00Z', laptop, '2026-07-30T09:00:00Z')
  check('no double reversal', bal(merged, 'a'), 1000)
}

/* 4. Same transaction on both sides must not be counted twice. */
{
  const shared = tx('t1', -100, 'a')
  const phone = base([acc('a', 900)], [shared])
  const laptop = base([acc('a', 900)], [shared])
  const { merged } = mergeStates(phone, '2026-07-30T10:00:00Z', laptop, '2026-07-30T11:00:00Z')
  check('no duplicate', merged.transactions.length, 1)
  check('balance unchanged', bal(merged, 'a'), 900)
}

/* 5. Transfers move both sides of the pair. */
{
  const t = tx('t1', -500, 'a', { transfer: true, transferAccountId: 'b' })
  const phone = base([acc('a', 1000), acc('b', 0)], [])
  const laptop = base([acc('a', 500), acc('b', 500)], [t])
  const { merged } = mergeStates(phone, '2026-07-30T12:00:00Z', laptop, '2026-07-30T09:00:00Z')
  check('transfer source', bal(merged, 'a'), 500)
  check('transfer destination', bal(merged, 'b'), 500)
}

/* 6. Newer side wins for configuration. */
{
  const phone = base([acc('a', 100)], [])
  phone.settings.ownerName = 'phone'
  const laptop = base([acc('a', 100)], [])
  laptop.settings.ownerName = 'laptop'
  const { merged, summary } = mergeStates(phone, '2026-07-30T10:00:00Z', laptop, '2026-07-30T11:00:00Z')
  check('newer config wins', merged.settings.ownerName, 'laptop')
  check('summary names base', summary.base, 'remote')
}

/* 7. Merging is order-independent — same result whichever device syncs first. */
{
  const phone = base([acc('a', 900)], [tx('t1', -100, 'a')])
  const laptop = base([acc('a', 750)], [tx('t2', -250, 'a')])
  const a = mergeStates(phone, '2026-07-30T10:00:00Z', laptop, '2026-07-30T11:00:00Z').merged
  const b = mergeStates(laptop, '2026-07-30T11:00:00Z', phone, '2026-07-30T10:00:00Z').merged
  check('same balance either way', bal(a, 'a'), bal(b, 'a'))
  check('same transaction count', a.transactions.length, b.transactions.length)
}

/* 8. Re-merging an already-merged state changes nothing. */
{
  const phone = base([acc('a', 900)], [tx('t1', -100, 'a')])
  const laptop = base([acc('a', 750)], [tx('t2', -250, 'a')])
  const once = mergeStates(phone, '2026-07-30T10:00:00Z', laptop, '2026-07-30T11:00:00Z').merged
  const twice = mergeStates(once, '2026-07-30T12:00:00Z', laptop, '2026-07-30T11:00:00Z').merged
  check('idempotent balance', bal(twice, 'a'), bal(once, 'a'))
  check('idempotent count', twice.transactions.length, once.transactions.length)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
