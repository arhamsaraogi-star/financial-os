'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact } from '@/lib/format'
import { addMonths, longDate, today } from '@/lib/dates'
import type { Goal } from '@/lib/types'
import { Badge, Button, Card, Empty, Field, Meter, PageHeader, Sheet, Toggle } from '@/components/ui'

const ICONS = ['🛟', '✈️', '🏠', '🚗', '💍', '🎓', '💻', '🎁', '🏥', '◎']

export default function Goals() {
  const { state, update, metrics } = useStore()
  const [editing, setEditing] = useState<Goal | null>(null)

  const patch = (id: string, fields: Partial<Goal>) =>
    update((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...fields } : g)) }))

  const create = () => {
    const fresh: Goal = {
      id: `goal_${Date.now().toString(36)}`,
      name: 'New goal',
      icon: '◎',
      emergencyFund: false,
      target: 0,
      saved: 0,
      monthlyContribution: 0,
      accountId: state.accounts.find((a) => a.kind === 'savings' && !a.archived)?.id ?? state.accounts[0]?.id ?? '',
    }
    update((s) => ({ ...s, goals: [...s.goals, fresh] }))
    setEditing(fresh)
  }

  const ef = state.goals.find((g) => g.emergencyFund)
  const others = state.goals.filter((g) => !g.emergencyFund)
  const suggested = Math.round(metrics.burnRate * state.settings.emergencyFundMonths)

  return (
    <div className="rise space-y-4 pb-4">
      <PageHeader
        title="Goals"
        lede="What you're saving for, and how long it will take at the rate you're going."
        action={
          <Button size="sm" variant="accent" onClick={create}>
            Add
          </Button>
        }
      />

      {/* ---- Emergency fund ------------------------------------------------- */}
      {ef && (
        <Card>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[19px]">{ef.icon}</span>
                <span className="label">Emergency fund</span>
              </div>
              <div className="tnum display text-[32px] leading-none">{money(ef.saved)}</div>
              <p className="mt-2 text-[13.5px] text-faint">
                covers {metrics.emergencyMonthsCovered.toFixed(1)} months of your spending
              </p>
            </div>
            <Badge
              tone={
                metrics.emergencyMonthsCovered >= state.settings.emergencyFundMonths
                  ? 'good'
                  : metrics.emergencyMonthsCovered >= 3
                    ? 'warn'
                    : 'bad'
              }
            >
              {metrics.emergencyMonthsCovered >= state.settings.emergencyFundMonths
                ? 'Done'
                : metrics.emergencyMonthsCovered >= 3
                  ? 'Getting there'
                  : 'Too thin'}
            </Badge>
          </div>

          <Meter
            value={ef.saved}
            max={Math.max(ef.target, 1)}
            tone={ef.saved >= ef.target ? 'good' : 'accent'}
          />
          <div className="mt-2 flex justify-between text-[12px] text-ghost">
            <span>{money(ef.saved)}</span>
            <span>target {moneyCompact(ef.target)}</span>
          </div>

          <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
            You spend about {money(metrics.burnRate)} a month, so {state.settings.emergencyFundMonths} months
            of cover is {money(suggested)}.
            {ef.target !== suggested && (
              <>
                {' '}
                Your target is set to {money(ef.target)} —{' '}
                <button
                  onClick={() => patch(ef.id, { target: suggested })}
                  className="text-accent underline underline-offset-2"
                >
                  match it
                </button>
                .
              </>
            )}
          </p>

          <div className="mt-4">
            <Button full onClick={() => setEditing(ef)}>
              Edit
            </Button>
          </div>
        </Card>
      )}

      {/* ---- Other goals ------------------------------------------------------ */}
      {others.length === 0 && !ef ? (
        <Card>
          <Empty
            icon="🎯"
            title="No goals yet"
            detail="Set one and the app will tell you when you'll get there at your current pace."
            action={<Button variant="accent" onClick={create}>Add a goal</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {others.map((g) => {
            const pct = g.target > 0 ? (g.saved / g.target) * 100 : 0
            const left = Math.max(0, g.target - g.saved)
            const months = g.monthlyContribution > 0 ? Math.ceil(left / g.monthlyContribution) : null
            return (
              <Card key={g.id} padded={false}>
                <button onClick={() => setEditing(g)} className="w-full px-4 py-4 text-left active:opacity-70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[19px]">{g.icon}</span>
                        <span className="truncate text-[16px]">{g.name}</span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-faint">
                        {pct >= 100
                          ? 'Fully saved'
                          : months
                            ? `${money(g.monthlyContribution)}/mo · ready ${longDate(addMonths(today(), months))}`
                            : 'No monthly amount set'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum display text-[20px] leading-none">{money(g.saved)}</div>
                      <div className="mt-1.5 text-[11.5px] text-ghost">of {moneyCompact(g.target)}</div>
                    </div>
                  </div>
                  <div className="mt-3.5">
                    <Meter value={g.saved} max={Math.max(g.target, 1)} height={6} tone={pct >= 100 ? 'good' : 'accent'} />
                    <div className="mt-1.5 flex justify-between text-[11.5px] text-ghost">
                      <span>{pct.toFixed(0)}%</span>
                      <span>{money(left)} to go</span>
                    </div>
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}

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
                  update((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== editing.id) }))
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
          <GoalForm goal={state.goals.find((g) => g.id === editing.id) ?? editing} patch={patch} />
        )}
      </Sheet>
    </div>
  )
}

function GoalForm({ goal, patch }: { goal: Goal; patch: (id: string, f: Partial<Goal>) => void }) {
  const { state, metrics } = useStore()
  const left = Math.max(0, goal.target - goal.saved)
  const months = goal.monthlyContribution > 0 ? Math.ceil(left / goal.monthlyContribution) : null

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input value={goal.name} onChange={(e) => patch(goal.id, { name: e.target.value })} />
      </Field>

      <div>
        <span className="label mb-2 block">Icon</span>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((i) => (
            <button
              key={i}
              onClick={() => patch(goal.id, { icon: i })}
              className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border text-[19px] ${
                goal.icon === i ? 'border-accent/50 bg-accent-wash' : 'border-line-soft bg-surface-2'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Saved so far">
          <input
            type="number"
            inputMode="decimal"
            value={goal.saved || ''}
            placeholder="0"
            onChange={(e) => patch(goal.id, { saved: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Target">
          <input
            type="number"
            inputMode="decimal"
            value={goal.target || ''}
            placeholder="0"
            onChange={(e) => patch(goal.id, { target: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      <Field
        label="Adding each month"
        hint={
          months
            ? `At this rate you get there in ${months} month${months === 1 ? '' : 's'}, around ${longDate(
                addMonths(today(), months),
              )}.`
            : 'Set an amount to see when you will reach the target.'
        }
      >
        <input
          type="number"
          inputMode="decimal"
          value={goal.monthlyContribution || ''}
          placeholder="0"
          onChange={(e) => patch(goal.id, { monthlyContribution: Number(e.target.value) || 0 })}
        />
      </Field>

      <Field label="Kept in">
        <select value={goal.accountId} onChange={(e) => patch(goal.id, { accountId: e.target.value })}>
          {state.accounts
            .filter((a) => !a.archived && a.kind !== 'credit')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </Field>

      <div className="border-t border-line-soft pt-2">
        <Toggle
          checked={goal.emergencyFund}
          onChange={(v) => patch(goal.id, { emergencyFund: v })}
          label="This is my emergency fund"
        />
        <p className="mt-1 text-[12px] leading-snug text-ghost">
          Marking it this way means the app measures it in months of your spending
          {metrics.burnRate > 0 && <> — currently {money(metrics.burnRate)} a month</>}, and never counts it
          as spare cash when answering “can I afford this”.
        </p>
      </div>
    </div>
  )
}
