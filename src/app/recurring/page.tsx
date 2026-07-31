'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact, ordinal } from '@/lib/format'
import { monthName, relativeDays, shortDate, today } from '@/lib/dates'
import type { Priority, Recurring, RecurringKind } from '@/lib/types'
import { normaliseMonthly } from '@/lib/engine/derived'
import { subscriptionInsights } from '@/lib/engine/analytics'
import { upcoming } from '@/lib/engine/events'
import { Badge, Button, Card, Empty, Field, PageHeader, Row, Segmented, Sheet, Toggle } from '@/components/ui'

const KIND_LABEL: Record<RecurringKind, string> = {
  income: 'Money in',
  bill: 'Bill',
  subscription: 'Subscription',
}

export default function RecurringPage() {
  const { state, update, accountName } = useStore()
  const [tab, setTab] = useState<RecurringKind>('bill')
  const [editing, setEditing] = useState<Recurring | null>(null)

  const subs = useMemo(() => subscriptionInsights(state), [state])
  const next = useMemo(() => upcoming(state, 35), [state])

  const items = state.recurring.filter((r) => r.kind === tab)
  const monthlyTotal = items
    .filter((r) => r.active)
    .reduce((s, r) => s + normaliseMonthly(r.amount, r.cadence), 0)

  const patch = (id: string, fields: Partial<Recurring>) =>
    update((s) => ({ ...s, recurring: s.recurring.map((r) => (r.id === id ? { ...r, ...fields } : r)) }))

  const create = () => {
    const fresh: Recurring = {
      id: `rec_${Date.now().toString(36)}`,
      name: tab === 'income' ? 'New income' : tab === 'bill' ? 'New bill' : 'New subscription',
      kind: tab,
      amount: 0,
      minAmount: 0,
      maxAmount: 0,
      cadence: 'monthly',
      day: 1,
      dayEnd: tab === 'income' ? 5 : undefined,
      accountId:
        state.accounts.find((a) => a.kind === (tab === 'income' ? 'spending' : 'bills') && !a.archived)?.id ??
        state.accounts[0]?.id ??
        '',
      categoryId:
        state.categories.find((c) => c.kind === (tab === 'income' ? 'income' : 'expense'))?.id ?? '',
      priority: 'normal',
      confidence: tab === 'income' ? 0.9 : 1,
      usage: 5,
      autopay: false,
      active: true,
      startedOn: today(),
      notes: '',
    }
    update((s) => ({ ...s, recurring: [...s.recurring, fresh] }))
    setEditing(fresh)
  }

  return (
    <div className="rise space-y-4 pb-4">
      <PageHeader
        title="Recurring"
        lede="Anything that repeats — money coming in, bills going out, subscriptions ticking along."
        action={
          <Button size="sm" variant="accent" onClick={create}>
            Add
          </Button>
        }
      />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { label: 'Bills', value: 'bill' },
          { label: 'Subscriptions', value: 'subscription' },
          { label: 'Money in', value: 'income' },
        ]}
      />

      <Card>
        <div className="label mb-1.5">
          {tab === 'income' ? 'Expected each month' : 'Costs each month'}
        </div>
        <div className={`tnum display text-[30px] leading-none ${tab === 'income' ? 'text-good' : ''}`}>
          {money(monthlyTotal)}
        </div>
        <p className="mt-2 text-[13px] text-faint">
          {items.filter((r) => r.active).length} active
          {tab === 'subscription' && subs.recoverable > 0 && (
            <> · {money(subs.recoverable)} of it barely used</>
          )}
          {tab !== 'income' && <> · {money(monthlyTotal * 12)} a year</>}
        </p>
      </Card>

      {tab === 'subscription' && subs.lowValue.length > 0 && (
        <Card title="Worth cancelling">
          <div className="divide-y divide-line-soft">
            {subs.lowValue.map((r) => (
              <Row
                key={r.recurring.id}
                icon="⚠️"
                title={r.recurring.name}
                subtitle={`Used ${r.recurring.usage}/10 · ${money(r.yearly)} a year`}
                value={`${money(r.monthly)}/mo`}
                valueTone="bad"
                onClick={() => setEditing(r.recurring)}
              />
            ))}
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <Empty
            icon={tab === 'income' ? '💰' : tab === 'bill' ? '📄' : '🔁'}
            title={`No ${KIND_LABEL[tab].toLowerCase()} set up`}
            detail="Adding these lets the app forecast your balance instead of just recording the past."
            action={<Button variant="accent" onClick={create}>Add one</Button>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="divide-y divide-line-soft px-4">
            {items.map((r) => {
              const monthly = normaliseMonthly(r.amount, r.cadence)
              const soon = next.find((e) => e.sourceId === r.id)
              return (
                <Row
                  key={r.id}
                  icon={r.kind === 'income' ? '↓' : r.kind === 'subscription' ? '🔁' : '📄'}
                  title={
                    <span className="flex items-center gap-2">
                      <span className="truncate">{r.name}</span>
                      {!r.active && <Badge tone="neutral">Off</Badge>}
                      {r.priority === 'critical' && r.active && <Badge tone="bad">Must pay</Badge>}
                    </span>
                  }
                  subtitle={
                    r.kind === 'income'
                      ? `${ordinal(r.day)}–${ordinal(r.dayEnd ?? r.day)} into ${accountName(r.accountId)}`
                      : `${cadenceLabel(r)} · ${soon ? relativeDays(soon.date) : 'not scheduled'} · ${accountName(
                          r.accountId,
                        )}`
                  }
                  value={money(r.amount)}
                  valueTone={r.kind === 'income' ? 'good' : 'neutral'}
                  valueSub={r.cadence !== 'monthly' ? `${money(monthly)}/mo` : undefined}
                  onClick={() => setEditing(r)}
                />
              )
            })}
          </div>
        </Card>
      )}

      <Card title="Next 35 days" padded={false}>
        {next.length === 0 ? (
          <Empty icon="🗓" title="Nothing scheduled" />
        ) : (
          <div className="divide-y divide-line-soft px-4">
            {next.slice(0, 12).map((e) => (
              <Row
                key={e.id}
                title={e.label}
                subtitle={`${shortDate(e.date)} · ${relativeDays(e.date)}`}
                value={`${e.kind === 'income' ? '+' : '−'}${money(e.amount)}`}
                valueTone={e.kind === 'income' ? 'good' : 'muted'}
              />
            ))}
          </div>
        )}
      </Card>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ''}
        footer={
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (editing) {
                  update((s) => ({ ...s, recurring: s.recurring.filter((r) => r.id !== editing.id) }))
                  setEditing(null)
                }
              }}
            >
              Remove
            </Button>
            <Button variant="accent" size="lg" full onClick={() => setEditing(null)}>
              Done
            </Button>
          </div>
        }
      >
        {editing && (
          <RecurringForm
            item={state.recurring.find((r) => r.id === editing.id) ?? editing}
            patch={patch}
          />
        )}
      </Sheet>
    </div>
  )
}

