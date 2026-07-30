'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, ordinal } from '@/lib/format'
import { longDate, monthName, shortDate } from '@/lib/dates'
import type { Subscription } from '@/lib/types'
import { subscriptionInsights } from '@/lib/engine/analytics'
import { AllocationDonut, Legend } from '@/components/charts'
import { Badge, Button, Field, Meter, PageHeader, Panel, ScrollX, Stat, Td, Th } from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'

export default function Subscriptions() {
  const { state, update, metrics } = useStore()
  const [editing, setEditing] = useState<string | null>(null)

  const insights = useMemo(() => subscriptionInsights(state), [state])

  const patch = (id: string, fields: Partial<Subscription>) =>
    update((s) => ({
      ...s,
      subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, ...fields } : x)),
    }))

  const remove = (id: string) =>
    update((s) => ({ ...s, subscriptions: s.subscriptions.filter((x) => x.id !== id) }))

  const add = () =>
    update((s) => ({
      ...s,
      subscriptions: [
        ...s.subscriptions,
        {
          id: `sub_${Date.now().toString(36)}`,
          name: 'New subscription',
          category: 'Software',
          amount: 0,
          cycle: 'monthly',
          renewalDay: 1,
          accountId: s.accounts.find((a) => a.role === 'bills')?.id ?? s.accounts[0]?.id ?? '',
          usageScore: 5,
          startedOn: new Date().toISOString().slice(0, 10),
          active: true,
        },
      ],
    }))

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of insights.rows) m.set(r.category, (m.get(r.category) ?? 0) + r.monthlyCost)
    const total = [...m.values()].reduce((s, v) => s + v, 0)
    return [...m.entries()]
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [insights.rows])

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Recurring Spend"
        title="Subscriptions"
        lede="Normalised to a monthly figure regardless of billing cycle, scored against how much you actually use them. A cheap subscription you never open is worse value than an expensive one you live in."
        actions={
          <Button onClick={add} variant="brass" size="sm">
            <IconPlus /> Subscription
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat
            label="Monthly"
            value={money(insights.monthly)}
            sub={`${((insights.monthly / Math.max(1, metrics.income)) * 100).toFixed(1)}% of income`}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Annualised" value={money(insights.annual)} sub="If nothing changes" />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Paid to date" value={money(insights.lifetime)} sub="Across every active subscription" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Recoverable"
            value={money(insights.potentialSaving)}
            sub={`${insights.cancelCandidates.length} low-usage services`}
            tone={insights.potentialSaving > 0 ? 'negative' : 'positive'}
          />
        </div>
      </div>

      {insights.cancelCandidates.length > 0 && (
        <Panel
          className="mb-4"
          title="Cancellation candidates"
          subtitle="High cost against low usage — ranked by rupees per point of value"
        >
          <ul className="space-y-3">
            {insights.cancelCandidates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px]">{c.name}</span>
                    <Badge tone="negative">{c.usageScore}/10 used</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-ghost">
                    {money(c.monthlyCost)}/month · {money(c.lifetime)} paid over {c.monthsHeld} months ·{' '}
                    {money(c.monthlyCost * 12)} a year if kept
                  </p>
                </div>
                <span className="tnum shrink-0 text-[13px] text-brass">
                  save {money(c.monthlyCost * 12)}/yr
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Where it goes">
          <AllocationDonut data={byCategory} height={180} />
          <div className="mt-3 border-t border-line-soft pt-3">
            <Legend data={byCategory} />
          </div>
        </Panel>

        <Panel title="Value map" subtitle="Monthly cost against self-rated usage">
          <ScrollX>
            <table className="w-full min-w-[420px] text-[12px]">
              <thead>
                <tr className="border-b border-line-soft">
                  <Th>Service</Th>
                  <Th align="right">Monthly</Th>
                  <Th>Usage</Th>
                  <Th align="right">Lifetime</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {insights.rows.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      {r.name}
                      <span className="ml-2 text-[10px] text-ghost">{r.cycle}</span>
                    </Td>
                    <Td className="tnum text-right">{money(r.monthlyCost)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-16">
                          <Meter
                            value={r.usageScore}
                            max={10}
                            height={3}
                            tone={r.usageScore >= 7 ? 'positive' : r.usageScore >= 4 ? 'caution' : 'negative'}
                          />
                        </div>
                        <span className="tnum text-[10.5px] text-ghost">{r.usageScore}</span>
                      </div>
                    </Td>
                    <Td className="tnum text-right text-faint">{money(r.lifetime)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </Panel>
      </div>

      <div className="space-y-3">
        {state.subscriptions.map((sub) => {
          const open = editing === sub.id
          const row = insights.rows.find((r) => r.id === sub.id)
          const account = state.accounts.find((a) => a.id === sub.accountId)

          return (
            <Panel key={sub.id} padded={false}>
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px]">{sub.name}</h3>
                      <Badge tone="neutral">{sub.cycle}</Badge>
                      {sub.usageScore >= 8 && <Badge tone="positive">Well used</Badge>}
                      {sub.usageScore < 4 && <Badge tone="negative">Barely used</Badge>}
                      {!sub.active && <Badge tone="neutral">Cancelled</Badge>}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ghost">
                      {sub.category} · renews {ordinal(sub.renewalDay)}
                      {sub.cycle === 'annual' && sub.renewalMonth ? ` ${monthName(sub.renewalMonth)}` : ''} ·
                      from {account?.name ?? '—'} · since {longDate(sub.startedOn)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="tnum display text-[22px] leading-none">{money(sub.amount)}</div>
                      <div className="mt-1.5 text-[10.5px] text-ghost">
                        {row ? `${money(row.monthlyCost)}/mo effective` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => setEditing(open ? null : sub.id)}
                      className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                      aria-label={open ? 'Close editor' : 'Edit subscription'}
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
                      <input value={sub.name} onChange={(e) => patch(sub.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Category">
                      <input value={sub.category} onChange={(e) => patch(sub.id, { category: e.target.value })} />
                    </Field>
                    <Field label="Billing account">
                      <select value={sub.accountId} onChange={(e) => patch(sub.id, { accountId: e.target.value })}>
                        {state.accounts
                          .filter((a) => a.role !== 'credit')
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Amount per cycle">
                      <input
                        type="number"
                        value={sub.amount}
                        onChange={(e) => patch(sub.id, { amount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Cycle">
                      <select
                        value={sub.cycle}
                        onChange={(e) => patch(sub.id, { cycle: e.target.value as Subscription['cycle'] })}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </Field>
                    <Field label="Renewal day">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={sub.renewalDay}
                        onChange={(e) =>
                          patch(sub.id, {
                            renewalDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </Field>
                    {sub.cycle === 'annual' && (
                      <Field label="Renewal month">
                        <select
                          value={sub.renewalMonth ?? 1}
                          onChange={(e) => patch(sub.id, { renewalMonth: Number(e.target.value) })}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                            <option key={m} value={m}>
                              {monthName(m)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field label="Started on">
                      <input
                        type="date"
                        value={sub.startedOn}
                        onChange={(e) => patch(sub.id, { startedOn: e.target.value })}
                      />
                    </Field>
                    <Field
                      label={`Usage — ${sub.usageScore}/10`}
                      hint="Be honest. Below 4 with real spend puts it on the cancellation list."
                    >
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={sub.usageScore}
                        onChange={(e) => patch(sub.id, { usageScore: Number(e.target.value) })}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[12px] text-dim">
                      <input
                        type="checkbox"
                        checked={sub.active}
                        onChange={(e) => patch(sub.id, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <Button variant="danger" size="sm" onClick={() => remove(sub.id)}>
                      <IconTrash /> Remove
                    </Button>
                  </div>

                  {row && (
                    <p className="mt-3 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-ghost">
                      Held {row.monthsHeld} months at {money(row.monthlyCost)} a month — {money(row.lifetime)}{' '}
                      paid so far. Next renewal falls on {ordinal(sub.renewalDay)}
                      {sub.cycle === 'annual' && sub.renewalMonth ? ` ${monthName(sub.renewalMonth)}` : ''};
                      cancelling before then avoids {money(sub.amount)}.
                    </p>
                  )}
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      <Panel className="mt-4" title="Renewal calendar" subtitle="The next twelve charges in date order">
        <ul className="divide-y divide-line-soft">
          {upcomingRenewals(state).map((r) => (
            <li key={`${r.id}-${r.date}`} className="flex items-center justify-between gap-3 py-2 first:pt-0">
              <span className="text-[12.5px]">
                {r.name}
                <span className="ml-2 text-[10.5px] text-ghost">{shortDate(r.date)}</span>
              </span>
              <span className="tnum text-[12.5px] text-faint">−{money(r.amount)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

/** Flatten the next twelve subscription charges regardless of cycle. */
function upcomingRenewals(state: ReturnType<typeof useStore>['state']) {
  const out: { id: string; name: string; date: string; amount: number }[] = []
  const now = new Date()

  for (const s of state.subscriptions) {
    if (!s.active) continue
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const m = d.getMonth() + 1
      if (s.cycle === 'annual' && s.renewalMonth && m !== s.renewalMonth) continue
      if (s.cycle === 'quarterly') {
        const anchor = Number(s.startedOn.slice(5, 7))
        if ((m - anchor + 12) % 3 !== 0) continue
      }
      const day = Math.min(s.renewalDay, new Date(d.getFullYear(), m, 0).getDate())
      const date = `${d.getFullYear()}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (date >= new Date().toISOString().slice(0, 10)) {
        out.push({ id: s.id, name: s.name, date, amount: s.amount })
      }
    }
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 12)
}
