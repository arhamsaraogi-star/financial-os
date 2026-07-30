'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact } from '@/lib/format'
import { monthKey, shortDate } from '@/lib/dates'
import type { Account, AccountRole } from '@/lib/types'
import { Sparkline } from '@/components/charts'
import {
  Badge,
  Button,
  Field,
  Meter,
  PageHeader,
  Panel,
  Stat,
} from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'

const ROLE_COPY: Record<AccountRole, { label: string; job: string }> = {
  income_hub: { label: 'Income hub', job: 'Receives salary and acts as the operating account for everyday spend.' },
  bills: { label: 'Bills', job: 'Every obligation is paid from here. It must never run thin.' },
  reserve: { label: 'Reserve', job: 'Holds the emergency fund, funds investments and absorbs timing gaps.' },
  investment: { label: 'Investment', job: 'Brokerage or folio cash awaiting deployment.' },
  credit: { label: 'Credit', job: 'A liability. Counts against net worth, never toward liquidity.' },
}

const PALETTE = ['#C9A227', '#7A9E9F', '#8F74A2', '#74A37F', '#C28C3E', '#B8564C']

export default function Accounts() {
  const { state, update, forecast, horizon } = useStore()
  const [editing, setEditing] = useState<string | null>(null)

  const patch = (id: string, fields: Partial<Account>) =>
    update((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...fields } : a)) }))

  const remove = (id: string) =>
    update((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }))

  const add = () =>
    update((s) => ({
      ...s,
      accounts: [
        ...s.accounts,
        {
          id: `acc_${Date.now().toString(36)}`,
          name: 'New account',
          institution: '',
          role: 'reserve',
          balance: 0,
          targetBalance: 0,
          minBuffer: 0,
          accent: PALETTE[s.accounts.length % PALETTE.length],
        },
      ],
    }))

  // Balance trail reconstructed by walking the ledger backwards from today.
  const trails = useMemo(() => {
    const out = new Map<string, number[]>()
    for (const a of state.accounts) {
      const byMonth = new Map<string, number>()
      for (const t of state.transactions) {
        if (t.accountId !== a.id) continue
        byMonth.set(monthKey(t.date), (byMonth.get(monthKey(t.date)) ?? 0) + t.amount)
      }
      const months = [...byMonth.keys()].sort()
      let running = a.balance
      const series: number[] = [running]
      for (let i = months.length - 1; i >= 0; i--) {
        running -= byMonth.get(months[i]) ?? 0
        series.unshift(running)
      }
      out.set(a.id, series.slice(-13))
    }
    return out
  }, [state.accounts, state.transactions])

  const liquid = state.accounts.filter((a) => a.role !== 'credit')
  const total = liquid.reduce((s, a) => s + a.balance, 0)
  const targetTotal = liquid.reduce((s, a) => s + a.targetBalance, 0)

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Architecture"
        title="Accounts have responsibilities"
        lede="Each account exists to do one job. The role drives the automation, so changing a role changes how money moves — nothing here is hardcoded to a bank."
        actions={
          <Button onClick={add} variant="brass" size="sm">
            <IconPlus /> Account
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Total liquid" value={money(total)} sub={`${liquid.length} cash accounts`} />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Against target"
            value={money(total - targetTotal)}
            sub={`Targets total ${moneyCompact(targetTotal)}`}
            tone={total >= targetTotal ? 'positive' : 'negative'}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Automated moves"
            value={`${forecast.automatedMoves.length}`}
            sub={`Rule transfers over ${horizon} days`}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Buffer events"
            value={`${forecast.flags.length}`}
            sub="Projected floor breaches"
            tone={forecast.flags.length ? 'negative' : 'positive'}
          />
        </div>
      </div>

      <div className="space-y-3">
        {state.accounts.map((a) => {
          const series = trails.get(a.id) ?? []
          const low = Math.min(...forecast.days.map((d) => d.byAccount[a.id] ?? a.balance))
          const close = forecast.days[forecast.days.length - 1]?.byAccount[a.id] ?? a.balance
          const inbound = forecast.events
            .filter((e) => e.toAccountId === a.id)
            .reduce((s, e) => s + e.amount, 0)
          const outbound = forecast.events
            .filter((e) => e.fromAccountId === a.id)
            .reduce((s, e) => s + e.amount, 0)
          const open = editing === a.id

          return (
            <Panel key={a.id} padded={false}>
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.accent }} />
                      <h3 className="truncate text-[15px]">{a.name}</h3>
                      <Badge tone={a.role === 'credit' ? 'negative' : 'neutral'}>
                        {ROLE_COPY[a.role].label}
                      </Badge>
                      {low < a.minBuffer && a.role !== 'credit' && <Badge tone="caution">Dips below floor</Badge>}
                    </div>
                    <p className="mt-1.5 max-w-xl text-[11.5px] leading-relaxed text-ghost">
                      {a.notes || ROLE_COPY[a.role].job}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="tnum display text-[24px] leading-none">{money(a.balance)}</div>
                      <div className="mt-1.5 text-[10.5px] text-ghost">{a.institution || '—'}</div>
                    </div>
                    <Sparkline values={series} colour={a.accent} />
                    <button
                      onClick={() => setEditing(open ? null : a.id)}
                      className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                      aria-label={open ? 'Close editor' : 'Edit account'}
                    >
                      <IconChevron className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>
                </div>

                {a.role !== 'credit' && (
                  <div className="mt-4">
                    <Meter
                      value={a.balance}
                      max={Math.max(a.targetBalance, a.balance, 1)}
                      notch={a.minBuffer}
                      tone={a.balance < a.minBuffer ? 'negative' : 'brass'}
                      height={4}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-5">
                      <Cell label="Target" value={money(a.targetBalance)} />
                      <Cell label="Floor" value={money(a.minBuffer)} />
                      <Cell label={`Low (${horizon}d)`} value={money(low)} tone={low < a.minBuffer ? 'bad' : undefined} />
                      <Cell label="Inbound" value={money(inbound)} tone="good" />
                      <Cell label="Outbound" value={money(outbound)} tone="bad" />
                    </div>
                    <div className="mt-2 text-[10.5px] text-ghost">
                      Projected close {money(close)} on{' '}
                      {shortDate(forecast.days[forecast.days.length - 1]?.date ?? forecast.to)}
                    </div>
                  </div>
                )}
              </div>

              {open && (
                <div className="border-t border-line-soft bg-panel-2/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Name">
                      <input value={a.name} onChange={(e) => patch(a.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Institution">
                      <input
                        value={a.institution}
                        onChange={(e) => patch(a.id, { institution: e.target.value })}
                      />
                    </Field>
                    <Field label="Role" hint={ROLE_COPY[a.role].job}>
                      <select
                        value={a.role}
                        onChange={(e) => patch(a.id, { role: e.target.value as AccountRole })}
                      >
                        {(Object.keys(ROLE_COPY) as AccountRole[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_COPY[r].label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Current balance">
                      <input
                        type="number"
                        value={a.balance}
                        onChange={(e) => patch(a.id, { balance: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Target balance" hint="What this account should hold when everything is in order.">
                      <input
                        type="number"
                        value={a.targetBalance}
                        onChange={(e) => patch(a.id, { targetBalance: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Hard floor" hint="Dropping below this is flagged as a risk event, not a warning.">
                      <input
                        type="number"
                        value={a.minBuffer}
                        onChange={(e) => patch(a.id, { minBuffer: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Notes">
                      <input
                        value={a.notes ?? ''}
                        onChange={(e) => patch(a.id, { notes: e.target.value })}
                        placeholder="What this account is for"
                      />
                    </Field>
                    <Field label="Accent">
                      <div className="flex gap-1.5 pt-1">
                        {PALETTE.map((c) => (
                          <button
                            key={c}
                            onClick={() => patch(a.id, { accent: c })}
                            aria-label={`Set accent ${c}`}
                            className={`h-6 w-6 rounded-full border-2 transition-transform ${
                              a.accent === c ? 'scale-110 border-parchment' : 'border-transparent'
                            }`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="danger" size="sm" onClick={() => remove(a.id)}>
                      <IconTrash /> Remove account
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

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div
        className={`tnum ${tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-negative' : 'text-dim'}`}
      >
        {value}
      </div>
    </div>
  )
}
