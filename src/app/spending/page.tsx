'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money } from '@/lib/format'
import {
  budgetSummary,
  currentMonth,
  dailySpend,
  monthLabel,
  monthlyRollups,
  previousMonth,
  spendByCategory,
} from '@/lib/engine/analytics'
import { CategoryDonut, DailyStrip, MonthBars } from '@/components/charts'
import { Badge, Button, Card, Empty, Field, Meter, PageHeader, Row, Sheet } from '@/components/ui'

export default function Spending() {
  const { state, update } = useStore()
  const [month, setMonth] = useState(currentMonth())
  const [editing, setEditing] = useState<string | null>(null)

  const rows = useMemo(() => spendByCategory(state, month), [state, month])
  const budget = useMemo(() => budgetSummary(state, month), [state, month])
  const strip = useMemo(() => dailySpend(state, month), [state, month])
  const history = useMemo(() => monthlyRollups(state, 6), [state])

  const spent = rows.reduce((s, r) => s + r.spent, 0)
  const withSpend = rows.filter((r) => r.spent > 0)

  const donut = withSpend.slice(0, 7).map((r) => ({
    name: r.category.name,
    value: r.spent,
    colour: r.category.colour,
  }))

  const months = useMemo(() => {
    const out: string[] = []
    let m = currentMonth()
    for (let i = 0; i < 6; i++) {
      out.push(m)
      m = previousMonth(m)
    }
    return out
  }, [])

  const target = state.categories.find((c) => c.id === editing)

  const setBudget = (id: string, value: number) =>
    update((s) => ({
      ...s,
      categories: s.categories.map((c) => (c.id === id ? { ...c, budget: Math.max(0, value) } : c)),
    }))

  return (
    <div className="rise space-y-4 pb-4">
      <PageHeader title="Spending" lede="Where the money actually goes, and whether it fits." />

      {/* ---- Month picker -------------------------------------------------- */}
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setMonth(m)}
            className={`shrink-0 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors ${
              month === m ? 'border-accent/50 bg-accent-wash text-accent' : 'border-line bg-surface-2 text-faint'
            }`}
          >
            {monthLabel(m, m.slice(0, 4) !== currentMonth().slice(0, 4))}
          </button>
        ))}
      </div>

      {/* ---- Headline ------------------------------------------------------- */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label mb-1.5">Total spent</div>
            <div className="tnum display text-[32px] leading-none">{money(spent)}</div>
            <p className="mt-2 text-[13px] text-faint">
              {withSpend.reduce((s, r) => s + r.count, 0)} transactions in {monthLabel(month, true)}
            </p>
          </div>
          {budget.budgeted > 0 && (
            <Badge tone={budget.spent > budget.budgeted ? 'bad' : budget.paceRatio > 1.05 ? 'warn' : 'good'}>
              {Math.round((budget.spent / budget.budgeted) * 100)}% of budget
            </Badge>
          )}
        </div>

        <div className="mt-4">
          <DailyStrip data={strip} height={60} />
          <p className="mt-2 text-[12px] text-ghost">
            Busiest day:{' '}
            {strip.reduce((a, b) => (b.amount > a.amount ? b : a), strip[0] ?? { date: '', amount: 0 }).amount > 0
              ? `${money(Math.max(...strip.map((d) => d.amount)))}`
              : 'nothing logged yet'}
          </p>
        </div>
      </Card>

      {/* ---- Split ----------------------------------------------------------- */}
      {donut.length > 0 && (
        <Card title="Split">
          <CategoryDonut
            data={donut}
            centre={
              <div className="text-center">
                <div className="tnum display text-[19px]">{money(spent)}</div>
                <div className="text-[11px] text-ghost">total</div>
              </div>
            }
          />
        </Card>
      )}

      {/* ---- Categories ------------------------------------------------------- */}
      <Card title="By category" padded={false}>
        {rows.length === 0 ? (
          <Empty icon="🧾" title="Nothing spent this month" detail="Log a transaction and it will show up here." />
        ) : (
          <div className="divide-y divide-line-soft px-4 pb-2">
            {rows.map((r) => (
              <div key={r.category.id} className="py-3">
                <Row
                  icon={r.category.icon}
                  title={r.category.name}
                  subtitle={
                    r.budget > 0
                      ? r.spent > r.budget
                        ? `${money(r.spent - r.budget)} over budget`
                        : `${money(r.budget - r.spent)} left of ${money(r.budget)}`
                      : `${r.count} transaction${r.count === 1 ? '' : 's'}`
                  }
                  value={money(r.spent)}
                  valueTone={r.budget > 0 && r.spent > r.budget ? 'bad' : 'neutral'}
                  valueSub={
                    r.prior > 0
                      ? `${r.change >= 0 ? '+' : ''}${r.change.toFixed(0)}% vs last`
                      : undefined
                  }
                  onClick={() => setEditing(r.category.id)}
                />
                {r.budget > 0 && (
                  <div className="pl-13 pt-1">
                    <Meter
                      value={r.spent}
                      max={r.budget}
                      height={5}
                      tone={r.spent > r.budget ? 'bad' : r.ratio > 0.85 ? 'warn' : 'good'}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---- Budget summary ---------------------------------------------------- */}
      {budget.budgeted > 0 && (
        <Card title="Budget">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="label mb-1.5">Projected month</div>
              <div
                className={`tnum display text-[22px] ${
                  budget.projectedSpend > budget.budgeted ? 'text-bad' : 'text-good'
                }`}
              >
                {money(budget.projectedSpend)}
              </div>
            </div>
            <div>
              <div className="label mb-1.5">Budgeted</div>
              <div className="tnum display text-[22px]">{money(budget.budgeted)}</div>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-faint">
            {budget.daysLeft > 0
              ? `At the pace so far you will finish around ${money(
                  budget.projectedSpend,
                )}. There are ${budget.daysLeft} days left${
                  budget.remaining > 0
                    ? `, so ${money(budget.remaining / budget.daysLeft)} a day keeps you inside budget.`
                    : '.'
                }`
              : `The month closed at ${money(budget.spent)} against ${money(budget.budgeted)}.`}
          </p>
        </Card>
      )}

      {/* ---- Trend --------------------------------------------------------------- */}
      <Card title="Last six months">
        <MonthBars data={history} />
        <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line-soft pt-3">
          <div>
            <div className="label mb-1">Average in</div>
            <div className="tnum text-[15px] text-good">
              {money(Math.round(history.reduce((s, r) => s + r.income, 0) / Math.max(1, history.length)))}
            </div>
          </div>
          <div>
            <div className="label mb-1">Average out</div>
            <div className="tnum text-[15px] text-bad">
              {money(Math.round(history.reduce((s, r) => s + r.spend, 0) / Math.max(1, history.length)))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-ghost">
          Includes your recurring bills and subscriptions, which are not stored as individual
          transactions.
        </p>
      </Card>

      {/* ---- Budget editor ------------------------------------------------------- */}
      <Sheet
        open={!!target}
        onClose={() => setEditing(null)}
        title={target ? `${target.icon} ${target.name}` : ''}
        footer={
          <Button variant="accent" size="lg" full onClick={() => setEditing(null)}>
            Done
          </Button>
        }
      >
        {target && (
          <div className="space-y-4">
            <Field
              label="Monthly budget"
              hint="Leave at 0 for no budget — the category is still tracked, just not capped."
            >
              <input
                type="number"
                inputMode="decimal"
                value={target.budget || ''}
                placeholder="0"
                onChange={(e) => setBudget(target.id, Number(e.target.value) || 0)}
              />
            </Field>

            <div className="flex flex-wrap gap-1.5">
              {[2000, 5000, 10000, 15000].map((v) => (
                <button
                  key={v}
                  onClick={() => setBudget(target.id, v)}
                  className="rounded-full border border-line bg-surface-2 px-3 py-2 text-[13px] text-muted active:bg-surface-3"
                >
                  {money(v)}
                </button>
              ))}
              <button
                onClick={() => setBudget(target.id, 0)}
                className="rounded-full border border-line bg-surface-2 px-3 py-2 text-[13px] text-muted active:bg-surface-3"
              >
                No budget
              </button>
            </div>

            {(() => {
              const r = rows.find((x) => x.category.id === target.id)
              if (!r) return null
              return (
                <div className="rounded-[var(--radius-control)] border border-line-soft bg-surface p-4">
                  <div className="mb-2 flex justify-between text-[13.5px]">
                    <span className="text-muted">Spent in {monthLabel(month, true)}</span>
                    <span className="tnum text-text">{money(r.spent)}</span>
                  </div>
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-muted">Previous month</span>
                    <span className="tnum text-faint">{money(r.prior)}</span>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </Sheet>
    </div>
  )
}
