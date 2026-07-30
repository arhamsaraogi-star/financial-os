'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact, ordinal } from '@/lib/format'
import { nextDayOfMonth, relativeDays, shortDate } from '@/lib/dates'
import type { CreditCard } from '@/lib/types'
import { creditSummary } from '@/lib/engine/analytics'
import { Badge, Button, Field, Meter, PageHeader, Panel, Stat } from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'

/**
 * Utilisation is the largest input a person can actually move month to month,
 * which is why these bands drive both the colour and the advice.
 */
const FACTORS = [
  {
    name: 'Utilisation',
    weight: '30%',
    detail: 'Balance against limit at the moment the statement cuts — not on the due date.',
  },
  {
    name: 'Payment history',
    weight: '35%',
    detail: 'A single missed payment outweighs years of perfect behaviour. Autopay the minimum, always.',
  },
  {
    name: 'Age of accounts',
    weight: '15%',
    detail: 'Closing an old card shortens your average history and shrinks total limit at the same time.',
  },
  {
    name: 'Credit mix',
    weight: '10%',
    detail: 'A mix of revolving and instalment credit reads better than cards alone.',
  },
  {
    name: 'Recent enquiries',
    weight: '10%',
    detail: 'Each hard pull leaves a mark. Cluster applications rather than spreading them out.',
  },
]

