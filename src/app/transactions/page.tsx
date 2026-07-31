'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { useTransactionSheet } from '@/components/Shell'
import { money } from '@/lib/format'
import { longDate, today } from '@/lib/dates'
import { transactionsToCsv } from '@/lib/storage'
import { Button, Card, Empty, PageHeader, Row, Segmented } from '@/components/ui'

type Filter = 'all' | 'spend' | 'income' | 'transfer'

export default function Transactions() {
  const { state, categoryOf, accountName } = useStore()
  const sheet = useTransactionSheet()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [limit, setLimit] = useState(60)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return state.transactions.filter((t) => {
      if (filter === 'spend' && (t.transfer || t.amount >= 0)) return false
      if (filter === 'income' && (t.transfer || t.amount <= 0)) return false
      if (filter === 'transfer' && !t.transfer) return false
      if (categoryId && t.categoryId !== categoryId) return false
      if (accountId && t.accountId !== accountId) return false
      if (needle) {
        const cat = categoryOf(t.categoryId)?.name.toLowerCase() ?? ''
        if (
          !t.description.toLowerCase().includes(needle) &&
          !cat.includes(needle) &&
          !(t.note ?? '').toLowerCase().includes(needle)
        ) {
          return false
        }
      }
      return true
    })
  }, [state.transactions, query, filter, categoryId, accountId, categoryOf])

  // Group into day buckets so the list reads like a statement.
  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const t of filtered.slice(0, limit)) {
      const arr = map.get(t.date)
      if (arr) arr.push(t)
      else map.set(t.date, [t])
    }
    return [...map.entries()]
  }, [filtered, limit])

  const totals = useMemo(() => {
    let out = 0
    let inn = 0
    for (const t of filtered) {
      if (t.transfer) continue
      if (t.amount < 0) out += Math.abs(t.amount)
      else inn += t.amount
    }
    return { out, inn }
  }, [filtered])

  const exportCsv = () => {
    const blob = new Blob([transactionsToCsv(state)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${today()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const active = Boolean(query || filter !== 'all' || categoryId || accountId)

  return (
    <div className="rise pb-4">
      <PageHeader
        title="Activity"
        lede={`${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`}
        action={
          <Button size="sm" onClick={exportCsv}>
            Export
          </Button>
        }
      />

      <div className="mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search description, category or note"
          type="search"
          aria-label="Search transactions"
        />
      </div>

      <div className="mb-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Spent', value: 'spend' },
            { label: 'Received', value: 'income' },
            { label: 'Moved', value: 'transfer' },
          ]}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
          <option value="">All accounts</option>
          {state.accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </div>

      {(totals.out > 0 || totals.inn > 0) && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Card>
            <div className="label mb-1.5">Out</div>
            <div className="tnum display text-[21px] text-bad">{money(totals.out)}</div>
          </Card>
          <Card>
            <div className="label mb-1.5">In</div>
            <div className="tnum display text-[21px] text-good">{money(totals.inn)}</div>
          </Card>
        </div>
      )}

      {active && (
        <div className="mb-3">
          <Button
            size="sm"
            variant="plain"
            onClick={() => {
              setQuery('')
              setFilter('all')
              setCategoryId('')
              setAccountId('')
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {groups.length === 0 ? (
        <Card>
          <Empty
            icon="🔍"
            title={active ? 'Nothing matches' : 'No transactions yet'}
            detail={
              active
                ? 'Try a different search or clear the filters.'
                : 'Tap the + button to log your first one.'
            }
            action={!active ? <Button variant="accent" onClick={sheet.add}>Add transaction</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, rows]) => {
            const dayTotal = rows.reduce((s, t) => (t.transfer ? s : s + t.amount), 0)
            return (
              <section key={date}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="label">{date === today() ? 'Today' : longDate(date)}</h2>
                  {dayTotal !== 0 && (
                    <span className={`tnum text-[12.5px] ${dayTotal < 0 ? 'text-faint' : 'text-good'}`}>
                      {dayTotal < 0 ? '−' : '+'}
                      {money(Math.abs(dayTotal))}
                    </span>
                  )}
                </div>
                <Card padded={false}>
                  <div className="divide-y divide-line-soft px-4">
                    {rows.map((t) => {
                      const cat = categoryOf(t.categoryId)
                      return (
                        <Row
                          key={t.id}
                          icon={t.transfer ? '⇄' : (cat?.icon ?? '•')}
                          title={t.description}
                          subtitle={
                            t.transfer
                              ? `${accountName(t.accountId)} → ${accountName(t.transferAccountId)}`
                              : `${cat?.name ?? 'Uncategorised'} · ${accountName(t.accountId)}${
                                  t.note ? ` · ${t.note}` : ''
                                }`
                          }
                          value={`${t.amount >= 0 ? '+' : '−'}${money(Math.abs(t.amount))}`}
                          valueTone={t.transfer ? 'muted' : t.amount >= 0 ? 'good' : 'neutral'}
                          onClick={() => sheet.edit(t)}
                        />
                      )
                    })}
                  </div>
                </Card>
              </section>
            )
          })}

          {filtered.length > limit && (
            <Button full onClick={() => setLimit((l) => l + 60)}>
              Show more ({filtered.length - limit} left)
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
