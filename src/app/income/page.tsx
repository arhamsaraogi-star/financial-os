'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, ordinal, pct } from '@/lib/format'
import { relativeDays, shortDate } from '@/lib/dates'
import type { IncomeSource } from '@/lib/types'
import { upcomingIncome } from '@/lib/engine/events'
import { Sparkline } from '@/components/charts'
import { Badge, Button, Field, Meter, PageHeader, Panel, Stat } from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'

/** Mean, standard deviation and coefficient of variation of past receipts. */
function stats(history: { amount: number }[]) {
  if (!history.length) return { mean: 0, sd: 0, cv: 0, min: 0, max: 0 }
  const amounts = history.map((h) => h.amount)
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length
  const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length
  const sd = Math.sqrt(variance)
  return { mean, sd, cv: mean > 0 ? (sd / mean) * 100 : 0, min: Math.min(...amounts), max: Math.max(...amounts) }
}

export default function Income() {
  const { state, update, metrics } = useStore()
  const [editing, setEditing] = useState<string | null>(null)

  const patch = (id: string, fields: Partial<IncomeSource>) =>
    update((s) => ({ ...s, income: s.income.map((i) => (i.id === id ? { ...i, ...fields } : i)) }))

  const remove = (id: string) => update((s) => ({ ...s, income: s.income.filter((i) => i.id !== id) }))

  const add = () =>
    update((s) => ({
      ...s,
      income: [
        ...s.income,
        {
          id: `inc_${Date.now().toString(36)}`,
          name: 'New source',
          kind: 'other',
          expectedAmount: 0,
          minAmount: 0,
          maxAmount: 0,
          windowStart: 1,
          windowEnd: 5,
          accountId: s.accounts[0]?.id ?? '',
          confidence: 0.8,
          history: [],
          active: true,
        },
      ],
    }))

  const next = useMemo(() => upcomingIncome(state, 45), [state])
  const gross = state.income.filter((i) => i.active).reduce((s, i) => s + i.expectedAmount, 0)
  const worst = state.income.filter((i) => i.active).reduce((s, i) => s + i.minAmount, 0)

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Income Engine"
        title="Expected ranges, not fixed numbers"
        lede="Nothing arrives on the same day for the same amount twice. Each source carries a window, a range and a confidence score, and the forecast leans on the pessimistic end of all three."
        actions={
          <Button onClick={add} variant="brass" size="sm">
            <IconPlus /> Source
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Expected monthly" value={money(gross)} sub={`${state.income.filter((i) => i.active).length} active sources`} />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Confidence-weighted"
            value={money(metrics.income)}
            sub="What the forecast actually plans around"
            tone="brass"
          />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Worst case" value={money(worst)} sub="Every source at the bottom of its range" tone="negative" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Next receipt"
            value={next[0] ? money(next[0].amount) : '—'}
            sub={next[0] ? `${next[0].label} · ${relativeDays(next[0].date)}` : 'None scheduled'}
            tone="positive"
          />
        </div>
      </div>

      <div className="space-y-3">
        {state.income.map((src) => {
          const s = stats(src.history)
          const drift = s.mean > 0 ? ((src.expectedAmount - s.mean) / s.mean) * 100 : 0
          const open = editing === src.id
          const account = state.accounts.find((a) => a.id === src.accountId)

          return (
            <Panel key={src.id} padded={false}>
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px]">{src.name}</h3>
                      <Badge tone="neutral">{src.kind}</Badge>
                      {!src.active && <Badge tone="negative">Paused</Badge>}
                      {Math.abs(drift) > 6 && (
                        <Badge tone={drift > 0 ? 'caution' : 'positive'}>
                          Expectation {drift > 0 ? 'above' : 'below'} history
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ghost">
                      {ordinal(src.windowStart)}–{ordinal(src.windowEnd)} into {account?.name ?? '—'} ·{' '}
                      {Math.round(src.confidence * 100)}% confidence
                      {src.notes ? ` · ${src.notes}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="tnum display text-[24px] leading-none">{money(src.expectedAmount)}</div>
                      <div className="mt-1.5 text-[10.5px] text-ghost">
                        {money(src.minAmount)} – {money(src.maxAmount)}
                      </div>
                    </div>
                    <Sparkline values={src.history.map((h) => h.amount)} colour={account?.accent ?? '#C9A227'} />
                    <button
                      onClick={() => setEditing(open ? null : src.id)}
                      className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                      aria-label={open ? 'Close editor' : 'Edit source'}
                    >
                      <IconChevron className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>
                </div>

                {/* Range band with the expected value marked. */}
                <div className="mt-4">
                  <Meter
                    value={src.expectedAmount - src.minAmount}
                    max={Math.max(1, src.maxAmount - src.minAmount)}
                    notch={s.mean - src.minAmount}
                    tone="brass"
                    height={4}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
                    <Cell label="12-month average" value={s.mean ? money(Math.round(s.mean)) : '—'} />
                    <Cell
                      label="Variance"
                      value={s.cv ? `±${pct(s.cv, 1)}` : '—'}
                      hint={s.sd ? `σ ${money(Math.round(s.sd))}` : undefined}
                    />
                    <Cell label="Observed range" value={s.mean ? `${money(s.min)} – ${money(s.max)}` : '—'} />
                    <Cell
                      label="Window width"
                      value={`${Math.max(1, src.windowEnd - src.windowStart + 1)} days`}
                    />
                  </div>
                </div>
              </div>

              {open && (
                <div className="border-t border-line-soft bg-panel-2/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Name">
                      <input value={src.name} onChange={(e) => patch(src.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Type">
                      <select
                        value={src.kind}
                        onChange={(e) => patch(src.id, { kind: e.target.value as IncomeSource['kind'] })}
                      >
                        {['salary', 'bond', 'allowance', 'freelance', 'other'].map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Receiving account">
                      <select
                        value={src.accountId}
                        onChange={(e) => patch(src.id, { accountId: e.target.value })}
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
                        value={src.expectedAmount}
                        onChange={(e) => patch(src.id, { expectedAmount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Range low">
                      <input
                        type="number"
                        value={src.minAmount}
                        onChange={(e) => patch(src.id, { minAmount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Range high">
                      <input
                        type="number"
                        value={src.maxAmount}
                        onChange={(e) => patch(src.id, { maxAmount: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Window opens (day)">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={src.windowStart}
                        onChange={(e) => patch(src.id, { windowStart: clampDay(e.target.value) })}
                      />
                    </Field>
                    <Field label="Window closes (day)">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={src.windowEnd}
                        onChange={(e) => patch(src.id, { windowEnd: clampDay(e.target.value) })}
                      />
                    </Field>
                    <Field
                      label={`Confidence — ${Math.round(src.confidence * 100)}%`}
                      hint="Scales this source down in the forecast. Drop it when a source becomes unreliable."
                    >
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(src.confidence * 100)}
                        onChange={(e) => patch(src.id, { confidence: Number(e.target.value) / 100 })}
                      />
                    </Field>
                    <Field label="Notes">
                      <input
                        value={src.notes ?? ''}
                        onChange={(e) => patch(src.id, { notes: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[12px] text-dim">
                      <input
                        type="checkbox"
                        checked={src.active}
                        onChange={(e) => patch(src.id, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <Button variant="danger" size="sm" onClick={() => remove(src.id)}>
                      <IconTrash /> Remove
                    </Button>
                  </div>

                  {src.history.length > 0 && (
                    <div className="mt-4 border-t border-line-soft pt-3">
                      <div className="eyebrow mb-2">Receipt history</div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-faint">
                        {src.history.map((h) => (
                          <span key={h.date} className="tnum">
                            {shortDate(h.date)} <span className="text-parchment">{money(h.amount)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      <Panel className="mt-4" title="Next 45 days" subtitle="Expected receipts in date order">
        <ul className="divide-y divide-line-soft">
          {next.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
              <div>
                <div className="text-[13px]">{e.label}</div>
                <div className="text-[10.5px] text-ghost">
                  {shortDate(e.date)} · {relativeDays(e.date)}
                </div>
              </div>
              <span className="tnum text-[13px] text-positive">+{money(e.amount)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

function clampDay(v: string) {
  return Math.max(1, Math.min(31, Number(v) || 1))
}

function Cell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="tnum text-dim">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-ghost">{hint}</div>}
    </div>
  )
}
