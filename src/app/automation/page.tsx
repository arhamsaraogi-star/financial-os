'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, ordinal } from '@/lib/format'
import { shortDate } from '@/lib/dates'
import type { Rule, RuleAction, RuleTrigger } from '@/lib/types'
import { simulate, topUpThreshold } from '@/lib/engine/forecast'
import { Badge, Button, Field, PageHeader, Panel, ScrollX, Stat, Td, Th } from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'

export default function Automation() {
  const { state, update, forecast, horizon } = useStore()
  const [editing, setEditing] = useState<string | null>(null)

  const accountName = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? '—'

  const patch = (id: string, fields: Partial<Rule>) =>
    update((s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, ...fields } : r)) }))

  const add = () =>
    update((s) => ({
      ...s,
      rules: [
        ...s.rules,
        {
          id: `rule_${Date.now().toString(36)}`,
          name: 'New rule',
          trigger: { type: 'day_of_month', day: 1 },
          actions: [],
          enabled: false,
          rationale: 'Explain why this rule exists.',
          order: s.rules.length + 1,
        },
      ],
    }))

  // The honest measure of automation: what breaks when you turn it off.
  const unmanaged = useMemo(
    () => simulate(state, { horizonDays: horizon, applyRules: false }),
    [state, horizon],
  )

  const describeTrigger = (t: RuleTrigger): string => {
    switch (t.type) {
      case 'income_received':
        return t.incomeId
          ? `${state.income.find((i) => i.id === t.incomeId)?.name ?? 'Income'} is received`
          : 'Any income is received'
      case 'day_of_month':
        return `It is the ${ordinal(t.day)}`
      case 'account_below_target': {
        const acct = state.accounts.find((a) => a.id === t.accountId)
        return `${accountName(t.accountId)} falls more than ${
          acct ? money(Math.round(topUpThreshold(acct))) : '—'
        } below its target`
      }
      case 'account_above':
        return `${accountName(t.accountId)} holds more than ${money(t.amount)}`
      case 'goal_complete':
        return `${state.goals.find((g) => g.id === t.goalId)?.name ?? 'A goal'} is fully funded`
    }
  }

  const describeAction = (a: RuleAction): string => {
    switch (a.type) {
      case 'top_up_to_target':
        return `Top ${accountName(a.toAccountId)} up to its target from ${accountName(a.fromAccountId)}`
      case 'transfer_fixed':
        return `Move ${money(a.amount)} from ${accountName(a.fromAccountId)} to ${accountName(a.toAccountId)}`
      case 'sweep_excess':
        return `Sweep everything above ${money(a.keep)} from ${accountName(
          a.fromAccountId,
        )} into ${accountName(a.toAccountId)}`
      case 'fund_sips':
        return `Fund every active SIP from ${accountName(a.fromAccountId)}`
      case 'recommend':
        return `Raise a recommendation: “${a.message}”`
    }
  }

  const enabled = state.rules.filter((r) => r.enabled)
  const moved = forecast.automatedMoves.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Rule Engine"
        title="Cash should move without being asked"
        lede="Each rule is an IF/THEN that runs inside the projection, not just in real life — so the forecast already reflects the transfers you would have made. Every rule carries a written rationale, and it appears verbatim in the ledger next to the money it moved."
        actions={
          <Button onClick={add} variant="brass" size="sm">
            <IconPlus /> Rule
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Active rules" value={`${enabled.length}`} sub={`of ${state.rules.length} defined`} />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Moves scheduled" value={`${forecast.automatedMoves.length}`} sub={`Over ${horizon} days`} />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Value routed" value={money(moved)} sub="Without you touching anything" tone="brass" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Risk without rules"
            value={`${unmanaged.riskScore}`}
            sub={`vs ${forecast.riskScore} with them`}
            tone={unmanaged.riskScore < forecast.riskScore ? 'negative' : 'neutral'}
          />
        </div>
      </div>

      <Panel
        className="mb-4"
        title="What automation is worth"
        subtitle="The same projection, run with rules disabled"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Compare
            label="Lowest point"
            with={money(forecast.trough.total)}
            without={money(unmanaged.trough.total)}
            better={forecast.trough.total >= unmanaged.trough.total}
          />
          <Compare
            label="Buffer breaches"
            with={`${forecast.flags.length}`}
            without={`${unmanaged.flags.length}`}
            better={forecast.flags.length <= unmanaged.flags.length}
          />
          <Compare
            label="Risk score"
            with={`${forecast.riskScore}/100`}
            without={`${unmanaged.riskScore}/100`}
            better={forecast.riskScore >= unmanaged.riskScore}
          />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-dim">
          {unmanaged.flags.length > forecast.flags.length
            ? `Without automation your accounts breach their floors ${
                unmanaged.flags.length - forecast.flags.length
              } more times over ${horizon} days. The money exists in every one of those cases — it is simply sitting in the wrong account on the wrong day. That is the entire problem these rules solve.`
            : `Your obligations clear even without automation, which means the rules are buying you attention rather than solvency. That is still worth having: the failure mode of manual treasury is forgetting, not insolvency.`}
        </p>
      </Panel>

      <div className="mb-4 space-y-3">
        {state.rules
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((rule) => {
            const open = editing === rule.id
            return (
              <Panel key={rule.id} padded={false}>
                <div className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tnum text-[11px] text-ghost">{String(rule.order).padStart(2, '0')}</span>
                        <h3 className="text-[15px]">{rule.name}</h3>
                        <Badge tone={rule.enabled ? 'positive' : 'neutral'}>
                          {rule.enabled ? 'Active' : 'Paused'}
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-1.5 text-[12.5px]">
                        <div className="flex gap-2">
                          <span className="eyebrow w-9 shrink-0 pt-[3px]">If</span>
                          <span className="text-parchment">{describeTrigger(rule.trigger)}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="eyebrow w-9 shrink-0 pt-[3px]">Then</span>
                          <ul className="space-y-1">
                            {rule.actions.map((a, i) => (
                              <li key={i} className="text-dim">
                                {describeAction(a)}
                              </li>
                            ))}
                            {!rule.actions.length && <li className="text-ghost">Nothing yet</li>}
                          </ul>
                        </div>
                      </div>

                      <p className="mt-3 max-w-2xl border-l-2 border-brass-deep pl-3 text-[11.5px] leading-relaxed text-faint">
                        {rule.rationale}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-dim">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => patch(rule.id, { enabled: e.target.checked })}
                        />
                        On
                      </label>
                      <button
                        onClick={() => setEditing(open ? null : rule.id)}
                        className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                        aria-label={open ? 'Close editor' : 'Edit rule'}
                      >
                        <IconChevron className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
                      </button>
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-line-soft bg-panel-2/40 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name">
                        <input value={rule.name} onChange={(e) => patch(rule.id, { name: e.target.value })} />
                      </Field>
                      <Field label="Order" hint="Lower numbers run first. Funding rules should precede sweeps.">
                        <input
                          type="number"
                          value={rule.order}
                          onChange={(e) => patch(rule.id, { order: Number(e.target.value) || 1 })}
                        />
                      </Field>
                      <Field
                        label="Rationale"
                        hint="Shown in the ledger beside every transfer this rule creates."
                      >
                        <textarea
                          rows={3}
                          value={rule.rationale}
                          onChange={(e) => patch(rule.id, { rationale: e.target.value })}
                        />
                      </Field>
                      <Field label="Trigger">
                        <select
                          value={rule.trigger.type}
                          onChange={(e) => {
                            const type = e.target.value as RuleTrigger['type']
                            const firstAccount = state.accounts[0]?.id ?? ''
                            const next: RuleTrigger =
                              type === 'income_received'
                                ? { type, incomeId: state.income[0]?.id }
                                : type === 'day_of_month'
                                  ? { type, day: 1 }
                                  : type === 'account_below_target'
                                    ? { type, accountId: firstAccount }
                                    : type === 'account_above'
                                      ? { type, accountId: firstAccount, amount: 50000 }
                                      : { type, goalId: state.goals[0]?.id ?? '' }
                            patch(rule.id, { trigger: next })
                          }}
                        >
                          <option value="income_received">Income received</option>
                          <option value="day_of_month">Day of month</option>
                          <option value="account_below_target">Account below target</option>
                          <option value="account_above">Account above amount</option>
                          <option value="goal_complete">Goal complete</option>
                        </select>
                      </Field>

                      <TriggerDetail rule={rule} patch={patch} />
                    </div>

                    <div className="mt-4 border-t border-line-soft pt-3">
                      <div className="eyebrow mb-2">Actions</div>
                      <ul className="space-y-2">
                        {rule.actions.map((a, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 text-[12px]">
                            <span className="text-dim">{describeAction(a)}</span>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                patch(rule.id, { actions: rule.actions.filter((_, j) => j !== i) })
                              }
                            >
                              <IconTrash />
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(
                          [
                            ['top_up_to_target', 'Top up to target'],
                            ['sweep_excess', 'Sweep excess'],
                            ['transfer_fixed', 'Fixed transfer'],
                            ['fund_sips', 'Fund SIPs'],
                          ] as const
                        ).map(([type, label]) => (
                          <Button
                            key={type}
                            size="sm"
                            onClick={() => {
                              const a = state.accounts[0]?.id ?? ''
                              const b = state.accounts[1]?.id ?? a
                              const action: RuleAction =
                                type === 'top_up_to_target'
                                  ? { type, fromAccountId: a, toAccountId: b }
                                  : type === 'sweep_excess'
                                    ? { type, fromAccountId: a, toAccountId: b, keep: 10000 }
                                    : type === 'transfer_fixed'
                                      ? { type, fromAccountId: a, toAccountId: b, amount: 5000 }
                                      : { type, fromAccountId: a }
                              patch(rule.id, { actions: [...rule.actions, action] })
                            }}
                          >
                            <IconPlus /> {label}
                          </Button>
                        ))}
                      </div>
                      <p className="mt-3 text-[10.5px] leading-relaxed text-ghost">
                        Actions use the first two accounts by default — open the account selectors below to
                        route them. Transfers are always capped at the source account&apos;s balance above its
                        own floor, so a rule can never create an overdraft. Top-ups also carry a materiality
                        threshold, so the reserve is not wired a few hundred rupees every time a small
                        subscription clears.
                      </p>
                      <ActionRouting rule={rule} patch={patch} />
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => update((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== rule.id) }))}
                      >
                        <IconTrash /> Remove rule
                      </Button>
                    </div>
                  </div>
                )}
              </Panel>
            )
          })}
      </div>

      {forecast.automatedMoves.length > 0 && (
        <Panel title="Scheduled transfers" subtitle={`Every automated move inside the ${horizon}-day horizon`}>
          <ScrollX>
            <table className="w-full min-w-[560px] text-[12px]">
              <thead>
                <tr className="border-b border-line-soft">
                  <Th>Date</Th>
                  <Th>Movement</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {forecast.automatedMoves.slice(0, 20).map((m, i) => (
                  <tr key={`${m.id}-${i}`}>
                    <Td className="text-faint">{shortDate(m.date)}</Td>
                    <Td>{m.label}</Td>
                    <Td className="text-faint">{accountName(m.fromAccountId ?? '')}</Td>
                    <Td className="text-faint">{accountName(m.toAccountId ?? '')}</Td>
                    <Td className="tnum text-right text-violet">{money(m.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </Panel>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function TriggerDetail({
  rule,
  patch,
}: {
  rule: Rule
  patch: (id: string, fields: Partial<Rule>) => void
}) {
  const { state } = useStore()
  const t = rule.trigger

  if (t.type === 'income_received') {
    return (
      <Field label="Which source">
        <select
          value={t.incomeId ?? ''}
          onChange={(e) =>
            patch(rule.id, { trigger: { type: 'income_received', incomeId: e.target.value || undefined } })
          }
        >
          <option value="">Any income</option>
          {state.income.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
    )
  }

  if (t.type === 'day_of_month') {
    return (
      <Field label="Day">
        <input
          type="number"
          min={1}
          max={31}
          value={t.day}
          onChange={(e) =>
            patch(rule.id, {
              trigger: { type: 'day_of_month', day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) },
            })
          }
        />
      </Field>
    )
  }

  if (t.type === 'account_below_target' || t.type === 'account_above') {
    return (
      <>
        <Field label="Account">
          <select
            value={t.accountId}
            onChange={(e) =>
              patch(rule.id, {
                trigger:
                  t.type === 'account_above'
                    ? { type: 'account_above', accountId: e.target.value, amount: t.amount }
                    : { type: 'account_below_target', accountId: e.target.value },
              })
            }
          >
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {t.type === 'account_above' && (
          <Field label="Threshold">
            <input
              type="number"
              value={t.amount}
              onChange={(e) =>
                patch(rule.id, {
                  trigger: { type: 'account_above', accountId: t.accountId, amount: Number(e.target.value) },
                })
              }
            />
          </Field>
        )}
      </>
    )
  }

  return (
    <Field label="Goal">
      <select
        value={t.goalId}
        onChange={(e) => patch(rule.id, { trigger: { type: 'goal_complete', goalId: e.target.value } })}
      >
        {state.goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

function ActionRouting({
  rule,
  patch,
}: {
  rule: Rule
  patch: (id: string, fields: Partial<Rule>) => void
}) {
  const { state } = useStore()
  if (!rule.actions.length) return null

  const setAction = (index: number, next: RuleAction) =>
    patch(rule.id, { actions: rule.actions.map((a, i) => (i === index ? next : a)) })

  const accountOptions = state.accounts.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
    </option>
  ))

  return (
    <div className="mt-3 space-y-3 border-t border-line-soft pt-3">
      {rule.actions.map((a, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-3">
          <Field label={`Action ${i + 1} — from`}>
            <select
              value={'fromAccountId' in a ? a.fromAccountId : ''}
              onChange={(e) => setAction(i, { ...a, fromAccountId: e.target.value } as RuleAction)}
            >
              {accountOptions}
            </select>
          </Field>
          {'toAccountId' in a && (
            <Field label="To">
              <select
                value={a.toAccountId}
                onChange={(e) => setAction(i, { ...a, toAccountId: e.target.value } as RuleAction)}
              >
                {accountOptions}
              </select>
            </Field>
          )}
          {a.type === 'transfer_fixed' && (
            <Field label="Amount">
              <input
                type="number"
                value={a.amount}
                onChange={(e) => setAction(i, { ...a, amount: Number(e.target.value) })}
              />
            </Field>
          )}
          {a.type === 'sweep_excess' && (
            <Field label="Keep behind">
              <input
                type="number"
                value={a.keep}
                onChange={(e) => setAction(i, { ...a, keep: Number(e.target.value) })}
              />
            </Field>
          )}
        </div>
      ))}
    </div>
  )
}

function Compare({
  label,
  with: w,
  without,
  better,
}: {
  label: string
  with: string
  without: string
  better: boolean
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`tnum text-[16px] ${better ? 'text-positive' : 'text-parchment'}`}>{w}</span>
        <span className="text-[10px] text-ghost">with rules</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tnum text-[13px] text-faint">{without}</span>
        <span className="text-[10px] text-ghost">without</span>
      </div>
    </div>
  )
}
