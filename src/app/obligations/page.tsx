'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, ordinal } from '@/lib/format'
import { relativeDays, shortDate } from '@/lib/dates'
import type { Bill, Priority } from '@/lib/types'
import { upcomingObligations } from '@/lib/engine/events'
import { Badge, Button, Field, Meter, PageHeader, Panel, ScrollX, Stat, Td, Th } from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'

const PRIORITY_TONE: Record<Priority, 'negative' | 'caution' | 'neutral'> = {
  critical: 'negative',
  high: 'caution',
  medium: 'neutral',
  low: 'neutral',
}

const PRIORITY_MEANING: Record<Priority, string> = {
  critical: 'Missing this has consequences beyond a fee. Funded first, always.',
  high: 'Important. Funded before anything discretionary.',
  medium: 'Standard obligation with room in the window.',
  low: 'Can slip a few days without harm.',
}

export default function Obligations() {
  const { state, update, metrics, forecast } = useStore()
  const [editing, setEditing] = useState<string | null>(null)

  const patch = (id: string, fields: Partial<Bill>) =>
    update((s) => ({ ...s, bills: s.bills.map((b) => (b.id === id ? { ...b, ...fields } : b)) }))

  const remove = (id: string) => update((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== id) }))

  const add = () =>
    update((s) => ({
      ...s,
      bills: [
        ...s.bills,
        {
          id: `bill_${Date.now().toString(36)}`,
          name: 'New obligation',
          category: 'General',
          expectedAmount: 0,
          minAmount: 0,
          maxAmount: 0,
          dueDay: 1,
          graceDays: 3,
          priority: 'medium',
          fundingAccountId:
            s.accounts.find((a) => a.role === 'bills')?.id ?? s.accounts[0]?.id ?? '',
          autopay: false,
          active: true,
        },
      ],
    }))

  const next = useMemo(() => upcomingObligations(state, 45), [state])
  const active = state.bills.filter((b) => b.active)
  const critical = active.filter((b) => b.priority === 'critical').reduce((s, b) => s + b.expectedAmount, 0)
  const worstCase = active.reduce((s, b) => s + b.maxAmount, 0)

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of active) m.set(b.category, (m.get(b.category) ?? 0) + b.expectedAmount)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [active])

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Bill Engine"
        title="Obligations"
        lede="Every recurring commitment with its own range, window, priority and funding account. Priority is what the engine falls back on when there is not enough to go round."
        actions={
          <Button onClick={add} variant="brass" size="sm">
            <IconPlus /> Obligation
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Monthly total" value={money(metrics.commitments.bills)} sub={`${active.length} active`} />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Critical tier"
            value={money(critical)}
            sub={`${((critical / Math.max(1, metrics.commitments.bills)) * 100).toFixed(0)}% of obligations`}
            tone="negative"
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Worst case"
            value={money(worstCase)}
            sub={`${money(worstCase - metrics.commitments.bills)} above expected`}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Fixed expense ratio"
            value={`${metrics.fixedExpenseRatio.toFixed(0)}%`}
            sub="Of confidence-weighted income"
            tone={metrics.fixedExpenseRatio > 50 ? 'negative' : 'positive'}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="By category">
          <ul className="space-y-3">
            {byCategory.map(([cat, amount]) => (
              <li key={cat}>
                <div className="mb-1 flex items-baseline justify-between text-[12px]">
                  <span className="text-dim">{cat}</span>
                  <span className="tnum text-faint">
                    {money(amount)} ·{' '}
                    {((amount / Math.max(1, metrics.commitments.bills)) * 100).toFixed(0)}%
                  </span>
                </div>
                <Meter value={amount} max={byCategory[0][1]} height={3} tone="teal" />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Next 45 days" subtitle={`${next.length} movements`}>
          <ul className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
            {next.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="min-w-0">
                  <span className="truncate">{e.label}</span>
                  <span className="ml-2 text-[10px] text-ghost">{shortDate(e.date)}</span>
                </span>
                <span className="tnum shrink-0 text-faint">−{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="space-y-3">
        {state.bills.map((b) => {
          const open = editing === b.id
          const account = state.accounts.find((a) => a.id === b.fundingAccountId)
          const upcoming = next.find((e) => e.sourceId === b.id)
          const swing = b.maxAmount - b.minAmount

          return (
            <Panel key={b.id} padded={false}>
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px]">{b.name}</h3>
                      <Badge tone={PRIORITY_TONE[b.priority]}>{b.priority}</Badge>
                      {b.autopay && <Badge tone="positive">Autopay</Badge>}
                      {!b.active && <Badge tone="neutral">Inactive</Badge>}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ghost">
                      {b.category} · due {ordinal(b.dueDay)} · {b.graceDays}-day grace · paid from{' '}
                      {account?.name ?? '—'}
                      {upcoming ? ` · next ${relativeDays(upcoming.date)}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="tnum display text-[22px] leading-none">{money(b.expectedAmount)}</div>
                      {swing > 0 && (
                        <div className="mt-1.5 text-[10.5px] text-ghost">
                          {money(b.minAmount)} – {money(b.maxAmount)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setEditing(open ? null : b.id)}
                      className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                      aria-label={open ? 'Close editor' : 'Edit obligation'}
                    >
                      <IconChevron className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>
                </div>
              </div>

              {open && (
                <div className="border-t border-line-soft bg-panel-2/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Name">
                      <input value={b.name} onChange={(e) => patch(b.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Category">
                      <input value={b.category} onChange={(e) => patch(b.id, { category: e.target.value })} />
                    </Field>
                    <Field label="Funding account">
                      <select
                        value={b.fundingAccountId}
                        onChange={(e) => patch(b.id, { fundingAccountId: e.target.value })}
                      >
                        {state.accounts
                          .filter((a) => a.role !== 'credit')
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Expected amount">
                      <input
                        type="number"
                        value={b.expectedAmount}
                        onChange={(e) => patch(b.id, { expectedAmount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Typical low">
                      <input
                        type="number"
                        value={b.minAmount}
                        onChange={(e) => patch(b.id, { minAmount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Typical high" hint="The forecast plans for the top of this range.">
                      <input
                        type="number"
                        value={b.maxAmount}
                        onChange={(e) => patch(b.id, { maxAmount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Due day">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={b.dueDay}
                        onChange={(e) =>
                          patch(b.id, { dueDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })
                        }
                      />
                    </Field>
                    <Field label="Grace days" hint="How long payment can slip before it genuinely hurts.">
                      <input
                        type="number"
                        min={0}
                        value={b.graceDays}
                        onChange={(e) => patch(b.id, { graceDays: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </Field>
                    <Field label="Priority" hint={PRIORITY_MEANING[b.priority]}>
                      <select
                        value={b.priority}
                        onChange={(e) => patch(b.id, { priority: e.target.value as Priority })}
                      >
                        {(['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-[12px] text-dim">
                        <input
                          type="checkbox"
                          checked={b.active}
                          onChange={(e) => patch(b.id, { active: e.target.checked })}
                        />
                        Active
                      </label>
                      <label className="flex items-center gap-2 text-[12px] text-dim">
                        <input
                          type="checkbox"
                          checked={b.autopay}
                          onChange={(e) => patch(b.id, { autopay: e.target.checked })}
                        />
                        Autopay
                      </label>
                    </div>
                    <Button variant="danger" size="sm" onClick={() => remove(b.id)}>
                      <IconTrash /> Remove
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      <Panel className="mt-4" title="Funding pressure" subtitle="Which account carries which obligations">
        <ScrollX>
          <table className="w-full min-w-[520px] text-[12px]">
            <thead>
              <tr className="border-b border-line-soft">
                <Th>Account</Th>
                <Th>Obligations</Th>
                <Th align="right">Monthly</Th>
                <Th align="right">Worst case</Th>
                <Th align="right">Low point</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {state.accounts
                .filter((a) => a.role !== 'credit')
                .map((a) => {
                  const mine = active.filter((b) => b.fundingAccountId === a.id)
                  const low = Math.min(...forecast.days.map((d) => d.byAccount[a.id] ?? a.balance))
                  return (
                    <tr key={a.id}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: a.accent }} />
                          {a.name}
                        </span>
                      </Td>
                      <Td className="text-faint">{mine.length ? mine.map((b) => b.name).join(', ') : '—'}</Td>
                      <Td className="tnum text-right">
                        {money(mine.reduce((s, b) => s + b.expectedAmount, 0))}
                      </Td>
                      <Td className="tnum text-right text-faint">
                        {money(mine.reduce((s, b) => s + b.maxAmount, 0))}
                      </Td>
                      <Td className={`tnum text-right ${low < a.minBuffer ? 'text-negative' : 'text-dim'}`}>
                        {money(low)}
                      </Td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </ScrollX>
      </Panel>
    </div>
  )
}
