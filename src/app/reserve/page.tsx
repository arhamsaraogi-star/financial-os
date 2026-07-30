'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact } from '@/lib/format'
import { addMonths, longDate, today } from '@/lib/dates'
import type { Goal, Priority } from '@/lib/types'
import { Badge, Button, Field, Meter, PageHeader, Panel, Stat } from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'

export default function Reserve() {
  const { state, update, metrics } = useStore()
  const [editing, setEditing] = useState<string | null>(null)

  const patch = (id: string, fields: Partial<Goal>) =>
    update((s) => ({ ...s, goals: s.goals.map((g) => (g.id === id ? { ...g, ...fields } : g)) }))

  const add = () =>
    update((s) => ({
      ...s,
      goals: [
        ...s.goals,
        {
          id: `goal_${Date.now().toString(36)}`,
          name: 'New goal',
          kind: 'custom',
          target: 0,
          current: 0,
          monthlyContribution: 0,
          accountId: s.accounts.find((a) => a.role === 'reserve')?.id ?? s.accounts[0]?.id ?? '',
          priority: 'medium',
        },
      ],
    }))

  const ef = state.goals.find((g) => g.kind === 'emergency_fund')
  const burn = metrics.burnRate
  const targetMonths = state.settings.emergencyFundMonths

  const monthsCovered = ef ? ef.current / Math.max(1, burn) : 0
  const suggestedTarget = Math.round(burn * targetMonths)

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Reserve"
        title="Money with a job"
        lede="The emergency fund is measured in months of obligations, not in rupees. When it completes, its contribution should convert into investment — cash beyond the cover you need loses to inflation quietly and permanently."
        actions={
          <Button onClick={add} variant="brass" size="sm">
            <IconPlus /> Goal
          </Button>
        }
      />

      {ef && (
        <Panel className="mb-4" title="Emergency fund" subtitle={`Target: ${targetMonths} months of obligations`}>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="tnum display text-[38px] leading-none">{money(ef.current)}</div>
                  <div className="mt-2 text-[12px] text-dim">
                    of {money(ef.target)} · {monthsCovered.toFixed(1)} months covered
                  </div>
                </div>
                <Badge
                  tone={monthsCovered >= targetMonths ? 'positive' : monthsCovered >= 3 ? 'caution' : 'negative'}
                >
                  {monthsCovered >= targetMonths
                    ? 'Complete'
                    : monthsCovered >= 3
                      ? 'Adequate'
                      : 'Below floor'}
                </Badge>
              </div>

              <div className="mt-5">
                <Meter
                  value={ef.current}
                  max={Math.max(ef.target, 1)}
                  tone={ef.current >= ef.target ? 'positive' : 'brass'}
                  height={8}
                  notch={burn * 3}
                />
                <div className="mt-2 flex justify-between text-[10px] text-ghost">
                  <span>0</span>
                  <span className="text-caution">3 months — the floor</span>
                  <span>{targetMonths} months</span>
                </div>
              </div>

              <p className="mt-5 text-[12px] leading-relaxed text-dim">
                Your committed and everyday spend runs{' '}
                <span className="tnum text-parchment">{money(burn)}</span> a month, so {targetMonths} months of
                cover is <span className="tnum text-parchment">{money(suggestedTarget)}</span>.
                {ef.target !== suggestedTarget && (
                  <>
                    {' '}
                    Your stated target of {money(ef.target)} is{' '}
                    {ef.target > suggestedTarget ? 'above' : 'below'} that —{' '}
                    <button
                      onClick={() => patch(ef.id, { target: suggestedTarget })}
                      className="text-brass underline decoration-brass-deep underline-offset-2"
                    >
                      align it
                    </button>
                    .
                  </>
                )}
              </p>
            </div>

            <div className="space-y-4 border-t border-line-soft pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <Row label="Monthly contribution" value={money(ef.monthlyContribution)} />
              <Row label="Remaining" value={money(Math.max(0, ef.target - ef.current))} />
              <Row
                label="Completion"
                value={
                  ef.monthlyContribution > 0 && ef.current < ef.target
                    ? longDate(
                        addMonths(
                          today(),
                          Math.ceil((ef.target - ef.current) / ef.monthlyContribution),
                        ),
                      )
                    : ef.current >= ef.target
                      ? 'Complete'
                      : 'No contribution set'
                }
              />
              <Row label="Held in" value={state.accounts.find((a) => a.id === ef.accountId)?.name ?? '—'} />
              <Row label="One month of cover" value={money(Math.round(burn))} />

              {ef.current >= ef.target && (
                <p className="border-l-2 border-positive pl-3 text-[11.5px] leading-relaxed text-dim">
                  Fully funded. The {money(ef.monthlyContribution)} monthly contribution is now doing nothing
                  productive — redirecting it to your SIP raises the investment rate from{' '}
                  {metrics.investmentRate.toFixed(0)}% to{' '}
                  {(
                    ((metrics.commitments.sips + ef.monthlyContribution) / Math.max(1, metrics.income)) *
                    100
                  ).toFixed(0)}
                  %.
                </p>
              )}
            </div>
          </div>
        </Panel>
      )}

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Cash runway" value={`${metrics.cashRunwayMonths.toFixed(1)} mo`} sub="If every source stopped" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Liquidity ratio"
            value={Number.isFinite(metrics.liquidityRatio) ? `${metrics.liquidityRatio.toFixed(2)}×` : '∞'}
            sub="Cash against near-term liabilities"
            tone={metrics.liquidityRatio >= 1 ? 'positive' : 'negative'}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Monthly burn" value={money(metrics.burnRate)} sub="Bills, subscriptions, everyday" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Goals funded"
            value={`${state.goals.filter((g) => g.current >= g.target).length}/${state.goals.length}`}
            sub={`${money(state.goals.reduce((s, g) => s + g.monthlyContribution, 0))} committed monthly`}
          />
        </div>
      </div>

      <div className="space-y-3">
        {state.goals.map((g) => {
          const open = editing === g.id
          const progress = g.target > 0 ? (g.current / g.target) * 100 : 0
          const remaining = Math.max(0, g.target - g.current)
          const months = g.monthlyContribution > 0 ? Math.ceil(remaining / g.monthlyContribution) : null

          return (
            <Panel key={g.id} padded={false}>
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px]">{g.name}</h3>
                      <Badge tone={g.priority === 'critical' ? 'negative' : 'neutral'}>{g.priority}</Badge>
                      {progress >= 100 && <Badge tone="positive">Funded</Badge>}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ghost">
                      {money(g.monthlyContribution)}/month ·{' '}
                      {months ? `complete in ${months} months` : progress >= 100 ? 'complete' : 'no contribution set'}{' '}
                      · held in {state.accounts.find((a) => a.id === g.accountId)?.name ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="tnum display text-[22px] leading-none">{money(g.current)}</div>
                      <div className="mt-1.5 text-[10.5px] text-ghost">of {moneyCompact(g.target)}</div>
                    </div>
                    <button
                      onClick={() => setEditing(open ? null : g.id)}
                      className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                      aria-label={open ? 'Close editor' : 'Edit goal'}
                    >
                      <IconChevron className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <Meter
                    value={g.current}
                    max={Math.max(g.target, 1)}
                    tone={progress >= 100 ? 'positive' : 'brass'}
                    height={4}
                  />
                  <div className="mt-2 flex justify-between text-[10.5px] text-ghost">
                    <span className="tnum">{progress.toFixed(0)}% funded</span>
                    <span className="tnum">{money(remaining)} remaining</span>
                  </div>
                </div>
              </div>

              {open && (
                <div className="border-t border-line-soft bg-panel-2/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Name">
                      <input value={g.name} onChange={(e) => patch(g.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Type">
                      <select
                        value={g.kind}
                        onChange={(e) => patch(g.id, { kind: e.target.value as Goal['kind'] })}
                      >
                        <option value="emergency_fund">Emergency fund</option>
                        <option value="purchase">Purchase</option>
                        <option value="travel">Travel</option>
                        <option value="custom">Custom</option>
                      </select>
                    </Field>
                    <Field label="Held in">
                      <select value={g.accountId} onChange={(e) => patch(g.id, { accountId: e.target.value })}>
                        {state.accounts
                          .filter((a) => a.role !== 'credit')
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Target">
                      <input
                        type="number"
                        value={g.target}
                        onChange={(e) => patch(g.id, { target: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Current">
                      <input
                        type="number"
                        value={g.current}
                        onChange={(e) => patch(g.id, { current: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Monthly contribution">
                      <input
                        type="number"
                        value={g.monthlyContribution}
                        onChange={(e) => patch(g.id, { monthlyContribution: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Priority">
                      <select
                        value={g.priority}
                        onChange={(e) => patch(g.id, { priority: e.target.value as Priority })}
                      >
                        {(['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => update((s) => ({ ...s, goals: s.goals.filter((x) => x.id !== g.id) }))}
                    >
                      <IconTrash /> Remove goal
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-soft pb-2 text-[12px] last:border-0">
      <span className="text-faint">{label}</span>
      <span className="tnum text-parchment">{value}</span>
    </div>
  )
}