export default function Credit() {
  const { state, update, forecast } = useStore()
  const [editing, setEditing] = useState<string | null>(null)
  const c = creditSummary(state)

  const patch = (id: string, fields: Partial<CreditCard>) =>
    update((s) => ({ ...s, cards: s.cards.map((x) => (x.id === id ? { ...x, ...fields } : x)) }))

  const add = () =>
    update((s) => ({
      ...s,
      cards: [
        ...s.cards,
        {
          id: `card_${Date.now().toString(36)}`,
          name: 'New card',
          issuer: '',
          limit: 100000,
          currentBalance: 0,
          statementDay: 20,
          dueDay: 8,
          paymentAccountId: s.accounts.find((a) => a.role === 'bills')?.id ?? s.accounts[0]?.id ?? '',
          apr: 42,
          active: true,
        },
      ],
    }))

  const toThirty = Math.max(0, c.balance - c.limit * 0.3)
  const monthlyInterestIfCarried = c.perCard.reduce(
    (s, card) => s + (card.currentBalance * (card.apr / 100)) / 12,
    0,
  )

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Credit Health"
        title="Cards are a liability, not liquidity"
        lede="Outstanding balances count against net worth and never toward what you can spend. The forecast schedules each statement balance against its due date out of the account responsible for it."
        actions={
          <Button onClick={add} variant="brass" size="sm">
            <IconPlus /> Card
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat
            label="Utilisation"
            value={`${c.utilisation.toFixed(1)}%`}
            sub={c.band.label}
            tone={c.utilisation <= 30 ? 'positive' : 'negative'}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Outstanding" value={money(c.balance)} sub={`Across ${c.perCard.length} cards`} />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Available" value={money(c.available)} sub={`of ${moneyCompact(c.limit)} total limit`} />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Cost if carried"
            value={money(Math.round(monthlyInterestIfCarried))}
            sub="Interest per month at current APRs"
            tone="negative"
          />
        </div>
      </div>

      <Panel className="mb-4" title="Utilisation band">
        <div className="relative">
          <Meter
            value={c.utilisation}
            max={100}
            height={8}
            tone={c.utilisation <= 30 ? 'positive' : c.utilisation <= 50 ? 'caution' : 'negative'}
          />
          <div className="mt-2 flex justify-between text-[10px] text-ghost">
            <span>0% optimal</span>
            <span className="text-positive">10%</span>
            <span className="text-caution">30% healthy ceiling</span>
            <span className="text-negative">50%</span>
            <span>100%</span>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-dim">
          {c.utilisation <= 10
            ? `At ${c.utilisation.toFixed(1)}% you are in the optimal band. Nothing to fix — keep clearing statements in full.`
            : c.utilisation <= 30
              ? `${c.utilisation.toFixed(1)}% sits inside the healthy band. Staying under 30% at the statement date matters more than the balance on the due date, because that is the figure reported to the bureau.`
              : `${c.utilisation.toFixed(1)}% is above the 30% threshold scoring models treat as stress. Paying ${money(
                  toThirty,
                )} before the statement cuts returns you to the healthy band — and the payment date is what counts, not the due date.`}
        </p>
      </Panel>

      <div className="mb-4 space-y-3">
        {state.cards.map((card) => {
          const open = editing === card.id
          const util = card.limit > 0 ? (card.currentBalance / card.limit) * 100 : 0
          const account = state.accounts.find((a) => a.id === card.paymentAccountId)
          const due = nextDayOfMonth(card.dueDay)
          const stmt = nextDayOfMonth(card.statementDay)

          return (
            <Panel key={card.id} padded={false}>
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px]">{card.name}</h3>
                      <Badge
                        tone={util <= 10 ? 'positive' : util <= 30 ? 'brass' : util <= 50 ? 'caution' : 'negative'}
                      >
                        {util.toFixed(0)}% used
                      </Badge>
                      {!card.active && <Badge tone="neutral">Closed</Badge>}
                    </div>
                    <p className="mt-1.5 text-[11.5px] text-ghost">
                      {card.issuer || '—'} · statement {ordinal(card.statementDay)} · due{' '}
                      {ordinal(card.dueDay)} · paid from {account?.name ?? '—'} · {card.apr}% APR
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="tnum display text-[22px] leading-none">{money(card.currentBalance)}</div>
                      <div className="mt-1.5 text-[10.5px] text-ghost">
                        of {moneyCompact(card.limit)} limit
                      </div>
                    </div>
                    <button
                      onClick={() => setEditing(open ? null : card.id)}
                      className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                      aria-label={open ? 'Close editor' : 'Edit card'}
                    >
                      <IconChevron className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <Meter
                    value={card.currentBalance}
                    max={card.limit}
                    notch={card.limit * 0.3}
                    height={4}
                    tone={util <= 30 ? 'positive' : util <= 50 ? 'caution' : 'negative'}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
                    <Cell label="Statement cuts" value={`${shortDate(stmt)}`} />
                    <Cell label="Payment due" value={`${shortDate(due)} · ${relativeDays(due)}`} />
                    <Cell label="Available" value={money(card.limit - card.currentBalance)} />
                    <Cell
                      label="To reach 30%"
                      value={
                        util > 30 ? money(card.currentBalance - card.limit * 0.3) : 'Already there'
                      }
                      tone={util > 30 ? 'bad' : 'good'}
                    />
                  </div>
                </div>
              </div>

              {open && (
                <div className="border-t border-line-soft bg-panel-2/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Name">
                      <input value={card.name} onChange={(e) => patch(card.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Issuer">
                      <input value={card.issuer} onChange={(e) => patch(card.id, { issuer: e.target.value })} />
                    </Field>
                    <Field label="Credit limit">
                      <input
                        type="number"
                        value={card.limit}
                        onChange={(e) => patch(card.id, { limit: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Current balance">
                      <input
                        type="number"
                        value={card.currentBalance}
                        onChange={(e) => patch(card.id, { currentBalance: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Statement day" hint="The date your reported balance is measured.">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={card.statementDay}
                        onChange={(e) =>
                          patch(card.id, {
                            statementDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </Field>
                    <Field label="Due day">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={card.dueDay}
                        onChange={(e) =>
                          patch(card.id, { dueDay: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })
                        }
                      />
                    </Field>
                    <Field label="APR %">
                      <input
                        type="number"
                        step="0.1"
                        value={card.apr}
                        onChange={(e) => patch(card.id, { apr: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Payment account">
                      <select
                        value={card.paymentAccountId}
                        onChange={(e) => patch(card.id, { paymentAccountId: e.target.value })}
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
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[12px] text-dim">
                      <input
                        type="checkbox"
                        checked={card.active}
                        onChange={(e) => patch(card.id, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => update((s) => ({ ...s, cards: s.cards.filter((x) => x.id !== card.id) }))}
                    >
                      <IconTrash /> Remove card
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What actually moves a score" subtitle="Weighting is approximate and issuer-dependent">
          <ul className="space-y-3">
            {FACTORS.map((f) => (
              <li key={f.name}>
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span>{f.name}</span>
                  <span className="tnum text-faint">{f.weight}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ghost">{f.detail}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Recommendations" subtitle="Derived from your current position">
          <ul className="space-y-3 text-[12px] leading-relaxed">
            {c.utilisation > 30 && (
              <li className="border-l-2 border-negative pl-3">
                Pay <span className="tnum text-parchment">{money(toThirty)}</span> before the earliest
                statement date to drop under 30%. The reported figure is the statement balance, so a payment
                made after it cuts does nothing for this month&apos;s score.
              </li>
            )}
            {c.perCard.some((x) => x.utilisation > 50) && (
              <li className="border-l-2 border-caution pl-3">
                {c.perCard.find((x) => x.utilisation > 50)?.name} alone is over 50% utilised. Per-card
                utilisation is scored as well as the aggregate, so spreading a balance across two cards reads
                better than concentrating it on one.
              </li>
            )}
            {forecast.flags.some((f) =>
              state.cards.some((card) => card.paymentAccountId === f.accountId),
            ) && (
              <li className="border-l-2 border-caution pl-3">
                The account that pays your cards is projected to breach its floor inside the horizon. A missed
                card payment costs more in score than the interest saved by holding the cash.
              </li>
            )}
            <li className="border-l-2 border-line pl-3 text-dim">
              Carrying {money(c.balance)} at these APRs costs{' '}
              <span className="tnum text-negative">{money(Math.round(monthlyInterestIfCarried))}</span> a
              month. Nothing in your portfolio returns 42% — clearing the balance is the highest-return use of
              cash available to you.
            </li>
            {c.utilisation <= 10 && (
              <li className="border-l-2 border-positive pl-3">
                Utilisation is optimal. Keep both cards open even if unused; closing one shortens your average
                account age and removes limit, pushing utilisation up on the remaining card.
              </li>
            )}
          </ul>
        </Panel>
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