function cadenceLabel(r: Recurring) {
  if (r.cadence === 'monthly') return `${ordinal(r.day)} monthly`
  if (r.cadence === 'quarterly') return `${ordinal(r.day)} quarterly`
  return `${ordinal(r.day)} ${monthName(r.month ?? 1)}`
}

function RecurringForm({
  item,
  patch,
}: {
  item: Recurring
  patch: (id: string, fields: Partial<Recurring>) => void
}) {
  const { state } = useStore()
  const isIncome = item.kind === 'income'
  const cats = state.categories.filter((c) => c.kind === (isIncome ? 'income' : 'expense'))

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input value={item.name} onChange={(e) => patch(item.id, { name: e.target.value })} />
      </Field>

      <Field label="Amount">
        <input
          type="number"
          inputMode="decimal"
          value={item.amount || ''}
          placeholder="0"
          onChange={(e) => {
            const v = Number(e.target.value) || 0
            // Keep the range sensible by default; the user can widen it below.
            patch(item.id, {
              amount: v,
              minAmount: Math.min(item.minAmount || v, v),
              maxAmount: Math.max(item.maxAmount || v, v),
            })
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Usually as low as">
          <input
            type="number"
            inputMode="decimal"
            value={item.minAmount || ''}
            onChange={(e) => patch(item.id, { minAmount: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="As high as">
          <input
            type="number"
            inputMode="decimal"
            value={item.maxAmount || ''}
            onChange={(e) => patch(item.id, { maxAmount: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>
      <p className="-mt-2 text-[12px] leading-snug text-ghost">
        For things that vary, like electricity. The forecast plans for the {isIncome ? 'low' : 'high'} end.
      </p>

      <Field label="How often">
        <select
          value={item.cadence}
          onChange={(e) => patch(item.id, { cadence: e.target.value as Recurring['cadence'] })}
        >
          <option value="monthly">Every month</option>
          <option value="quarterly">Every 3 months</option>
          <option value="annual">Once a year</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={isIncome ? 'Arrives from' : 'Day of month'}>
          <input
            type="number"
            inputMode="numeric"
            value={item.day}
            onChange={(e) => patch(item.id, { day: clampDay(e.target.value) })}
          />
        </Field>
        {isIncome ? (
          <Field label="Arrives by">
            <input
              type="number"
              inputMode="numeric"
              value={item.dayEnd ?? item.day}
              onChange={(e) => patch(item.id, { dayEnd: clampDay(e.target.value) })}
            />
          </Field>
        ) : (
          item.cadence === 'annual' && (
            <Field label="Month">
              <select
                value={item.month ?? 1}
                onChange={(e) => patch(item.id, { month: Number(e.target.value) })}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthName(m)}
                  </option>
                ))}
              </select>
            </Field>
          )
        )}
      </div>

      <Field label={isIncome ? 'Goes into' : 'Paid from'}>
        <select value={item.accountId} onChange={(e) => patch(item.id, { accountId: e.target.value })}>
          {state.accounts
            .filter((a) => !a.archived && a.kind !== 'credit')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </Field>

      <Field label="Category">
        <select value={item.categoryId} onChange={(e) => patch(item.id, { categoryId: e.target.value })}>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </Field>

      {isIncome ? (
        <Field
          label={`How reliable — ${Math.round(item.confidence * 100)}%`}
          hint="Lower this for income that sometimes does not arrive. The forecast scales it down."
        >
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(item.confidence * 100)}
            onChange={(e) => patch(item.id, { confidence: Number(e.target.value) / 100 })}
          />
        </Field>
      ) : (
        <Field label="How important">
          <select
            value={item.priority}
            onChange={(e) => patch(item.id, { priority: e.target.value as Priority })}
          >
            <option value="critical">Must pay — real consequences if missed</option>
            <option value="high">Important</option>
            <option value="normal">Normal</option>
          </select>
        </Field>
      )}

      {item.kind === 'subscription' && (
        <Field
          label={`How much you use it — ${item.usage}/10`}
          hint="Be honest. Below 4 with real cost puts it on the cancel list."
        >
          <input
            type="range"
            min={0}
            max={10}
            value={item.usage}
            onChange={(e) => patch(item.id, { usage: Number(e.target.value) })}
          />
        </Field>
      )}

      <div className="space-y-1 border-t border-line-soft pt-2">
        <Toggle checked={item.active} onChange={(v) => patch(item.id, { active: v })} label="Active" />
        {!isIncome && (
          <Toggle checked={item.autopay} onChange={(v) => patch(item.id, { autopay: v })} label="On autopay" />
        )}
      </div>
    </div>
  )
}

function clampDay(v: string) {
  return Math.max(1, Math.min(31, Number(v) || 1))
}
