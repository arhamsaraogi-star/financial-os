'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact } from '@/lib/format'
import { longDate, relativeDays, shortDate } from '@/lib/dates'
import { simulate } from '@/lib/engine/forecast'
import { buildSankey } from '@/lib/engine/sankey'
import { AccountLinesChart, LiquidityChart, Sankey, type FlowPoint } from '@/components/charts'
import {
  Badge,
  Button,
  Field,
  PageHeader,
  Panel,
  ScrollX,
  Segmented,
  Stat,
  Td,
  Th,
} from '@/components/ui'

const KIND_TONE = {
  income: 'text-positive',
  bill: 'text-negative',
  subscription: 'text-teal',
  sip: 'text-brass',
  card_payment: 'text-negative',
  discretionary: 'text-dim',
  transfer: 'text-violet',
} as const

const KIND_LABEL = {
  income: 'Income',
  bill: 'Bill',
  subscription: 'Subscription',
  sip: 'Investment',
  card_payment: 'Card',
  discretionary: 'Everyday',
  transfer: 'Transfer',
} as const

export default function CashFlow() {
  const { state, forecast, horizon, setHorizon } = useStore()
  const [view, setView] = useState<'total' | 'accounts'>('total')
  const [delayDays, setDelayDays] = useState(0)
  const [delaySource, setDelaySource] = useState(state.income[0]?.id ?? '')

  const flow = useMemo<FlowPoint[]>(
    () => forecast.days.map((d) => ({ date: d.date, total: Math.round(d.total), ...d.byAccount })),
    [forecast.days],
  )

  const stressed = useMemo(
    () =>
      delayDays > 0 && delaySource
        ? simulate(state, { horizonDays: horizon, delayIncome: { incomeId: delaySource, days: delayDays } })
        : null,
    [state, horizon, delayDays, delaySource],
  )

  const sankey = useMemo(() => buildSankey(state), [state])
  const accounts = state.accounts.filter((a) => a.role !== 'credit')

  // Only days that actually move money are worth a row in the ledger.
  const ledgerDays = forecast.days.filter((d) => d.events.length > 0)

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Cash Flow Engine"
        title="What happens next"
        lede="A day-by-day simulation of every receipt, obligation and automated transfer. Balances are projected, not recorded — the question is never what you have, it is what you will have."
        actions={
          <Segmented
            value={horizon}
            onChange={setHorizon}
            options={[
              { label: '30d', value: 30 },
              { label: '60d', value: 60 },
              { label: '90d', value: 90 },
              { label: '1y', value: 365 },
            ]}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Opening" value={money(forecast.openingTotal)} sub="Liquid today" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Trough"
            value={money(forecast.trough.total)}
            sub={longDate(forecast.trough.date)}
            tone={forecast.trough.total < 0 ? 'negative' : 'brass'}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Net flow"
            value={money(forecast.netFlow)}
            sub={`${money(forecast.totalInflow)} in · ${money(forecast.totalOutflow)} out`}
            tone={forecast.netFlow >= 0 ? 'positive' : 'negative'}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Closing"
            value={money(forecast.closingTotal)}
            sub={`Risk ${forecast.riskScore}/100 · ${forecast.riskLevel}`}
          />
        </div>
      </div>

      {/* ---- Projection ---------------------------------------------------- */}
      <Panel
        className="mb-4"
        title="Projection"
        subtitle={
          view === 'total'
            ? 'Total liquidity across every cash account'
            : 'Each account tracked independently — an aggregate can look healthy while one account is dry'
        }
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { label: 'Total', value: 'total' },
              { label: 'By account', value: 'accounts' },
            ]}
          />
        }
      >
        {view === 'total' ? (
          <LiquidityChart data={flow} troughDate={forecast.trough.date} height={280} />
        ) : (
          <>
            <AccountLinesChart data={flow} accounts={accounts} height={280} />
            <div className="mt-3 flex flex-wrap gap-4 border-t border-line-soft pt-3">
              {accounts.map((a) => (
                <span key={a.id} className="flex items-center gap-1.5 text-[11px] text-dim">
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: a.accent }} />
                  {a.name} · floor {moneyCompact(a.minBuffer)}
                </span>
              ))}
            </div>
          </>
        )}
      </Panel>

      {/* ---- Stress test ---------------------------------------------------- */}
      <Panel
        className="mb-4"
        title="Stress test"
        subtitle="None of your income arrives on a fixed date. This is what that costs."
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Delay which source">
            <select value={delaySource} onChange={(e) => setDelaySource(e.target.value)}>
              {state.income.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Delay by ${delayDays} day${delayDays === 1 ? '' : 's'}`}>
            <input
              type="range"
              min={0}
              max={14}
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
            />
          </Field>
          <Button onClick={() => setDelayDays(0)} size="sm">
            Reset
          </Button>
        </div>

        {stressed && (
          <div className="mt-4 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-3">
            <Comparison
              label="Trough"
              before={money(forecast.trough.total)}
              after={money(stressed.trough.total)}
              worse={stressed.trough.total < forecast.trough.total}
            />
            <Comparison
              label="Risk score"
              before={`${forecast.riskScore}`}
              after={`${stressed.riskScore}`}
              worse={stressed.riskScore < forecast.riskScore}
            />
            <Comparison
              label="Buffer breaches"
              before={`${forecast.flags.length}`}
              after={`${stressed.flags.length}`}
              worse={stressed.flags.length > forecast.flags.length}
            />
            <p className="text-[11.5px] leading-relaxed text-faint sm:col-span-3">
              {stressed.flags.some((f) => f.severity === 'overdraft')
                ? `A ${delayDays}-day delay leaves ${
                    stressed.flags.find((f) => f.severity === 'overdraft')?.accountName
                  } unable to fund its obligations. Pre-fund before the window opens.`
                : stressed.flags.length > forecast.flags.length
                  ? `You absorb the delay, but ${
                      stressed.flags[0]?.accountName
                    } drops below its floor on ${shortDate(
                      stressed.flags[0]?.date ?? '',
                    )} — survivable with no room for a second surprise.`
                  : `A ${delayDays}-day delay changes nothing material. Every obligation still funds on time.`}
            </p>
          </div>
        )}
      </Panel>

      {/* ---- Sankey --------------------------------------------------------- */}
      <Panel
        className="mb-4"
        title="Where every rupee goes"
        subtitle="A representative month: source → account that receives it → account that pays → what it buys"
      >
        <Sankey nodes={sankey.nodes} links={sankey.links} height={360} />
      </Panel>

      {/* ---- Risk flags ------------------------------------------------------ */}
      {forecast.flags.length > 0 && (
        <Panel className="mb-4" title="Pressure points" subtitle={`${forecast.flags.length} events inside the horizon`}>
          <ScrollX>
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  <Th>Date</Th>
                  <Th>Account</Th>
                  <Th>Balance</Th>
                  <Th>Short by</Th>
                  <Th>Trigger</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {forecast.flags.slice(0, 14).map((f, i) => (
                  <tr key={`${f.date}-${f.accountId}-${i}`}>
                    <Td>
                      {shortDate(f.date)}
                      <span className="ml-1.5 text-ghost">{relativeDays(f.date)}</span>
                    </Td>
                    <Td>{f.accountName}</Td>
                    <Td className={`tnum ${f.balance < 0 ? 'text-negative' : 'text-caution'}`}>
                      {money(f.balance)}
                    </Td>
                    <Td className="tnum text-faint">{money(f.shortfall)}</Td>
                    <Td>
                      <span className="text-faint">{f.cause ?? '—'}</span>
                      <Badge tone={f.severity === 'overdraft' ? 'negative' : 'caution'}>
                        {f.severity === 'overdraft' ? 'Overdraft' : 'Below floor'}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </Panel>
      )}

      {/* ---- Ledger ---------------------------------------------------------- */}
      <Panel
        title="Projected ledger"
        subtitle={`${forecast.events.length} movements over ${horizon} days · automated transfers are explained inline`}
      >
        <ol className="relative space-y-0">
          {ledgerDays.map((day) => (
            <li key={day.date} className="relative border-b border-line-soft py-3 last:border-0">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-dim">
                  {shortDate(day.date)}
                  <span className="ml-2 text-[10.5px] text-ghost">{relativeDays(day.date)}</span>
                </span>
                <span
                  className={`tnum text-[12px] ${
                    day.overdraft ? 'text-negative' : day.breach ? 'text-caution' : 'text-faint'
                  }`}
                >
                  {money(day.total)}
                </span>
              </div>
              <ul className="space-y-1.5">
                {day.events.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[12.5px]">{e.label}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-ghost">
                        {KIND_LABEL[e.kind]}
                      </span>
                      {e.rationale && (
                        <p className="mt-0.5 max-w-xl text-[10.5px] leading-relaxed text-ghost">
                          {e.rationale}
                        </p>
                      )}
                    </div>
                    <span className={`tnum shrink-0 text-[12.5px] ${KIND_TONE[e.kind]}`}>
                      {e.kind === 'income' ? '+' : e.kind === 'transfer' ? '⇄ ' : '−'}
                      {money(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}

function Comparison({
  label,
  before,
  after,
  worse,
}: {
  label: string
  before: string
  after: string
  worse: boolean
}) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2 text-[15px]">
        <span className="tnum text-faint line-through decoration-ghost/60">{before}</span>
        <span className={`tnum ${worse ? 'text-negative' : 'text-positive'}`}>{after}</span>
      </div>
    </div>
  )
}
