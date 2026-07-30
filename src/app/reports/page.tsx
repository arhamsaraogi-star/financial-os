'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact, pct } from '@/lib/format'
import { monthKey, monthName } from '@/lib/dates'
import {
  creditSummary,
  growthRate,
  monthlyRollups,
  portfolioSummary,
  rolling12,
  subscriptionInsights,
} from '@/lib/engine/analytics'
import { MonthlyBars } from '@/components/charts'
import { Badge, PageHeader, Panel, ScrollX, Stat, Td, Th } from '@/components/ui'

export default function Reports() {
  const { state, metrics, health, forecast } = useStore()
  const rows = useMemo(() => monthlyRollups(state), [state])
  const [selected, setSelected] = useState<string>(rows[rows.length - 1]?.month ?? '')

  const month = rows.find((r) => r.month === selected) ?? rows[rows.length - 1]
  const prior = rows[rows.findIndex((r) => r.month === month?.month) - 1]

  const p = portfolioSummary(state)
  const credit = creditSummary(state)
  const subs = subscriptionInsights(state)

  const avgIncome = rolling12(rows, 'income')
  const avgExpense = rolling12(rows, 'expense')
  const incomeGrowth = growthRate(rows, 'income')
  const expenseGrowth = growthRate(rows, 'expense')

  const categories = useMemo(() => {
    if (!month) return []
    const m = new Map<string, number>()
    for (const t of state.transactions) {
      if (monthKey(t.date) !== month.month || t.amount >= 0 || t.kind === 'transfer') continue
      m.set(t.category, (m.get(t.category) ?? 0) + Math.abs(t.amount))
    }
    const total = [...m.values()].reduce((s, v) => s + v, 0)
    return [...m.entries()]
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [state.transactions, month])

  const { wins, misses } = useMemo(() => {
    const w: string[] = []
    const m: string[] = []
    if (!month) return { wins: w, misses: m }

    if (month.savingsRate >= 25) w.push(`Saved ${month.savingsRate.toFixed(0)}% of income — well above the 20% bar.`)
    else if (month.savingsRate < 15)
      m.push(`Savings rate fell to ${month.savingsRate.toFixed(0)}%, below the 15% floor.`)

    if (prior && month.expense < prior.expense)
      w.push(`Spending fell ${money(prior.expense - month.expense)} against the prior month.`)
    if (prior && month.expense > prior.expense * 1.15)
      m.push(
        `Spending rose ${pct(((month.expense - prior.expense) / prior.expense) * 100)} on the prior month.`,
      )

    if (month.invested > 0) w.push(`Invested ${money(month.invested)} without interruption.`)
    if (month.net < 0) m.push(`Net position fell ${money(Math.abs(month.net))} across the month.`)
    if (credit.utilisation > 30)
      m.push(`Card utilisation closed at ${credit.utilisation.toFixed(0)}%, above the healthy band.`)
    if (subs.cancelCandidates.length)
      m.push(
        `${subs.cancelCandidates.length} low-usage subscriptions still running at ${money(
          subs.potentialSaving,
        )} a month.`,
      )
    if (!m.length) w.push('No structural problems in the month.')

    return { wins: w, misses: m }
  }, [month, prior, credit.utilisation, subs.cancelCandidates.length, subs.potentialSaving])

  if (!month) {
    return (
      <div className="rise">
        <PageHeader eyebrow="Reports" title="Nothing to report yet" lede="Add transactions to build a history." />
      </div>
    )
  }

  const label = `${monthName(Number(month.month.slice(5, 7)))} ${month.month.slice(0, 4)}`

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Monthly Report"
        title={label}
        lede="Generated from the ledger each month: what came in, what went out, what was kept, and what the numbers say to do about it."
        actions={
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="!w-auto !text-[12px]"
          >
            {rows
              .slice()
              .reverse()
              .map((r) => (
                <option key={r.month} value={r.month}>
                  {monthName(Number(r.month.slice(5, 7)))} {r.month.slice(0, 4)}
                </option>
              ))}
          </select>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat
            label="Income"
            value={money(month.income)}
            sub={prior ? `${pct(((month.income - prior.income) / Math.max(1, prior.income)) * 100)} on prior` : undefined}
            tone="positive"
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Expenses"
            value={money(month.expense)}
            sub={prior ? `${pct(((month.expense - prior.expense) / Math.max(1, prior.expense)) * 100)} on prior` : undefined}
            tone="negative"
          />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Invested" value={money(month.invested)} sub="Treated as a fixed obligation" tone="brass" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Kept"
            value={money(month.income - month.expense)}
            sub={`${month.savingsRate.toFixed(0)}% savings rate`}
            tone={month.savingsRate >= 20 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      <Panel className="mb-4" title="Twelve-month history" subtitle="Income, expenses and investment side by side">
        <MonthlyBars data={rows} height={230} />
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line-soft pt-3 sm:grid-cols-4 text-[11px]">
          <Metric label="Avg income" value={money(Math.round(avgIncome))} />
          <Metric label="Avg expense" value={money(Math.round(avgExpense))} />
          <Metric
            label="Income growth"
            value={pct(incomeGrowth)}
            tone={incomeGrowth >= 0 ? 'good' : 'bad'}
            hint="3-month against prior 3"
          />
          <Metric
            label="Expense growth"
            value={pct(expenseGrowth)}
            tone={expenseGrowth <= 0 ? 'good' : 'bad'}
            hint="3-month against prior 3"
          />
        </div>
      </Panel>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Where the money went" subtitle={label}>
          <ScrollX>
            <table className="w-full min-w-[380px] text-[12px]">
              <thead>
                <tr className="border-b border-line-soft">
                  <Th>Category</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Share</Th>
                  <Th align="right">Of income</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {categories.map((c) => (
                  <tr key={c.name}>
                    <Td>{c.name}</Td>
                    <Td className="tnum text-right">{money(c.value)}</Td>
                    <Td className="tnum text-right text-faint">{c.pct.toFixed(1)}%</Td>
                    <Td className="tnum text-right text-faint">
                      {((c.value / Math.max(1, month.income)) * 100).toFixed(1)}%
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </Panel>

        <Panel title="Financial health" subtitle={`Composite ${health.total}/100`}>
          <ul className="space-y-2.5">
            {health.parts.map((p2) => (
              <li key={p2.key} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-dim">{p2.key}</span>
                <span className="flex items-center gap-2">
                  <span className="tnum text-faint">{Math.round(p2.value)}</span>
                  <Badge tone={p2.value >= 70 ? 'positive' : p2.value >= 40 ? 'caution' : 'negative'}>
                    {p2.value >= 70 ? 'Strong' : p2.value >= 40 ? 'Fair' : 'Weak'}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 border-t border-line-soft pt-3 text-[11.5px]">
            <Line label="Savings rate" value={`${metrics.savingsRate.toFixed(1)}%`} />
            <Line label="Fixed expense ratio" value={`${metrics.fixedExpenseRatio.toFixed(1)}%`} />
            <Line label="Investment rate" value={`${metrics.investmentRate.toFixed(1)}%`} />
            <Line label="Cash runway" value={`${metrics.cashRunwayMonths.toFixed(1)} months`} />
            <Line
              label="Liquidity ratio"
              value={Number.isFinite(metrics.liquidityRatio) ? `${metrics.liquidityRatio.toFixed(2)}×` : '∞'}
            />
            <Line label="Burn rate" value={`${money(metrics.burnRate)}/mo`} />
            <Line label="Emergency cover" value={`${metrics.emergencyMonthsCovered.toFixed(1)} months`} />
            <Line label="Net worth" value={money(metrics.netWorth.total)} />
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Investment summary">
          <div className="space-y-2 text-[11.5px]">
            <Line label="Market value" value={money(p.current)} />
            <Line label="Invested" value={money(p.invested)} />
            <Line label="Absolute gain" value={`${money(p.absoluteGain)} · ${pct(p.absoluteReturnPct)}`} />
            <Line label="XIRR" value={p.xirrPct != null ? pct(p.xirrPct) : '—'} />
            <Line label="Dividends YTD" value={money(p.dividends)} />
            <Line label="Monthly SIP" value={money(metrics.commitments.sips)} />
          </div>
        </Panel>

        <Panel title="Credit summary">
          <div className="space-y-2 text-[11.5px]">
            <Line label="Outstanding" value={money(credit.balance)} />
            <Line label="Total limit" value={moneyCompact(credit.limit)} />
            <Line label="Utilisation" value={`${credit.utilisation.toFixed(1)}%`} />
            <Line label="Band" value={credit.band.label} />
            <Line label="Available" value={money(credit.available)} />
            <Line label="Cards" value={`${credit.perCard.length} active`} />
          </div>
        </Panel>

        <Panel title="Recurring summary">
          <div className="space-y-2 text-[11.5px]">
            <Line label="Obligations" value={`${money(metrics.commitments.bills)}/mo`} />
            <Line label="Subscriptions" value={`${money(subs.monthly)}/mo`} />
            <Line label="Annualised subs" value={money(subs.annual)} />
            <Line label="Low usage" value={`${subs.cancelCandidates.length} services`} />
            <Line label="Recoverable" value={`${money(subs.potentialSaving)}/mo`} />
            <Line label="Total committed" value={`${money(metrics.commitments.total)}/mo`} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="What went right">
          <ul className="space-y-2">
            {wins.map((w, i) => (
              <li key={i} className="border-l-2 border-positive pl-3 text-[12px] leading-relaxed text-dim">
                {w}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="What to fix">
          <ul className="space-y-2">
            {misses.length ? (
              misses.map((m, i) => (
                <li key={i} className="border-l-2 border-negative pl-3 text-[12px] leading-relaxed text-dim">
                  {m}
                </li>
              ))
            ) : (
              <li className="text-[12px] text-ghost">Nothing structural to correct this month.</li>
            )}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-4" title="Outlook" subtitle={`Next ${forecast.days.length - 1} days`}>
        <p className="text-[12.5px] leading-relaxed text-dim">
          Liquidity is projected to bottom out at{' '}
          <span className="tnum text-parchment">{money(forecast.trough.total)}</span> and close at{' '}
          <span className="tnum text-parchment">{money(forecast.closingTotal)}</span>, a net{' '}
          {forecast.netFlow >= 0 ? 'gain' : 'draw'} of{' '}
          <span className={`tnum ${forecast.netFlow >= 0 ? 'text-positive' : 'text-negative'}`}>
            {money(Math.abs(forecast.netFlow))}
          </span>
          . The projection scores {forecast.riskScore}/100 —{' '}
          {forecast.riskLevel === 'secure'
            ? 'every obligation is covered with buffers intact throughout.'
            : forecast.riskLevel === 'watch'
              ? 'obligations clear, but the margin narrows at points inside the window.'
              : 'the schedule is under real strain and needs intervention.'}{' '}
          {forecast.flags.length > 0 &&
            `${forecast.flags.length} buffer events are flagged, the first on ${forecast.flags[0].date} in ${forecast.flags[0].accountName}.`}
        </p>
      </Panel>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-soft pb-1.5 last:border-0">
      <span className="text-faint">{label}</span>
      <span className="tnum text-parchment">{value}</span>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
  hint?: string
}) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div
        className={`tnum text-[14px] ${
          tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-negative' : 'text-parchment'
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-ghost">{hint}</div>}
    </div>
  )
}
